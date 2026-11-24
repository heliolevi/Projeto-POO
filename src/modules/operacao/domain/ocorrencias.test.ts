import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictError } from "../../../shared/http/errors.ts";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { abrirOcorrencia } from "./abrir-ocorrencia.ts";
import { Atraso, TOLERANCIA_DE_ATRASO_MS } from "./atraso.ts";
import { Dano } from "./dano.ts";
import { Furto } from "./furto.ts";
import { Ocorrencia, OcorrenciaInvalida } from "./ocorrencia.ts";

const R = (reais: number) => Dinheiro.deCentavos(reais * 100);
const ABERTURA = new Date("2026-11-20T15:00:00.000Z");
const FIM = new Date("2026-11-20T14:00:00.000Z");
const MIN = 60 * 1000;
const depois = (minutos: number) => new Date(FIM.getTime() + minutos * MIN);

const base = (parcial = {}) => ({
  id: "o-1",
  reservaId: "r-1",
  bicicletaId: "b-1",
  abertaPor: "u-1",
  descricao: "  Pneu furado e freio solto  ",
  criadaEm: ABERTURA,
  ...parcial,
});
const PRECOS = { precoHoraCentavos: 1000, precoDiaCentavos: 5000 }; // R$ 10 por hora, R$ 50 por dia
const dano = (custo = R(80), parcial = {}) => new Dano({ ...base(parcial), custoEstimado: custo });
const atraso = (minutosDeAtraso: number) =>
  new Atraso({ ...base(), fimPrevisto: FIM, devolvidoEm: depois(minutosDeAtraso), precos: PRECOS });
const furto = (custoEstimado?: Dinheiro | null) => new Furto({ ...base(), custoEstimado, caucao: R(200) });

describe("Ocorrencia: o que é comum", () => {
  test("nasce ABERTA, sem valor cobrado nem data de resolução, com a descrição aparada", () => {
    const o = dano();
    assert.equal(o.status, "ABERTA");
    assert.equal(o.valorCobrado, null);
    assert.equal(o.resolvidaEm, null);
    assert.equal(o.descricao, "Pneu furado e freio solto");
    assert.equal(o.estaEmAberto(), true);
  });

  test("é uma Ocorrencia (herança) e cada filha diz o seu tipo", () => {
    for (const [o, tipo] of [[dano(), "DANO"], [atraso(60), "ATRASO"], [furto(), "FURTO"]] as const) {
      assert.ok(o instanceof Ocorrencia);
      assert.equal(o.tipo, tipo);
    }
  });

  test("não guarda campo visível: o estado é privado", () => {
    assert.deepEqual(Object.keys(dano()), []);
    assert.deepEqual(Object.keys(atraso(60)), []);
    assert.deepEqual(Object.keys(furto()), []);
  });

  test("devolve cópia das datas: mexer no que veio do getter não muda a ocorrência", () => {
    const o = dano();
    o.criadaEm.setFullYear(1999);
    assert.equal(o.criadaEm.getUTCFullYear(), 2026);
    const entrada = new Date(ABERTURA);
    const o2 = dano(R(10), { criadaEm: entrada });
    entrada.setFullYear(1999);
    assert.equal(o2.criadaEm.getUTCFullYear(), 2026);
  });

  test("recusa dados inválidos", () => {
    assert.throws(() => dano(R(1), { id: "" }), RangeError);
    assert.throws(() => dano(R(1), { reservaId: "" }), RangeError);
    assert.throws(() => dano(R(1), { bicicletaId: "" }), RangeError);
    assert.throws(() => dano(R(1), { abertaPor: "" }), RangeError);
    assert.throws(() => dano(R(1), { descricao: "   " }), RangeError);
    assert.throws(() => dano(R(1), { criadaEm: new Date("lixo") }), RangeError);
    assert.throws(() => dano(R(1), { status: "QUALQUER" }), RangeError);
  });

  test("paraDto devolve o formato da API, com datas ISO e o valor em centavos", () => {
    const o = dano();
    assert.deepEqual(o.paraDto(), {
      id: "o-1",
      reservaId: "r-1",
      bicicletaId: "b-1",
      abertaPor: "u-1",
      tipo: "DANO",
      descricao: "Pneu furado e freio solto",
      status: "ABERTA",
      valorCobradoCentavos: null,
      criadaEm: "2026-11-20T15:00:00.000Z",
      resolvidaEm: null,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(o)), o.paraDto());
  });
});

describe("Ocorrencia: ciclo de vida", () => {
  test("ABERTA vai para EM_ANALISE e depois para RESOLVIDA com o valor e a data", () => {
    const o = dano();
    o.iniciarAnalise();
    assert.equal(o.status, "EM_ANALISE");
    const quando = new Date("2026-11-21T10:00:00.000Z");
    o.resolver(R(60), quando);
    assert.equal(o.status, "RESOLVIDA");
    assert.equal(o.valorCobrado?.centavos, 6000);
    assert.equal(o.resolvidaEm?.toISOString(), quando.toISOString());
    assert.equal(o.estaEmAberto(), false);
    assert.equal(o.paraDto().valorCobradoCentavos, 6000);
  });

  test("pode ser resolvida direto da ABERTA, inclusive sem cobrar nada", () => {
    const o = dano();
    o.resolver(Dinheiro.ZERO, ABERTURA);
    assert.equal(o.status, "RESOLVIDA");
    assert.equal(o.valorCobrado?.centavos, 0);
  });

  test("pode ser cancelada, e cancelar não registra valor", () => {
    const o = dano();
    o.cancelar();
    assert.equal(o.status, "CANCELADA");
    assert.equal(o.valorCobrado, null);
    assert.equal(o.estaEmAberto(), false);
  });

  test("RESOLVIDA e CANCELADA são finais: qualquer mudança é recusada (409) e nada muda", () => {
    const resolvida = dano();
    resolvida.resolver(R(10), ABERTURA);
    const cancelada = dano();
    cancelada.cancelar();
    for (const o of [resolvida, cancelada]) {
      const antes = o.status;
      assert.throws(() => o.iniciarAnalise(), OcorrenciaInvalida);
      assert.throws(() => o.resolver(R(1), ABERTURA), OcorrenciaInvalida);
      assert.throws(() => o.cancelar(), OcorrenciaInvalida);
      assert.equal(o.status, antes);
    }
    assert.equal(resolvida.valorCobrado?.centavos, 1000, "um resolver recusado não troca o valor");
  });

  test("não volta de EM_ANALISE para ABERTA nem analisa duas vezes", () => {
    const o = dano();
    o.iniciarAnalise();
    assert.throws(() => o.iniciarAnalise(), OcorrenciaInvalida);
    assert.equal(o.status, "EM_ANALISE");
  });

  test("OcorrenciaInvalida é um ConflictError (409)", () => {
    assert.ok(new OcorrenciaInvalida("x") instanceof ConflictError);
  });

  test("uma ocorrência do banco volta no estado em que estava", () => {
    const o = dano(R(80), { status: "RESOLVIDA", valorCobrado: R(50), resolvidaEm: ABERTURA });
    assert.equal(o.status, "RESOLVIDA");
    assert.equal(o.valorCobrado?.centavos, 5000);
    assert.throws(() => o.cancelar(), OcorrenciaInvalida);
  });
});

describe("Ocorrencia: divisão da cobrança (caução e adicional)", () => {
  test("o que cabe na caução sai dela, sem adicional", () => {
    const { daCaucao, adicional } = dano().cobrarCliente(R(80), R(200));
    assert.equal(daCaucao.centavos, 8000);
    assert.equal(adicional.centavos, 0);
  });

  test("o que passa da caução vira adicional cobrado do cliente", () => {
    const { daCaucao, adicional } = dano().cobrarCliente(R(260), R(200));
    assert.equal(daCaucao.centavos, 20000);
    assert.equal(adicional.centavos, 6000);
  });

  test("sem caução, tudo é adicional; sem valor, nada é cobrado", () => {
    assert.equal(dano().cobrarCliente(R(50), Dinheiro.ZERO).adicional.centavos, 5000);
    const nada = dano().cobrarCliente(Dinheiro.ZERO, R(200));
    assert.equal(nada.daCaucao.centavos + nada.adicional.centavos, 0);
  });
});

describe("Dano", () => {
  test("sugere o custo estimado do conserto", () => {
    assert.equal(dano(R(80)).valorSugerido().centavos, 8000);
    assert.equal(dano(Dinheiro.ZERO).valorSugerido().ehZero(), true);
  });
});

describe("Furto", () => {
  test("sem estimativa, sugere a caução inteira", () => {
    assert.equal(furto().valorSugerido().centavos, 20000);
    assert.equal(furto(null).valorSugerido().centavos, 20000);
  });

  test("com estimativa, sugere a estimativa (mesmo que passe da caução)", () => {
    assert.equal(furto(R(900)).valorSugerido().centavos, 90000);
  });
});

describe("Atraso", () => {
  test("até 15 minutos de atraso não se cobra (a tolerância é inclusive)", () => {
    assert.equal(TOLERANCIA_DE_ATRASO_MS, 15 * MIN);
    assert.equal(atraso(0).valorSugerido().ehZero(), true);
    assert.equal(atraso(15).valorSugerido().ehZero(), true);
  });

  test("devolver antes do fim não gera cobrança nem atraso negativo", () => {
    const o = atraso(-30);
    assert.equal(o.duracaoDoAtrasoMs(), 0);
    assert.equal(o.valorSugerido().ehZero(), true);
  });

  test("passou da tolerância: hora iniciada conta como hora cheia", () => {
    assert.equal(atraso(16).valorSugerido().centavos, 1000);
    assert.equal(atraso(60).valorSugerido().centavos, 1000);
    assert.equal(atraso(61).valorSugerido().centavos, 2000);
    assert.equal(atraso(150).valorSugerido().centavos, 3000);
  });

  test("as horas do atraso não passam de uma diária por bloco de 24 horas", () => {
    assert.equal(atraso(10 * 60).valorSugerido().centavos, 5000, "10 h custariam 100, mas o teto é 50");
    assert.equal(atraso(24 * 60).valorSugerido().centavos, 5000);
    assert.equal(atraso(25 * 60).valorSugerido().centavos, 6000, "1 diária + 1 hora");
  });

  test("não guarda referência aos preços nem às datas de entrada", () => {
    const precos = { ...PRECOS };
    const o = new Atraso({ ...base(), fimPrevisto: FIM, devolvidoEm: depois(60), precos });
    precos.precoHoraCentavos = 999999;
    assert.equal(o.valorSugerido().centavos, 1000);
    o.fimPrevisto.setFullYear(1999);
    assert.equal(o.fimPrevisto.getUTCFullYear(), 2026);
  });

  test("recusa datas inválidas", () => {
    assert.throws(
      () => new Atraso({ ...base(), fimPrevisto: new Date("lixo"), devolvidoEm: FIM, precos: PRECOS }),
      RangeError,
    );
  });
});

describe("abrirOcorrencia (fábrica)", () => {
  test("escolhe a subclasse pelo tipo", () => {
    assert.ok(abrirOcorrencia("DANO", { ...base(), custoEstimado: R(10) }) instanceof Dano);
    assert.ok(abrirOcorrencia("FURTO", { ...base(), caucao: R(200) }) instanceof Furto);
    assert.ok(
      abrirOcorrencia("ATRASO", { ...base(), fimPrevisto: FIM, devolvidoEm: depois(60), precos: PRECOS }) instanceof Atraso,
    );
  });

  test("a ocorrência já nasce aberta", () => {
    assert.equal(abrirOcorrencia("DANO", { ...base(), custoEstimado: R(10) }).status, "ABERTA");
  });

  test("ACIDENTE e OUTRO ainda não têm regra: 409, não cobra sem regra", () => {
    assert.throws(() => abrirOcorrencia("ACIDENTE", base()), OcorrenciaInvalida);
    assert.throws(() => abrirOcorrencia("OUTRO", base()), OcorrenciaInvalida);
  });

  test("tipo desconhecido é recusado", () => {
    assert.throws(() => (abrirOcorrencia as (t: string, d: unknown) => unknown)("ROUBO", base()), OcorrenciaInvalida);
  });
});
