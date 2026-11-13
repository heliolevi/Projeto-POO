import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictError } from "../../../shared/http/errors.ts";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { Periodo } from "../../../shared/dominio/periodo-aluguel.ts";
import { TransicaoDeReservaInvalida } from "./erros.ts";
import {
  ANTECEDENCIA_DA_RETIRADA_MS,
  Reserva,
  type DadosDeReservaPersistida,
} from "./reserva-entidade.ts";
import { PRAZO_PAGAMENTO_MS, STATUS_RESERVA, TRANSICOES, podeCancelar, podeTransitar, type StatusReserva } from "./reserva.ts";

const MIN = 60_000;
const HORA = 60 * MIN;
const CRIADA = new Date("2026-11-14T08:00:00.000Z");
const INICIO = new Date("2026-11-14T12:00:00.000Z");
const FIM = new Date("2026-11-14T16:00:00.000Z");
const depois = (base: Date, ms: number) => new Date(base.getTime() + ms);

function dados(parcial: Partial<DadosDeReservaPersistida> = {}): DadosDeReservaPersistida {
  return {
    id: "r-1",
    codigo: "BIC-7K2F9Q",
    status: "PENDENTE_PAGAMENTO",
    tipoId: "t-1",
    tipoNome: "Passeio",
    pontoId: "p-1",
    pontoNome: "Ponto Litorânea",
    pontoEndereco: "Av. Litorânea, 100, Calhau",
    inicio: INICIO,
    fim: FIM,
    valorAluguelCentavos: 4800,
    valorCaucaoCentavos: 15000,
    criadoEm: CRIADA,
    pagamentoStatus: null,
    pagamentoMetodo: null,
    ...parcial,
  };
}
const reserva = (status: StatusReserva = "PENDENTE_PAGAMENTO") => new Reserva(dados({ status }));

describe("TRANSICOES (máquina de estados)", () => {
  test("todo status tem uma entrada e só aponta para status que existem", () => {
    assert.deepEqual(Object.keys(TRANSICOES).sort(), [...STATUS_RESERVA].sort());
    for (const destinos of Object.values(TRANSICOES)) {
      for (const d of destinos) assert.ok(STATUS_RESERVA.includes(d), d);
    }
  });

  test("os estados finais não saem para lugar nenhum", () => {
    for (const final of ["CONCLUIDA", "CANCELADA", "EXPIRADA", "NAO_RETIRADA"] as const) {
      assert.deepEqual(TRANSICOES[final], []);
    }
  });

  test("o ciclo feliz: pendente -> confirmada -> em andamento -> concluída", () => {
    assert.ok(podeTransitar("PENDENTE_PAGAMENTO", "CONFIRMADA"));
    assert.ok(podeTransitar("CONFIRMADA", "EM_ANDAMENTO"));
    assert.ok(podeTransitar("EM_ANDAMENTO", "CONCLUIDA"));
    assert.ok(!podeTransitar("PENDENTE_PAGAMENTO", "EM_ANDAMENTO"));
    assert.ok(!podeTransitar("EM_ANDAMENTO", "CANCELADA"));
  });

  test("a tabela é exatamente a do modelo de dados, sem nenhuma transição a mais", () => {
    assert.deepEqual(TRANSICOES, {
      PENDENTE_PAGAMENTO: ["CONFIRMADA", "CANCELADA", "EXPIRADA"],
      CONFIRMADA: ["EM_ANDAMENTO", "CANCELADA", "NAO_RETIRADA"],
      EM_ANDAMENTO: ["CONCLUIDA"],
      CONCLUIDA: [],
      CANCELADA: [],
      EXPIRADA: [],
      NAO_RETIRADA: [],
    });
  });

  test("a reserva só anda para a frente: nenhum estado volta a um anterior (sem ciclos)", () => {
    for (const inicio of STATUS_RESERVA) {
      const visitados = new Set<string>();
      const fila: string[] = [...TRANSICOES[inicio]];
      while (fila.length > 0) {
        const atual = fila.shift()!;
        assert.notEqual(atual, inicio, `${inicio} consegue voltar a si mesmo`);
        if (visitados.has(atual)) continue;
        visitados.add(atual);
        fila.push(...TRANSICOES[atual as StatusReserva]);
      }
    }
    // ninguém volta a PENDENTE_PAGAMENTO
    for (const destinos of Object.values(TRANSICOES)) assert.ok(!destinos.includes("PENDENTE_PAGAMENTO"));
  });

  test("podeCancelar lê a mesma tabela: só pendente e confirmada", () => {
    for (const status of STATUS_RESERVA) {
      assert.equal(podeCancelar(status), status === "PENDENTE_PAGAMENTO" || status === "CONFIRMADA", status);
    }
  });
});

describe("Reserva: criação e leitura", () => {
  test("expõe os dados como objetos de valor", () => {
    const r = reserva();
    assert.equal(r.codigo, "BIC-7K2F9Q");
    assert.ok(r.periodo instanceof Periodo);
    assert.ok(r.valorAluguel.igual(Dinheiro.deCentavos(4800)));
    assert.equal(r.valorCaucao.centavos, 15000);
    assert.equal(r.status, "PENDENTE_PAGAMENTO");
    assert.equal(r.tipoId, "t-1");
    assert.equal(r.pontoId, "p-1");
  });

  test("recusa id e código vazios, período invertido e valores quebrados", () => {
    assert.throws(() => new Reserva(dados({ id: "" })), RangeError);
    assert.throws(() => new Reserva(dados({ codigo: "" })), RangeError);
    assert.throws(() => new Reserva(dados({ inicio: FIM, fim: INICIO })), RangeError);
    assert.throws(() => new Reserva(dados({ valorAluguelCentavos: 10.5 })), RangeError);
    assert.throws(() => new Reserva(dados({ valorCaucaoCentavos: -1 })), RangeError);
  });

  test("expiraEm: só a pendente tem, e é a criação mais 15 minutos", () => {
    assert.equal(reserva().expiraEm()?.getTime(), CRIADA.getTime() + PRAZO_PAGAMENTO_MS);
    assert.equal(PRAZO_PAGAMENTO_MS, 15 * MIN);
    for (const status of STATUS_RESERVA.filter((s) => s !== "PENDENTE_PAGAMENTO")) {
      assert.equal(reserva(status).expiraEm(), null, status);
    }
  });

  test("estaAtiva: pendente, confirmada e em andamento seguram a bicicleta", () => {
    for (const status of STATUS_RESERVA) {
      const ativa = status === "PENDENTE_PAGAMENTO" || status === "CONFIRMADA" || status === "EM_ANDAMENTO";
      assert.equal(reserva(status).estaAtiva(), ativa, status);
    }
  });

  test("encapsulamento: nada de fora altera a reserva", () => {
    const r = reserva();
    r.criadaEm.setUTCFullYear(1999);
    assert.equal(r.criadaEm.getUTCFullYear(), 2026);
    assert.deepEqual(Object.keys(r), []);
    const entrada = dados({ inicio: new Date(INICIO) });
    const r2 = new Reserva(entrada);
    entrada.inicio.setUTCFullYear(1999);
    assert.equal(r2.periodo.inicio.getUTCFullYear(), 2026);
  });
});

describe("Reserva.confirmar", () => {
  test("pendente dentro do prazo vira CONFIRMADA", () => {
    const r = reserva();
    r.confirmar(depois(CRIADA, 14 * MIN));
    assert.equal(r.status, "CONFIRMADA");
    assert.equal(r.expiraEm(), null);
  });

  test("no instante do vencimento ou depois não confirma (o prazo é de 15 minutos)", () => {
    for (const ms of [15 * MIN, 16 * MIN, 5 * HORA]) {
      const r = reserva();
      assert.throws(() => r.confirmar(depois(CRIADA, ms)), TransicaoDeReservaInvalida, String(ms));
      assert.equal(r.status, "PENDENTE_PAGAMENTO");
    }
  });

  test("só a pendente confirma", () => {
    for (const status of STATUS_RESERVA.filter((s) => s !== "PENDENTE_PAGAMENTO")) {
      assert.throws(() => reserva(status).confirmar(CRIADA), TransicaoDeReservaInvalida, status);
    }
  });
});

describe("Reserva.cancelar", () => {
  test("pendente e confirmada cancelam e guardam motivo e hora", () => {
    for (const status of ["PENDENTE_PAGAMENTO", "CONFIRMADA"] as const) {
      const r = reserva(status);
      const agora = depois(CRIADA, 5 * MIN);
      r.cancelar("  desistiu  ", agora);
      assert.equal(r.status, "CANCELADA", status);
      assert.equal(r.motivoDoCancelamento, "desistiu");
      assert.equal(r.canceladaEm?.getTime(), agora.getTime());
      assert.equal(r.estaAtiva(), false);
    }
  });

  test("em andamento e os estados finais não cancelam", () => {
    for (const status of ["EM_ANDAMENTO", "CONCLUIDA", "CANCELADA", "EXPIRADA", "NAO_RETIRADA"] as const) {
      const r = reserva(status);
      assert.throws(() => r.cancelar("x", CRIADA), TransicaoDeReservaInvalida, status);
      assert.equal(r.status, status);
    }
  });

  test("exige motivo e, sem ele, não muda nada", () => {
    const r = reserva();
    assert.throws(() => r.cancelar("   ", CRIADA), RangeError);
    assert.equal(r.status, "PENDENTE_PAGAMENTO");
    assert.equal(r.canceladaEm, null);
  });

  test("a transição inválida é um 409 (ConflictError)", () => {
    assert.throws(
      () => reserva("CONCLUIDA").cancelar("x", CRIADA),
      (erro) => {
        assert.ok(erro instanceof ConflictError);
        assert.equal((erro as ConflictError).status, 409);
        return true;
      },
    );
  });
});

describe("Reserva.iniciar (retirada)", () => {
  test("a retirada abre 30 minutos antes do início", () => {
    assert.equal(ANTECEDENCIA_DA_RETIRADA_MS, 30 * MIN);
    const cedo = reserva("CONFIRMADA");
    assert.throws(() => cedo.iniciar(depois(INICIO, -31 * MIN)), TransicaoDeReservaInvalida);
    assert.equal(cedo.status, "CONFIRMADA");
    const noLimite = reserva("CONFIRMADA");
    noLimite.iniciar(depois(INICIO, -30 * MIN));
    assert.equal(noLimite.status, "EM_ANDAMENTO");
  });

  test("pode retirar no início e durante o período, mas não no fim nem depois", () => {
    const noInicio = reserva("CONFIRMADA");
    noInicio.iniciar(INICIO);
    assert.equal(noInicio.status, "EM_ANDAMENTO");
    const quaseFim = reserva("CONFIRMADA");
    quaseFim.iniciar(depois(FIM, -1));
    assert.equal(quaseFim.status, "EM_ANDAMENTO");
    for (const quando of [FIM, depois(FIM, HORA)]) {
      const r = reserva("CONFIRMADA");
      assert.throws(() => r.iniciar(quando), TransicaoDeReservaInvalida);
      assert.equal(r.status, "CONFIRMADA");
    }
  });

  test("só a confirmada inicia (pendente não paga não retira)", () => {
    for (const status of STATUS_RESERVA.filter((s) => s !== "CONFIRMADA")) {
      assert.throws(() => reserva(status).iniciar(INICIO), TransicaoDeReservaInvalida, status);
    }
  });
});

describe("Reserva.concluir (devolução)", () => {
  test("em andamento vira CONCLUIDA", () => {
    const r = reserva("EM_ANDAMENTO");
    r.concluir();
    assert.equal(r.status, "CONCLUIDA");
  });

  test("só a que está em andamento conclui", () => {
    for (const status of STATUS_RESERVA.filter((s) => s !== "EM_ANDAMENTO")) {
      assert.throws(() => reserva(status).concluir(), TransicaoDeReservaInvalida, status);
    }
  });
});

describe("Reserva.expirar", () => {
  test("pendente vencida expira e devolve true", () => {
    const r = reserva();
    assert.equal(r.expirar(depois(CRIADA, 15 * MIN)), true);
    assert.equal(r.status, "EXPIRADA");
    assert.equal(r.estaAtiva(), false);
  });

  test("pendente dentro do prazo continua pendente e devolve false", () => {
    const r = reserva();
    assert.equal(r.expirar(depois(CRIADA, 14 * MIN + 59_000)), false);
    assert.equal(r.status, "PENDENTE_PAGAMENTO");
  });

  test("reserva que não é pendente nunca expira, e a varredura não lança", () => {
    for (const status of STATUS_RESERVA.filter((s) => s !== "PENDENTE_PAGAMENTO")) {
      const r = reserva(status);
      assert.equal(r.expirar(depois(CRIADA, 100 * HORA)), false, status);
      assert.equal(r.status, status);
    }
  });

  test("expirar duas vezes é seguro", () => {
    const r = reserva();
    assert.equal(r.expirar(depois(CRIADA, HORA)), true);
    assert.equal(r.expirar(depois(CRIADA, 2 * HORA)), false);
  });
});

describe("Reserva.marcarNaoRetirada", () => {
  test("confirmada, depois do fim do período", () => {
    const r = reserva("CONFIRMADA");
    r.marcarNaoRetirada(FIM);
    assert.equal(r.status, "NAO_RETIRADA");
    assert.equal(r.estaAtiva(), false);
  });

  test("antes do fim ainda não", () => {
    const r = reserva("CONFIRMADA");
    assert.throws(() => r.marcarNaoRetirada(depois(FIM, -1)), TransicaoDeReservaInvalida);
    assert.equal(r.status, "CONFIRMADA");
  });

  test("só a confirmada", () => {
    for (const status of STATUS_RESERVA.filter((s) => s !== "CONFIRMADA")) {
      assert.throws(() => reserva(status).marcarNaoRetirada(FIM), TransicaoDeReservaInvalida, status);
    }
  });
});

describe("Reserva: atraso, valor e extensão", () => {
  test("estaAtrasada: só em andamento e depois do fim", () => {
    const r = reserva("EM_ANDAMENTO");
    assert.equal(r.estaAtrasada(FIM), false);
    assert.equal(r.estaAtrasada(depois(FIM, 1)), true);
    assert.equal(reserva("CONFIRMADA").estaAtrasada(depois(FIM, HORA)), false);
    assert.equal(reserva("CONCLUIDA").estaAtrasada(depois(FIM, HORA)), false);
  });

  test("atrasoEmMs", () => {
    const r = reserva("EM_ANDAMENTO");
    assert.equal(r.atrasoEmMs(depois(FIM, -HORA)), 0);
    assert.equal(r.atrasoEmMs(depois(FIM, 90 * MIN)), 90 * MIN);
    assert.equal(reserva("CONCLUIDA").atrasoEmMs(depois(FIM, HORA)), 0);
  });

  test("calcularValor usa a regra única de preço (4 h de Passeio = R$ 48,00)", () => {
    const r = reserva();
    assert.equal(r.calcularValor({ precoHoraCentavos: 1200, precoDiaCentavos: 6000 }).centavos, 4800);
  });

  test("estender troca período e valor", () => {
    const r = reserva("CONFIRMADA");
    const novoFim = depois(FIM, 2 * HORA);
    r.estender(novoFim, (periodo) =>
      Dinheiro.deCentavos(periodo.horasCobradas * 1200),
    );
    assert.equal(r.periodo.fim.getTime(), novoFim.getTime());
    assert.equal(r.periodo.inicio.getTime(), INICIO.getTime());
    assert.equal(r.valorAluguel.centavos, 6 * 1200);
  });

  test("estender recusa fim igual ou antes do atual e status que não permite", () => {
    const r = reserva("EM_ANDAMENTO");
    assert.throws(() => r.estender(FIM, () => Dinheiro.ZERO), RangeError);
    assert.throws(() => r.estender(depois(FIM, -1), () => Dinheiro.ZERO), RangeError);
    assert.equal(r.periodo.fim.getTime(), FIM.getTime());
    for (const status of ["PENDENTE_PAGAMENTO", "CONCLUIDA", "CANCELADA", "EXPIRADA", "NAO_RETIRADA"] as const) {
      assert.throws(() => reserva(status).estender(depois(FIM, HORA), () => Dinheiro.ZERO), TransicaoDeReservaInvalida, status);
    }
  });

  test("se o cálculo do novo valor falha, a reserva fica como estava", () => {
    const r = reserva("CONFIRMADA");
    assert.throws(() =>
      r.estender(depois(FIM, HORA), () => {
        throw new Error("falhou");
      }),
    );
    assert.equal(r.periodo.fim.getTime(), FIM.getTime());
    assert.equal(r.valorAluguel.centavos, 4800);
  });
});

describe("Reserva: formato da API", () => {
  test("paraDto tem exatamente os campos do contrato e não vaza a unidade", () => {
    assert.deepEqual(reserva().paraDto(), {
      id: "r-1",
      codigo: "BIC-7K2F9Q",
      status: "PENDENTE_PAGAMENTO",
      tipo: { id: "t-1", nome: "Passeio" },
      ponto: { id: "p-1", nome: "Ponto Litorânea", endereco: "Av. Litorânea, 100, Calhau" },
      periodo: { inicio: "2026-11-14T12:00:00.000Z", fim: "2026-11-14T16:00:00.000Z" },
      valorAluguelCentavos: 4800,
      valorCaucaoCentavos: 15000,
      expiraEm: "2026-11-14T08:15:00.000Z",
      criadaEm: "2026-11-14T08:00:00.000Z",
    });
  });

  test("expiraEm é null fora da pendente", () => {
    assert.equal(reserva("CONFIRMADA").paraDto().expiraEm, null);
  });

  test("paraDtoDetalhado inclui o pagamento, ou null", () => {
    assert.equal(reserva().paraDtoDetalhado().pagamento, null);
    const paga = new Reserva(dados({ pagamentoStatus: "APROVADO", pagamentoMetodo: "PIX" }));
    assert.deepEqual(paga.paraDtoDetalhado().pagamento, { status: "APROVADO", metodo: "PIX" });
    const meio = new Reserva(dados({ pagamentoStatus: "APROVADO", pagamentoMetodo: null }));
    assert.equal(meio.paraDtoDetalhado().pagamento, null);
  });

  test("o DTO reflete as mudanças de estado", () => {
    const r = reserva();
    r.confirmar(CRIADA);
    assert.equal(r.paraDto().status, "CONFIRMADA");
    assert.equal(r.paraDto().expiraEm, null);
  });

  test("a cópia do DTO não altera a reserva", () => {
    const r = reserva();
    r.paraDto().tipo.nome = "outro";
    assert.equal(r.paraDto().tipo.nome, "Passeio");
  });
});
