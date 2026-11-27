import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ConflictError,
  NotFoundError,
  PagamentoIndisponivelError,
  ValidationError,
} from "../../../shared/http/errors.ts";
import type { Pagamento } from "../domain/pagamento.ts";
import {
  criarConsultarStatus,
  criarIniciarPagamento,
  criarProcessarAviso,
  type DependenciasPagarReserva,
} from "./pagar-reserva.ts";
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
function montar(opcoes: { reservaCriadaHaMin?: number; gatewayFora?: boolean } = {}) {
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
  const prazo = (r: ReservaFalsa) => new Date(r.criadaEm.getTime() + 15 * MIN);

  const op: OperacoesPagamento = {
    async expirarVencidas() {
      for (const r of reservas.values()) {
        const aprovado = [...pagamentos.values()].some((p) => p.reservaId === r.id && p.status === "APROVADO");
        if (r.status === "PENDENTE_PAGAMENTO" && !aprovado && relogio >= prazo(r)) r.status = "EXPIRADA";
      }
    },
    async travarReserva(id) {
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
    async travarPorIdExterno(idExterno) {
      return [...pagamentos.values()].find((p) => p.mpPaymentId === idExterno) ?? null;
    },
    async salvar(p) {
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
      if (opcoes.gatewayFora) throw new PagamentoIndisponivelError();
      return naStripe.get(idExterno) ?? "pendente";
    },
    async estornar(idExterno) {
      estornos.push(idExterno);
    },
  };

  let n = 0;
  const erros: unknown[] = [];
  const deps: DependenciasPagarReserva = {
    // sem banco de verdade: a "transação" só repassa as operações (o rollback é testado no banco)
    transacao: (_sessao, fn) => fn(op),
    agora: () => relogio,
    gerarId: () => `pg-${++n}`,
    gerarQrCode: async (texto) => `png(${texto})`,
    gateway: () => gateway,
    clienteDoPagamento: async (idExterno) =>
      [...pagamentos.values()].some((p) => p.mpPaymentId === idExterno) ? CLIENTE_ID : null,
    registrarErro: (e) => erros.push(e),
  };

  return {
    reservas,
    pagamentos,
    criadas,
    estornos,
    naStripe,
    erros,
    iniciar: criarIniciarPagamento(deps),
    status: criarConsultarStatus(deps),
    aviso: criarProcessarAviso(deps),
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
