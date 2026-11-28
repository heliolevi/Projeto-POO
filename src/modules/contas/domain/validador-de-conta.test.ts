import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidadorDeConta } from "./validador-de-conta.ts";

const validador = new ValidadorDeConta();

const valido = {
  nome: "  Maria   da Silva ",
  email: " Maria@Exemplo.com ",
  senha: "senha1234",
  cpf: "529.982.247-25",
  aceiteTermos: true,
};

test("o cadastro confere os dígitos verificadores do CPF", () => {
  const comCpf = (cpf: string) => validador.cadastro({ ...valido, cpf });
  assert.ok("dados" in comCpf("52998224725"));
  assert.ok("erros" in comCpf("52998224726"));
  assert.ok("erros" in comCpf("11111111111"));
  assert.ok("erros" in comCpf("123"));
});

test("validarCadastro normaliza nome, e-mail e CPF", () => {
  const r = validador.cadastro(valido);
  assert.ok("dados" in r);
  assert.equal(r.dados.nome, "Maria da Silva");
  assert.equal(r.dados.email, "maria@exemplo.com");
  assert.equal(r.dados.cpf, "52998224725");
  assert.equal(r.dados.telefone, null);
});

test("validarCadastro aponta cada campo inválido", () => {
  const r = validador.cadastro({
    nome: "Al",
    email: "sem-arroba",
    senha: "curta",
    cpf: "000",
    telefone: "12",
    dataNascimento: "2020-02-31",
    alturaCm: 50,
    aceiteTermos: false,
  });
  assert.ok("erros" in r);
  assert.deepEqual(Object.keys(r.erros).sort(), [
    "aceiteTermos",
    "alturaCm",
    "cpf",
    "dataNascimento",
    "email",
    "nome",
    "senha",
    "telefone",
  ]);
});

test("validarCadastro exige letra e número na senha", () => {
  const r = validador.cadastro({ ...valido, senha: "somenteletras" });
  assert.ok("erros" in r);
  assert.ok(r.erros.senha);
});

test("validarCadastro rejeita corpo que não é objeto", () => {
  assert.ok("erros" in validador.cadastro(null));
  assert.ok("erros" in validador.cadastro([valido]));
});

test("validarLogin exige e-mail e senha", () => {
  assert.ok("erros" in validador.login({}));
  const r = validador.login({ email: " A@B.com ", senha: "x" });
  assert.ok("dados" in r);
  assert.equal(r.dados.email, "a@b.com");
});

test("validarAlterarSenha exige senha atual e nova senha forte", () => {
  assert.ok("erros" in validador.alterarSenha({}));
  assert.ok("erros" in validador.alterarSenha({ senhaAtual: "x", novaSenha: "semnumero" }));
  const r = validador.alterarSenha({ senhaAtual: "antiga1", novaSenha: "nova1234" });
  assert.ok("dados" in r);
});

test("validarAltura aceita de 100 a 250 cm", () => {
  assert.ok("erros" in validador.altura({ alturaCm: 50 }));
  assert.ok("erros" in validador.altura({ alturaCm: "170" }));
  const r = validador.altura({ alturaCm: 170 });
  assert.ok("dados" in r);
  assert.equal(r.dados, 170);
});

test("validarAlterarSenha recusa nova senha igual à atual", () => {
  const r = validador.alterarSenha({ senhaAtual: "mesma1234", novaSenha: "mesma1234" });
  assert.ok("erros" in r);
  assert.match(r.erros.novaSenha, /diferente/);
  // a comparação usa a mesma normalização (NFKC) do hash da senha
  const composta = validador.alterarSenha({ senhaAtual: "café1234", novaSenha: "café1234" });
  assert.ok("erros" in composta);
});

test("validarAlterarSenha limita o tamanho da senha atual", () => {
  const r = validador.alterarSenha({ senhaAtual: "a1".repeat(65), novaSenha: "nova1234" });
  assert.ok("erros" in r);
  assert.ok(r.erros.senhaAtual);
});

test("validarAceiteTermos exige a versão vigente", () => {
  assert.ok("erros" in validador.aceiteDeTermos({}, "2026-11"));
  assert.ok("erros" in validador.aceiteDeTermos({ versao: "   " }, "2026-11"));
  assert.ok("erros" in validador.aceiteDeTermos({ versao: "x".repeat(10_000) }, "2026-11"));
  const antiga = validador.aceiteDeTermos({ versao: "2025-01" }, "2026-11");
  assert.ok("erros" in antiga);
  assert.match(antiga.erros.versao, /2026-11/);
  const r = validador.aceiteDeTermos({ versao: " 2026-11 " }, "2026-11");
  assert.ok("dados" in r);
  assert.equal(r.dados, "2026-11");
});
