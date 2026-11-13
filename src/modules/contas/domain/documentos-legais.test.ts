import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { extrairVersao, lerMarkdown } from "../../../shared/markdown/markdown.ts";
import { VERSAO_TERMOS_ATUAL } from "./usuario.ts";

const raiz = new URL("../../../../", import.meta.url);
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), "utf8");

describe("documentos legais mostrados no app", () => {
  for (const arquivo of ["docs/termos-de-uso.md", "docs/politica-de-privacidade.md"]) {
    it(`${arquivo} está na versão vigente dos termos`, () => {
      assert.equal(extrairVersao(ler(arquivo)), VERSAO_TERMOS_ATUAL);
    });
  }

  it("os termos têm as seções que a página precisa exibir", () => {
    const titulos = lerMarkdown(ler("docs/termos-de-uso.md"))
      .filter((b) => b.tipo === "titulo")
      .map((b) => b.texto);
    assert.equal(titulos[0], "Termos de uso");
    assert.ok(titulos.some((t) => t.includes("Cancelamento")));
  });

  it("a política traz a tabela de dados coletados", () => {
    const tabela = lerMarkdown(ler("docs/politica-de-privacidade.md")).find((b) => b.tipo === "tabela");
    assert.ok(tabela && tabela.tipo === "tabela");
    assert.equal(tabela.cabecalho.length, 4);
    assert.ok(tabela.linhas.every((l) => l.length === 4));
  });

  it("o cadastro aponta para páginas que existem e o aceite continua obrigatório", () => {
    const cadastro = ler("src/app/cadastro/page.tsx");
    for (const rota of ["/termos", "/privacidade"]) {
      assert.ok(cadastro.includes(`href="${rota}"`), `cadastro sem link para ${rota}`);
      assert.ok(readFileSync(new URL(`src/app${rota}/page.tsx`, raiz)).length > 0);
    }
  });
});
