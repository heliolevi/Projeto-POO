import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../../../shared/http/errors.ts";
import { FiltroDoPainel } from "../domain/filtro-do-painel.ts";
import { ReservaDoPainel, type DadosDaReservaDoPainel } from "../domain/reserva-do-painel.ts";
import { OperacoesDoPainelNoBanco, RepositorioDoPainel, LIMITE_DO_PAINEL } from "../infrastructure/repositorio-do-painel.ts";
import {
  PainelDeReservas,
  type ExecutorDoPainel,
  type OperacoesDoPainel,
  type SessaoDaEquipe,
} from "./painel-de-reservas.ts";

const SESSAO: SessaoDaEquipe = { perfil: "OPERADOR", usuarioId: "cccccccc-0000-4000-8000-000000000003" };

const reserva = (extra: Partial<DadosDaReservaDoPainel> = {}) =>
  new ReservaDoPainel({
    id: "r-1", codigo: "BIC-1", status: "CONFIRMADA", clienteId: "c-1", clienteNome: "Maria",
    tipoId: "t-1", tipoNome: "Urbana", bicicletaId: "b-1", bicicletaCodigo: "BIC-003",
    inicio: new Date("2026-11-14T12:00:00Z"), fim: new Date("2026-11-14T16:00:00Z"), valorAluguelCentavos: 4000, ...extra,
  });

// Executor de mentira: anota a ordem das chamadas e devolve as reservas combinadas.
function executorFalso(reservas: ReservaDoPainel[] = [reserva()]) {
  const eventos: string[] = [];
  const filtros: FiltroDoPainel[] = [];
  const sessoes: SessaoDaEquipe[] = [];
  const operacoes: OperacoesDoPainel = {
    async expirarVencidas() {
      eventos.push("expirar");
    },
    async listar(filtro) {
      eventos.push("listar");
      filtros.push(filtro);
      return reservas;
    },
  };
  const executor: ExecutorDoPainel = {
    async executar(sessao, fn) {
      eventos.push("abre");
      sessoes.push(sessao);
      try {
        return await fn(operacoes);
      } finally {
        eventos.push("fecha");
      }
    },
  };
  return { executor, eventos, filtros, sessoes };
}

// ---------------------------------------------------------------- PainelDeReservas
test("expira as pendentes vencidas e só depois lista, tudo na mesma transação", async () => {
  const f = executorFalso();
  await new PainelDeReservas(f.executor).listar(SESSAO, {});
  assert.deepEqual(f.eventos, ["abre", "expirar", "listar", "fecha"]);
});

test("devolve as reservas já no formato do contrato", async () => {
  const f = executorFalso([reserva({ id: "a" }), reserva({ id: "b" })]);
  const lista = await new PainelDeReservas(f.executor).listar(SESSAO, {});
  assert.deepEqual(lista.map((r) => r.id), ["a", "b"]);
  assert.deepEqual(Object.keys(lista[0]).sort(), ["bicicleta", "cliente", "codigo", "id", "periodo", "status", "tipo", "valorAluguelCentavos"]);
});

test("lista vazia é uma resposta válida, não um erro", async () => {
  assert.deepEqual(await new PainelDeReservas(executorFalso([]).executor).listar(SESSAO, {}), []);
});

test("repassa a sessão da equipe e o filtro já validado ao banco", async () => {
  const f = executorFalso();
  await new PainelDeReservas(f.executor).listar(SESSAO, { status: "EM_ANDAMENTO", data: "2026-11-14" });
  assert.equal(f.sessoes[0], SESSAO);
  assert.equal(f.filtros[0].status, "EM_ANDAMENTO");
  assert.equal(f.filtros[0].inicioDoDia?.toISOString(), "2026-11-14T03:00:00.000Z");
});

test("filtro inválido é 400 com details por campo e o banco nem é aberto", async () => {
  const f = executorFalso();
  await assert.rejects(new PainelDeReservas(f.executor).listar(SESSAO, { status: "x", data: "y" }), (erro: unknown) => {
    assert.ok(erro instanceof ValidationError);
    assert.equal(erro.status, 400);
    assert.deepEqual(Object.keys(erro.details as object).sort(), ["data", "status"]);
    return true;
  });
  assert.deepEqual(f.eventos, [], "nenhuma transação aberta");
});

test("erro do banco sobe (a transação é fechada) e não vira lista vazia", async () => {
  const f = executorFalso();
  const quebrado: ExecutorDoPainel = {
    executar: (s, fn) => f.executor.executar(s, async (op) => fn({ ...op, listar: async () => { throw new Error("banco caiu"); } })),
  };
  await assert.rejects(new PainelDeReservas(quebrado).listar(SESSAO, {}), /banco caiu/);
  assert.deepEqual(f.eventos, ["abre", "expirar", "fecha"]);
});

test("estresse: 200 consultas ao mesmo tempo, cada uma com o seu filtro, não se misturam", async () => {
  const f = executorFalso();
  const painel = new PainelDeReservas(f.executor);
  const resultados = await Promise.allSettled(
    Array.from({ length: 200 }, (_, i) => painel.listar(SESSAO, i % 2 === 0 ? { status: "CONFIRMADA" } : { status: "invalido" })),
  );
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 100);
  assert.equal(resultados.filter((r) => r.status === "rejected").length, 100);
  assert.equal(f.filtros.length, 100);
});

// ---------------------------------------------------------------- OperacoesDoPainelNoBanco (SQL)
function clienteFalso(linhas: Record<string, unknown>[] = []) {
  const consultas: { sql: string; valores?: unknown[] }[] = [];
  return {
    consultas,
    client: {
      async query(sql: string, valores?: unknown[]) {
        consultas.push({ sql, valores });
        return { rows: linhas };
      },
    } as never,
  };
}

const LINHA = {
  id: "r-1", codigo: "BIC-1", status: "CONFIRMADA", cliente_id: "c-1", cliente_nome: "Maria", tipo_id: "t-1", tipo_nome: "Urbana",
  bicicleta_id: "b-1", bicicleta_codigo: "BIC-003", inicio: new Date("2026-11-14T12:00:00Z"), fim: new Date("2026-11-14T16:00:00Z"), valor_aluguel_centavos: 4000,
};

function filtro(parametros: { status?: unknown; data?: unknown }): FiltroDoPainel {
  const lido = FiltroDoPainel.validar(parametros);
  assert.ok("filtro" in lido);
  return lido.filtro;
}

test("expirarVencidas chama a função do banco, sem parâmetros", async () => {
  const c = clienteFalso();
  await new OperacoesDoPainelNoBanco(c.client).expirarVencidas();
  assert.deepEqual(c.consultas, [{ sql: "SELECT expirar_reservas_vencidas()", valores: undefined }]);
});

test("listar manda status e o intervalo do dia como parâmetros ($1, $2, $3), nunca dentro do SQL", async () => {
  const c = clienteFalso([LINHA]);
  await new OperacoesDoPainelNoBanco(c.client).listar(filtro({ status: "CONFIRMADA", data: "2026-11-14" }));
  assert.deepEqual(c.consultas[0].valores, ["CONFIRMADA", "2026-11-14T03:00:00.000Z", "2026-11-15T03:00:00.000Z"]);
  const { sql } = c.consultas[0];
  assert.ok(!sql.includes("CONFIRMADA") && !sql.includes("2026-11-14"), "valor do filtro fora do texto SQL");
  assert.match(sql, /\$1/);
  assert.match(sql, /\$2/);
  assert.match(sql, /\$3/);
});

test("sem filtro manda três nulos e o SQL tem limite", async () => {
  const c = clienteFalso([]);
  await new OperacoesDoPainelNoBanco(c.client).listar(filtro({}));
  assert.deepEqual(c.consultas[0].valores, [null, null, null]);
  assert.match(c.consultas[0].sql, new RegExp(`LIMIT ${LIMITE_DO_PAINEL}\\b`));
});

test("o SQL lê o cliente, a unidade e o tipo, ordena pelo início e usa só tabelas da equipe", async () => {
  const c = clienteFalso([]);
  await new OperacoesDoPainelNoBanco(c.client).listar(filtro({}));
  const { sql } = c.consultas[0];
  for (const trecho of ["u.nome", "b.codigo", "t.nome", "JOIN usuario u", "JOIN bicicleta b", "JOIN tipo_bicicleta t", "ORDER BY lower(r.periodo)"]) {
    assert.ok(sql.includes(trecho), trecho);
  }
  assert.ok(!/senha|cpf|email|cnpj/i.test(sql), "nada sensível do cliente é lido");
});

test("linha com dado ruim (status desconhecido ou período invertido) falha alto, não passa para a tela", async () => {
  for (const ruim of [{ status: "LIXO" }, { inicio: LINHA.fim, fim: LINHA.inicio }, { valor_aluguel_centavos: -5 }]) {
    const c = clienteFalso([{ ...LINHA, ...ruim }]);
    await assert.rejects(new OperacoesDoPainelNoBanco(c.client).listar(filtro({})), RangeError, JSON.stringify(ruim));
  }
});

test("converte as linhas do banco em ReservaDoPainel", async () => {
  const c = clienteFalso([LINHA]);
  const lista = await new OperacoesDoPainelNoBanco(c.client).listar(filtro({}));
  assert.equal(lista.length, 1);
  assert.ok(lista[0] instanceof ReservaDoPainel);
  assert.equal(lista[0].paraDto().bicicleta.codigo, "BIC-003");
});

// ---------------------------------------------------------------- RepositorioDoPainel
test("executar abre a transação do banco com a sessão da equipe e entrega as operações", async () => {
  const c = clienteFalso([]);
  const sessoes: unknown[] = [];
  const banco = {
    comSessao: async (sessao: unknown, fn: (client: never) => Promise<unknown>) => {
      sessoes.push(sessao);
      return fn(c.client);
    },
  };
  const repo = new RepositorioDoPainel(banco as never);
  const resultado = await repo.executar(SESSAO, async (op) => {
    await op.expirarVencidas();
    return "ok";
  });
  assert.equal(resultado, "ok");
  assert.equal(sessoes[0], SESSAO);
  assert.equal(c.consultas.length, 1);
});
