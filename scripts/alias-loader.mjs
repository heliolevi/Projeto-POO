// Hooks de resolução de módulos para o node --test: fazem o Node carregar o código TypeScript do
// projeto do jeito que o Next e o TypeScript o resolvem, isto é, com o alias "@/" (que aponta para
// src/) e com imports sem extensão. Sem isso, um teste não consegue carregar um arquivo que importe
// outro módulo pelo alias (como os route.ts e o handlers.ts), e a ligação entre eles ficaria sem teste.
//
// Só mexe em código do próprio projeto: pacotes de node_modules seguem a resolução normal do Node.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));

function arquivo(caminho) {
  for (const candidato of [caminho, `${caminho}.ts`, `${caminho}.tsx`, path.join(caminho, "index.ts")]) {
    if (existsSync(candidato) && statSync(candidato).isFile()) return candidato;
  }
  return null;
}

export async function resolve(especificador, contexto, proximo) {
  let alvo = null;
  if (especificador.startsWith("@/")) {
    alvo = arquivo(path.join(raiz, "src", especificador.slice(2)));
  } else if (especificador.startsWith("./") || especificador.startsWith("../")) {
    const pai = contexto.parentURL;
    if (pai?.startsWith("file:") && !pai.includes("/node_modules/")) {
      alvo = arquivo(path.resolve(path.dirname(fileURLToPath(pai)), especificador));
    }
  }
  return proximo(alvo ? pathToFileURL(alvo).href : especificador, contexto);
}
