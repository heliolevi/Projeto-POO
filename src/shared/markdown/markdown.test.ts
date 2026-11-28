import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LeitorDeMarkdown, LinksDeDocumento } from "./markdown.ts";

describe("legendaDaTabela", () => {
  it("usa o título da seção em que a tabela está, sem a marcação", () => {
    const blocos = LeitorDeMarkdown.blocos("## 1. Outra\n\ntexto\n\n## 2. Quais **dados** coletamos\n\n| A | B |\n|---|---|\n| 1 | 2 |");
    const indice = blocos.findIndex((b) => b.tipo === "tabela");
    assert.equal(LeitorDeMarkdown.legendaDaTabela(blocos, indice), "2. Quais dados coletamos");
  });
  it("sem título antes, cai para a lista dos cabeçalhos", () => {
    const blocos = LeitorDeMarkdown.blocos("| Dado | Para que |\n|---|---|\n| x | y |");
    assert.equal(LeitorDeMarkdown.legendaDaTabela(blocos, 0), "Dado, Para que");
  });
  it("não pega o título de uma seção que vem depois da tabela", () => {
    const blocos = LeitorDeMarkdown.blocos("| A | B |\n|---|---|\n| 1 | 2 |\n\n## Depois");
    assert.equal(LeitorDeMarkdown.legendaDaTabela(blocos, 0), "A, B");
  });
});

describe("lerMarkdown", () => {
  it("separa títulos, parágrafos e listas", () => {
    const blocos = LeitorDeMarkdown.blocos("# Título\n\nTexto **forte**.\n\n## Seção\n- um\n- dois\n\n1. a\n2. b");
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
    const blocos = LeitorDeMarkdown.blocos("primeira linha\nsegunda linha");
    assert.deepEqual(blocos, [{ tipo: "paragrafo", texto: "primeira linha segunda linha" }]);
  });

  it("lê citação com várias linhas", () => {
    const blocos = LeitorDeMarkdown.blocos("> **Aviso:** um\n> dois");
    assert.deepEqual(blocos, [{ tipo: "citacao", texto: "**Aviso:** um dois" }]);
  });

  it("lê tabela com cabeçalho e ignora a linha de separação", () => {
    const blocos = LeitorDeMarkdown.blocos("| Dado | Para que |\n|---|---|\n| Nome | Conta |\n| CPF | Retirada |");
    assert.deepEqual(blocos, [
      { tipo: "tabela", cabecalho: ["Dado", "Para que"], linhas: [["Nome", "Conta"], ["CPF", "Retirada"]] },
    ]);
  });

  it("continua o item de lista que quebra a linha", () => {
    const blocos = LeitorDeMarkdown.blocos("- primeiro item\n  continua aqui\n- segundo");
    assert.deepEqual(blocos[0].tipo === "lista" && blocos[0].itens, ["primeiro item continua aqui", "segundo"]);
  });

  it("não interpreta HTML: o texto vem como está", () => {
    const blocos = LeitorDeMarkdown.blocos("<script>alert(1)</script>");
    assert.deepEqual(blocos, [{ tipo: "paragrafo", texto: "<script>alert(1)</script>" }]);
  });

  it("texto vazio não gera blocos", () => {
    assert.deepEqual(LeitorDeMarkdown.blocos("\n\n  \n"), []);
  });
});

describe("extrairVersao", () => {
  it("lê a versão do topo do documento", () => {
    assert.equal(LeitorDeMarkdown.versao("# Termos\n\n**Versão:** 2026-11\n**Vigência:** x"), "2026-11");
  });
  it("devolve null sem a linha de versão", () => {
    assert.equal(LeitorDeMarkdown.versao("# Termos"), null);
  });
});

describe("LinksDeDocumento.converter", () => {
  it("troca os links entre documentos pelas rotas do app", () => {
    assert.equal(LinksDeDocumento.converter("politica-de-privacidade.md"), "/privacidade");
    assert.equal(LinksDeDocumento.converter("termos-de-uso.md"), "/termos");
  });
  it("mantém links externos e rotas do app", () => {
    assert.equal(LinksDeDocumento.converter("https://exemplo.com/x"), "https://exemplo.com/x");
    assert.equal(LinksDeDocumento.converter("/login"), "/login");
  });
  it("recusa esquemas perigosos", () => {
    assert.equal(LinksDeDocumento.converter("javascript:alert(1)"), null);
    assert.equal(LinksDeDocumento.converter("data:text/html,x"), null);
  });
  it("recusa documento desconhecido", () => {
    assert.equal(LinksDeDocumento.converter("outro.md"), null);
  });
  it("não aceita nomes herdados do Object como se fossem documentos", () => {
    // `x in objeto` enxerga a cadeia de protótipos: [x](constructor) devolvia uma função.
    for (const nome of ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"]) {
      assert.equal(LinksDeDocumento.converter(nome), null, nome);
    }
  });
  it("recusa destino que o navegador leria como outro site", () => {
    const barraInvertida = String.fromCharCode(92);
    // o navegador troca "\" por "/": "/\host" vira "//host" (outro site)
    assert.equal(LinksDeDocumento.converter(`/${barraInvertida}host`), null);
    assert.equal(LinksDeDocumento.converter(`/${barraInvertida}/host`), null);
    assert.equal(LinksDeDocumento.converter("//host"), null);
    // o navegador ignora tab e quebra de linha dentro da URL: "/\t/host" também vira "//host"
    assert.equal(LinksDeDocumento.converter("/\t/host"), null);
    assert.equal(LinksDeDocumento.converter("/\n/host"), null);
  });
  it("continua aceitando rotas do app com consulta e subcaminhos", () => {
    assert.equal(LinksDeDocumento.converter("/cadastro?origem=termos"), "/cadastro?origem=termos");
    assert.equal(LinksDeDocumento.converter("/a/b#secao"), "/a/b#secao");
  });
});

describe("lerTrechos", () => {
  it("separa texto, negrito e link", () => {
    assert.deepEqual(LeitorDeMarkdown.trechos("a **b** [c](termos-de-uso.md) d"), [
      { tipo: "texto", texto: "a " },
      { tipo: "forte", texto: "b" },
      { tipo: "texto", texto: " " },
      { tipo: "link", texto: "c", href: "/termos" },
      { tipo: "texto", texto: " d" },
    ]);
  });
  it("link com destino inseguro vira texto simples", () => {
    assert.deepEqual(LeitorDeMarkdown.trechos("[clique](javascript:void0)"), [{ tipo: "texto", texto: "clique" }]);
  });
});

it("LeitorDeMarkdown e LinksDeDocumento só têm métodos estáticos", () => {
  for (const Classe of [LeitorDeMarkdown, LinksDeDocumento]) {
    assert.throws(() => new (Classe as unknown as new () => unknown)(), /só tem métodos estáticos/);
  }
});
