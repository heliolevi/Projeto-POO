import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { CodigoRepetido } from "../domain/erros.ts";
import { calcularValorAluguel } from "../../../shared/dominio/preco-aluguel.ts";
import { criarBancoFalso } from "./banco-falso.ts";
import { criarCriarReserva } from "./criar-reserva.ts";
import type { SessaoCliente } from "./portas.ts";

const A: SessaoCliente = { perfil: "CLIENTE", usuarioId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const B: SessaoCliente = { perfil: "CLIENTE", usuarioId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const TIPO = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const INATIVO = "9f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
// "agora" fixo: 14/11/2026, 08:00 em São Luís
const AGORA = new Date("2026-11-14T11:00:00.000Z");
const CORPO = { tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T13:00:00-03:00" };
const PRECOS = { precoHoraCentavos: 1000, precoDiaCentavos: 5000 };
// período da CORPO em UTC (09:00 a 13:00 em São Luís)
const OCUPA = { inicio: new Date("2026-11-14T13:00:00.000Z"), fim: new Date("2026-11-14T15:00:00.000Z") };

function montar({ unidades = 2, codigos = ["BIC-AAAAAA", "BIC-BBBBBB", "BIC-CCCCCC"] } = {}) {
  const banco = criarBancoFalso(() => AGORA);
  banco.adicionarTipo({ id: TIPO, nome: "Urbana", ...PRECOS, valorCaucaoCentavos: 15000 });
  banco.adicionarTipo({ id: INATIVO, nome: "Antiga", ...PRECOS, valorCaucaoCentavos: 0, ativo: false });
  for (let i = 1; i <= unidades; i++) {
    banco.adicionarUnidade({ id: `bike-${i}`, tipoId: TIPO, codigo: `BIC-00${i}` });
  }
  const fila = [...codigos];
  const criar = criarCriarReserva({
    transacao: banco.transacao,
    agora: () => AGORA,
    gerarCodigo: () => fila.shift() ?? `BIC-EXTRA${fila.length}`,
    calcularValorAluguel,
  });
  return { banco, criar };
}

test("cria a reserva pendente com período, valor e caução congelados e o prazo de 15 minutos", async () => {
  const { banco, criar } = montar();
  const r = await criar(A, CORPO);
  assert.equal(r.status, "PENDENTE_PAGAMENTO");
  assert.equal(r.codigo, "BIC-AAAAAA");
  assert.deepEqual(r.tipo, { id: TIPO, nome: "Urbana" });
  assert.deepEqual(r.ponto, banco.ponto);
  assert.deepEqual(r.periodo, { inicio: "2026-11-14T12:00:00.000Z", fim: "2026-11-14T16:00:00.000Z" });
  assert.equal(r.valorAluguelCentavos, 4000); // 4 h x R$ 10,00
  assert.equal(r.valorCaucaoCentavos, 15000);
  assert.equal(r.expiraEm, "2026-11-14T11:15:00.000Z");
  assert.equal(r.criadaEm, "2026-11-14T11:00:00.000Z");
  assert.equal(banco.todasAsReservas().length, 1);
  assert.equal(banco.todasAsReservas()[0].clienteId, A.usuarioId);
});

test("o cliente nunca vê o código da unidade escolhida", async () => {
  const { criar } = montar();
  const r = await criar(A, CORPO);
  assert.doesNotMatch(JSON.stringify(r), /bike-1|BIC-001|bicicleta/i);
});

test("o valor é do servidor: valor, bicicletaId e clienteId do corpo são ignorados", async () => {
  const { banco, criar } = montar();
  const r = await criar(A, {
    ...CORPO,
    valorAluguelCentavos: 1,
    valorCaucaoCentavos: 0,
    bicicletaId: "bike-2",
    clienteId: B.usuarioId,
  });
  assert.equal(r.valorAluguelCentavos, 4000);
  assert.equal(r.valorCaucaoCentavos, 15000);
  assert.equal(banco.todasAsReservas()[0].bicicletaId, "bike-1");
  assert.equal(banco.todasAsReservas()[0].clienteId, A.usuarioId);
});

test("vai ao banco na ordem certa: expira as vencidas, confere o tipo, escolhe a unidade, grava", async () => {
  const { banco, criar } = montar();
  await criar(A, CORPO);
  assert.deepEqual(banco.log, ["BEGIN", "expirarVencidas", "buscarTipo", "escolherUnidade", "inserir", "COMMIT"]);
});

test("corpo inválido responde 400 com details e nem abre transação", async () => {
  const { banco, criar } = montar();
  await assert.rejects(
    criar(A, { tipoId: "x", inicio: "2026-11-14T07:00:00-03:00", fim: "2026-11-14T07:30:00-03:00" }),
    (erro: unknown) => {
      assert.ok(erro instanceof ValidationError);
      assert.deepEqual(Object.keys(erro.details as object).sort(), ["fim", "inicio", "tipoId"]);
      return true;
    },
  );
  assert.deepEqual(banco.log, []);
});

test("tipo inexistente ou inativo responde 404 e não grava nada", async () => {
  const { banco, criar } = montar();
  for (const tipoId of ["7f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f", INATIVO]) {
    await assert.rejects(criar(A, { ...CORPO, tipoId }), NotFoundError);
  }
  assert.equal(banco.todasAsReservas().length, 0);
});

test("sem unidade livre no período responde 409 e não grava nada", async () => {
  const { banco, criar } = montar({ unidades: 1 });
  await criar(A, CORPO);
  await assert.rejects(criar(B, CORPO), ConflictError);
  assert.equal(banco.todasAsReservas().length, 1);
});

test("a última unidade vai para um cliente só: o outro recebe 409", async () => {
  const { banco, criar } = montar({ unidades: 1 });
  const resultados = await Promise.allSettled([criar(A, CORPO), criar(B, CORPO)]);
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
  const falha = resultados.find((r) => r.status === "rejected");
  assert.ok(falha && falha.status === "rejected" && falha.reason instanceof ConflictError);
  assert.equal(banco.todasAsReservas().length, 1);
});

test("duas unidades, dois clientes: cada um fica com uma unidade diferente", async () => {
  const { banco, criar } = montar({ unidades: 2 });
  await criar(A, CORPO);
  await criar(B, CORPO);
  const usadas = banco.todasAsReservas().map((r) => r.bicicletaId).sort();
  assert.deepEqual(usadas, ["bike-1", "bike-2"]);
});

test("períodos que só se encostam não competem pela mesma unidade", async () => {
  const { banco, criar } = montar({ unidades: 1 });
  await criar(A, CORPO);
  await criar(B, { ...CORPO, inicio: CORPO.fim, fim: "2026-11-14T17:00:00-03:00" });
  assert.equal(banco.todasAsReservas().length, 2);
});

test("se o banco recusa por sobreposição (23P01), tenta outra unidade", async () => {
  const { banco, criar } = montar({ unidades: 2 });
  // a unidade 1 está ocupada por outro cliente, mas a escolha não a enxerga (RLS ou corrida)
  banco.semear({ id: "r0", clienteId: B.usuarioId, bicicletaId: "bike-1", ...OCUPA });
  banco.estado.escolheIgnorandoReservas = true;
  const r = await criar(A, CORPO);
  assert.equal(r.status, "PENDENTE_PAGAMENTO");
  assert.equal(banco.log.filter((l) => l === "inserir").length, 2, "uma tentativa recusada e uma aceita");
  assert.equal(banco.todasAsReservas().find((x) => x.id === r.id)?.bicicletaId, "bike-2");
});

test("se todas as unidades recusam por sobreposição, responde 409 e desfaz tudo", async () => {
  const { banco, criar } = montar({ unidades: 3 });
  for (const i of [1, 2, 3]) {
    banco.semear({ id: `r${i}`, clienteId: B.usuarioId, bicicletaId: `bike-${i}`, ...OCUPA });
  }
  banco.estado.escolheIgnorandoReservas = true;
  await assert.rejects(criar(A, CORPO), ConflictError);
  assert.equal(banco.todasAsReservas().length, 3, "só as 3 que já existiam");
  assert.equal(banco.log.filter((l) => l === "inserir").length, 3, "tentou cada unidade uma vez");
  assert.equal(banco.log.at(-1), "ROLLBACK");
});

test("a tentativa recusada não repete a mesma unidade (a lista de excluídas cresce)", async () => {
  const { banco, criar } = montar({ unidades: 4 });
  for (const i of [1, 2, 3]) {
    banco.semear({ id: `r${i}`, clienteId: B.usuarioId, bicicletaId: `bike-${i}`, ...OCUPA });
  }
  banco.estado.escolheIgnorandoReservas = true;
  const r = await criar(A, CORPO);
  assert.equal(banco.todasAsReservas().find((x) => x.id === r.id)?.bicicletaId, "bike-4");
});

test("código repetido (23505) sorteia outro código e tenta a mesma unidade", async () => {
  const { banco, criar } = montar({ codigos: ["BIC-AAAAAA", "BIC-NOVO22"] });
  banco.estado.codigosOcupados.add("BIC-AAAAAA");
  const r = await criar(A, CORPO);
  assert.equal(r.codigo, "BIC-NOVO22");
  assert.equal(banco.todasAsReservas()[0].bicicletaId, "bike-1");
});

test("código repetido sem parar não vira laço infinito: desiste depois de algumas tentativas", async () => {
  const { banco, criar } = montar({ codigos: [] });
  // todo código sorteado "já existe"
  banco.estado.codigosOcupados = new Proxy(banco.estado.codigosOcupados, {
    get: (alvo, p) => (p === "has" ? () => true : Reflect.get(alvo, p, alvo)),
  });
  await assert.rejects(criar(A, CORPO), CodigoRepetido);
  assert.equal(banco.todasAsReservas().length, 0);
  assert.ok(banco.log.filter((l) => l === "inserir").length <= 10);
});

test("pendente vencida que ninguém listou não bloqueia a nova reserva (CT-RES-17)", async () => {
  const { banco, criar } = montar({ unidades: 1 });
  banco.semear({
    id: "velha",
    clienteId: B.usuarioId,
    bicicletaId: "bike-1",
    status: "PENDENTE_PAGAMENTO",
    criadoEm: new Date(AGORA.getTime() - 16 * 60 * 1000),
    inicio: new Date("2026-11-14T12:00:00.000Z"),
    fim: new Date("2026-11-14T16:00:00.000Z"),
  });
  const r = await criar(A, CORPO);
  assert.equal(r.status, "PENDENTE_PAGAMENTO");
  assert.equal(banco.todasAsReservas().find((x) => x.id === "velha")?.status, "EXPIRADA");
});

test("pendente ainda dentro dos 15 minutos continua segurando a unidade", async () => {
  const { criar, banco } = montar({ unidades: 1 });
  banco.semear({
    id: "nova",
    clienteId: B.usuarioId,
    bicicletaId: "bike-1",
    status: "PENDENTE_PAGAMENTO",
    criadoEm: new Date(AGORA.getTime() - 14 * 60 * 1000),
    inicio: new Date("2026-11-14T12:00:00.000Z"),
    fim: new Date("2026-11-14T16:00:00.000Z"),
  });
  await assert.rejects(criar(A, CORPO), ConflictError);
});

test("unidade fora de DISPONIVEL (manutenção, bloqueada, baixada) não é reservada", async () => {
  const { banco, criar } = montar({ unidades: 0 });
  for (const [i, status] of ["MANUTENCAO", "BLOQUEADA", "BAIXADA"].entries()) {
    banco.adicionarUnidade({ id: `m${i}`, tipoId: TIPO, status });
  }
  await assert.rejects(criar(A, CORPO), ConflictError);
});

test("erro inesperado do banco sobe como está (vira 500) e desfaz a transação", async () => {
  const { banco } = montar();
  const boom = new Error("conexão caiu");
  const criarComFalha = criarCriarReserva({
    transacao: (sessao, fn) =>
      banco.transacao(sessao, (op) =>
        fn({
          ...op,
          inserir: async () => {
            throw boom;
          },
        }),
      ),
    agora: () => AGORA,
    gerarCodigo: () => "BIC-AAAAAA",
    calcularValorAluguel,
  });
  await assert.rejects(criarComFalha(A, CORPO), boom);
  assert.equal(banco.todasAsReservas().length, 0);
});
