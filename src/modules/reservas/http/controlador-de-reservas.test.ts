import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PerfilSessao } from "../../../shared/db/sessao.ts";
import { CalculadoraDeAluguel } from "../../../shared/dominio/preco-aluguel.ts";
import { TooManyRequestsError, UnauthorizedError } from "../../../shared/http/errors.ts";
import { criarBancoFalso } from "../application/banco-falso.ts";
import { ReservaService } from "../application/reserva-service.ts";
import { ControladorDeReservas, LIMITE_RESERVAS_POR_USUARIO } from "./controlador-de-reservas.ts";

// Provam as rotas 12 a 15 com o PerfisPermitidos de verdade: 401 sem sessão, 403 para a equipe, e o
// banco só é tocado depois. O exigirSessao é de mentira (modela só o que o módulo contas garante).

const CONTAS: Record<string, { usuarioId: string; perfil: PerfilSessao }> = {
  cliente: { usuarioId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", perfil: "CLIENTE" },
  outro: { usuarioId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", perfil: "CLIENTE" },
  operador: { usuarioId: "cccccccc-0000-4000-8000-000000000003", perfil: "OPERADOR" },
  admin: { usuarioId: "dddddddd-0000-4000-8000-000000000004", perfil: "ADMIN" },
};
const TIPO = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const AGORA = new Date("2026-11-14T11:00:00.000Z");
const CORPO = { tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T13:00:00-03:00" };

function montar(opcoes: { limite?: Error } = {}) {
  const banco = criarBancoFalso(() => AGORA);
  banco.adicionarTipo({ id: TIPO, nome: "Urbana", precoHoraCentavos: 1000, precoDiaCentavos: 5000, valorCaucaoCentavos: 15000 });
  banco.adicionarUnidade({ id: "bike-1", tipoId: TIPO });
  const eventos: string[] = [];
  const limites: Array<{ chave: string; regra: unknown }> = [];
  const lidos: Request[] = [];
  let sorteados = 0;
  const controlador = new ControladorDeReservas({
    exigirSessao: async (request) => {
      eventos.push("sessao");
      const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
      const conta = token ? CONTAS[token] : undefined;
      if (!conta) throw new UnauthorizedError("Sessão inválida ou expirada.");
      return conta;
    },
    limite: {
      async exigirDentroDoLimite(chave, regra) {
        eventos.push("limite");
        limites.push({ chave, regra });
        if (opcoes.limite) throw opcoes.limite;
      },
    },
    lerJson: async (request) => {
      eventos.push("corpo");
      lidos.push(request);
      return request.json();
    },
    reservas: new ReservaService({
      executor: {
        executar: (sessao, fn) => {
          eventos.push("banco");
          return banco.executor.executar(sessao, fn);
        },
      },
      agora: () => AGORA,
      geradorDeCodigo: { gerar: () => `BIC-A${String(++sorteados).padStart(5, "0")}` },
      calculadora: CalculadoraDeAluguel.padrao,
    }),
  });
  return { controlador, banco, eventos, limites, lidos };
}

const pedido = (token?: string, corpo?: unknown, caminho = "/api/reservas") =>
  new Request(`http://localhost${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

// O que os testes leem da resposta (a reserva, ou a lista, que também tem length).
type Dados = { id: string; status: string; codigo: string; pagamento: unknown; length: number };
const json = async (r: Response) =>
  (await r.json()) as { data: Dados; error?: { code: string; message: string; details?: unknown } };

// O banco falso numera as reservas que cria ("reserva-1"), que não são UUID; a leitura e o
// cancelamento por id exigem UUID, então estas reservas já nascem no banco com um.
function semear(m: ReturnType<typeof montar>) {
  const id = "11111111-1111-4111-8111-111111111111";
  m.banco.semear({ id, clienteId: CONTAS.cliente.usuarioId, bicicletaId: "bike-1", status: "PENDENTE_PAGAMENTO", criadoEm: AGORA });
  return { id };
}

describe("ControladorDeReservas", () => {
  test("encapsulamento: a instância não expõe campos", () => {
    assert.deepEqual(Object.keys(montar().controlador), []);
  });

  test("o limite do contrato: 20 por hora por usuário", () => {
    assert.deepEqual(LIMITE_RESERVAS_POR_USUARIO, { max: 20, janelaSegundos: 3600 });
  });

  test("sem token as quatro rotas dão 401 e o banco nem é tocado", async () => {
    const m = montar();
    const id = "11111111-1111-4111-8111-111111111111";
    const respostas = [
      await m.controlador.criar(pedido(undefined, CORPO)),
      await m.controlador.listar(pedido()),
      await m.controlador.detalhar(pedido(), id),
      await m.controlador.cancelar(pedido(undefined, {}), id),
    ];
    for (const r of respostas) {
      assert.equal(r.status, 401);
      assert.equal((await json(r)).error?.code, "UNAUTHORIZED");
    }
    assert.ok(!m.eventos.includes("banco") && !m.eventos.includes("limite") && !m.eventos.includes("corpo"));
  });

  test("operador e admin recebem 403 nas quatro rotas, antes do limite, do corpo e do banco", async () => {
    const m = montar();
    const id = "11111111-1111-4111-8111-111111111111";
    for (const token of ["operador", "admin"]) {
      const respostas = [
        await m.controlador.criar(pedido(token, CORPO)),
        await m.controlador.listar(pedido(token)),
        await m.controlador.detalhar(pedido(token), id),
        await m.controlador.cancelar(pedido(token, {}), id),
      ];
      for (const r of respostas) {
        assert.equal(r.status, 403, token);
        assert.equal((await json(r)).error?.code, "FORBIDDEN");
      }
    }
    assert.ok(!m.eventos.includes("banco") && !m.eventos.includes("limite") && !m.eventos.includes("corpo"));
  });

  test("criar: 201 com Cache-Control no-store, e a ordem é sessão, limite, corpo, banco", async () => {
    const m = montar();
    const r = await m.controlador.criar(pedido("cliente", CORPO));
    assert.equal(r.status, 201);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const corpo = await json(r);
    assert.equal(corpo.data.status, "PENDENTE_PAGAMENTO");
    assert.equal(corpo.data.codigo, "BIC-A00001");
    assert.deepEqual(m.eventos.slice(0, 4), ["sessao", "limite", "corpo", "banco"]);
    assert.equal(m.eventos.indexOf("sessao") < m.eventos.indexOf("limite"), true);
  });

  test("criar: o limite é por usuário, com a chave e a regra do contrato", async () => {
    const m = montar();
    await m.controlador.criar(pedido("cliente", CORPO));
    assert.deepEqual(m.limites, [
      { chave: `reservas:usuario:${CONTAS.cliente.usuarioId}`, regra: { max: 20, janelaSegundos: 3600 } },
    ]);
  });

  test("criar: limite estourado dá 429 e nem lê o corpo nem abre o banco", async () => {
    const m = montar({ limite: new TooManyRequestsError(30) });
    const r = await m.controlador.criar(pedido("cliente", CORPO));
    assert.equal(r.status, 429);
    assert.ok(!m.eventos.includes("corpo") && !m.eventos.includes("banco"));
  });

  test("criar: corpo inválido dá 400 com details por campo", async () => {
    const m = montar();
    const r = await m.controlador.criar(pedido("cliente", { tipoId: "x" }));
    assert.equal(r.status, 400);
    const corpo = await json(r);
    assert.equal(corpo.error?.code, "VALIDATION_ERROR");
    assert.ok((corpo.error?.details as Record<string, string>).tipoId);
    assert.ok(!m.eventos.includes("banco"));
  });

  test("criar: sem unidade livre é 409", async () => {
    const m = montar();
    assert.equal((await m.controlador.criar(pedido("cliente", CORPO))).status, 201);
    assert.equal((await m.controlador.criar(pedido("outro", CORPO))).status, 409);
  });

  test("listar: repassa o ?status= e devolve só as do cliente, em { data }", async () => {
    const m = montar();
    await m.controlador.criar(pedido("cliente", CORPO));
    const r = await m.controlador.listar(pedido("cliente", undefined, "/api/reservas?status=PENDENTE_PAGAMENTO"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal((await json(r)).data.length, 1);
    const vazia = await m.controlador.listar(pedido("cliente", undefined, "/api/reservas?status=CANCELADA"));
    assert.deepEqual((await json(vazia)).data, []);
    const deOutro = await m.controlador.listar(pedido("outro"));
    assert.deepEqual((await json(deOutro)).data, []);
  });

  test("listar: status inválido é 400", async () => {
    const m = montar();
    const r = await m.controlador.listar(pedido("cliente", undefined, "/api/reservas?status=XPTO"));
    assert.equal(r.status, 400);
  });

  test("detalhar: a própria reserva é 200; a de outro cliente e id que não é UUID são 404", async () => {
    const m = montar();
    const criada = semear(m);
    const ok = await m.controlador.detalhar(pedido("cliente"), criada.id);
    assert.equal(ok.status, 200);
    assert.equal((await json(ok)).data.pagamento, null);
    const deOutro = await m.controlador.detalhar(pedido("outro"), criada.id);
    assert.equal(deOutro.status, 404);
    assert.equal((await json(deOutro)).error?.message, "Reserva não encontrada.");
    assert.equal((await m.controlador.detalhar(pedido("cliente"), "nao-e-uuid")).status, 404);
  });

  test("cancelar: 200 e CANCELADA; de novo é 409; de outro cliente é 404", async () => {
    const m = montar();
    const criada = semear(m);
    assert.equal((await m.controlador.cancelar(pedido("outro", {}), criada.id)).status, 404);
    const r = await m.controlador.cancelar(pedido("cliente", {}), criada.id);
    assert.equal(r.status, 200);
    assert.equal((await json(r)).data.status, "CANCELADA");
    assert.equal((await m.controlador.cancelar(pedido("cliente", {}), criada.id)).status, 409);
  });

  test("cancelar não lê o corpo da requisição", async () => {
    const m = montar();
    const criada = semear(m);
    m.eventos.length = 0;
    await m.controlador.cancelar(pedido("cliente", {}), criada.id);
    assert.ok(!m.eventos.includes("corpo"));
  });

  test("erro inesperado vira 500 genérico, sem vazar a mensagem", async () => {
    const controlador = new ControladorDeReservas({
      exigirSessao: async () => CONTAS.cliente,
      limite: { exigirDentroDoLimite: async () => {} },
      lerJson: async () => ({}),
      reservas: {
        criarReserva: async () => {
          throw new Error("senha do banco: segredo");
        },
        listarReservas: async () => {
          throw new Error("senha do banco: segredo");
        },
        buscarReserva: async () => {
          throw new Error("senha do banco: segredo");
        },
        cancelarReserva: async () => {
          throw new Error("senha do banco: segredo");
        },
      },
    });
    const id = "11111111-1111-4111-8111-111111111111";
    for (const r of [
      await controlador.criar(pedido("x", {})),
      await controlador.listar(pedido("x")),
      await controlador.detalhar(pedido("x"), id),
      await controlador.cancelar(pedido("x", {}), id),
    ]) {
      assert.equal(r.status, 500);
      assert.doesNotMatch(JSON.stringify(await json(r)), /segredo/);
    }
  });

  test("estresse: 30 clientes criando ao mesmo tempo, cada um com a sua sessão, não se misturam", async () => {
    const m = montar();
    for (let i = 2; i <= 30; i++) m.banco.adicionarUnidade({ id: `bike-${i}`, tipoId: TIPO });
    const tokens = Array.from({ length: 30 }, (_, i) => `u${i}`);
    for (const [i, t] of tokens.entries()) {
      CONTAS[t] = { usuarioId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, perfil: "CLIENTE" };
    }
    try {
      const respostas = await Promise.all(tokens.map((t) => m.controlador.criar(pedido(t, CORPO))));
      assert.ok(respostas.every((r) => r.status === 201));
      const donos = m.banco.todasAsReservas().map((r) => r.clienteId).sort();
      assert.deepEqual(donos, tokens.map((t) => CONTAS[t].usuarioId).sort());
    } finally {
      for (const t of tokens) delete CONTAS[t];
    }
  });
});
