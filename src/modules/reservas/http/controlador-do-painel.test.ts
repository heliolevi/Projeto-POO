import assert from "node:assert/strict";
import { test } from "node:test";
import type { PerfilSessao } from "../../../shared/db/sessao.ts";
import { UnauthorizedError } from "../../../shared/http/errors.ts";
import { PainelDeReservas, type ExecutorDoPainel, type SessaoDaEquipe } from "../application/painel-de-reservas.ts";
import { ReservaDoPainel } from "../domain/reserva-do-painel.ts";
import { ControladorDoPainel } from "./controlador-do-painel.ts";

// Provam que a rota 25 exige sessão (401) e perfil OPERADOR ou ADMIN (403) ANTES de tocar o banco.
// O PerfisPermitidos é o de verdade. O exigirSessao é de mentira: modela só o que o módulo contas
// garante (sem token ou token inválido é 401; com token, devolve o perfil da conta).

const CONTAS: Record<string, { usuarioId: string; perfil: PerfilSessao }> = {
  "token-admin": { usuarioId: "aaaaaaaa-0000-4000-8000-000000000001", perfil: "ADMIN" },
  "token-cliente": { usuarioId: "bbbbbbbb-0000-4000-8000-000000000002", perfil: "CLIENTE" },
  "token-operador": { usuarioId: "cccccccc-0000-4000-8000-000000000003", perfil: "OPERADOR" },
};

const reserva = () =>
  new ReservaDoPainel({
    id: "r-1", codigo: "BIC-1", status: "CONFIRMADA", clienteId: "c-1", clienteNome: "Maria", tipoId: "t-1", tipoNome: "Urbana",
    bicicletaId: "b-1", bicicletaCodigo: "BIC-003", inicio: new Date("2026-11-14T12:00:00Z"), fim: new Date("2026-11-14T16:00:00Z"), valorAluguelCentavos: 4000,
  });

function montar(falhaNoBanco?: Error) {
  const aberturas: SessaoDaEquipe[] = [];
  const consultas: { status: unknown; data: string | null }[] = [];
  const executor: ExecutorDoPainel = {
    async executar(sessao, fn) {
      aberturas.push(sessao);
      return fn({
        async expirarVencidas() {},
        async listar(filtro) {
          if (falhaNoBanco) throw falhaNoBanco;
          consultas.push({ status: filtro.status, data: filtro.inicioDoDia?.toISOString() ?? null });
          return [reserva()];
        },
      });
    },
  };
  const controlador = new ControladorDoPainel({
    exigirSessao: async (request) => {
      const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
      const conta = token ? CONTAS[token] : undefined;
      if (!conta) throw new UnauthorizedError("Sessão inválida ou expirada.");
      return conta;
    },
    painel: new PainelDeReservas(executor),
  });
  return { controlador, aberturas, consultas };
}

const pedido = (consulta = "", token?: string) =>
  new Request(`http://localhost/api/admin/reservas${consulta}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

test("sem token responde 401 e não abre transação no banco", async () => {
  const m = montar();
  const r = await m.controlador.listar(pedido());
  assert.equal(r.status, 401);
  assert.equal(((await r.json()) as { error: { code: string } }).error.code, "UNAUTHORIZED");
  assert.equal(m.aberturas.length, 0);
});

test("token inválido responde 401", async () => {
  const m = montar();
  assert.equal((await m.controlador.listar(pedido("", "token-que-nao-existe"))).status, 401);
  assert.equal(m.aberturas.length, 0);
});

test("o cliente recebe 403 (a lista é da equipe) e o banco não é tocado", async () => {
  const m = montar();
  const r = await m.controlador.listar(pedido("", "token-cliente"));
  assert.equal(r.status, 403);
  assert.equal(((await r.json()) as { error: { code: string } }).error.code, "FORBIDDEN");
  assert.equal(m.aberturas.length, 0);
});

test("a ordem é 401 antes de 403 antes de 400: filtro inválido de cliente é 403, de visitante é 401", async () => {
  const m = montar();
  assert.equal((await m.controlador.listar(pedido("?status=x"))).status, 401);
  assert.equal((await m.controlador.listar(pedido("?status=x", "token-cliente"))).status, 403);
  assert.equal((await m.controlador.listar(pedido("?status=x", "token-operador"))).status, 400);
});

test("operador e administrador recebem 200 com { data } no formato do contrato", async () => {
  for (const token of ["token-operador", "token-admin"]) {
    const m = montar();
    const r = await m.controlador.listar(pedido("", token));
    assert.equal(r.status, 200);
    const corpo = (await r.json()) as { data: { id: string; cliente: { nome: string }; bicicleta: { codigo: string } }[] };
    assert.equal(corpo.data.length, 1);
    assert.equal(corpo.data[0].cliente.nome, "Maria");
    assert.equal(corpo.data[0].bicicleta.codigo, "BIC-003");
    assert.equal(m.aberturas[0].perfil, CONTAS[token].perfil, "a sessão da equipe vai para o banco");
  }
});

test("a resposta nunca fica em cache", async () => {
  const r = await montar().controlador.listar(pedido("", "token-operador"));
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("repassa status e data da query ao filtro; ausente ou vazio quer dizer sem filtro", async () => {
  const m = montar();
  await m.controlador.listar(pedido("?status=EM_ANDAMENTO&data=2026-11-14", "token-operador"));
  await m.controlador.listar(pedido("?status=&data=", "token-operador"));
  await m.controlador.listar(pedido("", "token-operador"));
  assert.deepEqual(m.consultas, [
    { status: "EM_ANDAMENTO", data: "2026-11-14T03:00:00.000Z" },
    { status: null, data: null },
    { status: null, data: null },
  ]);
});

test("filtro inválido é 400 com details por campo, sem tocar o banco", async () => {
  const m = montar();
  const r = await m.controlador.listar(pedido("?status=confirmada&data=2026-02-30", "token-operador"));
  assert.equal(r.status, 400);
  const corpo = (await r.json()) as { error: { code: string; details: Record<string, string> } };
  assert.equal(corpo.error.code, "VALIDATION_ERROR");
  assert.deepEqual(Object.keys(corpo.error.details).sort(), ["data", "status"]);
  assert.equal(m.aberturas.length, 0);
});

test("parâmetro repetido vale o primeiro e parâmetro desconhecido é ignorado", async () => {
  const m = montar();
  const r = await m.controlador.listar(pedido("?status=CONFIRMADA&status=CANCELADA&foo=bar&id=1", "token-operador"));
  assert.equal(r.status, 200);
  assert.equal(m.consultas[0].status, "CONFIRMADA");
});

test("estresse: query de 20 mil caracteres, encoding quebrado e injeção de SQL viram 400, nunca 500", async () => {
  const m = montar();
  const grande = "a".repeat(20_000);
  for (const consulta of [`?status=${grande}`, `?data=${grande}`, "?status=%E0%A4%A", "?data=%00", "?status=' OR 1=1 --", "?data=2026-11-14';DROP TABLE reserva;--", "?status[]=CONFIRMADA"]) {
    const r = await m.controlador.listar(pedido(consulta, "token-operador"));
    assert.ok([200, 400].includes(r.status), `${consulta.slice(0, 40)} -> ${r.status}`);
  }
});

test("erro inesperado do banco vira 500 genérico, sem vazar a mensagem", async () => {
  const antes = console.error;
  console.error = () => {};
  try {
    const m = montar(new Error("password authentication failed for user app_login"));
    const r = await m.controlador.listar(pedido("", "token-operador"));
    assert.equal(r.status, 500);
    const texto = JSON.stringify(await r.json());
    assert.ok(!texto.includes("password") && !texto.includes("app_login"));
    assert.deepEqual(JSON.parse(texto), { error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" } });
  } finally {
    console.error = antes;
  }
});

test("estresse: 200 chamadas ao mesmo tempo, de perfis misturados, cada uma recebe a resposta certa", async () => {
  const m = montar();
  const tokens = ["token-operador", "token-admin", "token-cliente", undefined] as const;
  const respostas = await Promise.all(Array.from({ length: 200 }, (_, i) => m.controlador.listar(pedido("", tokens[i % 4]))));
  const esperado = [200, 200, 403, 401];
  respostas.forEach((r, i) => assert.equal(r.status, esperado[i % 4], `chamada ${i}`));
  assert.equal(m.aberturas.length, 100);
});

test("o controlador é encapsulado: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(montar().controlador), []);
});
