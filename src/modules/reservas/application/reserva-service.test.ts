import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { Periodo } from "../../../shared/dominio/periodo-aluguel.ts";
import { calcularValorAluguel } from "../../../shared/dominio/preco-aluguel.ts";
import { criarBancoFalso } from "./banco-falso.ts";
import type { SessaoCliente } from "./portas.ts";
import { ReservaService } from "./reserva-service.ts";

const A: SessaoCliente = { perfil: "CLIENTE", usuarioId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const B: SessaoCliente = { perfil: "CLIENTE", usuarioId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const TIPO = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
// 14/11/2026, 08:00 em São Luís
const AGORA = new Date("2026-11-14T11:00:00.000Z");
const CORPO = { tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T13:00:00-03:00" };

function montar(unidades = 1) {
  const banco = criarBancoFalso(() => AGORA);
  banco.adicionarTipo({
    id: TIPO,
    nome: "Urbana",
    precoHoraCentavos: 1000,
    precoDiaCentavos: 5000,
    valorCaucaoCentavos: 15000,
  });
  for (let i = 1; i <= unidades; i++) banco.adicionarUnidade({ id: `bike-${i}`, tipoId: TIPO });
  let n = 0;
  const servico = new ReservaService({
    transacao: banco.transacao,
    agora: () => AGORA,
    gerarCodigo: () => `BIC-TESTE${++n}`,
    calcularValorAluguel,
  });
  return { banco, servico };
}

const T = (hora: number) => new Date(Date.UTC(2026, 10, 14, hora));
const ID_PENDENTE = "11111111-1111-4111-8111-111111111111";
const ID_CONCLUIDA = "22222222-2222-4222-8222-222222222222";

describe("ReservaService", () => {
  test("criarReserva cria a pendente com o valor calculado no servidor", async () => {
    const { servico } = montar();
    const r = await servico.criarReserva(A, CORPO);
    assert.equal(r.status, "PENDENTE_PAGAMENTO");
    assert.equal(r.valorAluguelCentavos, 4000);
    assert.equal(r.expiraEm, "2026-11-14T11:15:00.000Z");
  });

  test("criarReserva: corpo inválido é 400 e sem unidade livre é 409", async () => {
    const { servico } = montar(1);
    await assert.rejects(() => servico.criarReserva(A, {}), ValidationError);
    await servico.criarReserva(A, CORPO);
    await assert.rejects(() => servico.criarReserva(B, CORPO), ConflictError);
  });

  test("listarReservas devolve só as do cliente, e filtro de status inválido é 400", async () => {
    const { servico } = montar(2);
    await servico.criarReserva(A, CORPO);
    await servico.criarReserva(B, CORPO);
    assert.equal((await servico.listarReservas(A, {})).length, 1);
    await assert.rejects(() => servico.listarReservas(A, { status: "XPTO" }), ValidationError);
  });

  test("buscarReserva: a do cliente vem com o pagamento; a de outro cliente é 404", async () => {
    const { banco, servico } = montar();
    banco.semear({
      id: ID_PENDENTE,
      clienteId: A.usuarioId,
      bicicletaId: "bike-1",
      pagamentoStatus: "APROVADO",
      pagamentoMetodo: "PIX",
    });
    const detalhe = await servico.buscarReserva(A, ID_PENDENTE);
    assert.equal(detalhe.id, ID_PENDENTE);
    assert.deepEqual(detalhe.pagamento, { status: "APROVADO", metodo: "PIX" });
    await assert.rejects(() => servico.buscarReserva(B, ID_PENDENTE), NotFoundError);
    await assert.rejects(() => servico.buscarReserva(A, "nao-e-uuid"), NotFoundError);
  });

  test("cancelarReserva cancela a pendente e libera a bicicleta; cancelar de novo é 409", async () => {
    const { banco, servico } = montar(1);
    banco.semear({
      id: ID_PENDENTE,
      clienteId: A.usuarioId,
      bicicletaId: "bike-1",
      status: "PENDENTE_PAGAMENTO",
      criadoEm: AGORA,
    });
    const cancelada = await servico.cancelarReserva(A, ID_PENDENTE);
    assert.equal(cancelada.status, "CANCELADA");
    assert.equal(cancelada.expiraEm, null);
    await assert.rejects(() => servico.cancelarReserva(A, ID_PENDENTE), ConflictError);
    // a bicicleta voltou a ficar livre: outro cliente consegue reservar
    const outra = await servico.criarReserva(B, CORPO);
    assert.equal(outra.status, "PENDENTE_PAGAMENTO");
  });

  test("cancelarReserva: reserva concluída não cancela (409)", async () => {
    const { banco, servico } = montar();
    banco.semear({ id: ID_CONCLUIDA, clienteId: A.usuarioId, bicicletaId: "bike-1", status: "CONCLUIDA" });
    await assert.rejects(() => servico.cancelarReserva(A, ID_CONCLUIDA), ConflictError);
  });

  test("expirarPendentes chama a função de expiração do banco", async () => {
    const { banco, servico } = montar();
    await servico.expirarPendentes(A);
    assert.ok(banco.log.includes("expirarVencidas"));
  });

  test("verificarConflito: sobreposição conta, encostar não conta", () => {
    const { servico } = montar();
    const ocupado = [Periodo.de(T(10), T(12))];
    assert.equal(servico.verificarConflito(Periodo.de(T(11), T(13)), ocupado), true);
    assert.equal(servico.verificarConflito(Periodo.de(T(12), T(14)), ocupado), false);
    assert.equal(servico.verificarConflito(Periodo.de(T(11), T(13)), []), false);
  });
});
