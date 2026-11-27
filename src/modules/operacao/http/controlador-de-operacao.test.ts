import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictError, UnauthorizedError } from "../../../shared/http/errors.ts";
import type { SessaoEquipe } from "../application/portas.ts";
import { ControladorDeOperacao } from "./controlador-de-operacao.ts";

// Provam a ORDEM das rotas 26 e 27: sessão (401), perfil (403) e só então o serviço (id, corpo, banco).
const ID = "11111111-1111-4111-8111-111111111111";
const CONTAS = {
  "token-cliente": { usuarioId: "bbbbbbbb-0000-4000-8000-000000000002", perfil: "CLIENTE" as const },
  "token-operador": { usuarioId: "cccccccc-0000-4000-8000-000000000003", perfil: "OPERADOR" as const },
  "token-admin": { usuarioId: "aaaaaaaa-0000-4000-8000-000000000001", perfil: "ADMIN" as const },
};

type Chamada = { rota: string; sessao: SessaoEquipe; id: unknown; corpo: unknown };

function montar(opcoes: { falha?: Error } = {}) {
  const eventos: string[] = [];
  const chamadas: Chamada[] = [];
  const executar = (rota: string) => async (sessao: SessaoEquipe, id: unknown, lerCorpo: () => Promise<unknown>) => {
    eventos.push(rota);
    if (opcoes.falha) throw opcoes.falha;
    chamadas.push({ rota, sessao, id, corpo: await lerCorpo() });
    return { id, status: "EM_ANDAMENTO", bicicleta: null } as never;
  };
  const controlador = new ControladorDeOperacao({
    exigirSessao: async (request) => {
      eventos.push("sessao");
      const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] as keyof typeof CONTAS | undefined;
      const conta = token ? CONTAS[token] : undefined;
      if (!conta) throw new UnauthorizedError("Sessão inválida ou expirada.");
      return conta;
    },
    operacao: { registrarRetirada: executar("retirada"), registrarDevolucao: executar("devolucao") },
  });
  return { controlador, eventos, chamadas };
}

const pedido = (token?: string, corpo = '{"checklist":{"itens":[{"nome":"freios","ok":true}]}}') =>
  new Request("http://localhost/api/operacao/reservas/x/retirada", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo,
  });

for (const rota of ["retirada", "devolucao"] as const) {
  test(`${rota}: sem token ou com token inválido é 401, sem tocar o serviço`, async () => {
    const m = montar();
    assert.equal((await m.controlador[rota](pedido(), ID)).status, 401);
    assert.equal((await m.controlador[rota](pedido("lixo"), ID)).status, 401);
    assert.deepEqual(m.eventos, ["sessao", "sessao"]);
  });

  test(`${rota}: cliente é 403 antes do serviço`, async () => {
    const m = montar();
    const r = await m.controlador[rota](pedido("token-cliente"), ID);
    assert.equal(r.status, 403);
    assert.deepEqual(m.eventos, ["sessao"]);
  });

  test(`${rota}: operador e admin passam; 200 com { data }, sem cache, sessão e id repassados`, async () => {
    for (const token of ["token-operador", "token-admin"] as const) {
      const m = montar();
      const r = await m.controlador[rota](pedido(token), ID);
      assert.equal(r.status, 200, token);
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(((await r.json()) as { data: { id: string } }).data.id, ID);
      assert.deepEqual(m.eventos, ["sessao", rota]);
      assert.deepEqual(m.chamadas[0].sessao, CONTAS[token]);
      assert.equal(m.chamadas[0].id, ID);
      assert.deepEqual(m.chamadas[0].corpo, { checklist: { itens: [{ nome: "freios", ok: true }] } });
    }
  });

  test(`${rota}: erro do serviço vira a resposta do contrato e o inesperado vira 500 sem detalhe`, async () => {
    const conflito = await montar({ falha: new ConflictError("repetida") }).controlador[rota](pedido("token-operador"), ID);
    assert.equal(conflito.status, 409);
    const antes = console.error;
    console.error = () => {};
    try {
      const r = await montar({ falha: new Error("senha do banco: abc123") }).controlador[rota](pedido("token-operador"), ID);
      assert.equal(r.status, 500);
      assert.ok(!JSON.stringify(await r.json()).includes("abc123"));
    } finally {
      console.error = antes;
    }
  });

  test(`${rota}: corpo que não é JSON é 400 quando o serviço o lê`, async () => {
    const m = montar();
    const r = await m.controlador[rota](pedido("token-operador", "{quebrado"), ID);
    assert.equal(r.status, 400);
  });
}

test("a retirada chama só o serviço de retirada, e a devolução só o de devolução", async () => {
  const m = montar();
  await m.controlador.retirada(pedido("token-operador"), ID);
  await m.controlador.devolucao(pedido("token-operador"), ID);
  assert.deepEqual(m.chamadas.map((c) => c.rota), ["retirada", "devolucao"]);
});

test("estresse: 200 chamadas misturadas, cada uma recebe a resposta certa", async () => {
  const m = montar();
  const tokens = ["token-operador", "token-cliente", undefined, "token-admin"] as const;
  const rs = await Promise.all(
    Array.from({ length: 200 }, (_, i) => m.controlador[i % 2 ? "devolucao" : "retirada"](pedido(tokens[i % 4]), ID)),
  );
  rs.forEach((r, i) => assert.equal(r.status, [200, 403, 401, 200][i % 4], `chamada ${i}`));
  assert.equal(m.chamadas.length, 100);
});

test("o controlador é encapsulado: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(montar().controlador), []);
});
