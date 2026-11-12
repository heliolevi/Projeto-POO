import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../../../shared/http/errors.ts";
import type { TipoCandidato } from "../domain/recomendacao.ts";
import {
  criarBuscarRecomendacoes,
  type PerfilDoCliente,
  type Periodo,
  type Precos,
} from "./buscar-recomendacoes.ts";

const ID_CLIENTE = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
// a sessão do cliente logado, como o exigirPerfil a entrega
const CLIENTE = { perfil: "CLIENTE", usuarioId: ID_CLIENTE } as const;
// "agora" fixo: 14/11/2026, 08:00 em São Luís
const AGORA = new Date("2026-11-14T11:00:00.000Z");
const BUSCA = { inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T13:00:00-03:00" };

function tipo(parcial: Partial<TipoCandidato> & Pick<TipoCandidato, "id" | "nome">): TipoCandidato {
  return {
    descricao: null,
    atividades: ["PASSEIO"],
    alturaMinCm: 150,
    alturaMaxCm: 190,
    nivelRecomendado: "INICIANTE",
    precoHoraCentavos: 1000,
    precoDiaCentavos: 5000,
    valorCaucaoCentavos: 15000,
    ativo: true,
    unidadesLivres: 2,
    ...parcial,
  };
}

const PASSEIO = tipo({ id: "t-passeio", nome: "Passeio", atividades: ["PASSEIO", "TURISMO"], alturaMinCm: 145, alturaMaxCm: 190, precoHoraCentavos: 1200, precoDiaCentavos: 6000, unidadesLivres: 3 });
const MTB = tipo({ id: "t-mtb", nome: "Mountain bike", atividades: ["TRILHA", "ESPORTE"], alturaMinCm: 160, alturaMaxCm: 200, nivelRecomendado: "INTERMEDIARIO", precoHoraCentavos: 2000, precoDiaCentavos: 10000 });
const INFANTIL = tipo({ id: "t-infantil", nome: "Infantil", alturaMinCm: 100, alturaMaxCm: 140, precoHoraCentavos: 800, precoDiaCentavos: 4000 });

type Opcoes = { perfil?: PerfilDoCliente; tipos?: TipoCandidato[]; agora?: Date };

// Dependências de mentira que anotam o que foi pedido, para provar o que a busca consultou.
function montar({ perfil, tipos = [PASSEIO, MTB, INFANTIL], agora = AGORA }: Opcoes = {}) {
  const chamadas = { perfil: [] as string[], sessoes: [] as unknown[], tipos: [] as { inicio: Date; fim: Date }[], precos: [] as { periodo: Periodo; precos: Precos }[] };
  const buscar = criarBuscarRecomendacoes({
    buscarPerfil: async (usuarioId) => {
      chamadas.perfil.push(usuarioId);
      return perfil ?? { alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" };
    },
    buscarTipos: async (sessao, inicio, fim) => {
      chamadas.sessoes.push(sessao);
      chamadas.tipos.push({ inicio, fim });
      return tipos;
    },
    calcularValorAluguel: (periodo, precos) => {
      chamadas.precos.push({ periodo, precos });
      // a regra real mora em reservas; aqui basta uma conta previsível: horas x preço por hora
      const horas = Math.ceil((periodo.fim.getTime() - periodo.inicio.getTime()) / 3_600_000);
      return Math.min(horas * precos.precoHoraCentavos, precos.precoDiaCentavos);
    },
    horasCobradas: ({ inicio, fim }) => Math.ceil((fim.getTime() - inicio.getTime()) / 3_600_000),
    agora: () => agora,
  });
  return { buscar, chamadas };
}

test("exemplo do contrato: devolve o período em UTC, as horas e o tipo Passeio com 90 pontos", async () => {
  const { buscar } = montar();
  const r = await buscar(CLIENTE, BUSCA);
  assert.deepEqual(r.periodo, {
    inicio: "2026-11-14T12:00:00.000Z",
    fim: "2026-11-14T16:00:00.000Z",
    horas: 4,
  });
  const passeio = r.resultados.find((x) => x.tipoId === "t-passeio");
  assert.ok(passeio);
  assert.equal(passeio.pontos, 90);
  assert.equal(passeio.valorAluguelCentavos, 4800);
  assert.equal(passeio.valorCaucaoCentavos, 15000);
  assert.equal(passeio.unidadesLivres, 3);
  assert.deepEqual(passeio.motivos, [
    "Cabe bem na sua altura de 172 cm",
    "Boa para passeio",
    "Adequada ao seu nível (iniciante)",
  ]);
});

test("a lista vem ordenada por pontos e depois pelo menor preço", async () => {
  const { buscar } = montar({
    perfil: { alturaCm: null, experiencia: null, atividade: "PASSEIO" },
    tipos: [
      tipo({ id: "a", nome: "Cara", precoDiaCentavos: 9000 }),
      tipo({ id: "b", nome: "Barata", precoDiaCentavos: 3000 }),
      tipo({ id: "c", nome: "Trilha", atividades: ["TRILHA"], precoDiaCentavos: 1000 }),
    ],
  });
  const r = await buscar(CLIENTE, BUSCA);
  // Barata e Cara empatam em 30 pontos (atividade); a mais barata por dia vem na frente. Trilha, 0.
  assert.deepEqual(r.resultados.map((x) => [x.nome, x.pontos]), [["Barata", 30], ["Cara", 30], ["Trilha", 0]]);
});

test("a atividade da busca sobrepõe a do perfil; sem ela, vale a do perfil", async () => {
  const perfil: PerfilDoCliente = { alturaCm: 175, experiencia: "AVANCADO", atividade: "PASSEIO" };

  const doPerfil = await montar({ perfil }).buscar(CLIENTE, BUSCA);
  assert.equal(doPerfil.resultados[0].tipoId, "t-passeio", "sem atividade na busca, o perfil manda (passeio)");

  const trocada = await montar({ perfil }).buscar(CLIENTE, { ...BUSCA, atividade: "TRILHA" });
  assert.equal(trocada.resultados[0].tipoId, "t-mtb", "a busca por trilha vence o perfil");
  assert.ok(trocada.resultados[0].motivos.includes("Boa para trilha"));
});

test("sem atividade no perfil nem na busca, ninguém ganha os pontos de atividade", async () => {
  const { buscar } = montar({ perfil: { alturaCm: 172, experiencia: null, atividade: null } });
  const r = await buscar(CLIENTE, BUSCA);
  assert.ok(r.resultados.every((x) => !x.motivos.some((m) => /Boa para|Não é a mais indicada/.test(m))));
});

test("o filtro de altura tira os tipos em que o cliente não cabe", async () => {
  const adulto = await montar({ perfil: { alturaCm: 172, experiencia: null, atividade: null } }).buscar(CLIENTE, BUSCA);
  assert.ok(!adulto.resultados.some((x) => x.tipoId === "t-infantil"));
  const crianca = await montar({ perfil: { alturaCm: 130, experiencia: null, atividade: null } }).buscar(CLIENTE, BUSCA);
  assert.deepEqual(crianca.resultados.map((x) => x.tipoId), ["t-infantil"]);
});

test("sem altura no perfil, nenhum tipo sai por altura", async () => {
  const r = await montar({ perfil: { alturaCm: null, experiencia: null, atividade: null } }).buscar(CLIENTE, BUSCA);
  assert.equal(r.resultados.length, 3);
});

test("tipo sem unidade livre ou inativo não aparece; nada livre devolve lista vazia, não erro", async () => {
  const { buscar } = montar({ tipos: [{ ...PASSEIO, unidadesLivres: 0 }, { ...MTB, ativo: false }] });
  assert.deepEqual((await buscar(CLIENTE, BUSCA)).resultados, []);
  const vazio = await montar({ tipos: [] }).buscar(CLIENTE, BUSCA);
  assert.deepEqual(vazio.resultados, []);
  assert.equal(vazio.periodo.horas, 4, "o período continua na resposta");
});

test("o valor do aluguel vem da função de preço de reservas, com o período e os preços do tipo", async () => {
  const { buscar, chamadas } = montar({ tipos: [PASSEIO] });
  const r = await buscar(CLIENTE, BUSCA);
  assert.equal(chamadas.precos.length, 1);
  assert.equal(chamadas.precos[0].periodo.inicio.toISOString(), "2026-11-14T12:00:00.000Z");
  assert.equal(chamadas.precos[0].precos.precoHoraCentavos, 1200);
  assert.equal(chamadas.precos[0].precos.precoDiaCentavos, 6000);
  assert.equal(r.resultados[0].valorAluguelCentavos, 4800);
});

test("a sessão do cliente vai para a busca de unidades livres (é ela que o comSessao usa para a RLS)", async () => {
  const { buscar, chamadas } = montar();
  await buscar(CLIENTE, BUSCA);
  assert.deepEqual(chamadas.perfil, [ID_CLIENTE], "o perfil lido é o do usuário da sessão");
  assert.deepEqual(chamadas.sessoes, [CLIENTE]);
});

test("o mesmo caso de uso atende clientes diferentes, sem misturar a sessão de um com a de outro", async () => {
  const { buscar, chamadas } = montar();
  const outro = { perfil: "CLIENTE", usuarioId: "aaaaaaaa-0000-4000-8000-000000000001" } as const;
  await Promise.all([buscar(CLIENTE, BUSCA), buscar(outro, BUSCA)]);
  assert.deepEqual(chamadas.perfil.sort(), [ID_CLIENTE, outro.usuarioId].sort());
  assert.equal(chamadas.sessoes.length, 2);
});

test("a busca de unidades livres recebe exatamente o período pedido", async () => {
  const { buscar, chamadas } = montar();
  await buscar(CLIENTE, BUSCA);
  assert.equal(chamadas.tipos.length, 1);
  assert.equal(chamadas.tipos[0].inicio.toISOString(), "2026-11-14T12:00:00.000Z");
  assert.equal(chamadas.tipos[0].fim.toISOString(), "2026-11-14T16:00:00.000Z");
});

test("parâmetros inválidos respondem 400 com details e não tocam o banco", async () => {
  const casos: [string, Record<string, unknown>, string[]][] = [
    ["sem nada", {}, ["fim", "inicio"]],
    ["sem fuso", { inicio: "2026-11-14T09:00:00", fim: "2026-11-14T13:00:00" }, ["fim", "inicio"]],
    ["fim antes do início", { inicio: BUSCA.fim, fim: BUSCA.inicio }, ["fim"]],
    ["menos de 1 hora", { inicio: BUSCA.inicio, fim: "2026-11-14T09:30:00-03:00" }, ["fim"]],
    ["mais de 7 dias", { inicio: BUSCA.inicio, fim: "2026-11-22T09:00:00-03:00" }, ["fim"]],
    ["início no passado", { inicio: "2026-11-14T07:00:00-03:00", fim: "2026-11-14T10:00:00-03:00" }, ["inicio"]],
    ["atividade inválida", { ...BUSCA, atividade: "CORRIDA" }, ["atividade"]],
  ];
  for (const [nome, parametros, campos] of casos) {
    const { buscar, chamadas } = montar();
    await assert.rejects(buscar(CLIENTE, parametros), (erro: unknown) => {
      assert.ok(erro instanceof ValidationError, nome);
      assert.equal(erro.status, 400, nome);
      assert.deepEqual(Object.keys(erro.details as object).sort(), campos, nome);
      return true;
    });
    assert.equal(chamadas.perfil.length, 0, `${nome}: não deveria ler o perfil`);
    assert.equal(chamadas.tipos.length, 0, `${nome}: não deveria consultar o banco`);
  }
});

test("os limites do período: exatamente 1 hora e exatamente 7 dias são aceitos", async () => {
  const uma = await montar().buscar(CLIENTE, { inicio: BUSCA.inicio, fim: "2026-11-14T10:00:00-03:00" });
  assert.equal(uma.periodo.horas, 1);
  const sete = await montar().buscar(CLIENTE, { inicio: BUSCA.inicio, fim: "2026-11-21T09:00:00-03:00" });
  assert.equal(sete.periodo.horas, 168);
});

test("início 'agora' é aceito pela folga de 5 minutos", async () => {
  const r = await montar().buscar(CLIENTE, { inicio: "2026-11-14T07:57:00-03:00", fim: "2026-11-14T10:00:00-03:00" });
  assert.equal(r.periodo.inicio, "2026-11-14T10:57:00.000Z");
});

test("erro do banco não é engolido", async () => {
  const buscar = criarBuscarRecomendacoes({
    buscarPerfil: async () => ({ alturaCm: 172, experiencia: null, atividade: null }),
    buscarTipos: async () => {
      throw new Error("banco fora do ar");
    },
    calcularValorAluguel: () => 0,
    horasCobradas: () => 4,
    agora: () => AGORA,
  });
  await assert.rejects(buscar(CLIENTE, BUSCA), /banco fora do ar/);
});
