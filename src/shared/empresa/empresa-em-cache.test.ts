import assert from "node:assert/strict";
import { test } from "node:test";
import { EmpresaDaLocadora } from "./empresa-da-locadora.ts";
import { EmpresaEmCache, type FonteDaEmpresa } from "./empresa-em-cache.ts";
import { EmpresaCarregada, EmpresaIndisponivel, EmpresaSemCadastro, type ResultadoDaEmpresa } from "./resultado-da-empresa.ts";

const carregada = () => new EmpresaCarregada(new EmpresaDaLocadora({ nomeFantasia: "Bike Ilha Club" }));

// Fonte de mentira: devolve, em ordem, o que foi combinado, e conta as buscas.
function fonteQue(...respostas: (ResultadoDaEmpresa | Error)[]) {
  let buscas = 0;
  const fonte: FonteDaEmpresa = {
    async buscar() {
      const r = respostas[Math.min(buscas, respostas.length - 1)];
      buscas++;
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { fonte, get buscas() { return buscas; } };
}

// Fonte que só responde quando mandarem (para testar chamadas simultâneas).
function fonteManual() {
  const pendentes: ((r: ResultadoDaEmpresa) => void)[] = [];
  const fonte: FonteDaEmpresa = { buscar: () => new Promise((res) => pendentes.push(res)) };
  return { fonte, responder: (i: number, r: ResultadoDaEmpresa) => pendentes[i](r), get buscas() { return pendentes.length; } };
}

test("o resultado carregado fica guardado: várias telas, uma busca só", async () => {
  const f = fonteQue(carregada());
  const cache = new EmpresaEmCache(f.fonte);
  const a = await cache.obter();
  const b = await cache.obter();
  const c = await cache.obter();
  assert.equal(f.buscas, 1);
  assert.ok(a instanceof EmpresaCarregada);
  assert.equal(a, b);
  assert.equal(b, c);
});

test("chamadas ao mesmo tempo dividem a mesma busca em andamento", async () => {
  const f = fonteManual();
  const cache = new EmpresaEmCache(f.fonte);
  const promessas = Array.from({ length: 50 }, () => cache.obter());
  assert.equal(f.buscas, 1);
  const r = carregada();
  f.responder(0, r);
  for (const p of promessas) assert.equal(await p, r);
});

test("locadora sem cadastro (404) não é guardada: a próxima tela tenta de novo", async () => {
  const f = fonteQue(new EmpresaSemCadastro(), carregada());
  const cache = new EmpresaEmCache(f.fonte);
  assert.ok((await cache.obter()) instanceof EmpresaSemCadastro);
  assert.ok((await cache.obter()) instanceof EmpresaCarregada);
  assert.equal(f.buscas, 2);
});

test("falha (indisponível) não é guardada: o erro não gruda na visita", async () => {
  const f = fonteQue(new EmpresaIndisponivel(), new EmpresaIndisponivel(), carregada());
  const cache = new EmpresaEmCache(f.fonte);
  assert.ok((await cache.obter()) instanceof EmpresaIndisponivel);
  assert.ok((await cache.obter()) instanceof EmpresaIndisponivel);
  assert.ok((await cache.obter()) instanceof EmpresaCarregada);
  assert.ok((await cache.obter()) instanceof EmpresaCarregada);
  assert.equal(f.buscas, 3);
});

test("fonte que lança também não fica guardada: o erro sobe e a próxima tenta de novo", async () => {
  const f = fonteQue(new Error("quebrou"), carregada());
  const cache = new EmpresaEmCache(f.fonte);
  await assert.rejects(cache.obter(), /quebrou/);
  assert.ok((await cache.obter()) instanceof EmpresaCarregada);
  assert.equal(f.buscas, 2);
});

test("invalidar faz a próxima chamada buscar de novo (o 'tentar de novo' da tela)", async () => {
  const f = fonteQue(carregada(), carregada());
  const cache = new EmpresaEmCache(f.fonte);
  const primeira = await cache.obter();
  cache.invalidar();
  const segunda = await cache.obter();
  assert.notEqual(primeira, segunda);
  assert.equal(f.buscas, 2);
});

test("invalidar com uma busca em andamento: a resposta antiga não apaga a busca nova", async () => {
  const f = fonteManual();
  const cache = new EmpresaEmCache(f.fonte);
  const velha = cache.obter();
  cache.invalidar();
  const nova = cache.obter();
  assert.equal(f.buscas, 2);
  const rNova = carregada();
  f.responder(1, rNova);
  assert.equal(await nova, rNova);
  f.responder(0, new EmpresaIndisponivel()); // a antiga chega depois e falha
  await velha;
  assert.equal(await cache.obter(), rNova, "a busca nova continua guardada");
  assert.equal(f.buscas, 2);
});

test("dois caches não dividem o que guardam", async () => {
  const a = fonteQue(carregada());
  const b = fonteQue(carregada());
  await new EmpresaEmCache(a.fonte).obter();
  await new EmpresaEmCache(b.fonte).obter();
  assert.equal(a.buscas, 1);
  assert.equal(b.buscas, 1);
});

test("estresse: 300 telas ao mesmo tempo, com a primeira busca falhando, acabam todas com a locadora", async () => {
  const f = fonteQue(new EmpresaIndisponivel(), carregada());
  const cache = new EmpresaEmCache(f.fonte);
  const primeiras = await Promise.all(Array.from({ length: 300 }, () => cache.obter()));
  assert.ok(primeiras.every((r) => r instanceof EmpresaIndisponivel));
  assert.equal(f.buscas, 1, "as 300 dividiram a busca que falhou");
  const depois = await Promise.all(Array.from({ length: 300 }, () => cache.obter()));
  assert.ok(depois.every((r) => r instanceof EmpresaCarregada));
  assert.equal(f.buscas, 2);
});

test("EmpresaEmCache é encapsulado e o cache padrão existe sem buscar nada ao ser importado", () => {
  assert.deepEqual(Object.keys(new EmpresaEmCache(fonteQue(carregada()).fonte)), []);
  assert.ok(EmpresaEmCache.padrao instanceof EmpresaEmCache);
});
