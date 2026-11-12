import assert from "node:assert/strict";
import { test } from "node:test";
import { enderecoDoPonto, linkDaReserva, lerPedidoDaReserva } from "./nova-reserva.ts";

const pedido = {
  tipoId: "t-1",
  inicio: "2026-11-15T09:00:00-03:00",
  fim: "2026-11-15T16:00:00.000Z",
};

test("o link e a leitura do pedido são inversos", () => {
  const url = new URL(linkDaReserva(pedido), "http://localhost");
  assert.equal(url.pathname, "/app/reservas/nova");
  assert.deepEqual(lerPedidoDaReserva(url.searchParams), pedido);
});

test("recusa pedido incompleto, com data inválida ou com fim antes do início", () => {
  const ler = (q: string) => lerPedidoDaReserva(new URLSearchParams(q));
  assert.equal(ler(""), null);
  assert.equal(ler("tipoId=t-1&inicio=2026-11-15T09:00:00-03:00"), null);
  assert.equal(ler("tipoId=t-1&inicio=ontem&fim=amanha"), null);
  assert.equal(
    ler("tipoId=t-1&inicio=2026-11-15T16:00:00.000Z&fim=2026-11-15T09:00:00.000Z"),
    null,
  );
});

test("enderecoDoPonto junta rua, complemento, bairro e cidade", () => {
  const base = {
    id: "p1",
    nome: "Ponto Litorânea",
    logradouro: "Av. Litorânea",
    numero: "100",
    complemento: null,
    bairro: "Calhau",
    cidade: "São Luís",
    uf: "MA",
  };
  assert.equal(enderecoDoPonto(base), "Av. Litorânea, 100, Calhau, São Luís/MA");
  assert.equal(
    enderecoDoPonto({ ...base, complemento: "loja 2" }),
    "Av. Litorânea, 100 (loja 2), Calhau, São Luís/MA",
  );
});
