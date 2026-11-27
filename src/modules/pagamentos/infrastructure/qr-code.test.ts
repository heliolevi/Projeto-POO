import assert from "node:assert/strict";
import { test } from "node:test";
import { QrCodePng } from "./qr-code.ts";

test("tira o prefixo data: e devolve só o base64, pedindo correção M, margem 1 e largura 280", async () => {
  const pedidos: unknown[][] = [];
  const qr = new QrCodePng(async (texto, opcoes) => {
    pedidos.push([texto, opcoes]);
    return "data:image/png;base64,QUJD";
  });
  assert.equal(await qr.gerarBase64("00020126"), "QUJD");
  assert.deepEqual(pedidos, [["00020126", { errorCorrectionLevel: "M", margin: 1, width: 280 }]]);
});

test("sem o prefixo esperado, devolve o texto como veio", async () => {
  assert.equal(await new QrCodePng(async () => "outra-coisa").gerarBase64("x"), "outra-coisa");
});

test("erro do gerador sobe (não vira imagem vazia)", async () => {
  await assert.rejects(new QrCodePng(async () => { throw new Error("sem memória"); }).gerarBase64("x"), /sem memória/);
});

test("a instância do app gera um PNG de verdade (assinatura PNG em base64) para um copia e cola", async () => {
  const base64 = await QrCodePng.padrao.gerarBase64("00020126580014br.gov.bcb.pix");
  assert.ok(!base64.startsWith("data:"));
  assert.equal(Buffer.from(base64, "base64").subarray(1, 4).toString("latin1"), "PNG");
});

test("nenhum campo é visível", () => {
  assert.deepEqual(Object.keys(QrCodePng.padrao), []);
});
