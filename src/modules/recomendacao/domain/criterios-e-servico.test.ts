import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CriterioAltura,
  CriterioAtividade,
  CriterioExperiencia,
  criteriosPadrao,
  PESOS,
  type CriterioDeRecomendacao,
} from "./criterios.ts";
import type { PerfilCiclista } from "./perfil.ts";
import { RecomendacaoService, recomendar, type TipoCandidato } from "./recomendacao.ts";

function tipo(parcial: Partial<TipoCandidato> = {}): TipoCandidato {
  return {
    id: "t1",
    nome: "Urbana",
    descricao: null,
    atividades: ["URBANO", "PASSEIO"],
    alturaMinCm: 150,
    alturaMaxCm: 195,
    nivelRecomendado: "INICIANTE",
    precoHoraCentavos: 1000,
    precoDiaCentavos: 5000,
    valorCaucaoCentavos: 15000,
    ativo: true,
    unidadesLivres: 2,
    ...parcial,
  };
}

const PERFIL_COMPLETO: PerfilCiclista = { alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" };
const SEM_DADOS: PerfilCiclista = { alturaCm: null, experiencia: null, atividade: null };
const valor = () => 4000;

describe("CriterioAltura", () => {
  const criterio = new CriterioAltura();

  test("dá o peso inteiro no centro da faixa e menos nas pontas", () => {
    const centro = criterio.avaliar({ ...SEM_DADOS, alturaCm: 172.5 }, tipo())!;
    assert.equal(centro.pontos, PESOS.altura);
    const ponta = criterio.avaliar({ ...SEM_DADOS, alturaCm: 150 }, tipo())!;
    assert.equal(ponta.pontos, 0);
    assert.ok(ponta.motivo.includes("perto do limite da faixa (150 a 195 cm)"));
  });

  test("sem altura não pontua e não dá motivo (null)", () => {
    assert.equal(criterio.avaliar(SEM_DADOS, tipo()), null);
  });

  test("o motivo diz a altura do cliente", () => {
    assert.equal(
      criterio.avaliar({ ...SEM_DADOS, alturaCm: 172 }, tipo())!.motivo,
      "Cabe bem na sua altura de 172 cm",
    );
  });

  test("tem nome e peso", () => {
    assert.equal(criterio.nome, "altura");
    assert.equal(criterio.peso, 50);
  });
});

describe("CriterioAtividade", () => {
  const criterio = new CriterioAtividade();

  test("atividade que o tipo atende ganha o peso e o motivo positivo", () => {
    assert.deepEqual(criterio.avaliar({ ...SEM_DADOS, atividade: "PASSEIO" }, tipo()), {
      pontos: 30,
      motivo: "Boa para passeio",
    });
  });

  test("atividade que o tipo não atende dá 0 e avisa", () => {
    assert.deepEqual(criterio.avaliar({ ...SEM_DADOS, atividade: "TRILHA" }, tipo()), {
      pontos: 0,
      motivo: "Não é a mais indicada para trilha",
    });
  });

  test("sem atividade, null", () => {
    assert.equal(criterio.avaliar(SEM_DADOS, tipo()), null);
  });
});

describe("CriterioExperiencia", () => {
  const criterio = new CriterioExperiencia();

  test("experiência igual ou maior que a recomendada ganha o peso", () => {
    assert.deepEqual(criterio.avaliar({ ...SEM_DADOS, experiencia: "INICIANTE" }, tipo()), {
      pontos: 20,
      motivo: "Adequada ao seu nível (iniciante)",
    });
    assert.equal(
      criterio.avaliar({ ...SEM_DADOS, experiencia: "AVANCADO" }, tipo({ nivelRecomendado: "INTERMEDIARIO" }))!.pontos,
      20,
    );
  });

  test("experiência menor que a recomendada dá 0 e avisa o nível", () => {
    assert.deepEqual(
      criterio.avaliar({ ...SEM_DADOS, experiencia: "INICIANTE" }, tipo({ nivelRecomendado: "AVANCADO" })),
      { pontos: 0, motivo: "Recomendada a partir do nível avançado" },
    );
  });

  test("sem experiência, null", () => {
    assert.equal(criterio.avaliar(SEM_DADOS, tipo()), null);
  });
});

describe("criteriosPadrao", () => {
  test("são três critérios, na ordem dos motivos, e os pesos somam 100", () => {
    const criterios = criteriosPadrao();
    assert.deepEqual(criterios.map((c) => c.nome), ["altura", "atividade", "experiência"]);
    assert.equal(criterios.reduce((soma, c) => soma + c.peso, 0), 100);
  });

  test("todos cumprem a mesma interface (polimorfismo)", () => {
    for (const criterio of criteriosPadrao()) {
      const interface_: CriterioDeRecomendacao = criterio;
      const resultado = interface_.avaliar(PERFIL_COMPLETO, tipo());
      assert.ok(resultado === null || typeof resultado.pontos === "number");
    }
  });
});

describe("RecomendacaoService", () => {
  test("pontuar soma os critérios e arredonda no fim", () => {
    const servico = new RecomendacaoService();
    // cliente de 172 cm no tipo 150–195 (centro 172,5): ajuste de altura 1 - 0,5/22,5
    const esperado = Math.round(50 * (1 - 0.5 / 22.5) + 30 + 20);
    assert.equal(servico.pontuar(tipo(), PERFIL_COMPLETO), esperado);
    assert.equal(esperado, 99);
  });

  test("pontuar: sem nenhum dado ninguém ganha nada", () => {
    assert.equal(new RecomendacaoService().pontuar(tipo(), SEM_DADOS), 0);
  });

  test("motivos vêm na ordem altura, atividade, experiência", () => {
    assert.deepEqual(new RecomendacaoService().motivos(tipo(), PERFIL_COMPLETO), [
      "Cabe bem na sua altura de 172 cm",
      "Boa para passeio",
      "Adequada ao seu nível (iniciante)",
    ]);
  });

  test("motivos pula o critério sem dado", () => {
    assert.deepEqual(
      new RecomendacaoService().motivos(tipo(), { ...SEM_DADOS, atividade: "TRILHA" }),
      ["Não é a mais indicada para trilha"],
    );
  });

  test("recomendar filtra inativos, sem unidade livre e fora da faixa de altura", () => {
    const servico = new RecomendacaoService();
    const lista = servico.recomendar(
      PERFIL_COMPLETO,
      [
        tipo({ id: "ok", nome: "Ok" }),
        tipo({ id: "inativo", nome: "Inativo", ativo: false }),
        tipo({ id: "esgotado", nome: "Esgotado", unidadesLivres: 0 }),
        tipo({ id: "baixinho", nome: "Infantil", alturaMinCm: 100, alturaMaxCm: 140 }),
      ],
      valor,
    );
    assert.deepEqual(lista.map((r) => r.tipoId), ["ok"]);
    assert.equal(lista[0].valorAluguelCentavos, 4000);
    assert.equal(lista[0].unidadesLivres, 2);
  });

  test("sem altura nenhum tipo sai por altura", () => {
    const lista = new RecomendacaoService().recomendar(
      SEM_DADOS,
      [tipo({ id: "a", nome: "A" }), tipo({ id: "b", nome: "B", alturaMinCm: 100, alturaMaxCm: 140 })],
      valor,
    );
    assert.equal(lista.length, 2);
  });

  test("ordena por pontos; empate pelo menor preço por dia, depois pelo nome, depois pelo id", () => {
    const lista = new RecomendacaoService().recomendar(
      { alturaCm: null, experiencia: null, atividade: "PASSEIO" },
      [
        tipo({ id: "3", nome: "Beta", precoDiaCentavos: 6000 }),
        tipo({ id: "2", nome: "Alfa", precoDiaCentavos: 6000 }),
        tipo({ id: "1", nome: "Gama", precoDiaCentavos: 4000 }),
        tipo({ id: "0", nome: "Zeta", atividades: ["TRILHA"], precoDiaCentavos: 1000 }),
        tipo({ id: "9", nome: "Alfa", precoDiaCentavos: 6000 }),
      ],
      valor,
    );
    assert.deepEqual(lista.map((r) => r.tipoId), ["1", "2", "9", "3", "0"]);
  });

  test("a lista de critérios é injetável: um critério novo entra sem mexer no serviço", () => {
    const baratos: CriterioDeRecomendacao = {
      nome: "preço",
      peso: 100,
      avaliar: (_perfil, t) => ({
        pontos: t.precoDiaCentavos <= 5000 ? 100 : 0,
        motivo: t.precoDiaCentavos <= 5000 ? "Cabe no orçamento" : "Mais cara",
      }),
    };
    const servico = new RecomendacaoService([baratos]);
    const lista = servico.recomendar(
      SEM_DADOS,
      [tipo({ id: "caro", nome: "Caro", precoDiaCentavos: 9000 }), tipo({ id: "barato", nome: "Barato" })],
      valor,
    );
    assert.deepEqual(lista.map((r) => [r.tipoId, r.pontos, r.motivos]), [
      ["barato", 100, ["Cabe no orçamento"]],
      ["caro", 0, ["Mais cara"]],
    ]);
  });

  test("sem nenhum critério, todos têm 0 ponto e a ordem cai no desempate", () => {
    const lista = new RecomendacaoService([]).recomendar(
      SEM_DADOS,
      [tipo({ id: "b", nome: "B", precoDiaCentavos: 7000 }), tipo({ id: "a", nome: "A", precoDiaCentavos: 6000 })],
      valor,
    );
    assert.deepEqual(lista.map((r) => [r.tipoId, r.pontos, r.motivos.length]), [
      ["a", 0, 0],
      ["b", 0, 0],
    ]);
  });

  test("encapsulamento: alterar a lista passada depois não muda o serviço", () => {
    const criterios = criteriosPadrao();
    const servico = new RecomendacaoService(criterios);
    criterios.length = 0;
    assert.equal(servico.pontuar(tipo(), PERFIL_COMPLETO), 99);
  });

  test("não altera a lista de tipos recebida", () => {
    const tipos = [tipo({ id: "b", nome: "B" }), tipo({ id: "a", nome: "A" })];
    const copia = tipos.map((t) => t.id);
    new RecomendacaoService().recomendar(SEM_DADOS, tipos, valor);
    assert.deepEqual(tipos.map((t) => t.id), copia);
  });

  test("a função recomendar() dá o mesmo resultado que o serviço padrão", () => {
    const tipos = [tipo({ id: "a", nome: "A" }), tipo({ id: "b", nome: "B", atividades: ["TRILHA"] })];
    assert.deepEqual(
      recomendar(PERFIL_COMPLETO, tipos, valor),
      new RecomendacaoService().recomendar(PERFIL_COMPLETO, tipos, valor),
    );
  });
});
