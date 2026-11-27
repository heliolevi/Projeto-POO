import assert from "node:assert/strict";
import { test } from "node:test";
import { EmpresaDaLocadora, Telefone } from "./index.ts";

// O banco guarda só os dígitos, e é assim que GET /api/empresa devolve ("98900000000"). A tela
// precisa mostrar "(98) 90000-0000", como mostrava antes de ler da API.

test("Telefone formata celular (11 dígitos) e fixo (10 dígitos) com DDD", () => {
  assert.equal(Telefone.de("98900000000")?.formatado(), "(98) 90000-0000");
  assert.equal(Telefone.de("9832221100")?.formatado(), "(98) 3222-1100");
});

test("Telefone aceita o número já formatado ou com espaços, traço, ponto e +55", () => {
  for (const texto of ["(98) 90000-0000", " 98 90000 0000 ", "98.90000.0000", "+55 98 90000-0000", "5598900000000"]) {
    assert.equal(Telefone.de(texto)?.formatado(), "(98) 90000-0000", texto);
  }
});

test("Telefone sem valor não existe: null, vazio ou só espaços viram null", () => {
  for (const texto of [null, undefined, "", "   "]) assert.equal(Telefone.de(texto), null, String(texto));
});

test("Telefone em formato que não é de DDD + número sai como veio, sem inventar máscara", () => {
  for (const texto of ["0800 123 4567", "190", "ramal 12", "989000000001234"]) {
    assert.equal(Telefone.de(texto)?.formatado(), texto, texto);
  }
});

test("Telefone: o 55 só é código do país com +55 ou com o número todo em dígitos", () => {
  // DDD 55 (Rio Grande do Sul) com ramal: 12 dígitos começando por 55, mas sem dizer que é o país.
  const comRamal = Telefone.de("(55) 3222-1100 r. 12");
  assert.equal(comRamal?.formatado(), "(55) 3222-1100 r. 12");
  assert.equal(comRamal?.link(), null);
  assert.equal(Telefone.de("(55) 3222-1100")?.link(), "tel:+555532221100");
  assert.equal(Telefone.de("+55 55 3222-1100")?.link(), "tel:+555532221100");
  assert.equal(Telefone.de("555532221100")?.link(), "tel:+555532221100");
});

test("Telefone com texto em volta do número sai como veio, sem perder a observação", () => {
  assert.equal(Telefone.de("98 3222-1100 (somente WhatsApp)")?.formatado(), "98 3222-1100 (somente WhatsApp)");
  assert.equal(Telefone.de("98 3222-1100 (somente WhatsApp)")?.link(), null);
});

test("Telefone dá o link de discagem só quando o número é reconhecido", () => {
  assert.equal(Telefone.de("98900000000")?.link(), "tel:+5598900000000");
  assert.equal(Telefone.de("(98) 3222-1100")?.link(), "tel:+559832221100");
  assert.equal(Telefone.de("ramal 12")?.link(), null);
});

test("Telefone é encapsulado: nenhum campo visível e o texto sai formatado", () => {
  const telefone = Telefone.de("98900000000");
  assert.ok(telefone);
  assert.deepEqual(Object.keys(telefone), []);
  assert.equal(String(telefone), "(98) 90000-0000");
  assert.equal(JSON.stringify({ telefone }), '{"telefone":"(98) 90000-0000"}');
});

test("a resposta real da API (telefone só com dígitos) aparece formatada na tela", () => {
  const empresa = EmpresaDaLocadora.deResposta({
    data: {
      nomeFantasia: "Bike Ilha Club",
      telefone: "98900000000",
      email: "contato@bikeilha.test",
      pontos: [
        { id: "p1", nome: "Ponto Litorânea", telefone: "98911112222", horarios: [] },
        { id: "p2", nome: "Ponto Centro", telefone: null, horarios: [] },
      ],
    },
  });
  assert.ok(empresa);
  const [comTelefone, semTelefone] = empresa.pontos;
  assert.equal(empresa.telefoneDoPonto(comTelefone)?.formatado(), "(98) 91111-2222");
  assert.equal(empresa.telefoneDoPonto(semTelefone)?.formatado(), "(98) 90000-0000");
  // O DTO continua com o valor do contrato, sem máscara.
  assert.equal(empresa.paraDto().telefone, "98900000000");
  assert.equal(empresa.paraDto().pontos[0].telefone, "98911112222");
});

test("sem telefone no ponto nem na locadora, telefoneDoPonto é null", () => {
  const empresa = EmpresaDaLocadora.deResposta({
    data: { nomeFantasia: "Bike Ilha Club", telefone: null, email: "", pontos: [{ id: "p1", nome: "Ponto", horarios: [] }] },
  });
  assert.ok(empresa);
  assert.equal(empresa.telefoneDoPonto(empresa.pontos[0]), null);
});

test("estresse: 100 mil telefones de formatos variados são formatados rápido e sem lançar", () => {
  const formatos = ["98900000000", "(98) 3222-1100", "+55 98 90000-0000", "", "lixo", "9".repeat(10_000)];
  const inicio = performance.now();
  for (let i = 0; i < 100_000; i++) Telefone.de(formatos[i % formatos.length])?.formatado();
  assert.ok(performance.now() - inicio < 10_000, "formatar 100 mil telefones passou de 10 s");
});
