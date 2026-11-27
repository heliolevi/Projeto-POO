import assert from "node:assert/strict";
import { test } from "node:test";
import { DestinoSeguro } from "./destino-seguro.ts";
import { ArmazemDeSessao, Sessao, type JanelaDoNavegador } from "./sessao.ts";

const b64 = (dados: string) => Buffer.from(dados).toString("base64url");
const token = (corpo: unknown) => `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify(corpo))}.assinatura`;
const emSegundos = (ms: number) => Math.floor(ms / 1000);
const AGORA = Date.UTC(2026, 10, 26, 12, 0, 0);

// Janela de mentira: localStorage em memória e os ouvintes de evento registrados.
function janelaFalsa() {
  const dados = new Map<string, string>();
  const ouvintes = new Map<string, Set<() => void>>();
  const janela = {
    localStorage: {
      getItem: (c: string) => dados.get(c) ?? null,
      setItem: (c: string, v: string) => void dados.set(c, v),
      removeItem: (c: string) => void dados.delete(c),
    },
    addEventListener: (tipo: string, f: () => void) => void (ouvintes.get(tipo) ?? ouvintes.set(tipo, new Set()).get(tipo))!.add(f),
    removeEventListener: (tipo: string, f: () => void) => void ouvintes.get(tipo)?.delete(f),
    dispatchEvent: (e: Event) => {
      ouvintes.get(e.type)?.forEach((f) => f());
      return true;
    },
  };
  return { janela: janela as unknown as JanelaDoNavegador, dados, ouvintes };
}

// ---------------------------------------------------------------- Sessao
test("Sessao.decodificar lê usuário, perfil e validade do token", () => {
  const s = Sessao.decodificar(token({ sub: "u1", perfil: "OPERADOR", exp: emSegundos(AGORA) + 3600 }), AGORA);
  assert.ok(s);
  assert.equal(s.usuarioId, "u1");
  assert.equal(s.perfil, "OPERADOR");
  assert.equal(s.exp, emSegundos(AGORA) + 3600);
});

test("Sessao.decodificar devolve null para token ausente, malformado, de perfil desconhecido ou expirado", () => {
  const exp = emSegundos(AGORA) + 3600;
  const ruins: (string | null)[] = [
    null, "", "a.b", "a.b.c.d", "a.!!!.c",
    token({ perfil: "CLIENTE", exp }),
    token({ sub: "u1", exp }),
    token({ sub: 1, perfil: "CLIENTE", exp }),
    token({ sub: "u1", perfil: "GERENTE_LOCADORA", exp }),
    token({ sub: "u1", perfil: "CLIENTE" }),
    token({ sub: "u1", perfil: "CLIENTE", exp: "amanha" }),
    token({ sub: "u1", perfil: "CLIENTE", exp: emSegundos(AGORA) }),
    token({ sub: "u1", perfil: "CLIENTE", exp: emSegundos(AGORA) - 1 }),
    token("nao-e-json"),
  ];
  for (const t of ruins) assert.equal(Sessao.decodificar(t, AGORA), null, String(t));
});

test("Sessao é encapsulada: nenhum campo visível e o JSON sai por toJSON", () => {
  const s = Sessao.decodificar(token({ sub: "u1", perfil: "ADMIN", exp: emSegundos(AGORA) + 60 }), AGORA);
  assert.ok(s);
  assert.deepEqual(Object.keys(s), []);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), { usuarioId: "u1", perfil: "ADMIN", exp: emSegundos(AGORA) + 60 });
});

// ---------------------------------------------------------------- ArmazemDeSessao
test("salvar guarda o token e limpar o apaga", () => {
  const { janela, dados } = janelaFalsa();
  const armazem = new ArmazemDeSessao(() => janela);
  assert.equal(armazem.token(), null);
  armazem.salvar("abc");
  assert.equal(armazem.token(), "abc");
  assert.equal(dados.get("bik_token"), "abc");
  armazem.limpar();
  assert.equal(armazem.token(), null);
});

test("sessao() decodifica o token guardado e some quando ele expira ou é apagado", () => {
  const { janela } = janelaFalsa();
  const armazem = new ArmazemDeSessao(() => janela);
  armazem.salvar(token({ sub: "u1", perfil: "CLIENTE", exp: Date.now() / 1000 + 3600 }));
  assert.equal(armazem.sessao()?.perfil, "CLIENTE");
  armazem.salvar(token({ sub: "u1", perfil: "CLIENTE", exp: Date.now() / 1000 - 10 }));
  assert.equal(armazem.sessao(), null);
});

test("salvar e limpar avisam quem assinou, e cancelar a assinatura para os avisos", () => {
  const { janela } = janelaFalsa();
  const armazem = new ArmazemDeSessao(() => janela);
  let avisos = 0;
  const cancelar = armazem.assinar(() => avisos++);
  armazem.salvar("a");
  armazem.limpar();
  assert.equal(avisos, 2);
  cancelar();
  armazem.salvar("b");
  assert.equal(avisos, 2);
});

test("a assinatura também escuta o evento storage (outras abas)", () => {
  const { janela, ouvintes } = janelaFalsa();
  const armazem = new ArmazemDeSessao(() => janela);
  let avisos = 0;
  armazem.assinar(() => avisos++);
  ouvintes.get("storage")?.forEach((f) => f());
  assert.equal(avisos, 1);
});

test("sem janela (servidor) o armazém está vazio e nada quebra", () => {
  const armazem = new ArmazemDeSessao(() => null);
  assert.equal(armazem.token(), null);
  assert.equal(armazem.sessao(), null);
  armazem.salvar("x");
  armazem.limpar();
  assert.doesNotThrow(() => armazem.assinar(() => {})());
});

test("janela sem eventos (teste simples) ainda guarda e apaga o token", () => {
  const dados = new Map<string, string>();
  const janela = { localStorage: { getItem: (c: string) => dados.get(c) ?? null, setItem: (c: string, v: string) => void dados.set(c, v), removeItem: (c: string) => void dados.delete(c) } };
  const armazem = new ArmazemDeSessao(() => janela as unknown as JanelaDoNavegador);
  armazem.salvar("t");
  assert.equal(armazem.token(), "t");
  armazem.limpar();
  assert.equal(armazem.token(), null);
});

test("dois armazéns com janelas diferentes não se misturam", () => {
  const a = janelaFalsa();
  const b = janelaFalsa();
  new ArmazemDeSessao(() => a.janela).salvar("so-do-a");
  assert.equal(new ArmazemDeSessao(() => b.janela).token(), null);
});

// ---------------------------------------------------------------- DestinoSeguro
test("DestinoSeguro usa o padrão escolhido no construtor", () => {
  assert.equal(new DestinoSeguro("/inicio").resolver(null), "/inicio");
  assert.equal(new DestinoSeguro("/inicio").resolver("//evil.com"), "/inicio");
  assert.equal(new DestinoSeguro("/inicio").resolver("/perfil"), "/perfil");
  assert.equal(new DestinoSeguro().resolver("https://evil.com"), "/app");
});
