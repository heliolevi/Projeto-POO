import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictError } from "../../../shared/http/errors.ts";
import { CalculadoraDeAluguel } from "../../../shared/dominio/preco-aluguel.ts";
import { ValidadorDeNovaReserva } from "../domain/validador-de-nova-reserva.ts";
import { criarBancoFalso } from "./banco-falso.ts";
import { CancelamentoDeReserva } from "./cancelar-reserva.ts";
import { ConsultaDeReservas } from "./consultar-reservas.ts";
import { CriadorDeReserva } from "./criar-reserva.ts";
import type { LinhaReserva, SessaoCliente } from "./portas.ts";
import { MontadorDeReserva } from "./reserva-dto.ts";
import { ReservaService } from "./reserva-service.ts";

const A: SessaoCliente = { perfil: "CLIENTE", usuarioId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const TIPO = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const AGORA = new Date("2026-11-14T11:00:00.000Z");
const CORPO = { tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T13:00:00-03:00" };

function montar(unidades: number) {
  const banco = criarBancoFalso(() => AGORA);
  banco.adicionarTipo({ id: TIPO, nome: "Urbana", precoHoraCentavos: 1000, precoDiaCentavos: 5000, valorCaucaoCentavos: 15000 });
  for (let i = 1; i <= unidades; i++) banco.adicionarUnidade({ id: `bike-${i}`, tipoId: TIPO, codigo: `BIC-00${i}` });
  let n = 0;
  const deps = {
    executor: banco.executor,
    agora: () => AGORA,
    geradorDeCodigo: { gerar: () => `BIC-C${String(++n).padStart(5, "0")}` },
    calculadora: CalculadoraDeAluguel.padrao,
  };
  return { banco, deps, servico: new ReservaService(deps) };
}

const LINHA: LinhaReserva = {
  id: "11111111-1111-4111-8111-111111111111",
  codigo: "BIC-AAAAAA",
  status: "PENDENTE_PAGAMENTO",
  tipoId: "t",
  tipoNome: "Urbana",
  pontoId: "p",
  pontoNome: "Ponto",
  pontoEndereco: "Av.",
  inicio: new Date("2026-11-14T12:00:00Z"),
  fim: new Date("2026-11-14T16:00:00Z"),
  valorAluguelCentavos: 4000,
  valorCaucaoCentavos: 15000,
  criadoEm: new Date("2026-11-14T11:00:00Z"),
  pagamentoStatus: "APROVADO",
  pagamentoMetodo: "PIX",
};

describe("classes de aplicação das reservas", () => {
  test("encapsulamento: nenhuma instância expõe campo", () => {
    const { deps, servico } = montar(1);
    assert.deepEqual(Object.keys(servico), []);
    assert.deepEqual(Object.keys(new CriadorDeReserva({ ...deps, validador: ValidadorDeNovaReserva.padrao })), []);
    assert.deepEqual(Object.keys(new ConsultaDeReservas(deps.executor)), []);
    assert.deepEqual(Object.keys(new CancelamentoDeReserva(deps)), []);
  });

  test("MontadorDeReserva só tem métodos estáticos (não se cria instância)", () => {
    assert.throws(() => new (MontadorDeReserva as unknown as new () => unknown)(), /só tem membros estáticos/);
  });

  test("MontadorDeReserva monta a resposta do contrato, com e sem detalhe do pagamento", () => {
    const simples = MontadorDeReserva.reserva(LINHA);
    assert.equal(simples.expiraEm, "2026-11-14T11:15:00.000Z");
    assert.equal(simples.criadaEm, "2026-11-14T11:00:00.000Z");
    assert.equal("pagamento" in simples, false);
    const detalhada = MontadorDeReserva.detalhada(LINHA);
    assert.deepEqual(detalhada.pagamento, { status: "APROVADO", metodo: "PIX" });
    assert.equal(MontadorDeReserva.detalhada({ ...LINHA, pagamentoStatus: null }).pagamento, null);
  });

  test("a mensagem de reserva não encontrada é a do contrato", () => {
    assert.equal(ConsultaDeReservas.MENSAGEM_NAO_ENCONTRADA, "Reserva não encontrada.");
  });

  test("os tetos do criador: 50 tentativas e 5 códigos repetidos", () => {
    assert.equal(CriadorDeReserva.MAX_TENTATIVAS, 50);
    assert.equal(CriadorDeReserva.MAX_CODIGOS_REPETIDOS, 5);
  });

  test("o serviço usa o ValidadorDeNovaReserva.padrao quando nenhum é entregue, e o entregue quando há", async () => {
    const { deps } = montar(1);
    const chamadas: unknown[] = [];
    const servico = new ReservaService({
      ...deps,
      validador: {
        validar(corpo) {
          chamadas.push(corpo);
          return { erros: { tipoId: "do falso" } };
        },
      },
    });
    await assert.rejects(servico.criarReserva(A, CORPO), (e: Error) => e.name !== "" && /Dados inválidos/.test(e.message));
    assert.deepEqual(chamadas, [CORPO]);
  });

  test("o relógio injetado alimenta o cancelamento: confirmada com período já acabado é 409", async () => {
    const { banco, deps } = montar(1);
    banco.semear({
      id: "22222222-2222-4222-8222-222222222222",
      clienteId: A.usuarioId,
      bicicletaId: "bike-1",
      status: "CONFIRMADA",
      inicio: new Date("2026-11-14T08:00:00Z"),
      fim: new Date("2026-11-14T10:00:00Z"),
    });
    const noFuturo = new CancelamentoDeReserva({ ...deps, agora: () => new Date("2026-11-14T10:00:00Z") });
    await assert.rejects(noFuturo.cancelar(A, "22222222-2222-4222-8222-222222222222"), ConflictError);
    const noPassado = new CancelamentoDeReserva({ ...deps, agora: () => new Date("2026-11-14T09:59:59Z") });
    assert.equal((await noPassado.cancelar(A, "22222222-2222-4222-8222-222222222222")).status, "CANCELADA");
  });

  test("estresse: 40 pedidos ao mesmo tempo para 5 unidades dão exatamente 5 reservas e 35 conflitos", async () => {
    const { banco, servico } = montar(5);
    const resultados = await Promise.allSettled(
      Array.from({ length: 40 }, (_, i) =>
        servico.criarReserva({ perfil: "CLIENTE", usuarioId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }, CORPO),
      ),
    );
    const ok = resultados.filter((r) => r.status === "fulfilled");
    const recusados = resultados.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 5);
    assert.equal(recusados.length, 35);
    for (const r of recusados) assert.ok((r as PromiseRejectedResult).reason instanceof ConflictError);
    assert.equal(banco.todasAsReservas().length, 5);
    assert.equal(new Set(banco.todasAsReservas().map((r) => r.bicicletaId)).size, 5, "nenhuma unidade reservada duas vezes");
    assert.equal(new Set(banco.todasAsReservas().map((r) => r.codigo)).size, 5);
  });

  test("estresse: 30 cancelamentos simultâneos da mesma reserva só dão sucesso ou 409, e ela termina CANCELADA", async () => {
    const { banco, servico } = montar(1);
    const id = "33333333-3333-4333-8333-333333333333";
    banco.semear({ id, clienteId: A.usuarioId, bicicletaId: "bike-1", status: "CONFIRMADA", criadoEm: AGORA });
    const resultados = await Promise.allSettled(Array.from({ length: 30 }, () => servico.cancelarReserva(A, id)));
    assert.equal(resultados.filter((r) => r.status === "fulfilled").length >= 1, true);
    for (const r of resultados) {
      if (r.status === "rejected") assert.ok(r.reason instanceof ConflictError);
    }
    assert.equal(banco.todasAsReservas()[0].status, "CANCELADA");
  });
});
