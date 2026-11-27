import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { TooManyRequestsError, UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import type { UsuarioComSenha } from "../domain/usuario.ts";
import { ValidadorDeConta } from "../domain/validador-de-conta.ts";
import { Autenticador } from "./autenticador.ts";
import { EmissorDeSessao } from "./emissor-de-sessao.ts";

const ID = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const SENHA = "senha-certa-1";
const HASH_FALSO = "hash-falso-do-login";
const IP = "200.1.1.1";

const maria = (extra: Partial<UsuarioComSenha> = {}): UsuarioComSenha => ({
  id: ID, perfil: "CLIENTE", nome: "Maria da Silva", email: "maria@exemplo.com", senhaHash: `hash:${SENHA}`, ativo: true, ...extra,
});

// Tudo de mentira, anotando a ordem do que acontece: o que importa no login é a ordem e o custo.
function cenario(opcoes: { usuario?: UsuarioComSenha | null; estourarEm?: string } = {}) {
  const eventos: string[] = [];
  const chavesContadas: string[] = [];
  const chavesLimpas: string[] = [];
  const usuario = opcoes.usuario === undefined ? maria() : opcoes.usuario;
  const autenticador = new Autenticador({
    limite: {
      async exigirDentroDoLimite(chave) {
        eventos.push(`limite:${chave.split(":")[1]}`);
        chavesContadas.push(chave);
        if (opcoes.estourarEm && chave.startsWith(opcoes.estourarEm)) throw new TooManyRequestsError(42);
      },
      async limpar(chave) {
        eventos.push("limpar");
        chavesLimpas.push(chave);
      },
    },
    validador: new ValidadorDeConta(),
    senhas: {
      async verificar(senha, hash) {
        eventos.push(hash === HASH_FALSO ? "scrypt:falso" : "scrypt:real");
        return hash === `hash:${senha}`;
      },
      async gerarHash(senha) {
        return `hash:${senha}`;
      },
      async hashParaTempoConstante() {
        return HASH_FALSO;
      },
    },
    usuarios: {
      async buscarPorEmail(email) {
        eventos.push(`busca:${email}`);
        return usuario && usuario.email === email ? usuario : null;
      },
    },
    sessoes: new EmissorDeSessao({ emitir: (u) => ({ token: `token-de-${u.id}`, expiraEm: new Date("2026-11-28T12:00:00.000Z") }) }),
  });
  return { autenticador, eventos, chavesContadas, chavesLimpas };
}

const entrar = (a: Autenticador, email = "maria@exemplo.com", senha = SENHA, ip = IP) => a.autenticar({ email, senha }, { ip });

test("login certo devolve a sessão no formato do contrato, sem nada da senha", async () => {
  const { autenticador } = cenario();
  const r = await entrar(autenticador);
  assert.deepEqual(r, {
    token: `token-de-${ID}`, tipo: "Bearer", expiraEm: "2026-11-28T12:00:00.000Z",
    usuario: { id: ID, perfil: "CLIENTE", nome: "Maria da Silva", email: "maria@exemplo.com" },
  });
  assert.ok(!JSON.stringify(r).match(/hash|senha/i));
});

test("e-mail com maiúsculas e espaços acha a mesma conta", async () => {
  const { autenticador } = cenario();
  assert.equal((await entrar(autenticador, "  MARIA@Exemplo.COM ")).usuario.id, ID);
});

test("e-mail inexistente, senha errada e conta inativa dão a MESMA resposta (401 com a mesma mensagem)", async () => {
  const mensagens: string[] = [];
  for (const c of [cenario({ usuario: null }), cenario(), cenario({ usuario: maria({ ativo: false }) })]) {
    await assert.rejects(entrar(c.autenticador, "maria@exemplo.com", "senha-errada-9"), (e: unknown) => {
      assert.ok(e instanceof UnauthorizedError);
      mensagens.push(e.message);
      return true;
    });
  }
  assert.equal(new Set(mensagens).size, 1);
  assert.equal(mensagens[0], "E-mail ou senha inválidos.");
});

test("conta inativa com a senha CERTA também é 401, e não zera o limite", async () => {
  const c = cenario({ usuario: maria({ ativo: false }) });
  await assert.rejects(entrar(c.autenticador), UnauthorizedError);
  assert.deepEqual(c.chavesLimpas, []);
});

test("custo de tempo igual: e-mail inexistente também roda o scrypt, contra o hash falso", async () => {
  const semUsuario = cenario({ usuario: null });
  await assert.rejects(entrar(semUsuario.autenticador), UnauthorizedError);
  assert.ok(semUsuario.eventos.includes("scrypt:falso"));
  assert.ok(!semUsuario.eventos.includes("scrypt:real"));

  const comUsuario = cenario();
  await assert.rejects(entrar(comUsuario.autenticador, "maria@exemplo.com", "outra-1234"), UnauthorizedError);
  assert.ok(comUsuario.eventos.includes("scrypt:real"));
  assert.equal(semUsuario.eventos.filter((e) => e.startsWith("scrypt")).length, comUsuario.eventos.filter((e) => e.startsWith("scrypt")).length);
});

test("login certo zera só a contagem de e-mail+IP, nunca a de IP nem a de e-mail", async () => {
  const c = cenario();
  await entrar(c.autenticador);
  assert.equal(c.chavesLimpas.length, 1);
  assert.match(c.chavesLimpas[0], /^login:email-ip:/);
});

test("login errado não zera nada", async () => {
  const c = cenario();
  await assert.rejects(entrar(c.autenticador, "maria@exemplo.com", "errada-1234"), UnauthorizedError);
  assert.deepEqual(c.chavesLimpas, []);
});

test("conta os três limites, nesta ordem: IP, e-mail e e-mail+IP; e o e-mail vira hash na chave", async () => {
  const c = cenario();
  await entrar(c.autenticador);
  assert.deepEqual(c.chavesContadas.map((k) => k.split(":").slice(0, 2).join(":")), ["login:ip", "login:email", "login:email-ip"]);
  const hash = createHash("sha256").update("maria@exemplo.com").digest("hex").slice(0, 32);
  assert.equal(c.chavesContadas[1], `login:email:${hash}`);
  assert.equal(c.chavesContadas[2], `login:email-ip:${hash}:${IP}`);
  assert.ok(!c.chavesContadas.join().includes("maria@"), "o endereço de e-mail nunca vai para a tabela de limites");
});

test("o limite por IP vem antes de qualquer outra coisa, até da validação e da busca do usuário", async () => {
  const c = cenario({ estourarEm: "login:ip" });
  await assert.rejects(c.autenticador.autenticar({}, { ip: IP }), TooManyRequestsError);
  assert.deepEqual(c.eventos, ["limite:ip"]);
});

test("estourar o limite de e-mail ou de e-mail+IP responde 429 sem consultar o usuário nem gastar scrypt", async () => {
  for (const prefixo of ["login:email:", "login:email-ip:"]) {
    const c = cenario({ estourarEm: prefixo });
    await assert.rejects(entrar(c.autenticador), (e: unknown) => e instanceof TooManyRequestsError && e.status === 429);
    assert.ok(!c.eventos.some((e) => e.startsWith("busca") || e.startsWith("scrypt")), prefixo);
  }
});

test("corpo inválido é 400 com details por campo e não consulta o usuário", async () => {
  const c = cenario();
  await assert.rejects(c.autenticador.autenticar({ email: "", senha: "" }, { ip: IP }), (e: unknown) => {
    assert.ok(e instanceof ValidationError);
    assert.deepEqual(Object.keys(e.details as object).sort(), ["email", "senha"]);
    return true;
  });
  assert.ok(!c.eventos.some((e) => e.startsWith("busca")));
});

test("o IP é cortado em 64 caracteres na chave (não deixa a tabela crescer com cabeçalho enorme)", async () => {
  const c = cenario();
  await entrar(c.autenticador, "maria@exemplo.com", SENHA, "9".repeat(500));
  assert.equal(c.chavesContadas[0], `login:ip:${"9".repeat(64)}`);
});

test("entradas hostis (não objeto, SQL, tamanhos enormes) viram 400, nunca 500", async () => {
  const c = cenario();
  for (const entrada of [null, undefined, 42, "texto", [], [{ email: "a@b.c" }], { email: ["a@b.c"], senha: "x" }, { email: "a@b.c", senha: { $ne: 1 } }, { email: "x".repeat(300) + "@b.com", senha: "x" }, { email: "a@b.com", senha: "x".repeat(10_000) }]) {
    await assert.rejects(c.autenticador.autenticar(entrada, { ip: IP }), ValidationError, JSON.stringify(entrada)?.slice(0, 40));
  }
});

test("estresse: 200 logins ao mesmo tempo, de contas diferentes, cada um recebe o seu resultado", async () => {
  const c = cenario();
  const rs = await Promise.allSettled(Array.from({ length: 200 }, (_, i) => entrar(c.autenticador, "maria@exemplo.com", i % 2 === 0 ? SENHA : "errada-1234", `10.0.0.${i % 250}`)));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 100);
  assert.equal(rs.filter((r) => r.status === "rejected").length, 100);
});

test("o Autenticador é encapsulado: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(cenario().autenticador), []);
});
