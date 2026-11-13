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
const PAGO = new Date("2026-11-14T11:05:00.000Z");
const MIN = 60_000;
const dados = (parcial = {}) => ({
  id: "pg-1",
  reservaId: "r-1",
  valor: Dinheiro.deCentavos(4800),
  criadoEm: CRIADO,
  ...parcial,
});
// um pagamento aprovado sempre tem a data em que foi pago (o banco exige pago_em no APROVADO)
const pix = (status?: StatusPagamento) =>
  new PagamentoPix(dados({ status, pagoEm: status === "APROVADO" ? PAGO : undefined }));
const cartao = (debito = false) => new PagamentoCartao({ ...dados(), debito });

describe("Pagamento (classe abstrata): ciclo de vida", () => {
  test("nasce PENDENTE, sem id do Mercado Pago, sem data de pagamento e sem estorno", () => {
    const p = pix();
    assert.equal(p.status, "PENDENTE");
    assert.equal(p.mpPaymentId, null);
    assert.equal(p.pagoEm, null);
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

  test("confirmar: PENDENTE -> APROVADO, guarda o id do Mercado Pago e a data do pagamento", () => {
    const p = pix();
    assert.equal(p.confirmar("mp-123", PAGO), true);
    assert.equal(p.status, "APROVADO");
    assert.equal(p.mpPaymentId, "mp-123");
    assert.equal(p.pagoEm?.getTime(), PAGO.getTime());
  });

  test("confirmar é idempotente com o mesmo id (aviso duplicado) e conflito com outro id", () => {
    const p = pix();
    p.confirmar("mp-123", PAGO);
    assert.equal(p.confirmar("mp-123", new Date(PAGO.getTime() + 60_000)), false);
    assert.equal(p.status, "APROVADO");
    assert.equal(p.pagoEm?.getTime(), PAGO.getTime(), "o aviso repetido não muda a data do pagamento");
    assert.throws(() => p.confirmar("mp-999", PAGO), TransicaoDePagamentoInvalida);
    assert.equal(p.mpPaymentId, "mp-123");
  });

  test("no MVP simulado o id do Mercado Pago fica vazio", () => {
    const p = pix();
    p.confirmar(null, PAGO);
    assert.equal(p.status, "APROVADO");
    assert.equal(p.mpPaymentId, null);
    assert.equal(p.confirmar(null, PAGO), false);
    assert.equal(p.status, "APROVADO");
  });

  test("recusar e expirar valem para pendente, e repetir o mesmo aviso é idempotente (false, sem erro)", () => {
    const recusado = pix();
    assert.equal(recusado.recusar(), true);
    assert.equal(recusado.status, "RECUSADO");
    assert.equal(recusado.recusar(), false, "o aviso repetido de recusado não vira 409");
    const expirado = pix();
    assert.equal(expirado.expirar(), true);
    assert.equal(expirado.status, "EXPIRADO");
    assert.equal(expirado.expirar(), false, "o aviso repetido de expirado não vira 409");
  });

  test("recusar e expirar não valem para um estado que contradiz o aviso", () => {
    for (const status of ["APROVADO", "ESTORNADO", "EXPIRADO"] as const) {
      assert.throws(() => pix(status).recusar(), TransicaoDePagamentoInvalida, `recusar em ${status}`);
    }
    for (const status of ["APROVADO", "RECUSADO", "ESTORNADO"] as const) {
      assert.throws(() => pix(status).expirar(), TransicaoDePagamentoInvalida, `expirar em ${status}`);
    }
  });

  test("os estados finais não confirmam", () => {
    for (const status of ["RECUSADO", "ESTORNADO", "EXPIRADO"] as const) {
      assert.throws(() => pix(status).confirmar("mp-1", PAGO), TransicaoDePagamentoInvalida, status);
    }
  });

  test("a transição inválida é um 409", () => {
    assert.throws(
      () => pix("EXPIRADO").confirmar("x", PAGO),
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

describe("Pagamento: data do pagamento (pago_em) como o banco exige", () => {
  test("um pagamento aprovado sem a data é recusado na construção (constraint pagamento_pago_em_consistente)", () => {
    assert.throws(() => new PagamentoPix(dados({ status: "APROVADO" })), RangeError);
    assert.throws(() => new PagamentoCartao({ ...dados({ status: "APROVADO" }) }), RangeError);
  });

  test("pagoEmParaPersistir: a data só vai ao banco enquanto o status é APROVADO", () => {
    assert.equal(pix().pagoEmParaPersistir(), null, "pendente");
    const aprovado = pix("APROVADO");
    assert.equal(aprovado.pagoEmParaPersistir()?.getTime(), PAGO.getTime());
    aprovado.estornar(Dinheiro.deCentavos(4800));
    assert.equal(aprovado.status, "ESTORNADO");
    assert.equal(aprovado.pagoEmParaPersistir(), null, "depois do estorno total o banco exige pago_em nulo");
    assert.equal(aprovado.pagoEm?.getTime(), PAGO.getTime(), "mas o objeto continua sabendo quando foi pago");
  });

  test("o que sai é cópia da data", () => {
    const p = pix("APROVADO");
    p.pagoEm?.setUTCFullYear(1999);
    p.pagoEmParaPersistir()?.setUTCFullYear(1999);
    assert.equal(p.pagoEm?.getUTCFullYear(), 2026);
  });

  test("ESTORNADO, RECUSADO e EXPIRADO lidos do banco (pago_em nulo) são aceitos", () => {
    for (const status of ["ESTORNADO", "RECUSADO", "EXPIRADO"] as const) {
      assert.doesNotThrow(() => new PagamentoPix(dados({ status })), status);
    }
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

  test("estornarTudo estorna o que resta e é idempotente (o aviso repetido não vira erro)", () => {
    const p = pix("APROVADO");
    p.estornar(Dinheiro.deCentavos(1000));
    assert.equal(p.estornarTudo(), true);
    assert.equal(p.status, "ESTORNADO");
    assert.equal(p.valorEstornado.centavos, 4800);
    assert.equal(p.estornarTudo(), false);
    assert.equal(p.status, "ESTORNADO");
  });

  test("estornarTudo num pagamento que não foi aprovado continua sendo erro", () => {
    for (const status of ["PENDENTE", "RECUSADO", "EXPIRADO"] as const) {
      assert.throws(() => pix(status).estornarTudo(), TransicaoDePagamentoInvalida, status);
    }
  });
});

describe("PagamentoPix", () => {
  test("o método é PIX e, sem prazo informado, vale 15 minutos", () => {
    assert.equal(pix().metodo, "PIX");
    assert.equal(PRAZO_DO_PIX_MS, 15 * MIN);
    assert.equal(pix().expiraEm().getTime(), CRIADO.getTime() + 15 * MIN);
  });

  test("com o prazo da reserva, vale até ele (e não 15 minutos a partir da criação)", () => {
    const p = new PagamentoPix(dados({ expiraEm: new Date(CRIADO.getTime() + 5 * MIN) }));
    assert.equal(p.expiraEm().getTime(), CRIADO.getTime() + 5 * MIN);
    assert.equal(p.gerar(CRIADO).pix.expiraEm, "2026-11-14T11:05:00.000Z");
    assert.throws(() => p.gerarPix(new Date(CRIADO.getTime() + 5 * MIN)), TransicaoDePagamentoInvalida);
  });

  test("o prazo precisa ser depois da criação", () => {
    assert.throws(() => new PagamentoPix(dados({ expiraEm: CRIADO })), RangeError);
    assert.throws(() => new PagamentoPix(dados({ expiraEm: new Date(CRIADO.getTime() - MIN) })), RangeError);
  });

  test("estaVencido: só o pendente que passou do prazo (no instante do prazo já venceu)", () => {
    const p = pix();
    assert.equal(p.estaVencido(new Date(CRIADO.getTime() + 15 * MIN - 1)), false);
    assert.equal(p.estaVencido(new Date(CRIADO.getTime() + 15 * MIN)), true);
    const aprovado = pix("APROVADO");
    assert.equal(aprovado.estaVencido(new Date(CRIADO.getTime() + 99 * MIN)), false, "aprovado nunca vence");
    assert.equal(pix("EXPIRADO").estaVencido(new Date(CRIADO.getTime() + 99 * MIN)), false);
  });

  test("o prazo devolvido é cópia", () => {
    const p = pix();
    p.expiraEm().setUTCFullYear(1999);
    assert.equal(p.expiraEm().getUTCFullYear(), 2026);
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
      assert.throws(() => c.cobrarCartao(ruim, "1234"), RangeError, ruim);
    }
    c.cobrarCartao("tok_ABCDEFGH1234", "1234");
    assert.equal(c.status, "PENDENTE");
  });

  test("o final do cartão vem do meio de pagamento e precisa ter exatamente 4 dígitos", () => {
    const c = cartao();
    for (const ruim of ["", "123", "12345", "abcd", "12 4", "4111111111111111"]) {
      assert.throws(() => c.cobrarCartao("tok_ABCDEFGH1234", ruim), RangeError, ruim);
    }
    assert.throws(() => c.gerar(), TransicaoDePagamentoInvalida, "um final recusado não deixa o cartão pronto");
  });

  test("gerar sem token é recusado; com token mostra o final informado, não o fim do token", () => {
    const c = cartao();
    assert.throws(() => c.gerar(), TransicaoDePagamentoInvalida);
    c.cobrarCartao("tok_ABCDEFGH1234", "9876");
    const cobranca = c.gerar();
    assert.equal(cobranca.cartao.finalDoCartao, "9876");
    assert.ok(!JSON.stringify(cobranca).includes("tok_ABCDEFGH"));
    assert.ok(!JSON.stringify(cobranca).includes("1234"), "os últimos caracteres do token não aparecem");
    assert.equal(cobranca.metodo, "CARTAO_CREDITO");
  });

  test("não cobra pagamento que já não está pendente", () => {
    const c = new PagamentoCartao({ ...dados({ status: "APROVADO", pagoEm: PAGO }) });
    assert.throws(() => c.cobrarCartao("tok_ABCDEFGH1234", "1234"), TransicaoDePagamentoInvalida);
  });

  test("o cartão não tem prazo próprio: nunca está vencido", () => {
    assert.equal(cartao().estaVencido(), false);
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

  test("o prazo informado vale para o Pix e é ignorado pelo cartão", () => {
    const prazo = new Date(CRIADO.getTime() + 3 * MIN);
    const p = criarPagamento("PIX", dados({ expiraEm: prazo }));
    assert.equal((p as PagamentoPix).expiraEm().getTime(), prazo.getTime());
    assert.doesNotThrow(() => criarPagamento("CARTAO_CREDITO", dados({ expiraEm: prazo })));
  });

  test("o mesmo código usa qualquer pagamento sem saber qual é: confirmar, vencimento e resumo", () => {
    const todos: Pagamento[] = METODOS_PAGAMENTO.map((m) => criarPagamento(m, dados()));
    for (const p of todos) {
      assert.equal(p.estaVencido(CRIADO), false);
      p.confirmar("mp-1", PAGO);
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

describe("pagamentos: cobrança inicial e prazo", () => {
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

  test("o prazo padrão do Pix é o da reserva pendente (uma constante só)", () => {
    assert.equal(PRAZO_DO_PIX_MS, PRAZO_DE_PAGAMENTO_MS);
    assert.equal(PRAZO_DE_PAGAMENTO_MS, 15 * MIN);
  });
});
