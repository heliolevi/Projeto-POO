import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { criarPagamento, PagamentoPix } from "../domain/formas-de-pagamento.ts";
import { TransicaoDePagamentoInvalida, type MetodoPagamento, type Pagamento } from "../domain/pagamento.ts";
import { PagamentoService, type RepositorioDePagamentos } from "./pagamento-service.ts";

const AGORA = new Date("2026-11-14T11:00:00.000Z");
const RESERVA = { id: "r-1", status: "PENDENTE_PAGAMENTO", valorAluguelCentavos: 4800 };

function montar() {
  const guardados = new Map<string, Pagamento>();
  const confirmadas: string[] = [];
  const repositorio: RepositorioDePagamentos = {
    salvar: async (p) => void guardados.set(p.id, p),
    buscarPorId: async (id) => guardados.get(id) ?? null,
    buscarPendenteDaReserva: async (reservaId: string, metodo: MetodoPagamento) =>
      [...guardados.values()].find(
        (p) => p.reservaId === reservaId && p.metodo === metodo && p.status === "PENDENTE",
      ) ?? null,
  };
  let n = 0;
  const servico = new PagamentoService({
    repositorio,
    agora: () => AGORA,
    gerarId: () => `pg-${++n}`,
    aoAprovar: async (reservaId) => void confirmadas.push(reservaId),
  });
  return { guardados, confirmadas, servico };
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

describe("PagamentoService.processarWebhook", () => {
  test("aprovado confirma o pagamento e a reserva", async () => {
    const { confirmadas, guardados, servico } = montar();
    await servico.iniciarPagamento(RESERVA, "PIX");
    const r = await servico.processarWebhook({ pagamentoId: "pg-1", mpPaymentId: "mp-9", situacao: "aprovado" });
    assert.deepEqual(r, { pagamentoId: "pg-1", status: "APROVADO" });
    assert.equal(guardados.get("pg-1")?.mpPaymentId, "mp-9");
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
    // Um banco de verdade devolve um objeto novo a cada leitura: guardamos um retrato e reconstruímos.
    type Retrato = { id: string; reservaId: string; metodo: MetodoPagamento; centavos: number; status: string; mp: string | null };
    const banco = new Map<string, Retrato>();
    const ler = (r: Retrato) =>
      criarPagamento(r.metodo, {
        id: r.id,
        reservaId: r.reservaId,
        valor: Dinheiro.deCentavos(r.centavos),
        criadoEm: AGORA,
        status: r.status as never,
        mpPaymentId: r.mp,
      });
    const confirmadas: string[] = [];
    let fora = true;
    const servico = new PagamentoService({
      repositorio: {
        salvar: async (p) =>
          void banco.set(p.id, { id: p.id, reservaId: p.reservaId, metodo: p.metodo, centavos: p.valor.centavos, status: p.status, mp: p.mpPaymentId }),
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
    assert.deepEqual(confirmadas, []);

    fora = false;
    assert.equal((await servico.processarWebhook(evento)).status, "APROVADO");
    assert.deepEqual(confirmadas, ["r-1"]);
    assert.equal(banco.get("pg-1")?.status, "APROVADO");
  });
});
