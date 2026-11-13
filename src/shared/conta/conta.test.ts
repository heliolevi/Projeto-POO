import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIRMACAO_DESATIVAR,
  confirmacaoValida,
  mensagemDeErro,
  podeDesativarConta,
  validarAltura,
  validarTrocaDeSenha,
} from "./conta.ts";

const ok = { senhaAtual: "antiga123", novaSenha: "nova12345", confirmar: "nova12345" };

describe("validarTrocaDeSenha", () => {
  it("aceita dados corretos", () => {
    assert.deepEqual(validarTrocaDeSenha(ok), {});
  });
  it("exige a senha atual", () => {
    assert.equal(validarTrocaDeSenha({ ...ok, senhaAtual: "" }).senhaAtual, "Informe a senha atual.");
  });
  it("recusa nova senha curta, longa e sem letra ou número", () => {
    const curta = validarTrocaDeSenha({ ...ok, novaSenha: "abc1", confirmar: "abc1" });
    assert.match(curta.novaSenha ?? "", /8 a 128/);
    const longa = "a1".repeat(65);
    assert.match(validarTrocaDeSenha({ ...ok, novaSenha: longa, confirmar: longa }).novaSenha ?? "", /8 a 128/);
    const semNumero = validarTrocaDeSenha({ ...ok, novaSenha: "somenteletras", confirmar: "somenteletras" });
    assert.match(semNumero.novaSenha ?? "", /letra e um número/);
    const semLetra = validarTrocaDeSenha({ ...ok, novaSenha: "12345678", confirmar: "12345678" });
    assert.match(semLetra.novaSenha ?? "", /letra e um número/);
  });
  it("recusa nova senha igual à atual", () => {
    const erros = validarTrocaDeSenha({ senhaAtual: "mesma1234", novaSenha: "mesma1234", confirmar: "mesma1234" });
    assert.match(erros.novaSenha ?? "", /diferente da atual/);
  });
  it("exige a confirmação igual à nova senha", () => {
    assert.equal(
      validarTrocaDeSenha({ ...ok, confirmar: "outra12345" }).confirmar,
      "As senhas não coincidem.",
    );
  });
});

describe("validarAltura", () => {
  it("aceita inteiro de 100 a 250", () => {
    assert.deepEqual(validarAltura("172"), { alturaCm: 172 });
    assert.deepEqual(validarAltura(" 100 "), { alturaCm: 100 });
    assert.deepEqual(validarAltura("250"), { alturaCm: 250 });
  });
  it("recusa vazio, fora da faixa, decimal e texto", () => {
    for (const valor of ["", "99", "251", "172.5", "172,5", "abc", "1e2", "-150"]) {
      assert.ok("erro" in validarAltura(valor), `deveria recusar "${valor}"`);
    }
  });
});

describe("confirmacaoValida", () => {
  it("só vale com DESATIVAR digitado", () => {
    assert.equal(CONFIRMACAO_DESATIVAR, "DESATIVAR");
    assert.equal(confirmacaoValida("DESATIVAR"), true);
    assert.equal(confirmacaoValida("  DESATIVAR "), true);
  });
  it("recusa minúsculas, vazio e outro texto", () => {
    for (const texto of ["", "desativar", "Desativar", "DESATIV", "DESATIVAR!"]) {
      assert.equal(confirmacaoValida(texto), false, texto);
    }
  });
});

describe("mensagemDeErro", () => {
  it("429 pede para aguardar", () => {
    assert.match(mensagemDeErro({ code: "TOO_MANY_REQUESTS", message: "x" }), /Muitas tentativas/);
  });
  it("401 depois de a sessão estar válida é senha atual incorreta", () => {
    assert.equal(
      mensagemDeErro({ code: "UNAUTHORIZED", message: "Senha atual incorreta." }, "senha"),
      "A senha atual está incorreta.",
    );
  });
  it("401 fora da troca de senha avisa que a sessão acabou", () => {
    assert.match(mensagemDeErro({ code: "UNAUTHORIZED", message: "x" }), /sessão/);
  });
  it("413 e erro desconhecido têm texto claro, sem vazar a mensagem crua de 500", () => {
    assert.match(mensagemDeErro({ code: "PAYLOAD_TOO_LARGE", message: "x" }), /grandes demais/);
    assert.equal(
      mensagemDeErro({ code: "INTERNAL_ERROR", message: "stack interna" }),
      "Não foi possível concluir agora. Tente novamente em instantes.",
    );
  });
  it("400 usa a mensagem da API", () => {
    assert.equal(mensagemDeErro({ code: "VALIDATION_ERROR", message: "Dados inválidos." }), "Dados inválidos.");
  });
});

describe("podeDesativarConta", () => {
  it("só o cliente vê a opção de desativar a própria conta", () => {
    assert.equal(podeDesativarConta("CLIENTE"), true);
  });
  it("a equipe não vê: um clique desativaria a única conta de operador ou admin da demo", () => {
    assert.equal(podeDesativarConta("OPERADOR"), false);
    assert.equal(podeDesativarConta("ADMIN"), false);
  });
  it("perfil desconhecido não vê a opção", () => {
    assert.equal(podeDesativarConta("GERENTE_LOCADORA"), false);
    assert.equal(podeDesativarConta(""), false);
  });
});
