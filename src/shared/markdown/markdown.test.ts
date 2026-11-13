import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { converterLinkDoc, extrairVersao, lerMarkdown, lerTrechos } from "./markdown.ts";

describe("lerMarkdown", () => {
  it("separa títulos, parágrafos e listas", () => {
    const blocos = lerMarkdown("# Título\n\nTexto **forte**.\n\n## Seção\n- um\n- dois\n\n1. a\n2. b");
    assert.deepEqual(
      blocos.map((b) => b.tipo),
      ["titulo", "paragrafo", "titulo", "lista", "lista"],
    );
    assert.deepEqual(blocos[0], { tipo: "titulo", nivel: 1, texto: "Título" });
    assert.equal(blocos[3].tipo === "lista" && blocos[3].ordenada, false);
    assert.equal(blocos[4].tipo === "lista" && blocos[4].ordenada, true);
    assert.deepEqual(blocos[3].tipo === "lista" && blocos[3].itens, ["um", "dois"]);
  });

  it("junta linhas seguidas num mesmo parágrafo", () => {
    const blocos = lerMarkdown("primeira linha\nsegunda linha");
    assert.deepEqual(blocos, [{ tipo: "paragrafo", texto: "primeira linha segunda linha" }]);
  });

  it("lê citação com várias linhas", () => {
    const blocos = lerMarkdown("> **Aviso:** um\n> dois");
    assert.deepEqual(blocos, [{ tipo: "citacao", texto: "**Aviso:** um dois" }]);
  });

  it("lê tabela com cabeçalho e ignora a linha de separação", () => {
    const blocos = lerMarkdown("| Dado | Para que |\n|---|---|\n| Nome | Conta |\n| CPF | Retirada |");
    assert.deepEqual(blocos, [
      { tipo: "tabela", cabecalho: ["Dado", "Para que"], linhas: [["Nome", "Conta"], ["CPF", "Retirada"]] },
    ]);
  });

  it("continua o item de lista que quebra a linha", () => {
    const blocos = lerMarkdown("- primeiro item\n  continua aqui\n- segundo");
    assert.deepEqual(blocos[0].tipo === "lista" && blocos[0].itens, ["primeiro item continua aqui", "segundo"]);
  });

  it("não interpreta HTML: o texto vem como está", () => {
    const blocos = lerMarkdown("<script>alert(1)</script>");
    assert.deepEqual(blocos, [{ tipo: "paragrafo", texto: "<script>alert(1)</script>" }]);
  });

  it("texto vazio não gera blocos", () => {
    assert.deepEqual(lerMarkdown("\n\n  \n"), []);
  });
});

describe("extrairVersao", () => {
  it("lê a versão do topo do documento", () => {
    assert.equal(extrairVersao("# Termos\n\n**Versão:** 2026-11\n**Vigência:** x"), "2026-11");
  });
  it("devolve null sem a linha de versão", () => {
    assert.equal(extrairVersao("# Termos"), null);
  });
});

describe("converterLinkDoc", () => {
  it("troca os links entre documentos pelas rotas do app", () => {
    assert.equal(converterLinkDoc("politica-de-privacidade.md"), "/privacidade");
    assert.equal(converterLinkDoc("termos-de-uso.md"), "/termos");
  });
  it("mantém links externos e rotas do app", () => {
    assert.equal(converterLinkDoc("https://exemplo.com/x"), "https://exemplo.com/x");
    assert.equal(converterLinkDoc("/login"), "/login");
  });
  it("recusa esquemas perigosos", () => {
    assert.equal(converterLinkDoc("javascript:alert(1)"), null);
    assert.equal(converterLinkDoc("data:text/html,x"), null);
  });
  it("recusa documento desconhecido", () => {
    assert.equal(converterLinkDoc("outro.md"), null);
  });
  it("não aceita nomes herdados do Object como se fossem documentos", () => {
    // `x in objeto` enxerga a cadeia de protótipos: [x](constructor) devolvia uma função.
    for (const nome of ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"]) {
      assert.equal(converterLinkDoc(nome), null, nome);
    }
  });
  it("recusa destino que o navegador leria como outro site", () => {
    const barraInvertida = String.fromCharCode(92);
    // o navegador troca "\" por "/": "/\host" vira "//host" (outro site)
    assert.equal(converterLinkDoc(`/${barraInvertida}host`), null);
    assert.equal(converterLinkDoc(`/${barraInvertida}/host`), null);
    assert.equal(converterLinkDoc("//host"), null);
    // o navegador ignora tab e quebra de linha dentro da URL: "/\t/host" também vira "//host"
    assert.equal(converterLinkDoc("/\t/host"), null);
    assert.equal(converterLinkDoc("/\n/host"), null);
  });
  it("continua aceitando rotas do app com consulta e subcaminhos", () => {
    assert.equal(converterLinkDoc("/cadastro?origem=termos"), "/cadastro?origem=termos");
    assert.equal(converterLinkDoc("/a/b#secao"), "/a/b#secao");
  });
});

describe("lerTrechos", () => {
  it("separa texto, negrito e link", () => {
    assert.deepEqual(lerTrechos("a **b** [c](termos-de-uso.md) d"), [
      { tipo: "texto", texto: "a " },
      { tipo: "forte", texto: "b" },
      { tipo: "texto", texto: " " },
      { tipo: "link", texto: "c", href: "/termos" },
      { tipo: "texto", texto: " d" },
    ]);
  });
  it("link com destino inseguro vira texto simples", () => {
    assert.deepEqual(lerTrechos("[clique](javascript:void0)"), [{ tipo: "texto", texto: "clique" }]);
  });
});
