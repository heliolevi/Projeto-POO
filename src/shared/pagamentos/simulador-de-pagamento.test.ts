import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../http/api-cliente.ts";
import type { StatusDoPagamento } from "./pagamento.ts";
import {
  SimulacaoAindaPendente,
  SimulacaoConfirmada,
  SimulacaoEncerrada,
  SimulacaoFalhou,
  SimulacaoIndisponivel,
  SimulacaoPagaSemReserva,
  SimulacaoReservaNaoAceita,
  SimulacaoReservaNaoEncontrada,
} from "./resultado-da-simulacao.ts";
import {
  CODIGO_SIMULACAO_INDISPONIVEL,
  SimuladorDePagamento,
  type ClienteDoPagamento,
} from "./simulador-de-pagamento.ts";

const status = (extra: Partial<StatusDoPagamento>): StatusDoPagamento => ({
  reservaId: "r1",
  statusPagamento: "PENDENTE",
  statusReserva: "PENDENTE_PAGAMENTO",
  ...extra,
});

function simulador(opcoes: { post?: () => Promise<unknown>; status?: () => Promise<StatusDoPagamento> }) {
  const chamadas: string[] = [];
  const cliente: ClienteDoPagamento = {
    post: async (url) => {
      chamadas.push(url);
      return (opcoes.post ?? (async () => ({})))();
    },
    status: opcoes.status ?? (async () => status({})),
  };
  return { chamadas, sim: new SimuladorDePagamento(cliente) };
}

// Como o api-cliente monta o erro: 404 em HTML (rota que não existe) vira UNKNOWN com status 404.
const erro = (status: number, code: string) => new ApiError(code, "mensagem", undefined, status);

test("200: chama o caminho da simulação e confirma pela rota 17", async () => {
  const { chamadas, sim } = simulador({
    status: async () => status({ statusPagamento: "APROVADO", statusReserva: "CONFIRMADA" }),
  });
  const r = await sim.aprovar("r1");
  assert.deepEqual(chamadas, ["/api/pagamentos/r1/simular"]);
  assert.ok(r instanceof SimulacaoConfirmada);
  assert.equal(r.situacaoFinal(), "confirmado");
  assert.equal(r.aviso(), null);
});

test("200 mas a conferência ainda mostra pendente: continua e avisa", async () => {
  const r = await simulador({}).sim.aprovar("r1");
  assert.ok(r instanceof SimulacaoAindaPendente);
  assert.equal(r.situacaoFinal(), null);
  assert.equal(r.tomDoAviso(), "info");
});

test("200 mas a leitura do status falha: continua, a consulta da tela confere depois", async () => {
  const r = await simulador({ status: async () => Promise.reject(erro(500, "INTERNAL")) }).sim.aprovar("r1");
  assert.ok(r instanceof SimulacaoAindaPendente);
});

test("200 com reserva expirada ou paga sem reserva", async () => {
  const expirada = await simulador({ status: async () => status({ statusReserva: "EXPIRADA" }) }).sim.aprovar("r1");
  assert.ok(expirada instanceof SimulacaoEncerrada);
  const tardio = await simulador({
    status: async () => status({ statusPagamento: "APROVADO", statusReserva: "CANCELADA" }),
  }).sim.aprovar("r1");
  assert.ok(tardio instanceof SimulacaoPagaSemReserva);
});

test("404 em HTML (rota inexistente, code UNKNOWN) vira indisponível", async () => {
  const r = await simulador({ post: () => Promise.reject(erro(404, "UNKNOWN")) }).sim.aprovar("r1");
  assert.ok(r instanceof SimulacaoIndisponivel);
  assert.match(r.aviso() ?? "", /não está disponível/);
});

test("404 com NOT_FOUND é reserva inexistente ou de outro cliente, não rota ausente", async () => {
  const r = await simulador({ post: () => Promise.reject(erro(404, "NOT_FOUND")) }).sim.aprovar("r1");
  assert.ok(r instanceof SimulacaoReservaNaoEncontrada);
  assert.doesNotMatch(r.aviso() ?? "", /servidor/);
});

test("código SIMULACAO_INDISPONIVEL (modo não simulado) vira indisponível", async () => {
  const r = await simulador({ post: () => Promise.reject(erro(404, CODIGO_SIMULACAO_INDISPONIVEL)) }).sim.aprovar("r1");
  assert.ok(r instanceof SimulacaoIndisponivel);
});

test("409 de reserva já paga confere a rota 17 e confirma", async () => {
  const { sim } = simulador({
    post: () => Promise.reject(erro(409, "CONFLICT")),
    status: async () => status({ statusPagamento: "APROVADO", statusReserva: "CONFIRMADA" }),
  });
  assert.ok((await sim.aprovar("r1")) instanceof SimulacaoConfirmada);
});

test("409 de reserva vencida encerra; 409 sem pista diz que não aceita mais pagamento", async () => {
  const vencida = simulador({
    post: () => Promise.reject(erro(409, "CONFLICT")),
    status: async () => status({ statusReserva: "EXPIRADA" }),
  });
  assert.ok((await vencida.sim.aprovar("r1")) instanceof SimulacaoEncerrada);
  const semPista = simulador({ post: () => Promise.reject(erro(409, "CONFLICT")) });
  assert.ok((await semPista.sim.aprovar("r1")) instanceof SimulacaoReservaNaoAceita);
  const statusFalha = simulador({
    post: () => Promise.reject(erro(409, "CONFLICT")),
    status: async () => Promise.reject(erro(0, "NETWORK_ERROR")),
  });
  assert.ok((await statusFalha.sim.aprovar("r1")) instanceof SimulacaoReservaNaoAceita);
});

test("500 e rede caída mostram a mensagem do cliente da API", async () => {
  for (const e of [erro(500, "INTERNAL"), erro(0, "NETWORK_ERROR")]) {
    const r = await simulador({ post: () => Promise.reject(e) }).sim.aprovar("r1");
    assert.ok(r instanceof SimulacaoFalhou);
    assert.equal(r.aviso(), "mensagem");
    assert.equal(r.situacaoFinal(), null);
    assert.equal(r.tomDoAviso(), "erro");
  }
});

test("erro que não é ApiError nunca vaza: vira falha genérica", async () => {
  const r = await simulador({ post: () => Promise.reject(new TypeError("x")) }).sim.aprovar("r1");
  assert.ok(r instanceof SimulacaoFalhou);
});
