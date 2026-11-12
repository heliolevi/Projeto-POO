import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import type { BicicletaAdmin, TipoAdmin } from "../domain/catalogo.ts";
import {
  CodigoDeBicicletaJaExiste,
  NomeDeTipoJaExiste,
  PontoInativo,
  PontoInexistente,
  TipoInexistente,
} from "../domain/erros.ts";
import { criarCatalogo, type RepositorioCatalogo } from "./catalogo.ts";

const ADMIN: SessaoBanco = { perfil: "ADMIN", usuarioId: "aaaaaaaa-0000-4000-8000-000000000001" };
const VISITANTE: SessaoBanco = { perfil: null, usuarioId: null };
const ID_TIPO = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const ID_PONTO = "bbbbbbbb-0000-4000-8000-000000000002";
const ID_BICI = "cccccccc-0000-4000-8000-000000000003";
const ID_PONTO_INATIVO = "bbbbbbbb-0000-4000-8000-0000000000ff";

const CORPO_TIPO = {
  nome: "Urbana",
  atividades: ["URBANO", "PASSEIO"],
  alturaMinCm: 150,
  alturaMaxCm: 195,
  precoHoraCentavos: 1000,
  precoDiaCentavos: 5000,
  valorCaucaoCentavos: 15000,
};

// Repositório de mentira: guarda tudo em memória e imita as regras do banco (nome único, código
// único, tipo e ponto existentes, status do enum).
function repositorioFalso() {
  const tipos = new Map<string, TipoAdmin>();
  const bicicletas = new Map<string, BicicletaAdmin>();
  const sessoesVistas: SessaoBanco[] = [];
  let sequencia = 0;
  const pontos = new Map([[ID_PONTO, true], [ID_PONTO_INATIVO, false]]); // id -> ativo

  const repositorio: RepositorioCatalogo = {
    async listarTipos(sessao, { apenasAtivos }) {
      sessoesVistas.push(sessao);
      return [...tipos.values()].filter((t) => !apenasAtivos || t.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
    },
    async criarTipo(sessao, dados) {
      sessoesVistas.push(sessao);
      if ([...tipos.values()].some((t) => t.nome === dados.nome)) throw new NomeDeTipoJaExiste();
      const id = `00000000-0000-4000-8000-${String(++sequencia).padStart(12, "0")}`;
      // os padrões do INSERT: descrição vazia, INICIANTE, caução 0 e ativo
      const tipo: TipoAdmin = {
        id,
        nome: dados.nome,
        descricao: dados.descricao ?? null,
        atividades: dados.atividades,
        alturaMinCm: dados.alturaMinCm,
        alturaMaxCm: dados.alturaMaxCm,
        nivelRecomendado: dados.nivelRecomendado ?? "INICIANTE",
        precoHoraCentavos: dados.precoHoraCentavos,
        precoDiaCentavos: dados.precoDiaCentavos,
        valorCaucaoCentavos: dados.valorCaucaoCentavos ?? 0,
        ativo: dados.ativo ?? true,
      };
      tipos.set(id, tipo);
      return tipo;
    },
    async atualizarTipo(sessao, id, dados) {
      sessoesVistas.push(sessao);
      const atual = tipos.get(id);
      if (!atual) return null;
      if ([...tipos.values()].some((t) => t.id !== id && t.nome === dados.nome)) throw new NomeDeTipoJaExiste();
      // os obrigatórios são substituídos; os opcionais ausentes mantêm o valor atual
      const novo: TipoAdmin = {
        id,
        nome: dados.nome,
        descricao: dados.descricao !== undefined ? dados.descricao : atual.descricao,
        atividades: dados.atividades,
        alturaMinCm: dados.alturaMinCm,
        alturaMaxCm: dados.alturaMaxCm,
        nivelRecomendado: dados.nivelRecomendado ?? atual.nivelRecomendado,
        precoHoraCentavos: dados.precoHoraCentavos,
        precoDiaCentavos: dados.precoDiaCentavos,
        valorCaucaoCentavos: dados.valorCaucaoCentavos ?? atual.valorCaucaoCentavos,
        ativo: dados.ativo ?? atual.ativo,
      };
      tipos.set(id, novo);
      return novo;
    },
    async listarBicicletas(sessao, filtro) {
      sessoesVistas.push(sessao);
      return [...bicicletas.values()].filter(
        (b) => (!filtro.tipoId || b.tipo.id === filtro.tipoId) && (!filtro.status || b.status === filtro.status),
      );
    },
    async criarBicicleta(sessao, dados) {
      sessoesVistas.push(sessao);
      const tipo = tipos.get(dados.tipoId);
      if (!tipo) throw new TipoInexistente();
      if (!pontos.has(dados.pontoId)) throw new PontoInexistente();
      if (!pontos.get(dados.pontoId)) throw new PontoInativo();
      if ([...bicicletas.values()].some((b) => b.codigo === dados.codigo)) throw new CodigoDeBicicletaJaExiste();
      const id = `dddddddd-0000-4000-8000-${String(++sequencia).padStart(12, "0")}`;
      const bici: BicicletaAdmin = {
        id,
        codigo: dados.codigo,
        tipo: { id: tipo.id, nome: tipo.nome },
        ponto: { id: dados.pontoId, nome: "Ponto Litorânea" },
        numeroSerie: dados.numeroSerie,
        tamanhoQuadro: dados.tamanhoQuadro,
        status: "DISPONIVEL",
        observacoes: dados.observacoes,
      };
      bicicletas.set(id, bici);
      return bici;
    },
    async atualizarBicicleta(sessao, id, dados) {
      sessoesVistas.push(sessao);
      const atual = bicicletas.get(id);
      if (!atual) return null;
      const nova = {
        ...atual,
        status: dados.status ?? atual.status,
        observacoes: dados.observacoes !== undefined ? dados.observacoes : atual.observacoes,
      };
      bicicletas.set(id, nova);
      return nova;
    },
  };
  return { catalogo: criarCatalogo(repositorio), tipos, bicicletas, sessoesVistas };
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
test("o catálogo público só mostra tipos ativos e esconde o campo `ativo`", async () => {
  const { catalogo } = repositorioFalso();
  await catalogo.criarTipo(ADMIN, CORPO_TIPO);
  await catalogo.criarTipo(ADMIN, { ...CORPO_TIPO, nome: "Antiga", ativo: false });
  const publico = await catalogo.listarTiposPublicos(VISITANTE);
  assert.deepEqual(publico.map((t) => t.nome), ["Urbana"]);
  assert.ok(!("ativo" in publico[0]));
  assert.equal(publico[0].precoDiaCentavos, 5000);
  assert.deepEqual(Object.keys(publico[0]).sort(), [
    "alturaMaxCm", "alturaMinCm", "atividades", "descricao", "id", "nivelRecomendado", "nome",
    "precoDiaCentavos", "precoHoraCentavos", "valorCaucaoCentavos",
  ]);
});

test("o painel lista todos os tipos, com `ativo`", async () => {
  const { catalogo } = repositorioFalso();
  await catalogo.criarTipo(ADMIN, CORPO_TIPO);
  await catalogo.criarTipo(ADMIN, { ...CORPO_TIPO, nome: "Antiga", ativo: false });
  const todos = await catalogo.listarTiposAdmin(ADMIN);
  assert.deepEqual(todos.map((t) => [t.nome, t.ativo]), [["Antiga", false], ["Urbana", true]]);
});

test("criar tipo: nasce ativo por padrão e usa os valores normalizados", async () => {
  const { catalogo } = repositorioFalso();
  const tipo = await catalogo.criarTipo(ADMIN, { ...CORPO_TIPO, nome: "  Urbana  " });
  assert.equal(tipo.nome, "Urbana");
  assert.equal(tipo.ativo, true);
  assert.equal(tipo.nivelRecomendado, "INICIANTE");
});

test("criar tipo com nome repetido responde 409", async () => {
  const { catalogo } = repositorioFalso();
  await catalogo.criarTipo(ADMIN, CORPO_TIPO);
  await assert.rejects(catalogo.criarTipo(ADMIN, CORPO_TIPO), ConflictError);
});

test("criar tipo inválido responde 400 com details e não chega ao banco", async () => {
  const { catalogo, tipos } = repositorioFalso();
  await assert.rejects(
    catalogo.criarTipo(ADMIN, { ...CORPO_TIPO, alturaMinCm: 200, alturaMaxCm: 150, precoHoraCentavos: 10.5, atividades: [] }),
    (erro: unknown) => {
      assert.ok(erro instanceof ValidationError);
      assert.deepEqual(Object.keys(erro.details as object).sort(), ["alturaMaxCm", "atividades", "precoHoraCentavos"]);
      return true;
    },
  );
  assert.equal(tipos.size, 0);
});

test("PUT substitui os dados e `ativo: false` tira o tipo do catálogo (não há exclusão)", async () => {
  const { catalogo } = repositorioFalso();
  const criado = await catalogo.criarTipo(ADMIN, CORPO_TIPO);
  const editado = await catalogo.atualizarTipo(ADMIN, criado.id, { ...CORPO_TIPO, precoDiaCentavos: 6000, ativo: false });
  assert.equal(editado.precoDiaCentavos, 6000);
  assert.equal(editado.ativo, false);
  assert.deepEqual(await catalogo.listarTiposPublicos(VISITANTE), []);
  assert.equal((await catalogo.listarTiposAdmin(ADMIN)).length, 1, "continua no painel");
});

test("PUT sem `ativo` mantém o estado atual (não reativa um tipo inativo sem querer)", async () => {
  const { catalogo } = repositorioFalso();
  const criado = await catalogo.criarTipo(ADMIN, { ...CORPO_TIPO, ativo: false });
  const editado = await catalogo.atualizarTipo(ADMIN, criado.id, { ...CORPO_TIPO, precoDiaCentavos: 7000 });
  assert.equal(editado.ativo, false);
});

test("PUT: id inexistente ou que não é UUID responde 404; nome de outro tipo responde 409", async () => {
  const { catalogo } = repositorioFalso();
  const a = await catalogo.criarTipo(ADMIN, CORPO_TIPO);
  await catalogo.criarTipo(ADMIN, { ...CORPO_TIPO, nome: "Passeio" });
  await assert.rejects(catalogo.atualizarTipo(ADMIN, "dddddddd-0000-4000-8000-00000000ffff", CORPO_TIPO), NotFoundError);
  await assert.rejects(catalogo.atualizarTipo(ADMIN, "1; DROP TABLE tipo_bicicleta", CORPO_TIPO), NotFoundError);
  await assert.rejects(catalogo.atualizarTipo(ADMIN, a.id, { ...CORPO_TIPO, nome: "Passeio" }), ConflictError);
  // manter o próprio nome não é conflito
  await catalogo.atualizarTipo(ADMIN, a.id, { ...CORPO_TIPO, precoHoraCentavos: 1500 });
});

test("PUT: id inválido responde 404 antes de validar o corpo (nada a revelar)", async () => {
  const { catalogo } = repositorioFalso();
  await assert.rejects(catalogo.atualizarTipo(ADMIN, "nao-e-uuid", {}), NotFoundError);
});

test("a sessão recebida é repassada ao repositório (é o que o comSessao usa para a RLS)", async () => {
  const { catalogo, sessoesVistas } = repositorioFalso();
  await catalogo.listarTiposPublicos(VISITANTE);
  await catalogo.criarTipo(ADMIN, CORPO_TIPO);
  assert.deepEqual(sessoesVistas, [VISITANTE, ADMIN]);
});

// ---------------------------------------------------------------------------
// Bicicletas
// ---------------------------------------------------------------------------
async function comTipo() {
  const ctx = repositorioFalso();
  const tipo = await ctx.catalogo.criarTipo(ADMIN, CORPO_TIPO);
  return { ...ctx, tipo };
}

const corpoBici = (tipoId: string, extra: object = {}) => ({
  tipoId,
  pontoId: ID_PONTO,
  codigo: "BIC-015",
  numeroSerie: "SN999",
  tamanhoQuadro: "M",
  ...extra,
});

test("criar bicicleta: 201 com status DISPONIVEL e o tipo e o ponto por nome", async () => {
  const { catalogo, tipo } = await comTipo();
  const bici = await catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id, { codigo: "bic-015" }));
  assert.equal(bici.status, "DISPONIVEL");
  assert.equal(bici.codigo, "BIC-015");
  assert.deepEqual(bici.tipo, { id: tipo.id, nome: "Urbana" });
  assert.equal(bici.ponto.id, ID_PONTO);
});

test("criar bicicleta com código repetido responde 409, mesmo variando maiúsculas", async () => {
  const { catalogo, tipo } = await comTipo();
  await catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id));
  await assert.rejects(catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id)), ConflictError);
  await assert.rejects(catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id, { codigo: "bic-015" })), ConflictError);
});

test("criar bicicleta com tipo ou ponto inexistente responde 404", async () => {
  const { catalogo, tipo } = await comTipo();
  await assert.rejects(
    catalogo.criarBicicleta(ADMIN, corpoBici("eeeeeeee-0000-4000-8000-000000000009")),
    (erro: unknown) => erro instanceof NotFoundError && /Tipo/.test(erro.message),
  );
  await assert.rejects(
    catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id, { pontoId: "ffffffff-0000-4000-8000-000000000009" })),
    (erro: unknown) => erro instanceof NotFoundError && /Ponto/.test(erro.message),
  );
});

test("criar bicicleta com dados inválidos responde 400 e não grava", async () => {
  const { catalogo, tipo, bicicletas } = await comTipo();
  await assert.rejects(catalogo.criarBicicleta(ADMIN, { tipoId: "x", pontoId: "y", codigo: "" }), ValidationError);
  await assert.rejects(catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id, { codigo: "A;B" })), ValidationError);
  assert.equal(bicicletas.size, 0);
});

test("PATCH muda o status e a bicicleta deixa de estar disponível", async () => {
  const { catalogo, tipo } = await comTipo();
  const bici = await catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id));
  const nova = await catalogo.atualizarBicicleta(ADMIN, bici.id, { status: "MANUTENCAO", observacoes: "pneu furado" });
  assert.equal(nova.status, "MANUTENCAO");
  assert.equal(nova.observacoes, "pneu furado");
  const livres = await catalogo.listarBicicletas(ADMIN, { status: "DISPONIVEL" });
  assert.deepEqual(livres, []);
});

test("PATCH com um campo só não mexe no outro; observacoes null apaga", async () => {
  const { catalogo, tipo } = await comTipo();
  const bici = await catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id, { observacoes: "nova" }));
  const soStatus = await catalogo.atualizarBicicleta(ADMIN, bici.id, { status: "BLOQUEADA" });
  assert.equal(soStatus.observacoes, "nova");
  const apagada = await catalogo.atualizarBicicleta(ADMIN, bici.id, { observacoes: null });
  assert.equal(apagada.observacoes, null);
  assert.equal(apagada.status, "BLOQUEADA");
});

test("PATCH: corpo vazio e status inválido respondem 400; id inexistente ou inválido responde 404", async () => {
  const { catalogo, tipo } = await comTipo();
  const bici = await catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id));
  await assert.rejects(catalogo.atualizarBicicleta(ADMIN, bici.id, {}), ValidationError);
  await assert.rejects(catalogo.atualizarBicicleta(ADMIN, bici.id, { status: "ALUGADA" }), ValidationError);
  await assert.rejects(catalogo.atualizarBicicleta(ADMIN, "eeeeeeee-0000-4000-8000-000000000009", { status: "BAIXADA" }), NotFoundError);
  await assert.rejects(catalogo.atualizarBicicleta(ADMIN, "abc", { status: "BAIXADA" }), NotFoundError);
});

test("listar bicicletas filtra por tipoId e status; filtro inválido responde 400", async () => {
  const { catalogo, tipo } = await comTipo();
  const outro = await catalogo.criarTipo(ADMIN, { ...CORPO_TIPO, nome: "Passeio" });
  const a = await catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id, { codigo: "A-1" }));
  await catalogo.criarBicicleta(ADMIN, corpoBici(outro.id, { codigo: "B-1" }));
  await catalogo.atualizarBicicleta(ADMIN, a.id, { status: "MANUTENCAO" });

  assert.equal((await catalogo.listarBicicletas(ADMIN, {})).length, 2);
  assert.deepEqual((await catalogo.listarBicicletas(ADMIN, { tipoId: tipo.id })).map((b) => b.codigo), ["A-1"]);
  assert.deepEqual((await catalogo.listarBicicletas(ADMIN, { status: "MANUTENCAO" })).map((b) => b.codigo), ["A-1"]);
  assert.deepEqual(await catalogo.listarBicicletas(ADMIN, { tipoId: outro.id, status: "MANUTENCAO" }), []);
  await assert.rejects(catalogo.listarBicicletas(ADMIN, { status: "ALUGADA" }), ValidationError);
  await assert.rejects(catalogo.listarBicicletas(ADMIN, { tipoId: "x" }), ValidationError);
});

test("erro inesperado do banco não é engolido nem vira 409/404", async () => {
  const catalogo = criarCatalogo({
    async listarTipos() { throw new Error("banco fora do ar"); },
    async criarTipo() { throw new Error("banco fora do ar"); },
    async atualizarTipo() { throw new Error("banco fora do ar"); },
    async listarBicicletas() { throw new Error("banco fora do ar"); },
    async criarBicicleta() { throw new Error("banco fora do ar"); },
    async atualizarBicicleta() { throw new Error("banco fora do ar"); },
  });
  await assert.rejects(catalogo.criarTipo(ADMIN, CORPO_TIPO), /banco fora do ar/);
  await assert.rejects(catalogo.atualizarTipo(ADMIN, ID_TIPO, CORPO_TIPO), /banco fora do ar/);
  await assert.rejects(catalogo.criarBicicleta(ADMIN, corpoBici(ID_TIPO)), /banco fora do ar/);
  await assert.rejects(catalogo.atualizarBicicleta(ADMIN, ID_BICI, { status: "BAIXADA" }), /banco fora do ar/);
});

// ---------------------------------------------------------------------------
// Pontos da review do PR #28
// ---------------------------------------------------------------------------
test("PUT sem os opcionais mantém caução, nível, descrição e ativo (só quer mudar o preço)", async () => {
  const { catalogo } = repositorioFalso();
  const criado = await catalogo.criarTipo(ADMIN, {
    ...CORPO_TIPO,
    descricao: "Leve e prática",
    nivelRecomendado: "INTERMEDIARIO",
    valorCaucaoCentavos: 15000,
    ativo: false,
  });
  const { nome, atividades, alturaMinCm, alturaMaxCm, precoHoraCentavos } = CORPO_TIPO;
  const editado = await catalogo.atualizarTipo(ADMIN, criado.id, {
    nome, atividades, alturaMinCm, alturaMaxCm, precoHoraCentavos, precoDiaCentavos: 7000,
  });
  assert.equal(editado.precoDiaCentavos, 7000, "o preço mudou");
  assert.equal(editado.valorCaucaoCentavos, 15000, "a caução NÃO foi zerada");
  assert.equal(editado.nivelRecomendado, "INTERMEDIARIO", "o nível NÃO voltou para INICIANTE");
  assert.equal(editado.descricao, "Leve e prática", "a descrição NÃO foi apagada");
  assert.equal(editado.ativo, false, "o estado NÃO mudou");
});

test("PUT com o opcional informado o substitui, inclusive caução 0 e descrição null", async () => {
  const { catalogo } = repositorioFalso();
  const criado = await catalogo.criarTipo(ADMIN, { ...CORPO_TIPO, descricao: "Antiga", nivelRecomendado: "AVANCADO" });
  const editado = await catalogo.atualizarTipo(ADMIN, criado.id, {
    ...CORPO_TIPO,
    descricao: null,
    nivelRecomendado: "INICIANTE",
    valorCaucaoCentavos: 0,
  });
  assert.equal(editado.descricao, null, "descricao: null apaga de propósito");
  assert.equal(editado.nivelRecomendado, "INICIANTE");
  assert.equal(editado.valorCaucaoCentavos, 0, "caução 0 informada é respeitada");
  const vazia = await catalogo.atualizarTipo(ADMIN, criado.id, { ...CORPO_TIPO, descricao: "   " });
  assert.equal(vazia.descricao, null, "texto vazio também apaga");
});

test("POST sem os opcionais usa os padrões", async () => {
  const { catalogo } = repositorioFalso();
  const { nome, atividades, alturaMinCm, alturaMaxCm, precoHoraCentavos, precoDiaCentavos } = CORPO_TIPO;
  const tipo = await catalogo.criarTipo(ADMIN, { nome, atividades, alturaMinCm, alturaMaxCm, precoHoraCentavos, precoDiaCentavos });
  assert.deepEqual(
    [tipo.descricao, tipo.nivelRecomendado, tipo.valorCaucaoCentavos, tipo.ativo],
    [null, "INICIANTE", 0, true],
  );
});

test("cadastrar bicicleta em ponto inativo responde 409, e em ponto que não existe, 404", async () => {
  const { catalogo, tipo, bicicletas } = await comTipo();
  await assert.rejects(
    catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id, { pontoId: ID_PONTO_INATIVO })),
    (erro: unknown) => erro instanceof ConflictError && erro.status === 409 && /inativo/.test(erro.message),
  );
  await assert.rejects(
    catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id, { pontoId: "ffffffff-0000-4000-8000-000000000009" })),
    NotFoundError,
  );
  assert.equal(bicicletas.size, 0, "nada foi gravado");
  await catalogo.criarBicicleta(ADMIN, corpoBici(tipo.id)); // ponto ativo continua funcionando
  assert.equal(bicicletas.size, 1);
});
