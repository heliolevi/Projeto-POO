import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cpfValido,
  validarAceiteTermos,
  validarAlterarSenha,
  validarAltura,
  validarCadastro,
  validarLogin,
} from "./validacao.ts";

const valido = {
  nome: "  Maria   da Silva ",
  email: " Maria@Exemplo.com ",
  senha: "senha1234",
  cpf: "529.982.247-25",
  aceiteTermos: true,
};

test("cpfValido confere os dígitos verificadores", () => {
  assert.equal(cpfValido("52998224725"), true);
  assert.equal(cpfValido("52998224726"), false);
  assert.equal(cpfValido("11111111111"), false);
  assert.equal(cpfValido("123"), false);
});

test("validarCadastro normaliza nome, e-mail e CPF", () => {
  const r = validarCadastro(valido);
  assert.ok("dados" in r);
  assert.equal(r.dados.nome, "Maria da Silva");
  assert.equal(r.dados.email, "maria@exemplo.com");
  assert.equal(r.dados.cpf, "52998224725");
  assert.equal(r.dados.telefone, null);
});

test("validarCadastro aponta cada campo inválido", () => {
  const r = validarCadastro({
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
  const r = validarCadastro({ ...valido, senha: "somenteletras" });
  assert.ok("erros" in r);
  assert.ok(r.erros.senha);
});

test("validarCadastro rejeita corpo que não é objeto", () => {
  assert.ok("erros" in validarCadastro(null));
  assert.ok("erros" in validarCadastro([valido]));
});

test("validarLogin exige e-mail e senha", () => {
  assert.ok("erros" in validarLogin({}));
  const r = validarLogin({ email: " A@B.com ", senha: "x" });
  assert.ok("dados" in r);
  assert.equal(r.dados.email, "a@b.com");
});

test("validarAlterarSenha exige senha atual e nova senha forte", () => {
  assert.ok("erros" in validarAlterarSenha({}));
  assert.ok("erros" in validarAlterarSenha({ senhaAtual: "x", novaSenha: "semnumero" }));
  const r = validarAlterarSenha({ senhaAtual: "antiga1", novaSenha: "nova1234" });
  assert.ok("dados" in r);
});

test("validarAltura aceita de 100 a 250 cm", () => {
  assert.ok("erros" in validarAltura({ alturaCm: 50 }));
  assert.ok("erros" in validarAltura({ alturaCm: "170" }));
  const r = validarAltura({ alturaCm: 170 });
  assert.ok("dados" in r);
  assert.equal(r.dados, 170);
});

test("validarAceiteTermos exige a versão", () => {
  assert.ok("erros" in validarAceiteTermos({}));
  const r = validarAceiteTermos({ versao: "2026-10" });
  assert.ok("dados" in r);
  assert.equal(r.dados, "2026-10");
});
