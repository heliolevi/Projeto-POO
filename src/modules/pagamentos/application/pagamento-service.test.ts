import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { criarPagamento, PagamentoPix, type CobrancaPix } from "../domain/formas-de-pagamento.ts";
import { TransicaoDePagamentoInvalida, type CobrancaGerada, type MetodoPagamento, type Pagamento } from "../domain/pagamento.ts";
import { PagamentoService, type RepositorioDePagamentos } from "./pagamento-service.ts";

const AGORA = new Date("2026-11-14T11:00:00.000Z");
const MIN = 60_000;
const emMin = (base: Date, min: number) => new Date(base.getTime() + min * MIN);
const expiraDoPix = (c: CobrancaGerada) => (c as CobrancaPix).pix.expiraEm;
// a reserva pendente expira 15 minutos depois de criada (aqui, criada em AGORA)
const RESERVA = { id: "r-1", status: "PENDENTE_PAGAMENTO", valorAluguelCentavos: 4800, expiraEm: emMin(AGORA, 15) };

function montar() {
  let relogio = AGORA;
  const guardados = new Map<string, Pagamento>();
  const confirmadas: string[] = [];
  const repositorio: RepositorioDePagamentos = {
    salvar: async (p) => void guardados.set(p.id, p),
    buscarPorId: async (id) => guardados.get(id) ?? null,
    buscarPendenteDaReserva: async (reservaId: string) =>
      [...guardados.values()].find((p) => p.reservaId === reservaId && p.status === "PENDENTE") ?? null,
  };
  let n = 0;
  const servico = new PagamentoService({
    repositorio,
    agora: () => relogio,
    gerarId: () => `pg-${++n}`,
    aoAprovar: async (reservaId) => void confirmadas.push(reservaId),
  });
  return {
    guardados,
    confirmadas,
    servico,
    avancar: (min: number) => {
      relogio = emMin(relogio, min);
    },
  };
}

describe("PagamentoService.iniciarPagamento", () => {
  test("cria o Pix pendente cobrando só o aluguel e devolve a cobrança", async () => {
    const { guardados, servico } = montar();
    const cobranca = await servico.iniciarPagamento(RESERVA, "PIX");
    assert.equal(cobranca.metodo, "PIX");
    assert.equal(cobranca.status, "PENDENTE");
    assert.equal(cobranca.valorCentavos, 4800);
    assert.equal(guardados.size, 1);
    assert.ok(guardados.get("pg-1") instanceof PagamentoPix);
    assert.ok("pix" in cobranca);
  });

  test("é idempotente: o mesmo Pix pendente volta, sem criar outro", async () => {
    const { guardados, servico } = montar();
    const a = await servico.iniciarPagamento(RESERVA, "PIX");
    const b = await servico.iniciarPagamento(RESERVA, "PIX");
    assert.equal(a.pagamentoId, b.pagamentoId);
    assert.equal(guardados.size, 1);
  });

  test("cartão cria o pagamento pendente sem gerar cobrança ainda", async () => {
    const { servico } = montar();
    const cobranca = await servico.iniciarPagamento(RESERVA, "CARTAO_CREDITO");
    assert.equal(cobranca.metodo, "CARTAO_CREDITO");
    assert.equal(cobranca.status, "PENDENTE");
    assert.ok(!("cartao" in cobranca));
  });

  test("cartão já pendente também é idempotente e não lança por falta de token", async () => {
    const { guardados, servico } = montar();
    const a = await servico.iniciarPagamento(RESERVA, "CARTAO_DEBITO");
    const b = await servico.iniciarPagamento(RESERVA, "CARTAO_DEBITO");
    assert.equal(a.pagamentoId, b.pagamentoId);
    assert.equal(b.metodo, "CARTAO_DEBITO");
    assert.equal(guardados.size, 1);
  });

  test("forma de pagamento inválida é 400", async () => {
    const { servico } = montar();
    for (const ruim of ["BOLETO", "", undefined, 3]) {
      await assert.rejects(() => servico.iniciarPagamento(RESERVA, ruim), ValidationError, String(ruim));
    }
  });

  test("só reserva pendente de pagamento pode ser paga (409)", async () => {
    const { guardados, servico } = montar();
    for (const status of ["CONFIRMADA", "EXPIRADA", "CANCELADA", "EM_ANDAMENTO", "CONCLUIDA"]) {
      await assert.rejects(() => servico.iniciarPagamento({ ...RESERVA, status }, "PIX"), ConflictError, status);
    }
    assert.equal(guardados.size, 0);
  });
});

describe("PagamentoService.iniciarPagamento: o Pix vale até a reserva expirar", () => {
  test("o Pix criado depois da reserva vale só até o prazo dela (não 15 minutos a partir do Pix)", async () => {
    const { avancar, servico } = montar();
    avancar(10); // o Pix é gerado aos 10 minutos da reserva, que expira aos 15
    const cobranca = await servico.iniciarPagamento(RESERVA, "PIX");
    assert.ok("pix" in cobranca);
    assert.equal(expiraDoPix(cobranca), emMin(AGORA, 15).toISOString(), "expira junto com a reserva, e não aos 25 minutos");
  });

  test("com a reserva ainda longe de expirar, o Pix vale 15 minutos", async () => {
    const { servico } = montar();
    const cobranca = await servico.iniciarPagamento({ ...RESERVA, expiraEm: emMin(AGORA, 60) }, "PIX");
    assert.ok("pix" in cobranca);
    assert.equal(expiraDoPix(cobranca), emMin(AGORA, 15).toISOString());
  });

  test("reserva sem prazo informado: vale o prazo padrão do Pix", async () => {
    const { servico } = montar();
    const cobranca = await servico.iniciarPagamento({ ...RESERVA, expiraEm: null }, "PIX");
    assert.ok("pix" in cobranca);
    assert.equal(expiraDoPix(cobranca), emMin(AGORA, 15).toISOString());
  });

  test("reserva cujo prazo já venceu não gera cobrança (409) e nada é gravado", async () => {
    const { avancar, guardados, servico } = montar();
    avancar(15);
    await assert.rejects(() => servico.iniciarPagamento(RESERVA, "PIX"), ConflictError);
    await assert.rejects(() => servico.iniciarPagamento(RESERVA, "CARTAO_CREDITO"), ConflictError);
    assert.equal(guardados.size, 0);
  });
});

describe("PagamentoService.iniciarPagamento: Pix vencido não trava a reserva", () => {
  const LONGA = { ...RESERVA, expiraEm: emMin(AGORA, 120) };

  test("um Pix pendente que venceu é expirado e a nova tentativa cria outro", async () => {
    const { avancar, guardados, servico } = montar();
    const primeiro = await servico.iniciarPagamento(LONGA, "PIX");
    avancar(16);
    const segundo = await servico.iniciarPagamento(LONGA, "PIX");
    assert.notEqual(segundo.pagamentoId, primeiro.pagamentoId);
    assert.equal(segundo.status, "PENDENTE");
    assert.equal(guardados.get(primeiro.pagamentoId)?.status, "EXPIRADO");
    assert.equal(guardados.get(segundo.pagamentoId)?.status, "PENDENTE");
    assert.ok("pix" in segundo);
    assert.equal(expiraDoPix(segundo), emMin(AGORA, 31).toISOString());
  });

  test("no instante exato do vencimento o Pix já é considerado vencido", async () => {
    const { avancar, guardados, servico } = montar();
    const primeiro = await servico.iniciarPagamento(LONGA, "PIX");
    avancar(15);
    const segundo = await servico.iniciarPagamento(LONGA, "PIX");
    assert.notEqual(segundo.pagamentoId, primeiro.pagamentoId);
    assert.equal(guardados.get(primeiro.pagamentoId)?.status, "EXPIRADO");
  });

  test("um segundo pedido logo depois ainda devolve o mesmo Pix (não substitui um Pix válido)", async () => {
    const { avancar, guardados, servico } = montar();
    const primeiro = await servico.iniciarPagamento(LONGA, "PIX");
    avancar(14);
    const segundo = await servico.iniciarPagamento(LONGA, "PIX");
    assert.equal(segundo.pagamentoId, primeiro.pagamentoId);
    assert.equal(guardados.size, 1);
  });

  test("depois que o Pix vence, dá para escolher outra forma de pagamento", async () => {
    const { avancar, guardados, servico } = montar();
    const pix = await servico.iniciarPagamento(LONGA, "PIX");
    avancar(16);
    const cartao = await servico.iniciarPagamento(LONGA, "CARTAO_CREDITO");
    assert.equal(cartao.metodo, "CARTAO_CREDITO");
    assert.equal(guardados.get(pix.pagamentoId)?.status, "EXPIRADO");
  });
});

describe("PagamentoService.iniciarPagamento: nunca dois pagamentos pendentes (cobrança dupla)", () => {
  test("com um Pix válido pendente, pedir cartão é 409 e nada novo é criado", async () => {
    const { guardados, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    await assert.rejects(() => servico.iniciarPagamento(RESERVA, "CARTAO_CREDITO"), (erro) => {
      assert.ok(erro instanceof ConflictError);
      assert.match((erro as ConflictError).message, /outra forma/);
      return true;
    });
    assert.equal(guardados.size, 1);
    assert.equal([...guardados.values()].filter((p) => p.status === "PENDENTE").length, 1);
  });

  test("com um cartão pendente, pedir Pix é 409", async () => {
    const { guardados, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "CARTAO_CREDITO");
    await assert.rejects(() => servico.iniciarPagamento(RESERVA, "PIX"), ConflictError);
    assert.equal(guardados.size, 1);
  });

  test("crédito e débito também são formas diferentes: um bloqueia o outro", async () => {
    const { guardados, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "CARTAO_CREDITO");
    await assert.rejects(() => servico.iniciarPagamento(RESERVA, "CARTAO_DEBITO"), ConflictError);
    assert.equal(guardados.size, 1);
  });

  test("outra reserva não é afetada pelo pagamento pendente desta", async () => {
    const { guardados, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    await servico.iniciarPagamento({ ...RESERVA, id: "r-2" }, "CARTAO_CREDITO");
    assert.equal(guardados.size, 2);
  });

  test("depois que o pendente é recusado, a reserva pode tentar outra forma", async () => {
    const { servico } = montar();
    const primeiro = await servico.iniciarPagamento(RESERVA, "PIX");
    await servico.processarWebhook({ pagamentoId: primeiro.pagamentoId, mpPaymentId: null, situacao: "recusado" });
    const segundo = await servico.iniciarPagamento(RESERVA, "CARTAO_CREDITO");
    assert.equal(segundo.metodo, "CARTAO_CREDITO");
  });
});

describe("PagamentoService.processarWebhook", () => {
  test("aprovado confirma o pagamento e a reserva, e guarda a data do pagamento", async () => {
    const { avancar, confirmadas, guardados, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    avancar(3);
    const r = await servico.processarWebhook({ pagamentoId: "pg-1", mpPaymentId: "mp-9", situacao: "aprovado" });
    assert.deepEqual(r, { pagamentoId: "pg-1", status: "APROVADO" });
    assert.equal(guardados.get("pg-1")?.mpPaymentId, "mp-9");
    assert.equal(guardados.get("pg-1")?.pagoEm?.getTime(), emMin(AGORA, 3).getTime());
    assert.deepEqual(confirmadas, ["r-1"]);
  });

  test("é idempotente: o mesmo aviso duas vezes não confirma a reserva duas vezes", async () => {
    const { confirmadas, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    const evento = { pagamentoId: "pg-1", mpPaymentId: "mp-9", situacao: "aprovado" as const };
    await servico.processarWebhook(evento);
    const segunda = await servico.processarWebhook(evento);
    assert.equal(segunda.status, "APROVADO");
    assert.deepEqual(confirmadas, ["r-1"]);
  });

  test("recusado e expirado atualizam o pagamento e não confirmam a reserva", async () => {
    const { confirmadas, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    const r = await servico.processarWebhook({ pagamentoId: "pg-1", mpPaymentId: null, situacao: "recusado" });
    assert.equal(r.status, "RECUSADO");
    await servico.iniciarPagamento({ ...RESERVA, id: "r-2" }, "PIX");
    const e = await servico.processarWebhook({ pagamentoId: "pg-2", mpPaymentId: null, situacao: "expirado" });
    assert.equal(e.status, "EXPIRADO");
    assert.deepEqual(confirmadas, []);
  });

  test("os avisos de recusado, expirado e estornado repetidos também respondem sucesso (sem 409)", async () => {
    const { confirmadas, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    const recusado = { pagamentoId: "pg-1", mpPaymentId: null, situacao: "recusado" as const };
    assert.equal((await servico.processarWebhook(recusado)).status, "RECUSADO");
    assert.equal((await servico.processarWebhook(recusado)).status, "RECUSADO");

    await servico.iniciarPagamento({ ...RESERVA, id: "r-2" }, "PIX");
    const expirado = { pagamentoId: "pg-2", mpPaymentId: null, situacao: "expirado" as const };
    assert.equal((await servico.processarWebhook(expirado)).status, "EXPIRADO");
    assert.equal((await servico.processarWebhook(expirado)).status, "EXPIRADO");

    await servico.iniciarPagamento({ ...RESERVA, id: "r-3" }, "PIX");
    await servico.processarWebhook({ pagamentoId: "pg-3", mpPaymentId: "mp-3", situacao: "aprovado" });
    const estornado = { pagamentoId: "pg-3", mpPaymentId: "mp-3", situacao: "estornado" as const };
    assert.equal((await servico.processarWebhook(estornado)).status, "ESTORNADO");
    assert.equal((await servico.processarWebhook(estornado)).status, "ESTORNADO");
    assert.deepEqual(confirmadas, ["r-3"], "só o aprovado confirmou uma reserva, e uma vez");
  });

  test("um aviso que contradiz o estado continua sendo 409 (recusado para um pagamento já aprovado)", async () => {
    const { guardados, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    await servico.processarWebhook({ pagamentoId: "pg-1", mpPaymentId: "mp-9", situacao: "aprovado" });
    await assert.rejects(
      () => servico.processarWebhook({ pagamentoId: "pg-1", mpPaymentId: null, situacao: "recusado" }),
      TransicaoDePagamentoInvalida,
    );
    assert.equal(guardados.get("pg-1")?.status, "APROVADO");
  });

  test("estornado devolve o que resta de um pagamento aprovado", async () => {
    const { servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    await servico.processarWebhook({ pagamentoId: "pg-1", mpPaymentId: "mp-9", situacao: "aprovado" });
    const r = await servico.processarWebhook({ pagamentoId: "pg-1", mpPaymentId: "mp-9", situacao: "estornado" });
    assert.equal(r.status, "ESTORNADO");
  });

  test("estornar um pagamento pendente é recusado e não altera nada", async () => {
    const { guardados, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    await assert.rejects(
      () => servico.processarWebhook({ pagamentoId: "pg-1", mpPaymentId: null, situacao: "estornado" }),
      TransicaoDePagamentoInvalida,
    );
    assert.equal(guardados.get("pg-1")?.status, "PENDENTE");
  });

  test("pagamento desconhecido é 404", async () => {
    const { servico } = montar();
    await assert.rejects(
      () => servico.processarWebhook({ pagamentoId: "nao-existe", mpPaymentId: null, situacao: "aprovado" }),
      NotFoundError,
    );
  });

  test("se a reserva não pôde ser confirmada o erro sobe, o pagamento segue pendente e o reenvio funciona", async () => {
    // Um banco de verdade devolve um objeto novo a cada leitura: guardamos um retrato e reconstruímos,
    // como o repositório faz (o pago_em só vai ao banco quando o status é APROVADO).
    type Retrato = {
      id: string;
      reservaId: string;
      metodo: MetodoPagamento;
      centavos: number;
      status: string;
      mp: string | null;
      pagoEm: Date | null;
    };
    const banco = new Map<string, Retrato>();
    const ler = (r: Retrato) =>
      criarPagamento(r.metodo, {
        id: r.id,
        reservaId: r.reservaId,
        valor: Dinheiro.deCentavos(r.centavos),
        criadoEm: AGORA,
        status: r.status as never,
        mpPaymentId: r.mp,
        pagoEm: r.pagoEm,
      });
    const confirmadas: string[] = [];
    let fora = true;
    const servico = new PagamentoService({
      repositorio: {
        salvar: async (p) =>
          void banco.set(p.id, {
            id: p.id,
            reservaId: p.reservaId,
            metodo: p.metodo,
            centavos: p.valor.centavos,
            status: p.status,
            mp: p.mpPaymentId,
            pagoEm: p.pagoEmParaPersistir(),
          }),
        buscarPorId: async (id) => (banco.has(id) ? ler(banco.get(id)!) : null),
        buscarPendenteDaReserva: async () => null,
      },
      agora: () => AGORA,
      gerarId: () => "pg-1",
      aoAprovar: async (reservaId) => {
        if (fora) throw new Error("reserva fora do ar");
        confirmadas.push(reservaId);
      },
    });
    await servico.iniciarPagamento(RESERVA, "PIX");
    const evento = { pagamentoId: "pg-1", mpPaymentId: "mp-9", situacao: "aprovado" as const };

    await assert.rejects(() => servico.processarWebhook(evento), /reserva fora do ar/);
    assert.equal(banco.get("pg-1")?.status, "PENDENTE");
    assert.equal(banco.get("pg-1")?.pagoEm, null);
    assert.deepEqual(confirmadas, []);

    fora = false;
    assert.equal((await servico.processarWebhook(evento)).status, "APROVADO");
    assert.deepEqual(confirmadas, ["r-1"]);
    assert.equal(banco.get("pg-1")?.status, "APROVADO");
    assert.equal(banco.get("pg-1")?.pagoEm?.getTime(), AGORA.getTime(), "o pagamento aprovado grava a data (pago_em)");
  });
});
