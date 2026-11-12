// Leitor mínimo de Markdown para as páginas de Termos e Privacidade (docs/*.md).
// Só entende o que esses documentos usam: títulos, parágrafos, listas, citação e tabela.
// Devolve blocos de dados; quem desenha é o componente (nunca HTML cru, então não há XSS).

export type Bloco =
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "citacao"; texto: string }
  | { tipo: "lista"; ordenada: boolean; itens: string[] }
  | { tipo: "tabela"; cabecalho: string[]; linhas: string[][] };

const TITULO = /^(#{1,6})\s+(.*)$/;
const ITEM_NAO_ORDENADO = /^[-*]\s+(.*)$/;
const ITEM_ORDENADO = /^\d+\.\s+(.*)$/;
const SEPARADOR_TABELA = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function iniciaBloco(linha: string): boolean {
  return (
    TITULO.test(linha) ||
    ITEM_NAO_ORDENADO.test(linha) ||
    ITEM_ORDENADO.test(linha) ||
    linha.startsWith(">") ||
    linha.startsWith("|")
  );
}

export function lerMarkdown(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  const blocos: Bloco[] = [];
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i].trim();
    if (linha === "") {
      i++;
      continue;
    }

    const titulo = TITULO.exec(linha);
    if (titulo) {
      blocos.push({ tipo: "titulo", nivel: titulo[1].length, texto: titulo[2].trim() });
      i++;
      continue;
    }

    if (linha.startsWith(">")) {
      const partes: string[] = [];
      while (i < linhas.length && linhas[i].trim().startsWith(">")) {
        partes.push(linhas[i].trim().replace(/^>\s?/, "").trim());
        i++;
      }
      blocos.push({ tipo: "citacao", texto: partes.filter(Boolean).join(" ") });
      continue;
    }

    if (linha.startsWith("|")) {
      const tabela: string[][] = [];
      while (i < linhas.length && linhas[i].trim().startsWith("|")) {
        const atual = linhas[i].trim();
        if (!SEPARADOR_TABELA.test(atual)) tabela.push(celulas(atual));
        i++;
      }
      const [cabecalho = [], ...resto] = tabela;
      blocos.push({ tipo: "tabela", cabecalho, linhas: resto });
      continue;
    }

    const ordenada = ITEM_ORDENADO.test(linha);
    if (ordenada || ITEM_NAO_ORDENADO.test(linha)) {
      const padrao = ordenada ? ITEM_ORDENADO : ITEM_NAO_ORDENADO;
      const itens: string[] = [];
      while (i < linhas.length) {
        const atual = linhas[i].trim();
        const item = padrao.exec(atual);
        if (item) {
          itens.push(item[1].trim());
        } else if (atual !== "" && !iniciaBloco(atual) && itens.length > 0) {
          itens[itens.length - 1] += ` ${atual}`; // continuação do item
        } else {
          break;
        }
        i++;
      }
      blocos.push({ tipo: "lista", ordenada, itens });
      continue;
    }

    const partes: string[] = [];
    while (i < linhas.length && linhas[i].trim() !== "" && !iniciaBloco(linhas[i].trim())) {
      partes.push(linhas[i].trim());
      i++;
    }
    blocos.push({ tipo: "paragrafo", texto: partes.join(" ") });
  }

  return blocos;
}

export function extrairVersao(texto: string): string | null {
  const achado = /^\*\*Vers[ãa]o:\*\*\s*(\S+)/m.exec(texto);
  return achado ? achado[1] : null;
}

const LINKS_ENTRE_DOCUMENTOS: Record<string, string> = {
  "termos-de-uso.md": "/termos",
  "politica-de-privacidade.md": "/privacidade",
};

// Só devolve destinos seguros: rota do app, http(s) ou um dos documentos conhecidos.
export function converterLinkDoc(destino: string): string | null {
  const limpo = destino.trim();
  if (limpo in LINKS_ENTRE_DOCUMENTOS) return LINKS_ENTRE_DOCUMENTOS[limpo];
  if (limpo.startsWith("/") && !limpo.startsWith("//")) return limpo;
  if (/^https?:\/\//i.test(limpo)) return limpo;
  return null;
}

export type Trecho =
  | { tipo: "texto"; texto: string }
  | { tipo: "forte"; texto: string }
  | { tipo: "link"; texto: string; href: string };

// Negrito (**x**) e links ([x](destino)). Link com destino inseguro vira só texto.
export function lerTrechos(texto: string): Trecho[] {
  const trechos: Trecho[] = [];
  const padrao = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  for (const achado of texto.matchAll(padrao)) {
    if (achado.index > ultimo) trechos.push({ tipo: "texto", texto: texto.slice(ultimo, achado.index) });
    if (achado[1] !== undefined) {
      trechos.push({ tipo: "forte", texto: achado[1] });
    } else {
      const href = converterLinkDoc(achado[3]);
      trechos.push(href ? { tipo: "link", texto: achado[2], href } : { tipo: "texto", texto: achado[2] });
    }
    ultimo = achado.index + achado[0].length;
  }
  if (ultimo < texto.length) trechos.push({ tipo: "texto", texto: texto.slice(ultimo) });
  return trechos;
}
