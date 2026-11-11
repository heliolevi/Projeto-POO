import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../../../shared/http/errors.ts";
import type { ContaLogada, PerfilCiclistaConta } from "../domain/usuario.ts";
import type { DadosPerfilCiclista } from "../domain/validacao.ts";
import { criarPerfilCiclista } from "./perfil-ciclista.ts";

const CLIENTE = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";

// Banco de mentira com um cliente e um administrador.
function cenario() {
  const contas = new Map<string, ContaLogada>([
    [
      CLIENTE,
      {
        id: CLIENTE,
        perfil: "CLIENTE",
        nome: "Maria da Silva",
        email: "maria@exemplo.com",
        ciclista: { alturaCm: null, experiencia: null, atividade: null },
      },
    ],
    [ADMIN, { id: ADMIN, perfil: "ADMIN", nome: "Admin", email: "admin@exemplo.com" }],
  ]);
  const gravacoes: { id: string; dados: DadosPerfilCiclista }[] = [];
  const servico = criarPerfilCiclista({
    buscarConta: async (id) => contas.get(id) ?? null,
    gravarPerfilCiclista: async (id, dados): Promise<PerfilCiclistaConta | null> => {
      gravacoes.push({ id, dados });
      const conta = contas.get(id);
      if (!conta || conta.perfil !== "CLIENTE") return null; // como o WHERE perfil = 'CLIENTE'
      conta.ciclista = { ...dados };
      return conta.ciclista;
    },
  });
  return { servico, gravacoes };
}

test("GET /me devolve nome, e-mail, perfil e os três dados do ciclista", async () => {
  const { servico } = cenario();
  await servico.atualizarPerfilCiclista(CLIENTE, {
    alturaCm: 172,
    experiencia: "INICIANTE",
    atividade: "PASSEIO",
  });
  assert.deepEqual(await servico.consultarConta(CLIENTE), {
    id: CLIENTE,
    perfil: "CLIENTE",
    nome: "Maria da Silva",
    email: "maria@exemplo.com",
    ciclista: { alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" },
  });
});

test("GET /me não traz `ciclista` para quem não é cliente", async () => {
  const { servico } = cenario();
  const conta = await servico.consultarConta(ADMIN);
  assert.equal(conta.perfil, "ADMIN");
  assert.ok(!("ciclista" in conta));
});

test("GET /me de conta que sumiu responde 401", async () => {
  const { servico } = cenario();
  await assert.rejects(servico.consultarConta("bbbbbbbb-0000-4000-8000-000000000009"), UnauthorizedError);
});

test("PUT devolve os três dados gravados", async () => {
  const { servico } = cenario();
  const gravado = await servico.atualizarPerfilCiclista(CLIENTE, {
    alturaCm: 180,
    experiencia: "AVANCADO",
    atividade: "TRILHA",
  });
  assert.deepEqual(gravado, { alturaCm: 180, experiencia: "AVANCADO", atividade: "TRILHA" });
});

test("PUT substitui os três campos: o que vem ausente ou null é apagado", async () => {
  const { servico } = cenario();
  await servico.atualizarPerfilCiclista(CLIENTE, { alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" });
  assert.deepEqual(await servico.atualizarPerfilCiclista(CLIENTE, { alturaCm: 175 }), {
    alturaCm: 175,
    experiencia: null,
    atividade: null,
  });
  assert.deepEqual(
    await servico.atualizarPerfilCiclista(CLIENTE, { alturaCm: null, experiencia: null, atividade: null }),
    { alturaCm: null, experiencia: null, atividade: null },
  );
  assert.deepEqual(await servico.atualizarPerfilCiclista(CLIENTE, {}), {
    alturaCm: null,
    experiencia: null,
    atividade: null,
  });
});

test("PUT valida a altura (100 a 250, inteiro) com o mesmo validador da rota de altura", async () => {
  const { servico, gravacoes } = cenario();
  for (const alturaCm of [99, 251, 172.5, "172", true, [], {}, NaN, -1]) {
    await assert.rejects(
      servico.atualizarPerfilCiclista(CLIENTE, { alturaCm }),
      (erro: unknown) => {
        assert.ok(erro instanceof ValidationError, String(alturaCm));
        assert.match((erro.details as Record<string, string>).alturaCm, /100 e 250/);
        return true;
      },
    );
  }
  for (const alturaCm of [100, 250]) {
    await servico.atualizarPerfilCiclista(CLIENTE, { alturaCm });
  }
  assert.equal(gravacoes.length, 2, "valores inválidos nunca chegam ao banco");
});

test("PUT valida experiência e atividade contra as enumerações do banco", async () => {
  const { servico } = cenario();
  for (const experiencia of ["iniciante", "EXPERT", "", 1, true]) {
    await assert.rejects(servico.atualizarPerfilCiclista(CLIENTE, { experiencia }), ValidationError, String(experiencia));
  }
  for (const atividade of ["passeio", "CORRIDA", "", 2, ["PASSEIO"]]) {
    await assert.rejects(servico.atualizarPerfilCiclista(CLIENTE, { atividade }), ValidationError, String(atividade));
  }
  for (const experiencia of ["INICIANTE", "INTERMEDIARIO", "AVANCADO"]) {
    await servico.atualizarPerfilCiclista(CLIENTE, { experiencia });
  }
  for (const atividade of ["PASSEIO", "URBANO", "TRILHA", "ESPORTE", "TURISMO"]) {
    await servico.atualizarPerfilCiclista(CLIENTE, { atividade });
  }
});

test("PUT junta os erros de todos os campos", async () => {
  const { servico } = cenario();
  await assert.rejects(
    servico.atualizarPerfilCiclista(CLIENTE, { alturaCm: 5, experiencia: "x", atividade: "y" }),
    (erro: unknown) => {
      assert.ok(erro instanceof ValidationError);
      assert.deepEqual(Object.keys(erro.details as object).sort(), ["alturaCm", "atividade", "experiencia"]);
      return true;
    },
  );
});

test("PUT com corpo que não é um objeto responde 400", async () => {
  const { servico, gravacoes } = cenario();
  for (const corpo of [null, undefined, "texto", 42, [], [{ alturaCm: 170 }]]) {
    await assert.rejects(servico.atualizarPerfilCiclista(CLIENTE, corpo), ValidationError, String(corpo));
  }
  assert.equal(gravacoes.length, 0);
});

test("PUT de conta que não é de cliente responde 403 e não grava", async () => {
  const { servico } = cenario();
  await assert.rejects(
    servico.atualizarPerfilCiclista(ADMIN, { alturaCm: 170 }),
    ForbiddenError,
  );
});

test("campos extras como id e perfil no corpo são ignorados: o alvo é o id do token", async () => {
  const { servico, gravacoes } = cenario();
  await servico.atualizarPerfilCiclista(CLIENTE, {
    alturaCm: 170,
    id: ADMIN,
    usuarioId: ADMIN,
    perfil: "ADMIN",
    nome: "Outro nome",
  });
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0].id, CLIENTE);
  assert.deepEqual(Object.keys(gravacoes[0].dados).sort(), ["alturaCm", "atividade", "experiencia"]);
});

test("consultarPerfilCiclista devolve só os três dados, e é 403 para quem não é cliente", async () => {
  const { servico } = cenario();
  await servico.atualizarPerfilCiclista(CLIENTE, { alturaCm: 168, experiencia: "INTERMEDIARIO", atividade: "URBANO" });
  assert.deepEqual(await servico.consultarPerfilCiclista(CLIENTE), {
    alturaCm: 168,
    experiencia: "INTERMEDIARIO",
    atividade: "URBANO",
  });
  await assert.rejects(servico.consultarPerfilCiclista(ADMIN), ForbiddenError);
});
