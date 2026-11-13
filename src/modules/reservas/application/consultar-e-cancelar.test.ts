import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { STATUS_RESERVA, type StatusReserva } from "../domain/reserva.ts";
import { criarBancoFalso } from "./banco-falso.ts";
import { criarBuscarReserva, criarListarReservas } from "./consultar-reservas.ts";
import { criarCancelarReserva } from "./cancelar-reserva.ts";
import type { SessaoCliente } from "./portas.ts";

const A: SessaoCliente = { perfil: "CLIENTE", usuarioId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const B: SessaoCliente = { perfil: "CLIENTE", usuarioId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const AGORA = new Date("2026-11-14T11:00:00.000Z");
const ID_A1 = "11111111-1111-4111-8111-111111111111";
const ID_A2 = "22222222-2222-4222-8222-222222222222";
const ID_B1 = "33333333-3333-4333-8333-333333333333";
const INEXISTENTE = "99999999-9999-4999-8999-999999999999";

function montar() {
  const banco = criarBancoFalso(() => AGORA);
  const dep = { transacao: banco.transacao };
  return {
    banco,
    listar: criarListarReservas(dep),
    buscar: criarBuscarReserva(dep),
    cancelar: criarCancelarReserva(dep),
  };
}

const minutosAtras = (m: number) => new Date(AGORA.getTime() - m * 60 * 1000);

// ----------------------------------------------------------------------------------- listar

test("lista só as reservas do cliente, da mais recente para a mais antiga", async () => {
  const { banco, listar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", criadoEm: minutosAtras(60) });
  banco.semear({ id: ID_A2, clienteId: A.usuarioId, bicicletaId: "b1", criadoEm: minutosAtras(5) });
  banco.semear({ id: ID_B1, clienteId: B.usuarioId, bicicletaId: "b2", criadoEm: minutosAtras(1) });
  const r = await listar(A, {});
  assert.deepEqual(r.map((x) => x.id), [ID_A2, ID_A1]);
  assert.equal((await listar(B, {})).length, 1);
});

test("sem reservas, a lista é vazia (não é erro)", async () => {
  const { listar } = montar();
  assert.deepEqual(await listar(A, {}), []);
});

test("antes de listar, expira as pendentes vencidas", async () => {
  const { banco, listar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", status: "PENDENTE_PAGAMENTO", criadoEm: minutosAtras(16) });
  banco.semear({ id: ID_A2, clienteId: A.usuarioId, bicicletaId: "b2", status: "PENDENTE_PAGAMENTO", criadoEm: minutosAtras(14) });
  const r = await listar(A, {});
  const porId = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.equal(porId[ID_A1].status, "EXPIRADA");
  assert.equal(porId[ID_A1].expiraEm, null);
  assert.equal(porId[ID_A2].status, "PENDENTE_PAGAMENTO");
  assert.equal(porId[ID_A2].expiraEm, "2026-11-14T11:01:00.000Z");
  assert.equal(banco.log.indexOf("expirarVencidas") < banco.log.indexOf("listar"), true);
});

test("filtra por status quando o valor é válido", async () => {
  const { banco, listar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", status: "CONFIRMADA" });
  banco.semear({ id: ID_A2, clienteId: A.usuarioId, bicicletaId: "b2", status: "CANCELADA" });
  assert.deepEqual((await listar(A, { status: "CANCELADA" })).map((x) => x.id), [ID_A2]);
  assert.deepEqual((await listar(A, { status: "CONFIRMADA" })).map((x) => x.id), [ID_A1]);
});

test("aceita cada status do enum no filtro", async () => {
  const { listar } = montar();
  for (const status of STATUS_RESERVA) await listar(A, { status });
});

test("status inválido responde 400 com details.status e não toca o banco", async () => {
  const { banco, listar } = montar();
  for (const status of ["confirmada", "XYZ", "ALUGADA", "1", " CONFIRMADA"]) {
    await assert.rejects(listar(A, { status }), (erro: unknown) => {
      assert.ok(erro instanceof ValidationError);
      assert.ok((erro.details as Record<string, string>).status);
      return true;
    });
  }
  assert.deepEqual(banco.log, []);
});

test("status ausente, nulo ou vazio significa sem filtro", async () => {
  const { banco, listar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1" });
  for (const status of [undefined, null, ""]) assert.equal((await listar(A, { status })).length, 1);
});

test("a lista não mostra a unidade (bicicleta) nem o cliente", async () => {
  const { banco, listar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "bike-secreta" });
  assert.doesNotMatch(JSON.stringify(await listar(A, {})), /bike-secreta|bicicleta|clienteId/);
});

// ----------------------------------------------------------------------------------- buscar

test("busca a própria reserva, com o pagamento nulo quando não há cobrança", async () => {
  const { banco, buscar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", status: "PENDENTE_PAGAMENTO" });
  const r = await buscar(A, ID_A1);
  assert.equal(r.id, ID_A1);
  assert.equal(r.pagamento, null);
  assert.equal(r.expiraEm, "2026-11-14T11:15:00.000Z");
});

test("traz status e método do pagamento quando existe", async () => {
  const { banco, buscar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", pagamentoStatus: "PENDENTE", pagamentoMetodo: "PIX" });
  assert.deepEqual((await buscar(A, ID_A1)).pagamento, { status: "PENDENTE", metodo: "PIX" });
});

test("reserva de outro cliente e reserva inexistente dão o mesmo 404", async () => {
  const { banco, buscar } = montar();
  banco.semear({ id: ID_B1, clienteId: B.usuarioId, bicicletaId: "b1" });
  const erros: unknown[] = [];
  for (const id of [ID_B1, INEXISTENTE]) {
    await assert.rejects(buscar(A, id), (erro: unknown) => {
      erros.push(erro);
      return erro instanceof NotFoundError;
    });
  }
  const [dele, inexistente] = erros as NotFoundError[];
  assert.equal(dele.message, inexistente.message);
  assert.equal(dele.status, 404);
});

test("id que não é UUID também é 404, sem chegar ao banco", async () => {
  const { banco, buscar } = montar();
  for (const id of ["", "abc", "1", "../etc", `${ID_A1}'; DROP TABLE reserva;--`, "undefined"]) {
    await assert.rejects(buscar(A, id), NotFoundError);
  }
  assert.deepEqual(banco.log, []);
});

test("buscar expira a pendente vencida antes de responder", async () => {
  const { banco, buscar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", status: "PENDENTE_PAGAMENTO", criadoEm: minutosAtras(20) });
  const r = await buscar(A, ID_A1);
  assert.equal(r.status, "EXPIRADA");
  assert.equal(r.expiraEm, null);
});

// ---------------------------------------------------------------------------------- cancelar

test("cancela a reserva pendente: vira CANCELADA, sem prazo", async () => {
  const { banco, cancelar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", status: "PENDENTE_PAGAMENTO" });
  const r = await cancelar(A, ID_A1);
  assert.equal(r.status, "CANCELADA");
  assert.equal(r.expiraEm, null);
  assert.equal(banco.todasAsReservas()[0].status, "CANCELADA");
});

test("cancela a reserva confirmada ainda não retirada", async () => {
  const { banco, cancelar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", status: "CONFIRMADA" });
  assert.equal((await cancelar(A, ID_A1)).status, "CANCELADA");
});

test("reserva já retirada, concluída, cancelada, expirada ou não retirada dá 409 e não muda", async () => {
  const { banco, cancelar } = montar();
  const nao: StatusReserva[] = ["EM_ANDAMENTO", "CONCLUIDA", "CANCELADA", "EXPIRADA", "NAO_RETIRADA"];
  for (const [i, status] of nao.entries()) {
    const id = `${i}${i}${i}${i}${i}${i}${i}${i}-0000-4000-8000-000000000000`;
    banco.semear({ id, clienteId: A.usuarioId, bicicletaId: `b${i}`, status });
    await assert.rejects(cancelar(A, id), ConflictError, status);
    assert.equal(banco.todasAsReservas().find((r) => r.id === id)?.status, status);
  }
  assert.ok(!banco.log.includes("marcarCancelada"));
});

test("pendente vencida que ninguém listou: cancelar dá 409, porque ela já expirou", async () => {
  const { banco, cancelar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", status: "PENDENTE_PAGAMENTO", criadoEm: minutosAtras(30) });
  await assert.rejects(cancelar(A, ID_A1), ConflictError);
});

test("reserva de outro cliente e inexistente dão 404, e a de outro não é cancelada", async () => {
  const { banco, cancelar } = montar();
  banco.semear({ id: ID_B1, clienteId: B.usuarioId, bicicletaId: "b1", status: "CONFIRMADA" });
  await assert.rejects(cancelar(A, ID_B1), NotFoundError);
  await assert.rejects(cancelar(A, INEXISTENTE), NotFoundError);
  assert.equal(banco.todasAsReservas()[0].status, "CONFIRMADA");
});

test("id que não é UUID dá 404 sem chegar ao banco", async () => {
  const { banco, cancelar } = montar();
  await assert.rejects(cancelar(A, "abc"), NotFoundError);
  assert.deepEqual(banco.log, []);
});

test("cancelar duas vezes: a segunda dá 409", async () => {
  const { banco, cancelar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", status: "CONFIRMADA" });
  await cancelar(A, ID_A1);
  await assert.rejects(cancelar(A, ID_A1), ConflictError);
});

test("a ordem no banco: expira, trava a reserva, cancela, relê", async () => {
  const { banco, cancelar } = montar();
  banco.semear({ id: ID_A1, clienteId: A.usuarioId, bicicletaId: "b1", status: "CONFIRMADA" });
  await cancelar(A, ID_A1);
  assert.deepEqual(banco.log, ["BEGIN", "expirarVencidas", "travarReserva", "marcarCancelada", "buscar", "COMMIT"]);
});
