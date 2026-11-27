import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import {
  CodigoDeBicicletaJaExiste,
  NomeDeTipoJaExiste,
  PontoInativo,
  PontoInexistente,
  TipoInexistente,
} from "../domain/erros.ts";
import { RepositorioDoCatalogo } from "./repositorio-catalogo.ts";

// O SQL do catálogo sobre um banco de mentira que responde o que o teste combinar, em ordem, e anota o que
// recebe. As políticas de RLS e as constraints reais estão nos testes de banco; aqui se prova o que este
// código MANDA (a sessão declarada, SQL parametrizado) e como ele traduz as respostas e os erros do banco.
const ADMIN: SessaoBanco = { perfil: "ADMIN", usuarioId: "aaaaaaaa-0000-4000-8000-000000000001" };
const VISITANTE: SessaoBanco = { perfil: null, usuarioId: null };

function banco(...respostas: (Record<string, unknown>[] | Error)[]) {
  const consultas: { sql: string; valores?: unknown[] }[] = [];
  const sessoes: SessaoBanco[] = [];
  let i = 0;
  return {
    consultas,
    sessoes,
    repositorio: new RepositorioDoCatalogo({
      comSessao: async (sessao: SessaoBanco, fn: (client: never) => Promise<unknown>) => {
        sessoes.push(sessao);
        return fn({
          async query(sql: string, valores?: unknown[]) {
            consultas.push({ sql, valores });
            const r = respostas[Math.min(i++, respostas.length - 1)] ?? [];
            if (r instanceof Error) throw r;
            return { rows: r };
          },
        } as never);
      },
    } as never),
  };
}

const LINHA_TIPO = {
  id: "t1", nome: "Urbana", descricao: null, atividades: ["URBANO"], altura_min_cm: 150, altura_max_cm: 195,
  nivel_recomendado: "INICIANTE", preco_hora_centavos: 1000, preco_dia_centavos: 5000, valor_caucao_centavos: 15000, ativo: true,
};
const LINHA_BICI = { id: "b1", codigo: "BIC-001", numero_serie: null, tamanho_quadro: "M", status: "DISPONIVEL", observacoes: null, tipo_id: "t1", tipo_nome: "Urbana", ponto_id: "p1", ponto_nome: "Ponto" };
const DADOS_TIPO = { nome: "Urbana", atividades: ["URBANO" as const], alturaMinCm: 150, alturaMaxCm: 195, precoHoraCentavos: 1000, precoDiaCentavos: 5000 };
const DADOS_BICI = { tipoId: "t1", pontoId: "p1", codigo: "BIC-001", numeroSerie: null, tamanhoQuadro: null, observacoes: null };

test("toda consulta roda dentro da sessão recebida (a RLS depende dela)", async () => {
  const b = banco([LINHA_TIPO]);
  await b.repositorio.listarTipos(ADMIN, { apenasAtivos: false });
  await b.repositorio.listarTipos(VISITANTE, { apenasAtivos: true });
  assert.deepEqual(b.sessoes, [ADMIN, VISITANTE]);
});

test("listarTipos converte a linha do banco (snake_case) para o tipo da API e manda o filtro como parâmetro", async () => {
  const b = banco([LINHA_TIPO]);
  const [tipo] = await b.repositorio.listarTipos(ADMIN, { apenasAtivos: true });
  assert.deepEqual(tipo, { id: "t1", nome: "Urbana", descricao: null, atividades: ["URBANO"], alturaMinCm: 150, alturaMaxCm: 195, nivelRecomendado: "INICIANTE", precoHoraCentavos: 1000, precoDiaCentavos: 5000, valorCaucaoCentavos: 15000, ativo: true });
  assert.deepEqual(b.consultas[0].valores, [true]);
});

test("criarTipo manda todos os valores por parâmetro e os opcionais ausentes como null (valem os padrões do banco)", async () => {
  const b = banco([LINHA_TIPO]);
  await b.repositorio.criarTipo(ADMIN, DADOS_TIPO);
  assert.deepEqual(b.consultas[0].valores, ["Urbana", null, ["URBANO"], 150, 195, null, 1000, 5000, null, null]);
});

test("criarTipo: nome repetido (23505) vira NomeDeTipoJaExiste; outro erro sobe como veio", async () => {
  await assert.rejects(banco(Object.assign(new Error("dup"), { code: "23505" })).repositorio.criarTipo(ADMIN, DADOS_TIPO), NomeDeTipoJaExiste);
  const outro = new Error("conexão caiu");
  await assert.rejects(banco(outro).repositorio.criarTipo(ADMIN, DADOS_TIPO), (e: unknown) => e === outro);
});

test("atualizarTipo: o último parâmetro diz se a descrição foi informada (null apaga, ausente mantém)", async () => {
  const a = banco([LINHA_TIPO]);
  await a.repositorio.atualizarTipo(ADMIN, "t1", { ...DADOS_TIPO, descricao: null });
  assert.equal(a.consultas[0].valores?.[11], true);
  const b = banco([LINHA_TIPO]);
  await b.repositorio.atualizarTipo(ADMIN, "t1", DADOS_TIPO);
  assert.equal(b.consultas[0].valores?.[11], false);
});

test("atualizarTipo devolve null para id que não existe e traduz o nome repetido", async () => {
  assert.equal(await banco([]).repositorio.atualizarTipo(ADMIN, "t1", DADOS_TIPO), null);
  await assert.rejects(banco(Object.assign(new Error("dup"), { code: "23505" })).repositorio.atualizarTipo(ADMIN, "t1", DADOS_TIPO), NomeDeTipoJaExiste);
});

test("listarBicicletas manda os filtros como parâmetros e converte a linha", async () => {
  const b = banco([LINHA_BICI]);
  const [bici] = await b.repositorio.listarBicicletas(ADMIN, { tipoId: "t1", status: "DISPONIVEL" });
  assert.deepEqual(b.consultas[0].valores, ["t1", "DISPONIVEL"]);
  assert.deepEqual(bici, { id: "b1", codigo: "BIC-001", tipo: { id: "t1", nome: "Urbana" }, ponto: { id: "p1", nome: "Ponto" }, numeroSerie: null, tamanhoQuadro: "M", status: "DISPONIVEL", observacoes: null });
});

test("criarBicicleta: confere o tipo e o ponto ANTES de inserir e diz qual não existe", async () => {
  await assert.rejects(banco([{ tipo: false, ponto_ativo: true }]).repositorio.criarBicicleta(ADMIN, DADOS_BICI), TipoInexistente);
  await assert.rejects(banco([{ tipo: true, ponto_ativo: null }]).repositorio.criarBicicleta(ADMIN, DADOS_BICI), PontoInexistente);
  await assert.rejects(banco([{ tipo: true, ponto_ativo: false }]).repositorio.criarBicicleta(ADMIN, DADOS_BICI), PontoInativo);
  const sem = banco([{ tipo: false, ponto_ativo: true }]);
  await assert.rejects(sem.repositorio.criarBicicleta(ADMIN, DADOS_BICI));
  assert.equal(sem.consultas.length, 1, "nada foi inserido");
});

test("criarBicicleta feliz: insere e devolve a bicicleta lida de volta", async () => {
  const b = banco([{ tipo: true, ponto_ativo: true }], [{ id: "b1" }], [LINHA_BICI]);
  const r = await b.repositorio.criarBicicleta(ADMIN, DADOS_BICI);
  assert.equal(r.codigo, "BIC-001");
  assert.deepEqual(b.consultas[1].valores, ["t1", "p1", "BIC-001", null, null, null]);
  assert.deepEqual(b.consultas[2].valores, ["b1"]);
});

test("criarBicicleta: código repetido e a corrida com a exclusão do tipo ou do ponto viram as falhas certas", async () => {
  const antes = [{ tipo: true, ponto_ativo: true }];
  const erro = (code: string, constraint?: string) => Object.assign(new Error("x"), { code, constraint });
  await assert.rejects(banco(antes, erro("23505")).repositorio.criarBicicleta(ADMIN, DADOS_BICI), CodigoDeBicicletaJaExiste);
  await assert.rejects(banco(antes, erro("23503", "bicicleta_ponto_id_fkey")).repositorio.criarBicicleta(ADMIN, DADOS_BICI), PontoInexistente);
  await assert.rejects(banco(antes, erro("23503", "bicicleta_tipo_id_fkey")).repositorio.criarBicicleta(ADMIN, DADOS_BICI), TipoInexistente);
  const desconhecido = erro("23503", "outra_fkey");
  await assert.rejects(banco(antes, desconhecido).repositorio.criarBicicleta(ADMIN, DADOS_BICI), (e: unknown) => e === desconhecido);
});

test("atualizarBicicleta: devolve null se o id não existe; senão lê a bicicleta de volta", async () => {
  assert.equal(await banco([]).repositorio.atualizarBicicleta(ADMIN, "b1", { status: "MANUTENCAO" }), null);
  const b = banco([{ id: "b1" }], [LINHA_BICI]);
  const r = await b.repositorio.atualizarBicicleta(ADMIN, "b1", { observacoes: null });
  assert.equal(r?.id, "b1");
  assert.deepEqual(b.consultas[0].valores, ["b1", null, true, null], "observacoes: null apaga (o terceiro parâmetro diz que foi informada)");
  const c = banco([{ id: "b1" }], [LINHA_BICI]);
  await c.repositorio.atualizarBicicleta(ADMIN, "b1", { status: "MANUTENCAO" });
  assert.deepEqual(c.consultas[0].valores, ["b1", "MANUTENCAO", false, null], "sem observacoes, o campo é mantido");
});

test("obterEmpresaPublica lê a VIEW empresa_publica (nunca a tabela) e converte os horários do jsonb", async () => {
  const b = banco(
    [{ nome_fantasia: "Bike Ilha Club", telefone: "9800", email: "a@b.c" }],
    [{ id: "p1", nome: "Ponto", logradouro: "Rua", numero: "1", complemento: null, bairro: "Calhau", cep: "65000000", cidade: "São Luís", uf: "MA", telefone: null, horarios: [{ dia_semana: 1, abre: "08:00", fecha: "18:00" }], ativo: true }],
  );
  const r = await b.repositorio.obterEmpresaPublica(VISITANTE);
  assert.match(b.consultas[0].sql, /FROM empresa_publica/);
  assert.ok(!/FROM empresa\b/.test(b.consultas[0].sql) && !/cnpj|razao|conta/i.test(b.consultas[0].sql));
  assert.deepEqual(r?.pontos[0].horarios, [{ diaSemana: 1, abre: "08:00", fecha: "18:00" }]);
  assert.match(b.consultas[1].sql, /WHERE ativo/);
});

test("obterEmpresaPublica: sem cadastro devolve null e sem horários vira lista vazia", async () => {
  assert.equal(await banco([]).repositorio.obterEmpresaPublica(VISITANTE), null);
  const r = await banco([{ nome_fantasia: "X", telefone: null, email: "a@b.c" }], [{ id: "p1", nome: "P", logradouro: "R", numero: "1", complemento: null, bairro: "B", cep: "65000000", cidade: "C", uf: "MA", telefone: null, horarios: null, ativo: true }]).repositorio.obterEmpresaPublica(VISITANTE);
  assert.deepEqual(r?.pontos[0].horarios, []);
});

test("nada do que o usuário manda aparece no texto SQL (tudo por parâmetro)", async () => {
  const hostil = "x'; DROP TABLE tipo_bicicleta;--";
  const sqls: string[] = [];
  const rodar = async (b: ReturnType<typeof banco>, operacao: (r: RepositorioDoCatalogo) => Promise<unknown>) => {
    await operacao(b.repositorio).catch(() => undefined);
    sqls.push(...b.consultas.map((c) => c.sql));
  };
  await rodar(banco([LINHA_TIPO]), (r) => r.criarTipo(ADMIN, { ...DADOS_TIPO, nome: hostil }));
  await rodar(banco([LINHA_TIPO]), (r) => r.atualizarTipo(ADMIN, hostil, { ...DADOS_TIPO, nome: hostil }));
  await rodar(banco([LINHA_BICI]), (r) => r.listarBicicletas(ADMIN, { tipoId: hostil, status: null }));
  await rodar(banco([{ tipo: true, ponto_ativo: true }], [{ id: "b1" }], [LINHA_BICI]), (r) => r.criarBicicleta(ADMIN, { ...DADOS_BICI, codigo: hostil }));
  await rodar(banco([{ id: "b1" }], [LINHA_BICI]), (r) => r.atualizarBicicleta(ADMIN, hostil, { observacoes: hostil }));
  assert.ok(sqls.length >= 7);
  for (const sql of sqls) assert.ok(!sql.includes("DROP TABLE"), sql.slice(0, 50));
});

test("o repositório do app existe, o banco é injetável e nenhum campo é visível", () => {
  assert.ok(RepositorioDoCatalogo.padrao instanceof RepositorioDoCatalogo);
  assert.deepEqual(Object.keys(banco().repositorio), []);
});
