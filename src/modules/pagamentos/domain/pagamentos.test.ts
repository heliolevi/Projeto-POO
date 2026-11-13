import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { PRAZO_DE_PAGAMENTO_MS } from "../../../shared/dominio/prazos.ts";
import { ConflictError } from "../../../shared/http/errors.ts";
import {
  criarPagamento,
  PagamentoCartao,
  PagamentoPix,
  PRAZO_DO_PIX_MS,
} from "./formas-de-pagamento.ts";
import {
  METODOS_PAGAMENTO,
  Pagamento,
  STATUS_PAGAMENTO,
  TransicaoDePagamentoInvalida,
  type StatusPagamento,
} from "./pagamento.ts";

const CRIADO = new Date("2026-11-14T11:00:00.000Z");
const MIN = 60_000;
const dados = (parcial = {}) => ({
  id: "pg-1",
  reservaId: "r-1",
  valor: Dinheiro.deCentavos(4800),
  criadoEm: CRIADO,
  ...parcial,
});
const pix = (status?: StatusPagamento) => new PagamentoPix(dados({ status }));
const cartao = (debito = false) => new PagamentoCartao({ ...dados(), debito });

describe("Pagamento (classe abstrata): ciclo de vida", () => {
  test("nasce PENDENTE, sem id do Mercado Pago e sem estorno", () => {
    const p = pix();
    assert.equal(p.status, "PENDENTE");
    assert.equal(p.mpPaymentId, null);
    assert.ok(p.valorEstornado.ehZero());
    assert.equal(p.reservaId, "r-1");
    assert.equal(p.valor.centavos, 4800);
  });

  test("recusa dados inválidos", () => {
    assert.throws(() => new PagamentoPix(dados({ id: "" })), RangeError);
    assert.throws(() => new PagamentoPix(dados({ reservaId: "" })), RangeError);
    assert.throws(() => new PagamentoPix(dados({ valor: Dinheiro.ZERO })), RangeError);
    assert.throws(() => new PagamentoPix(dados({ valorEstornado: Dinheiro.deCentavos(4801) })), RangeError);
  });

  test("confirmar: PENDENTE -> APROVADO e guarda o id do Mercado Pago", () => {
    const p = pix();
    p.confirmar("mp-123");
    assert.equal(p.status, "APROVADO");
    assert.equal(p.mpPaymentId, "mp-123");
  });

  test("confirmar é idempotente com o mesmo id (aviso duplicado) e conflito com outro id", () => {
    const p = pix();
    p.confirmar("mp-123");
    p.confirmar("mp-123");
    assert.equal(p.status, "APROVADO");
    assert.throws(() => p.confirmar("mp-999"), TransicaoDePagamentoInvalida);
    assert.equal(p.mpPaymentId, "mp-123");
  });

  test("no MVP simulado o id do Mercado Pago fica vazio", () => {
    const p = pix();
    p.confirmar(null);
    assert.equal(p.status, "APROVADO");
    assert.equal(p.mpPaymentId, null);
    p.confirmar(null);
    assert.equal(p.status, "APROVADO");
  });

  test("recusar e expirar só valem para pendente", () => {
    const recusado = pix();
    recusado.recusar();
    assert.equal(recusado.status, "RECUSADO");
    const expirado = pix();
    expirado.expirar();
    assert.equal(expirado.status, "EXPIRADO");
    for (const status of ["APROVADO", "RECUSADO", "ESTORNADO", "EXPIRADO"] as const) {
      assert.throws(() => pix(status).recusar(), TransicaoDePagamentoInvalida, status);
      assert.throws(() => pix(status).expirar(), TransicaoDePagamentoInvalida, status);
    }
  });

  test("os estados finais não confirmam", () => {
    for (const status of ["RECUSADO", "ESTORNADO", "EXPIRADO"] as const) {
      assert.throws(() => pix(status).confirmar("mp-1"), TransicaoDePagamentoInvalida, status);
    }
  });

  test("a transição inválida é um 409", () => {
    assert.throws(
      () => pix("EXPIRADO").confirmar("x"),
      (erro) => erro instanceof ConflictError && (erro as ConflictError).status === 409,
    );
  });

  test("encapsulamento: o status não é um campo alterável de fora", () => {
    const p = pix();
    assert.deepEqual(Object.keys(p), []);
    p.criadoEm.setUTCFullYear(1999);
    assert.equal(p.criadoEm.getUTCFullYear(), 2026);
  });
});

describe("Pagamento: estorno", () => {
  test("estorno total passa para ESTORNADO", () => {
    const p = pix("APROVADO");
    p.estornar(Dinheiro.deCentavos(4800));
    assert.equal(p.status, "ESTORNADO");
    assert.ok(p.restanteParaEstorno().ehZero());
  });

  test("estorno parcial mantém APROVADO e acumula; o último completa", () => {
    const p = pix("APROVADO");
    p.estornar(Dinheiro.deCentavos(1000));
    assert.equal(p.status, "APROVADO");
    assert.equal(p.valorEstornado.centavos, 1000);
    assert.equal(p.restanteParaEstorno().centavos, 3800);
    p.estornar(Dinheiro.deCentavos(3800));
    assert.equal(p.status, "ESTORNADO");
  });

  test("não estorna mais do que resta, nem zero, nem pagamento que não foi aprovado", () => {
    const p = pix("APROVADO");
    p.estornar(Dinheiro.deCentavos(4000));
    assert.throws(() => p.estornar(Dinheiro.deCentavos(801)), RangeError);
    assert.throws(() => p.estornar(Dinheiro.ZERO), RangeError);
    assert.equal(p.valorEstornado.centavos, 4000);
    for (const status of ["PENDENTE", "RECUSADO", "EXPIRADO", "ESTORNADO"] as const) {
      assert.throws(() => pix(status).estornar(Dinheiro.deCentavos(1)), TransicaoDePagamentoInvalida, status);
    }
  });
});

describe("PagamentoPix", () => {
  test("o método é PIX e vale 15 minutos", () => {
    assert.equal(pix().metodo, "PIX");
    assert.equal(PRAZO_DO_PIX_MS, 15 * MIN);
    assert.equal(pix().expiraEm().getTime(), CRIADO.getTime() + 15 * MIN);
  });

  test("gerarPix devolve o copia e cola simulado dentro do prazo", () => {
    assert.equal(pix().gerarPix(new Date(CRIADO.getTime() + 14 * MIN)), "PIX-SIMULADO|pg-1|4800");
  });

  test("gerarPix depois do prazo ou fora de PENDENTE é recusado", () => {
    assert.throws(() => pix().gerarPix(new Date(CRIADO.getTime() + 15 * MIN)), TransicaoDePagamentoInvalida);
    assert.throws(() => pix("APROVADO").gerarPix(CRIADO), TransicaoDePagamentoInvalida);
  });

  test("gerar devolve a cobrança no formato da rota 16", () => {
    assert.deepEqual(pix().gerar(CRIADO), {
      pagamentoId: "pg-1",
      reservaId: "r-1",
      metodo: "PIX",
      status: "PENDENTE",
      valorCentavos: 4800,
      pix: { copiaECola: "PIX-SIMULADO|pg-1|4800", expiraEm: "2026-11-14T11:15:00.000Z" },
    });
  });
});

describe("PagamentoCartao", () => {
  test("o método depende de ser débito ou crédito", () => {
    assert.equal(cartao(false).metodo, "CARTAO_CREDITO");
    assert.equal(cartao(true).metodo, "CARTAO_DEBITO");
  });

  test("cobrarCartao aceita um token e recusa texto que não parece token", () => {
    const c = cartao();
    for (const ruim of ["", "curto", "tem espaço no meio", "4111111111111111 12/30"]) {
      assert.throws(() => c.cobrarCartao(ruim), RangeError, ruim);
    }
    c.cobrarCartao("tok_ABCDEFGH1234");
    assert.equal(c.status, "PENDENTE");
  });

  test("gerar sem token é recusado; com token mostra só o final", () => {
    const c = cartao();
    assert.throws(() => c.gerar(), TransicaoDePagamentoInvalida);
    c.cobrarCartao("tok_ABCDEFGH1234");
    const cobranca = c.gerar();
    assert.equal(cobranca.cartao.finalDoCartao, "1234");
    assert.ok(!JSON.stringify(cobranca).includes("tok_ABCDEFGH"));
    assert.equal(cobranca.metodo, "CARTAO_CREDITO");
  });

  test("não cobra pagamento que já não está pendente", () => {
    const c = new PagamentoCartao({ ...dados({ status: "APROVADO" }) });
    assert.throws(() => c.cobrarCartao("tok_ABCDEFGH1234"), TransicaoDePagamentoInvalida);
  });
});

describe("criarPagamento (fábrica) e polimorfismo", () => {
  test("devolve a subclasse certa para cada forma de pagamento", () => {
    assert.ok(criarPagamento("PIX", dados()) instanceof PagamentoPix);
    const credito = criarPagamento("CARTAO_CREDITO", dados());
    const debito = criarPagamento("CARTAO_DEBITO", dados());
    assert.ok(credito instanceof PagamentoCartao && debito instanceof PagamentoCartao);
    assert.equal(credito.metodo, "CARTAO_CREDITO");
    assert.equal(debito.metodo, "CARTAO_DEBITO");
    for (const metodo of METODOS_PAGAMENTO) {
      assert.ok(criarPagamento(metodo, dados()) instanceof Pagamento, metodo);
    }
  });

  test("forma desconhecida não vira objeto", () => {
    assert.throws(() => criarPagamento("BOLETO" as never, dados()), RangeError);
  });

  test("o mesmo código usa qualquer pagamento sem saber qual é: confirmar e resumo", () => {
    const todos: Pagamento[] = METODOS_PAGAMENTO.map((m) => criarPagamento(m, dados()));
    for (const p of todos) {
      p.confirmar("mp-1");
      assert.equal(p.status, "APROVADO");
      assert.equal(p.resumo().metodo, p.metodo);
      assert.equal(p.resumo().valorCentavos, 4800);
    }
  });

  test("os status e métodos conferem com o enum do banco", () => {
    assert.deepEqual([...STATUS_PAGAMENTO], ["PENDENTE", "APROVADO", "RECUSADO", "ESTORNADO", "EXPIRADO"]);
    assert.deepEqual([...METODOS_PAGAMENTO], ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO"]);
  });
});

describe("pagamentos: pontos acrescentados na revisão de qualidade", () => {
  test("confirmar devolve true só na transição PENDENTE -> APROVADO", () => {
    const p = pix();
    assert.equal(p.confirmar("mp-1"), true);
    assert.equal(p.confirmar("mp-1"), false);
    assert.equal(pix().confirmar(null), true);
  });

  test("cobrancaInicial: o Pix já traz a cobrança e o cartão só o resumo, sem lançar sem token", () => {
    const cobrancaPix = pix().cobrancaInicial(CRIADO);
    assert.ok("pix" in cobrancaPix);
    const cobrancaCartao = cartao().cobrancaInicial();
    assert.ok(!("cartao" in cobrancaCartao));
    assert.deepEqual(cobrancaCartao, {
      pagamentoId: "pg-1",
      reservaId: "r-1",
      metodo: "CARTAO_CREDITO",
      status: "PENDENTE",
      valorCentavos: 4800,
    });
  });

  test("cobrancaInicial funciona do mesmo jeito para qualquer forma (polimorfismo)", () => {
    for (const metodo of METODOS_PAGAMENTO) {
      const c = criarPagamento(metodo, dados()).cobrancaInicial(CRIADO);
      assert.equal(c.metodo, metodo);
      assert.equal(c.status, "PENDENTE");
    }
  });

  test("o prazo do Pix é o mesmo da reserva pendente (uma constante só)", () => {
    assert.equal(PRAZO_DO_PIX_MS, PRAZO_DE_PAGAMENTO_MS);
    assert.equal(PRAZO_DE_PAGAMENTO_MS, 15 * MIN);
  });
});
