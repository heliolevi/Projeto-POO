import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AlturaDaConta,
  DesativacaoDaConta,
  FormularioDeSenha,
  MensagensDeErroDaConta,
} from "./conta.ts";
import { ApiError } from "../http/api-cliente.ts";

const ok = { senhaAtual: "antiga123", novaSenha: "nova12345", confirmar: "nova12345" };

describe("FormularioDeSenha", () => {
  it("aceita dados corretos", () => {
    assert.deepEqual(new FormularioDeSenha(ok).validar(), {});
  });
  it("exige a senha atual", () => {
    assert.equal(new FormularioDeSenha({ ...ok, senhaAtual: "" }).validar().senhaAtual, "Informe a senha atual.");
  });
  it("recusa nova senha curta, longa e sem letra ou número", () => {
    const curta = new FormularioDeSenha({ ...ok, novaSenha: "abc1", confirmar: "abc1" }).validar();
    assert.match(curta.novaSenha ?? "", /8 a 128/);
    const longa = "a1".repeat(65);
    assert.match(new FormularioDeSenha({ ...ok, novaSenha: longa, confirmar: longa }).validar().novaSenha ?? "", /8 a 128/);
    const semNumero = new FormularioDeSenha({ ...ok, novaSenha: "somenteletras", confirmar: "somenteletras" }).validar();
    assert.match(semNumero.novaSenha ?? "", /letra e um número/);
    const semLetra = new FormularioDeSenha({ ...ok, novaSenha: "12345678", confirmar: "12345678" }).validar();
    assert.match(semLetra.novaSenha ?? "", /letra e um número/);
  });
  it("recusa nova senha igual à atual", () => {
    const erros = new FormularioDeSenha({ senhaAtual: "mesma1234", novaSenha: "mesma1234", confirmar: "mesma1234" }).validar();
    assert.match(erros.novaSenha ?? "", /diferente da atual/);
  });
  it("exige a confirmação igual à nova senha", () => {
    assert.equal(
      new FormularioDeSenha({ ...ok, confirmar: "outra12345" }).validar().confirmar,
      "As senhas não coincidem.",
    );
  });
});

describe("AlturaDaConta", () => {
  it("aceita inteiro de 100 a 250", () => {
    assert.deepEqual(AlturaDaConta.validar("172"), { alturaCm: 172 });
    assert.deepEqual(AlturaDaConta.validar(" 100 "), { alturaCm: 100 });
    assert.deepEqual(AlturaDaConta.validar("250"), { alturaCm: 250 });
  });
  it("recusa vazio, fora da faixa, decimal e texto", () => {
    for (const valor of ["", "99", "251", "172.5", "172,5", "abc", "1e2", "-150"]) {
      assert.ok("erro" in AlturaDaConta.validar(valor), `deveria recusar "${valor}"`);
    }
  });
});

describe("DesativacaoDaConta.confirmacaoValida", () => {
  it("só vale com DESATIVAR digitado", () => {
    assert.equal(DesativacaoDaConta.CONFIRMACAO, "DESATIVAR");
    assert.equal(DesativacaoDaConta.confirmacaoValida("DESATIVAR"), true);
    assert.equal(DesativacaoDaConta.confirmacaoValida("  DESATIVAR "), true);
  });
  it("recusa minúsculas, vazio e outro texto", () => {
    for (const texto of ["", "desativar", "Desativar", "DESATIV", "DESATIVAR!"]) {
      assert.equal(DesativacaoDaConta.confirmacaoValida(texto), false, texto);
    }
  });
});

describe("MensagensDeErroDaConta", () => {
  it("429 pede para aguardar", () => {
    assert.match(MensagensDeErroDaConta.de({ code: "TOO_MANY_REQUESTS", message: "x" }), /Muitas tentativas/);
  });
  it("401 depois de a sessão estar válida é senha atual incorreta", () => {
    assert.equal(
      MensagensDeErroDaConta.de({ code: "UNAUTHORIZED", message: "Senha atual incorreta." }, "senha"),
      "A senha atual está incorreta.",
    );
  });
  it("401 fora da troca de senha avisa que a sessão acabou", () => {
    assert.match(MensagensDeErroDaConta.de({ code: "UNAUTHORIZED", message: "x" }), /sessão/);
  });
  it("413 e erro desconhecido têm texto claro, sem vazar a mensagem crua de 500", () => {
    assert.match(MensagensDeErroDaConta.de({ code: "PAYLOAD_TOO_LARGE", message: "x" }), /grandes demais/);
    assert.equal(
      MensagensDeErroDaConta.de({ code: "INTERNAL_ERROR", message: "stack interna" }),
      "Não foi possível concluir agora. Tente novamente em instantes.",
    );
  });
  it("400 usa a mensagem da API", () => {
    assert.equal(MensagensDeErroDaConta.de({ code: "VALIDATION_ERROR", message: "Dados inválidos." }), "Dados inválidos.");
  });
});

describe("DesativacaoDaConta.permitidaPara", () => {
  it("só o cliente vê a opção de desativar a própria conta", () => {
    assert.equal(DesativacaoDaConta.permitidaPara("CLIENTE"), true);
  });
  it("a equipe não vê: um clique desativaria a única conta de operador ou admin da demo", () => {
    assert.equal(DesativacaoDaConta.permitidaPara("OPERADOR"), false);
    assert.equal(DesativacaoDaConta.permitidaPara("ADMIN"), false);
  });
  it("perfil desconhecido não vê a opção", () => {
    assert.equal(DesativacaoDaConta.permitidaPara("GERENTE_LOCADORA"), false);
    assert.equal(DesativacaoDaConta.permitidaPara(""), false);
  });
});

describe("encapsulamento das classes da conta", () => {
  it("FormularioDeSenha não expõe campos e copia os dados recebidos", () => {
    const dados = { ...ok };
    const form = new FormularioDeSenha(dados);
    assert.deepEqual(Object.keys(form), []);
    dados.novaSenha = "";
    assert.deepEqual(form.validar(), {});
  });
  it("as classes só estáticas não têm instância", () => {
    for (const Classe of [AlturaDaConta, DesativacaoDaConta, MensagensDeErroDaConta]) {
      assert.throws(() => new (Classe as unknown as new () => unknown)(), /só tem métodos estáticos/);
    }
  });
  it("a frase de confirmação é DESATIVAR e só o cliente pode desativar", () => {
    assert.equal(DesativacaoDaConta.CONFIRMACAO, "DESATIVAR");
    assert.equal(DesativacaoDaConta.permitidaPara("CLIENTE"), true);
    assert.equal(DesativacaoDaConta.permitidaPara("OPERADOR"), false);
    assert.equal(DesativacaoDaConta.permitidaPara("ADMIN"), false);
  });
});

describe("MensagensDeErroDaConta.daFalha", () => {
  it("traduz o erro da API pelo código", () => {
    assert.equal(
      MensagensDeErroDaConta.daFalha(new ApiError("TOO_MANY_REQUESTS", "x")),
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    );
  });
  it("outra falha fala da conexão", () => {
    const texto = "Não foi possível concluir agora. Verifique a conexão e tente novamente.";
    assert.equal(MensagensDeErroDaConta.daFalha(new Error("rede")), texto);
    assert.equal(MensagensDeErroDaConta.daFalha(undefined), texto);
  });
});
