import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictError, TooManyRequestsError, ValidationError } from "../../../shared/http/errors.ts";
import { VERSAO_TERMOS_ATUAL } from "../domain/usuario.ts";
import { ValidadorDeConta, type DadosCadastro } from "../domain/validador-de-conta.ts";
import { EmailOuCpfJaCadastrado } from "../infrastructure/repositorio-usuarios.ts";
import { CadastroDeCliente } from "./cadastro-de-cliente.ts";
import { EmissorDeSessao } from "./emissor-de-sessao.ts";

const ID = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const VALIDO = { nome: " Maria   da Silva ", email: " Maria@Exemplo.com ", senha: "senha-forte-123", cpf: "529.982.247-25", aceiteTermos: true };

function cenario(opcoes: { falhaNoBanco?: Error; estourar?: boolean } = {}) {
  const eventos: string[] = [];
  const gravados: { dados: DadosCadastro; hash: string; versao: string }[] = [];
  const chaves: string[] = [];
  const cadastro = new CadastroDeCliente({
    limite: {
      async exigirDentroDoLimite(chave) {
        eventos.push("limite");
        chaves.push(chave);
        if (opcoes.estourar) throw new TooManyRequestsError(60);
      },
      async limpar() {},
    },
    validador: new ValidadorDeConta(),
    senhas: { async gerarHash(senha) { eventos.push("scrypt"); return `hash:${senha}`; } },
    usuarios: {
      async criarCliente(dados, hash, versao) {
        eventos.push("grava");
        if (opcoes.falhaNoBanco) throw opcoes.falhaNoBanco;
        gravados.push({ dados, hash, versao });
        return { id: ID, perfil: "CLIENTE", nome: dados.nome, email: dados.email };
      },
    },
    sessoes: new EmissorDeSessao({ emitir: () => ({ token: "tk", expiraEm: new Date("2026-11-28T12:00:00.000Z") }) }),
  });
  return { cadastro, eventos, gravados, chaves };
}

test("cadastro válido grava o cliente com o hash e a versão dos termos e devolve a sessão", async () => {
  const c = cenario();
  const r = await c.cadastro.cadastrar(VALIDO, { ip: "1.1.1.1" });
  assert.deepEqual(r, { token: "tk", tipo: "Bearer", expiraEm: "2026-11-28T12:00:00.000Z", usuario: { id: ID, perfil: "CLIENTE", nome: "Maria da Silva", email: "maria@exemplo.com" } });
  assert.equal(c.gravados[0].hash, "hash:senha-forte-123");
  assert.equal(c.gravados[0].versao, VERSAO_TERMOS_ATUAL);
  assert.equal(c.gravados[0].dados.cpf, "52998224725");
  assert.ok(!JSON.stringify(r).includes("senha"));
});

test("a ordem é: limite, depois validação e scrypt, depois gravação", async () => {
  const c = cenario();
  await c.cadastro.cadastrar(VALIDO, { ip: "1.1.1.1" });
  assert.deepEqual(c.eventos, ["limite", "scrypt", "grava"]);
});

test("o limite por IP vem antes da validação: corpo lixo também gasta a cota, e estourar dá 429 sem scrypt", async () => {
  const c = cenario({ estourar: true });
  await assert.rejects(c.cadastro.cadastrar(VALIDO, { ip: "1.1.1.1" }), (e: unknown) => e instanceof TooManyRequestsError && e.status === 429);
  assert.deepEqual(c.eventos, ["limite"]);
});

test("a chave do limite é por IP, cortada em 64 caracteres", async () => {
  const c = cenario();
  await c.cadastro.cadastrar(VALIDO, { ip: "7".repeat(300) });
  assert.equal(c.chaves[0], `cadastro:ip:${"7".repeat(64)}`);
});

test("dados inválidos são 400 com details, sem gastar scrypt nem gravar", async () => {
  const c = cenario();
  await assert.rejects(c.cadastro.cadastrar({ nome: "ab", email: "x", senha: "curta", cpf: "123", aceiteTermos: false }, { ip: "1.1.1.1" }), (e: unknown) => {
    assert.ok(e instanceof ValidationError);
    assert.deepEqual(Object.keys(e.details as object).sort(), ["aceiteTermos", "cpf", "email", "nome", "senha"]);
    return true;
  });
  assert.deepEqual(c.eventos, ["limite"]);
});

test("e-mail ou CPF repetido vira 409 com a mensagem do contrato", async () => {
  const c = cenario({ falhaNoBanco: new EmailOuCpfJaCadastrado() });
  await assert.rejects(c.cadastro.cadastrar(VALIDO, { ip: "1.1.1.1" }), (e: unknown) => e instanceof ConflictError && e.status === 409 && e.message === "E-mail ou CPF já cadastrado.");
});

test("outro erro do banco sobe como veio (vira 500 genérico na ponta), e não como 409", async () => {
  const c = cenario({ falhaNoBanco: new Error("conexão caiu") });
  await assert.rejects(c.cadastro.cadastrar(VALIDO, { ip: "1.1.1.1" }), (e: unknown) => e instanceof Error && !(e instanceof ConflictError) && e.message === "conexão caiu");
});

test("entradas hostis viram 400, nunca 500", async () => {
  const c = cenario();
  for (const entrada of [null, undefined, 7, "x", [], [VALIDO], { ...VALIDO, cpf: { a: 1 } }, { ...VALIDO, aceiteTermos: "true" }, { ...VALIDO, senha: "a".repeat(5000) + "1" }, { ...VALIDO, nome: "n".repeat(5000) }]) {
    await assert.rejects(c.cadastro.cadastrar(entrada, { ip: "1.1.1.1" }), ValidationError, JSON.stringify(entrada)?.slice(0, 40));
  }
});

test("estresse: 200 cadastros ao mesmo tempo, metade válida e metade inválida", async () => {
  const c = cenario();
  const rs = await Promise.allSettled(Array.from({ length: 200 }, (_, i) => c.cadastro.cadastrar(i % 2 === 0 ? VALIDO : { ...VALIDO, cpf: "111" }, { ip: `10.0.0.${i % 250}` })));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 100);
  assert.equal(c.gravados.length, 100);
});
