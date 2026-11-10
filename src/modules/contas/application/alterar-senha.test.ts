import assert from "node:assert/strict";
import { test } from "node:test";
import type { Executar } from "../../../shared/db/limite-tentativas.ts";
import {
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "../../../shared/http/errors.ts";
import { criarAlterarSenha, LIMITE_TROCA_SENHA } from "./alterar-senha.ts";

const ID = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const CORRETA = "senha-atual-1";

// Banco de mentira: a tabela limite_tentativas (contagem por chave) e a senha do usuário.
// O "hash" é a própria senha com um prefixo, para o teste não gastar tempo com scrypt.
function cenario() {
  const contagens = new Map<string, number>();
  const executar: Executar = async (sql, valores) => {
    const chave = String(valores[0]);
    if (sql.includes("INSERT INTO limite_tentativas")) {
      const nova = (contagens.get(chave) ?? 0) + 1;
      contagens.set(chave, nova);
      return { rows: [{ contagem: nova, restante: 600 }] };
    }
    if (sql.startsWith("DELETE FROM limite_tentativas WHERE chave")) contagens.delete(chave);
    return { rows: [] };
  };
  const senhas = new Map([[ID, `hash:${CORRETA}`]]);
  const alterarSenha = criarAlterarSenha({
    executar,
    buscarSenhaHash: async (id) => senhas.get(id) ?? null,
    salvarSenhaHash: async (id, hash) => {
      senhas.set(id, hash);
    },
    verificarSenha: async (senha, hash) => hash === `hash:${senha}`,
    gerarHashSenha: async (senha) => `hash:${senha}`,
  });
  return { alterarSenha, contagens, senhas };
}

test("troca a senha quando a atual confere", async () => {
  const { alterarSenha, senhas } = cenario();
  await alterarSenha(ID, { senhaAtual: CORRETA, novaSenha: "nova-senha-2" });
  assert.equal(senhas.get(ID), "hash:nova-senha-2");
});

test("senha atual errada responde 401 e não troca nada", async () => {
  const { alterarSenha, senhas } = cenario();
  await assert.rejects(
    alterarSenha(ID, { senhaAtual: "errada-1", novaSenha: "nova-senha-2" }),
    UnauthorizedError,
  );
  assert.equal(senhas.get(ID), `hash:${CORRETA}`);
});

test("depois de errar a senha atual além do limite, responde 429 até a janela passar", async () => {
  const { alterarSenha } = cenario();
  for (let i = 0; i < LIMITE_TROCA_SENHA.max; i++) {
    await assert.rejects(
      alterarSenha(ID, { senhaAtual: `errada-${i}`, novaSenha: "nova-senha-2" }),
      UnauthorizedError,
    );
  }
  for (let i = 0; i < 5; i++) {
    await assert.rejects(
      alterarSenha(ID, { senhaAtual: `errada-x${i}`, novaSenha: "nova-senha-2" }),
      TooManyRequestsError,
    );
  }
  // nem a senha certa passa enquanto a cota estiver estourada
  await assert.rejects(
    alterarSenha(ID, { senhaAtual: CORRETA, novaSenha: "nova-senha-2" }),
    TooManyRequestsError,
  );
});

test("acertar a senha atual zera a contagem do usuário", async () => {
  const { alterarSenha, contagens } = cenario();
  for (let i = 0; i < 3; i++) {
    await assert.rejects(
      alterarSenha(ID, { senhaAtual: `errada-${i}`, novaSenha: "nova-senha-2" }),
      UnauthorizedError,
    );
  }
  assert.equal(contagens.get(`senha:usuario:${ID}`), 3);
  await alterarSenha(ID, { senhaAtual: CORRETA, novaSenha: "nova-senha-2" });
  assert.equal(contagens.has(`senha:usuario:${ID}`), false);
});

test("a cota é por usuário: os erros de um não bloqueiam outro", async () => {
  const { alterarSenha, senhas } = cenario();
  const OUTRO = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  senhas.set(OUTRO, "hash:do-outro-1");
  for (let i = 0; i <= LIMITE_TROCA_SENHA.max; i++) {
    await alterarSenha(ID, { senhaAtual: `errada-${i}`, novaSenha: "nova-senha-2" }).catch(() => {});
  }
  await alterarSenha(OUTRO, { senhaAtual: "do-outro-1", novaSenha: "nova-senha-2" });
  assert.equal(senhas.get(OUTRO), "hash:nova-senha-2");
});

test("corpo inválido responde 400 sem gastar tentativa", async () => {
  const { alterarSenha, contagens } = cenario();
  await assert.rejects(alterarSenha(ID, { senhaAtual: CORRETA }), ValidationError);
  assert.equal(contagens.size, 0);
});
