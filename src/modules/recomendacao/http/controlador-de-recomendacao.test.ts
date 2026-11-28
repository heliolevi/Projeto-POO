import assert from "node:assert/strict";
import { test } from "node:test";
import { TooManyRequestsError, UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import type { SessaoCliente } from "../application/portas.ts";
import { ControladorDeRecomendacao, LIMITE_BUSCAS_POR_IP, LIMITE_BUSCAS_POR_USUARIO } from "./controlador-de-recomendacao.ts";

// Provam a ORDEM da rota 11: sessão (401), perfil (403), limites (429) e só então a busca (e o banco).
const CONTAS = {
  "token-cliente": { usuarioId: "bbbbbbbb-0000-4000-8000-000000000002", perfil: "CLIENTE" as const },
  "token-operador": { usuarioId: "cccccccc-0000-4000-8000-000000000003", perfil: "OPERADOR" as const },
  "token-admin": { usuarioId: "aaaaaaaa-0000-4000-8000-000000000001", perfil: "ADMIN" as const },
};

function montar(opcoes: { estourar?: "usuario" | "ip"; falhaNaBusca?: Error } = {}) {
  const eventos: string[] = [];
  const chaves: { chave: string; regra: object }[] = [];
  const buscas: { sessao: SessaoCliente; parametros: unknown }[] = [];
  const controlador = new ControladorDeRecomendacao({
    exigirSessao: async (request) => {
      eventos.push("sessao");
      const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] as keyof typeof CONTAS | undefined;
      const conta = token ? CONTAS[token] : undefined;
      if (!conta) throw new UnauthorizedError("Sessão inválida ou expirada.");
      return conta;
    },
    limite: {
      async exigirDentroDoLimite(chave, regra) {
        eventos.push(`limite:${chave.split(":")[1]}`);
        chaves.push({ chave, regra });
        if (opcoes.estourar && chave.startsWith(`recomendacao:${opcoes.estourar}`)) throw new TooManyRequestsError(30);
      },
    },
    busca: {
      async buscar(sessao, parametros) {
        eventos.push("busca");
        buscas.push({ sessao, parametros });
        if (opcoes.falhaNaBusca) throw opcoes.falhaNaBusca;
        return { periodo: { inicio: "a", fim: "b", horas: 4 }, resultados: [] };
      },
    },
  });
  return { controlador, eventos, chaves, buscas };
}

const pedido = (consulta = "", token?: string, ip = "200.1.1.1") =>
  new Request(`http://localhost/api/recomendacao${consulta}`, { headers: { "x-forwarded-for": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) } });

test("sem token ou com token inválido: 401, sem tocar nos limites nem na busca", async () => {
  const m = montar();
  assert.equal((await m.controlador.recomendar(pedido())).status, 401);
  assert.equal((await m.controlador.recomendar(pedido("", "lixo"))).status, 401);
  assert.deepEqual(m.eventos, ["sessao", "sessao"]);
});

test("operador e administrador: 403 antes de qualquer limite (a busca é do cliente)", async () => {
  for (const token of ["token-operador", "token-admin"]) {
    const m = montar();
    assert.equal((await m.controlador.recomendar(pedido("", token))).status, 403, token);
    assert.deepEqual(m.eventos, ["sessao"]);
  }
});

test("cliente: conta o limite por usuário e depois o por IP, e só então busca", async () => {
  const m = montar();
  const r = await m.controlador.recomendar(pedido("?inicio=2026-11-14T09:00:00-03:00&fim=2026-11-14T13:00:00-03:00", "token-cliente"));
  assert.equal(r.status, 200);
  assert.deepEqual(m.eventos, ["sessao", "limite:usuario", "limite:ip", "busca"]);
  assert.equal(m.chaves[0].chave, `recomendacao:usuario:${CONTAS["token-cliente"].usuarioId}`);
  assert.deepEqual(m.chaves[0].regra, LIMITE_BUSCAS_POR_USUARIO);
  assert.equal(m.chaves[1].chave, "recomendacao:ip:200.1.1.1");
  assert.deepEqual(m.chaves[1].regra, LIMITE_BUSCAS_POR_IP);
});

test("os limites do contrato: 60 por minuto por usuário e 300 por minuto por IP (mais folgado por causa do NAT)", () => {
  assert.deepEqual(LIMITE_BUSCAS_POR_USUARIO, { max: 60, janelaSegundos: 60 });
  assert.deepEqual(LIMITE_BUSCAS_POR_IP, { max: 300, janelaSegundos: 60 });
  assert.ok(LIMITE_BUSCAS_POR_IP.max > LIMITE_BUSCAS_POR_USUARIO.max);
});

test("estourar o limite por usuário ou por IP é 429 e não busca", async () => {
  for (const qual of ["usuario", "ip"] as const) {
    const m = montar({ estourar: qual });
    const r = await m.controlador.recomendar(pedido("", "token-cliente"));
    assert.equal(r.status, 429, qual);
    assert.ok(!m.eventos.includes("busca"));
  }
});

test("o limite por usuário estourado vem antes do por IP (não gasta a cota do IP à toa)", async () => {
  const m = montar({ estourar: "usuario" });
  await m.controlador.recomendar(pedido("", "token-cliente"));
  assert.deepEqual(m.eventos, ["sessao", "limite:usuario"]);
});

test("a chave do IP é cortada em 64 caracteres", async () => {
  const m = montar();
  await m.controlador.recomendar(pedido("", "token-cliente", "7".repeat(300)));
  assert.equal(m.chaves[1].chave, `recomendacao:ip:${"7".repeat(64)}`);
});

test("repassa início, fim e atividade da query à busca, com a sessão do cliente", async () => {
  const m = montar();
  await m.controlador.recomendar(pedido("?inicio=A&fim=B&atividade=TRILHA", "token-cliente"));
  assert.deepEqual(m.buscas[0].parametros, { inicio: "A", fim: "B", atividade: "TRILHA" });
  assert.equal(m.buscas[0].sessao.usuarioId, CONTAS["token-cliente"].usuarioId);
  await m.controlador.recomendar(pedido("", "token-cliente"));
  assert.deepEqual(m.buscas[1].parametros, { inicio: null, fim: null, atividade: null });
});

test("200 com { data } e nunca em cache; erro de validação da busca vira 400 com details", async () => {
  const ok = await montar().controlador.recomendar(pedido("", "token-cliente"));
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.ok("data" in ((await ok.json()) as object));
  const ruim = await montar({ falhaNaBusca: new ValidationError("Dados inválidos.", { inicio: "ruim" }) }).controlador.recomendar(pedido("", "token-cliente"));
  assert.equal(ruim.status, 400);
  assert.deepEqual(((await ruim.json()) as { error: { details: object } }).error.details, { inicio: "ruim" });
});

test("erro inesperado vira 500 genérico, sem vazar a mensagem", async () => {
  const antes = console.error;
  console.error = () => {};
  try {
    const r = await montar({ falhaNaBusca: new Error("senha do banco: abc123") }).controlador.recomendar(pedido("", "token-cliente"));
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(await r.json()).includes("abc123"));
  } finally {
    console.error = antes;
  }
});

test("estresse: 200 buscas ao mesmo tempo, de perfis misturados, cada uma recebe a resposta certa", async () => {
  const m = montar();
  const tokens = ["token-cliente", "token-operador", "token-admin", undefined] as const;
  const rs = await Promise.all(Array.from({ length: 200 }, (_, i) => m.controlador.recomendar(pedido("", tokens[i % 4]))));
  rs.forEach((r, i) => assert.equal(r.status, [200, 403, 403, 401][i % 4], `chamada ${i}`));
  assert.equal(m.buscas.length, 50);
});

test("o controlador é encapsulado: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(montar().controlador), []);
});
