import assert from "node:assert/strict";
import { test } from "node:test";
import { EmailOuCpfJaCadastrado, RepositorioDeUsuarios } from "./repositorio-usuarios.ts";

// O SQL do repositório sobre um banco de mentira que anota o que recebe. A segurança por linha e as
// constraints reais estão nos testes de banco; aqui se prova o que este código MANDA: SQL parametrizado,
// o filtro por perfil nas gravações do cliente e a conversão das linhas.
function banco(linhas: Record<string, unknown>[] = [], falha?: unknown) {
  const consultas: { sql: string; valores?: unknown[] }[] = [];
  return {
    consultas,
    banco: {
      async consultar(sql: string, valores?: unknown[]) {
        consultas.push({ sql, valores });
        if (falha) throw falha;
        return { rows: linhas };
      },
    } as never,
  };
}

const CADASTRO = { nome: "Maria da Silva", email: "maria@exemplo.com", senha: "x", cpf: "52998224725", telefone: null, dataNascimento: null, alturaCm: 172 };

test("criarCliente insere CLIENTE com os dados e o hash como parâmetros e devolve só o usuário público", async () => {
  const b = banco([{ id: "u1", perfil: "CLIENTE", nome: "Maria da Silva", email: "maria@exemplo.com", senha_hash: "NAO-PODE-VAZAR" }]);
  const r = await new RepositorioDeUsuarios(b.banco).criarCliente(CADASTRO, "hash-scrypt", "2026-11");
  assert.deepEqual(r, { id: "u1", perfil: "CLIENTE", nome: "Maria da Silva", email: "maria@exemplo.com" });
  assert.deepEqual(b.consultas[0].valores, ["Maria da Silva", "maria@exemplo.com", "hash-scrypt", null, "52998224725", null, 172, "2026-11"]);
  assert.match(b.consultas[0].sql, /VALUES \('CLIENTE'/);
});

test("criarCliente: violação de unicidade (23505) vira EmailOuCpfJaCadastrado; outro erro sobe como veio", async () => {
  await assert.rejects(new RepositorioDeUsuarios(banco([], { code: "23505" }).banco).criarCliente(CADASTRO, "h", "v"), EmailOuCpfJaCadastrado);
  const outro = new Error("conexão caiu");
  await assert.rejects(new RepositorioDeUsuarios(banco([], outro).banco).criarCliente(CADASTRO, "h", "v"), (e: unknown) => e === outro);
  await assert.rejects(new RepositorioDeUsuarios(banco([], { code: "23514" }).banco).criarCliente(CADASTRO, "h", "v"), (e: unknown) => !(e instanceof EmailOuCpfJaCadastrado));
});

test("todo valor de usuário vai por parâmetro: nada do que o usuário manda aparece no texto SQL", async () => {
  const hostil = "x'; DROP TABLE usuario;--";
  const b = banco([]);
  const repo = new RepositorioDeUsuarios(b.banco);
  await repo.buscarPorEmail(hostil);
  await repo.buscarSituacaoPorId(hostil);
  await repo.buscarSenhaHashPorId(hostil);
  await repo.atualizarSenha(hostil, hostil);
  await repo.desativar(hostil);
  await repo.atualizarAltura(hostil, 170);
  await repo.registrarAceiteDeTermos(hostil, hostil);
  await repo.buscarConta(hostil);
  await repo.gravarPerfilCiclista(hostil, { alturaCm: 1, experiencia: null, atividade: null });
  assert.equal(b.consultas.length, 9);
  for (const c of b.consultas) {
    assert.ok(!c.sql.includes("DROP TABLE"), c.sql.slice(0, 60));
    assert.ok(c.valores?.includes(hostil), c.sql.slice(0, 60));
  }
});

test("as gravações que só valem para cliente filtram por perfil no próprio SQL (segunda barreira)", async () => {
  const b = banco([]);
  const repo = new RepositorioDeUsuarios(b.banco);
  await repo.atualizarAltura("u", 170);
  await repo.registrarAceiteDeTermos("u", "2026-11");
  await repo.gravarPerfilCiclista("u", { alturaCm: 1, experiencia: null, atividade: null });
  for (const c of b.consultas) assert.match(c.sql, /perfil = 'CLIENTE'/);
});

test("buscarPorEmail traz o hash e o ativo (o login precisa); e devolve null sem linha", async () => {
  const achou = await new RepositorioDeUsuarios(banco([{ id: "u1", perfil: "OPERADOR", nome: "Op", email: "op@x.com", senha_hash: "h", ativo: false }]).banco).buscarPorEmail("op@x.com");
  assert.deepEqual(achou, { id: "u1", perfil: "OPERADOR", nome: "Op", email: "op@x.com", senhaHash: "h", ativo: false });
  assert.equal(await new RepositorioDeUsuarios(banco([]).banco).buscarPorEmail("x@y.z"), null);
});

test("buscarConta: cliente traz os dados de ciclista; operador e admin não", async () => {
  const cliente = await new RepositorioDeUsuarios(banco([{ id: "u1", perfil: "CLIENTE", nome: "M", email: "m@x.com", altura_cm: 172, experiencia: "INICIANTE", atividade_preferida: "PASSEIO" }]).banco).buscarConta("u1");
  assert.deepEqual(cliente?.ciclista, { alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" });
  const admin = await new RepositorioDeUsuarios(banco([{ id: "u2", perfil: "ADMIN", nome: "A", email: "a@x.com", altura_cm: 180, experiencia: "AVANCADO", atividade_preferida: "TRILHA" }]).banco).buscarConta("u2");
  assert.equal(admin?.ciclista, undefined, "mesmo que a linha traga dados, só cliente os expõe");
  assert.equal(await new RepositorioDeUsuarios(banco([]).banco).buscarConta("nao-existe"), null);
});

test("buscarConta e gravarPerfilCiclista nunca leem senha nem CPF", async () => {
  const b = banco([]);
  const repo = new RepositorioDeUsuarios(b.banco);
  await repo.buscarConta("u");
  await repo.gravarPerfilCiclista("u", { alturaCm: 1, experiencia: null, atividade: null });
  for (const c of b.consultas) assert.ok(!/senha|cpf/i.test(c.sql), c.sql.slice(0, 80));
});

test("gravarPerfilCiclista devolve null se a conta não é de cliente (nenhuma linha atualizada)", async () => {
  assert.equal(await new RepositorioDeUsuarios(banco([]).banco).gravarPerfilCiclista("u", { alturaCm: 1, experiencia: null, atividade: null }), null);
});

test("buscarSituacaoPorId e buscarSenhaHashPorId devolvem null sem linha", async () => {
  const repo = new RepositorioDeUsuarios(banco([]).banco);
  assert.equal(await repo.buscarSituacaoPorId("u"), null);
  assert.equal(await repo.buscarSenhaHashPorId("u"), null);
});

test("o repositório do app existe e o banco é injetável (duas instâncias não se misturam)", async () => {
  assert.ok(RepositorioDeUsuarios.padrao instanceof RepositorioDeUsuarios);
  const a = banco([{ perfil: "CLIENTE", ativo: true }]);
  const b = banco([]);
  assert.ok(await new RepositorioDeUsuarios(a.banco).buscarSituacaoPorId("u"));
  assert.equal(await new RepositorioDeUsuarios(b.banco).buscarSituacaoPorId("u"), null);
  assert.deepEqual(Object.keys(new RepositorioDeUsuarios(a.banco)), []);
});
