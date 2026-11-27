import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ConflictError,
  NotFoundError,
  PagamentoIndisponivelError,
  ValidationError,
} from "../../../shared/http/errors.ts";
import type { Pagamento } from "../domain/pagamento.ts";
import { IntervaloDeConsulta } from "./intervalo-de-consulta.ts";
import { PagarReservaService, type DependenciasPagarReserva } from "./pagar-reserva.ts";
import type { GatewayPix, NovaCobrancaPix, OperacoesPagamento, SessaoCliente, SituacaoNoGateway } from "./portas.ts";

const MIN = 60_000;
const AGORA = new Date("2026-11-14T11:00:00.000Z");
const RESERVA_ID = "11111111-1111-4111-8111-111111111111";
const OUTRA_ID = "22222222-2222-4222-8222-222222222222";
const CLIENTE_ID = "33333333-3333-4333-8333-333333333333";
const SESSAO: SessaoCliente = { perfil: "CLIENTE", usuarioId: CLIENTE_ID };
const corpo = (reservaId = RESERVA_ID) => ({ reservaId, metodo: "PIX" });

type ReservaFalsa = { id: string; status: string; valorAluguelCentavos: number; criadaEm: Date };

// Banco e Stripe de mentira, com o mínimo de comportamento que os casos de uso usam.
type OpcoesDoMontar = {
  reservaCriadaHaMin?: number;
  gatewayFora?: boolean;
  estornoFalha?: boolean;
  salvarFalha?: boolean;
  intervaloMs?: number;
};

function montar(opcoes: OpcoesDoMontar = {}) {
  let relogio = AGORA;
  const reservas = new Map<string, ReservaFalsa>([
    [
      RESERVA_ID,
      {
        id: RESERVA_ID,
        status: "PENDENTE_PAGAMENTO",
        valorAluguelCentavos: 4800,
        criadaEm: new Date(AGORA.getTime() - (opcoes.reservaCriadaHaMin ?? 1) * MIN),
      },
    ],
  ]);
  const pagamentos = new Map<string, Pagamento>();
  const travas: string[] = [];
  const prazo = (r: ReservaFalsa) => new Date(r.criadaEm.getTime() + 15 * MIN);

  const op: OperacoesPagamento = {
    async expirarVencidas() {
      for (const r of reservas.values()) {
        const aprovado = [...pagamentos.values()].some((p) => p.reservaId === r.id && p.status === "APROVADO");
        if (r.status === "PENDENTE_PAGAMENTO" && !aprovado && relogio >= prazo(r)) {
          r.status = "EXPIRADA";
          // como expirar_reservas_vencidas() (0008): o pagamento pendente da reserva expira junto
          for (const p of pagamentos.values()) if (p.reservaId === r.id && p.status === "PENDENTE") p.expirar();
        }
      }
    },
    async travarReserva(id) {
      travas.push("reserva");
      const r = reservas.get(id);
      if (!r) return null;
      return {
        id: r.id,
        status: r.status,
        valorAluguelCentavos: r.valorAluguelCentavos,
        expiraEm: r.status === "PENDENTE_PAGAMENTO" ? prazo(r) : null,
      };
    },
    async situacao(id) {
      const r = reservas.get(id);
      if (!r) return null;
      const doReserva = [...pagamentos.values()].filter((p) => p.reservaId === id);
      const ultimo = doReserva.sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())[0];
      return { statusReserva: r.status, statusPagamento: ultimo?.status ?? null };
    },
    async confirmarReserva(id) {
      const r = reservas.get(id);
      if (!r || r.status !== "PENDENTE_PAGAMENTO" || relogio >= prazo(r)) return false;
      r.status = "CONFIRMADA";
      return true;
    },
    async pagador() {
      return { nome: "Maria da Silva", email: "maria@bikeilha.test" };
    },
    async buscarPorIdExterno(idExterno) {
      return [...pagamentos.values()].find((p) => p.mpPaymentId === idExterno) ?? null;
    },
    async travarPorIdExterno(idExterno) {
      travas.push("pagamento");
      return [...pagamentos.values()].find((p) => p.mpPaymentId === idExterno) ?? null;
    },
    async salvar(p) {
      if (opcoes.salvarFalha) throw new Error("falha simulada ao gravar o pagamento");
      pagamentos.set(p.id, p);
    },
    async buscarPorId(id) {
      return pagamentos.get(id) ?? null;
    },
    async buscarPendenteDaReserva(id) {
      return [...pagamentos.values()].find((p) => p.reservaId === id && p.status === "PENDENTE") ?? null;
    },
  };

  const criadas: NovaCobrancaPix[] = [];
  const estornos: string[] = [];
  const cancelados: string[] = [];
  const consultas: string[] = [];
  const naStripe = new Map<string, SituacaoNoGateway>();
  const gateway: GatewayPix = {
    async criarCobrancaPix(dados) {
      if (opcoes.gatewayFora) throw new PagamentoIndisponivelError();
      criadas.push(dados);
      const idExterno = `pi_${criadas.length}`;
      naStripe.set(idExterno, "pendente");
      return { idExterno, copiaECola: `00020126-${idExterno}` };
    },
    async consultar(idExterno) {
      consultas.push(idExterno);
      if (opcoes.gatewayFora) throw new PagamentoIndisponivelError();
      return naStripe.get(idExterno) ?? "pendente";
    },
    async estornar(idExterno) {
      if (opcoes.estornoFalha) throw new PagamentoIndisponivelError();
      estornos.push(idExterno);
    },
    async cancelar(idExterno) {
      cancelados.push(idExterno);
    },
  };

  let n = 0;
  const erros: unknown[] = [];
  const limites: number[] = [];
  let emTransacao = 0;
  const deps: DependenciasPagarReserva = {
    // sem banco de verdade: a "transação" só repassa as operações (o rollback é testado no banco)
    transacao: async (_sessao, fn) => {
      emTransacao += 1;
      try {
        return await fn(op);
      } finally {
        emTransacao -= 1;
      }
    },
    agora: () => relogio,
    gerarId: () => `pg-${++n}`,
    gerarQrCode: async (texto) => `png(${texto})`,
    gateway: () => gateway,
    clienteDoPagamento: async (idExterno) =>
      [...pagamentos.values()].some((p) => p.mpPaymentId === idExterno) ? CLIENTE_ID : null,
    registrarErro: (e) => erros.push(e),
    limitarCriacao: async () => {
      // o limite usa outra conexão do pool: dentro de uma transação, esgotava o pool (visto no estresse)
      limites.push(emTransacao);
    },
    intervaloDeConsulta: new IntervaloDeConsulta(opcoes.intervaloMs ?? 0),
  };
  const servico = new PagarReservaService(deps);

  return {
    reservas,
    pagamentos,
    criadas,
    estornos,
    naStripe,
    erros,
    travas,
    cancelados,
    consultas,
    limites,
    iniciar: (sessao: SessaoCliente, c: unknown) => servico.iniciar(sessao, c),
    status: (sessao: SessaoCliente, id: unknown) => servico.consultarStatus(sessao, id),
    aviso: (id: string, situacao: SituacaoNoGateway) => servico.processarAviso(id, situacao),
    avancar: (min: number) => {
      relogio = new Date(relogio.getTime() + min * MIN);
    },
  };
}

describe("POST /api/pagamentos (rota 16) com a Stripe", () => {
  test("cria o Pix na Stripe e devolve o copia e cola dela com o QR (201)", async () => {
    const m = montar();
    const { cobranca, criada } = await m.iniciar(SESSAO, corpo());
    assert.equal(criada, true);
    assert.equal(cobranca.status, "PENDENTE");
    assert.equal(cobranca.valorCentavos, 4800);
    assert.equal(cobranca.pix.copiaECola, "00020126-pi_1");
    assert.equal(cobranca.pix.qrCodeBase64, "png(00020126-pi_1)");
    assert.equal(m.pagamentos.get(cobranca.pagamentoId)?.mpPaymentId, "pi_1");
    // a Stripe recebeu o valor, o pagador e o mesmo prazo do Pix no sistema (o da reserva)
    assert.equal(m.criadas[0].valorCentavos, 4800);
    assert.equal(m.criadas[0].pagador.email, "maria@bikeilha.test");
    assert.equal(m.criadas[0].expiraEm.toISOString(), cobranca.pix.expiraEm);
    assert.equal(cobranca.pix.expiraEm, "2026-11-14T11:14:00.000Z");
  });

  test("pedir de novo devolve o mesmo Pix (200), sem criar outra cobrança na Stripe", async () => {
    const m = montar();
    const a = await m.iniciar(SESSAO, corpo());
    const b = await m.iniciar(SESSAO, corpo());
    assert.equal(b.criada, false);
    assert.equal(b.cobranca.pagamentoId, a.cobranca.pagamentoId);
    assert.equal(b.cobranca.pix.copiaECola, a.cobranca.pix.copiaECola);
    assert.equal(m.criadas.length, 1);
  });

  test("corpo inválido é 400 com o erro de cada campo", async () => {
    const m = montar();
    await assert.rejects(() => m.iniciar(SESSAO, { reservaId: "x", metodo: "BOLETO" }), (e) => {
      assert.ok(e instanceof ValidationError);
      assert.deepEqual(Object.keys(e.details as object).sort(), ["metodo", "reservaId"]);
      return true;
    });
    await assert.rejects(() => m.iniciar(SESSAO, []), ValidationError);
    assert.equal(m.criadas.length, 0);
  });

  test("reserva que não existe (ou é de outro cliente) é 404", async () => {
    await assert.rejects(() => montar().iniciar(SESSAO, corpo(OUTRA_ID)), NotFoundError);
  });

  test("reserva já confirmada ou expirada é 409", async () => {
    const m = montar({ reservaCriadaHaMin: 20 });
    await assert.rejects(() => m.iniciar(SESSAO, corpo()), ConflictError, "expirada antes de pagar");
    assert.equal(m.reservas.get(RESERVA_ID)?.status, "EXPIRADA");
    assert.equal(m.criadas.length, 0);
  });

  test("com menos de 1 minuto de prazo não cria Pix (a Stripe recusaria): 409", async () => {
    const m = montar({ reservaCriadaHaMin: 14.5 });
    await assert.rejects(() => m.iniciar(SESSAO, corpo()), ConflictError);
    assert.equal(m.criadas.length, 0);
    assert.equal(m.pagamentos.size, 0);
  });

  test("Stripe fora do ar é 502 e nada é gravado", async () => {
    const m = montar({ gatewayFora: true });
    await assert.rejects(() => m.iniciar(SESSAO, corpo()), PagamentoIndisponivelError);
    assert.equal(m.pagamentos.size, 0);
  });
});

describe("GET /api/pagamentos/{reservaId}/status (rota 17)", () => {
  test("sem cobrança: statusPagamento null", async () => {
    assert.deepEqual(await montar().status(SESSAO, RESERVA_ID), {
      reservaId: RESERVA_ID,
      statusPagamento: null,
      statusReserva: "PENDENTE_PAGAMENTO",
    });
  });

  test("Pix pago na Stripe: a consulta aprova o pagamento e confirma a reserva", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    assert.equal((await m.status(SESSAO, RESERVA_ID)).statusPagamento, "PENDENTE");
    m.naStripe.set("pi_1", "aprovado");
    assert.deepEqual(await m.status(SESSAO, RESERVA_ID), {
      reservaId: RESERVA_ID,
      statusPagamento: "APROVADO",
      statusReserva: "CONFIRMADA",
    });
  });

  test("Stripe fora do ar na consulta: devolve o que o banco sabe e registra o erro", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    const fora = montar({ gatewayFora: true });
    // mesma situação, com a consulta falhando
    fora.pagamentos.set(...([...m.pagamentos.entries()][0] as [string, Pagamento]));
    const s = await fora.status(SESSAO, RESERVA_ID);
    assert.equal(s.statusPagamento, "PENDENTE");
    assert.equal(fora.erros.length, 1);
  });

  test("id que não é UUID é 404 sem ir ao banco", async () => {
    await assert.rejects(() => montar().status(SESSAO, "abc"), NotFoundError);
  });
});

describe("POST /api/pagamentos/webhook (rota 18): aviso da Stripe", () => {
  test("aprovado: confirma a reserva; o mesmo aviso de novo não muda nada", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    assert.equal(await m.aviso("pi_1", "aprovado"), "confirmado");
    assert.equal(m.reservas.get(RESERVA_ID)?.status, "CONFIRMADA");
    assert.equal(await m.aviso("pi_1", "aprovado"), "ignorado");
    assert.equal(m.estornos.length, 0);
  });

  test("pago depois que a reserva caiu: estorna na Stripe e marca ESTORNADO", async () => {
    const m = montar();
    const { cobranca } = await m.iniciar(SESSAO, corpo());
    m.reservas.get(RESERVA_ID)!.status = "CANCELADA";
    assert.equal(await m.aviso("pi_1", "aprovado"), "estornado");
    assert.deepEqual(m.estornos, ["pi_1"]);
    assert.equal(m.pagamentos.get(cobranca.pagamentoId)?.status, "ESTORNADO");
    assert.equal(await m.aviso("pi_1", "aprovado"), "ignorado", "não estorna duas vezes");
    assert.equal(m.estornos.length, 1);
  });

  test("pago depois do prazo da reserva: estorna em vez de confirmar", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    m.avancar(20);
    assert.equal(await m.aviso("pi_1", "aprovado"), "estornado");
    assert.notEqual(m.reservas.get(RESERVA_ID)?.status, "CONFIRMADA");
  });

  test("recusado e expirado acompanham o pagamento pendente", async () => {
    const m = montar();
    const { cobranca } = await m.iniciar(SESSAO, corpo());
    assert.equal(await m.aviso("pi_1", "expirado"), "atualizado");
    assert.equal(m.pagamentos.get(cobranca.pagamentoId)?.status, "EXPIRADO");
    assert.equal(await m.aviso("pi_1", "recusado"), "ignorado");
  });

  test("cobrança desconhecida é ignorada (200 para a Stripe não reenviar)", async () => {
    assert.equal(await montar().aviso("pi_nao_existe", "aprovado"), "ignorado");
  });
});

// ---------------------------------------------------------------------------------------------
// Ajustes da revisão do #80
// ---------------------------------------------------------------------------------------------

describe("revisão do #80: concorrência, pagamento tardio, limite e Pix órfão", () => {
  test("o aviso trava a reserva ANTES do pagamento (a ordem de expirar_reservas_vencidas, sem deadlock)", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    m.travas.length = 0;
    await m.aviso("pi_1", "aprovado");
    assert.deepEqual(m.travas, ["reserva", "pagamento"]);
  });

  test("a consulta de status também trava a reserva antes do pagamento", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    m.naStripe.set("pi_1", "aprovado");
    m.travas.length = 0;
    await m.status(SESSAO, RESERVA_ID);
    assert.deepEqual(m.travas.slice(0, 2), ["reserva", "pagamento"]);
  });

  test("Pix pago no último segundo, aviso depois da expiração do banco: estorna e grava ESTORNADO", async () => {
    const m = montar();
    const { cobranca } = await m.iniciar(SESSAO, corpo());
    m.avancar(20);
    await m.status(SESSAO, RESERVA_ID); // outra consulta expira a reserva e o pagamento, como o banco
    assert.equal(m.pagamentos.get(cobranca.pagamentoId)?.status, "EXPIRADO");
    assert.equal(await m.aviso("pi_1", "aprovado"), "estornado");
    assert.deepEqual(m.estornos, ["pi_1"]);
    const pagamento = m.pagamentos.get(cobranca.pagamentoId)!;
    assert.equal(pagamento.status, "ESTORNADO");
    assert.equal(pagamento.valorEstornado.centavos, 4800);
    assert.equal((await m.status(SESSAO, RESERVA_ID)).statusPagamento, "ESTORNADO", "a tela vê o estorno");
    assert.equal(await m.aviso("pi_1", "aprovado"), "ignorado", "não estorna duas vezes");
    assert.equal(m.estornos.length, 1);
  });

  test("rota 17: estorno que falha não derruba a consulta (devolve o que o banco sabe e registra o erro)", async () => {
    const m = montar({ estornoFalha: true });
    await m.iniciar(SESSAO, corpo());
    m.reservas.get(RESERVA_ID)!.status = "CANCELADA";
    m.naStripe.set("pi_1", "aprovado");
    const s = await m.status(SESSAO, RESERVA_ID);
    assert.equal(s.statusReserva, "CANCELADA");
    assert.equal(m.erros.length, 1);
  });

  test("rota 17: pergunta à Stripe no máximo uma vez por intervalo para a mesma cobrança", async () => {
    const m = montar({ intervaloMs: 6000 });
    await m.iniciar(SESSAO, corpo());
    for (let i = 0; i < 5; i++) await m.status(SESSAO, RESERVA_ID);
    assert.equal(m.consultas.length, 1);
    m.avancar(0.1); // 6 s depois
    await m.status(SESSAO, RESERVA_ID);
    assert.equal(m.consultas.length, 2);
  });

  test("o limite de cobranças só conta quando uma cobrança nova é criada (reabrir a tela não conta)", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    for (let i = 0; i < 15; i++) assert.equal((await m.iniciar(SESSAO, corpo())).criada, false);
    assert.equal(m.limites.length, 1);
  });

  test("o limite é conferido fora de qualquer transação (não pede uma segunda conexão com a reserva travada)", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    assert.deepEqual(m.limites, [0]);
  });

  test("Pix pendente vencido: a cobrança nova conta no limite", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    m.avancar(14.2); // o Pix (14 min, o prazo da reserva) venceu, mas a reserva ainda não
    await m.iniciar(SESSAO, corpo()).catch(() => {});
    assert.equal(m.limites.length, 2);
  });

  test("se gravar falha depois de criar o Pix na Stripe, o Pix é cancelado (não fica órfão)", async () => {
    const m = montar({ salvarFalha: true });
    await assert.rejects(() => m.iniciar(SESSAO, corpo()));
    assert.equal(m.criadas.length, 1);
    assert.deepEqual(m.cancelados, ["pi_1"]);
  });

  test("Stripe fora do ar ao criar: nada a cancelar", async () => {
    const m = montar({ gatewayFora: true });
    await assert.rejects(() => m.iniciar(SESSAO, corpo()), PagamentoIndisponivelError);
    assert.deepEqual(m.cancelados, []);
  });

  test("estresse: 5 mil consultas e 5 mil avisos repetidos não duplicam confirmação nem estorno", async () => {
    const m = montar();
    await m.iniciar(SESSAO, corpo());
    m.naStripe.set("pi_1", "aprovado");
    await Promise.all(Array.from({ length: 5000 }, () => m.status(SESSAO, RESERVA_ID)));
    const avisos = await Promise.all(Array.from({ length: 5000 }, () => m.aviso("pi_1", "aprovado")));
    assert.deepEqual([...new Set(avisos)], ["ignorado"]);
    assert.equal(m.reservas.get(RESERVA_ID)?.status, "CONFIRMADA");
    assert.equal(m.estornos.length, 0);
  });
});
