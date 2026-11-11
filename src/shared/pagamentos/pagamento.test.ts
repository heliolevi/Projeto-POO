import assert from "node:assert/strict";
import { test } from "node:test";
import { imagemDoQrCode, situacaoDoPix, type StatusDoPagamento } from "./pagamento.ts";

const base: StatusDoPagamento = {
  reservaId: "r1",
  statusPagamento: "PENDENTE",
  statusReserva: "PENDENTE_PAGAMENTO",
};

test("continua aguardando enquanto o pagamento está pendente", () => {
  assert.equal(situacaoDoPix(base), "aguardando");
  assert.equal(situacaoDoPix({ ...base, statusPagamento: null }), "aguardando");
});

test("confirma quando a reserva fica confirmada ou o pagamento é aprovado", () => {
  assert.equal(
    situacaoDoPix({ ...base, statusPagamento: "APROVADO", statusReserva: "CONFIRMADA" }),
    "confirmado",
  );
  assert.equal(situacaoDoPix({ ...base, statusPagamento: "APROVADO" }), "confirmado");
});

test("encerra quando a reserva expira ou é cancelada, ou o Pix é recusado ou expira", () => {
  assert.equal(situacaoDoPix({ ...base, statusReserva: "EXPIRADA" }), "encerrado");
  assert.equal(situacaoDoPix({ ...base, statusReserva: "CANCELADA" }), "encerrado");
  assert.equal(situacaoDoPix({ ...base, statusPagamento: "RECUSADO" }), "encerrado");
  assert.equal(situacaoDoPix({ ...base, statusPagamento: "EXPIRADO" }), "encerrado");
});

test("monta a imagem do QR a partir do base64", () => {
  assert.equal(imagemDoQrCode("abc"), "data:image/png;base64,abc");
});
