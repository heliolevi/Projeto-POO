import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ACOES_DE_AUDITORIA, AuditoriaLog, REDIGIDO } from "./auditoria-log.ts";

const T = (min: number) => new Date(Date.UTC(2026, 10, 14, 12, min));
const base = { entidade: "reserva", entidadeId: "r-1", usuarioId: "u-1", ip: "203.0.113.7" };

describe("AuditoriaLog.registrar", () => {
  test("registra uma atualização com antes, depois, quem e quando", () => {
    const log = AuditoriaLog.registrar(
      { ...base, acao: "ATUALIZACAO", dadosAntes: { status: "PENDENTE_PAGAMENTO" }, dadosDepois: { status: "CONFIRMADA" } },
      T(0),
    );
    assert.equal(log.entidade, "reserva");
    assert.equal(log.entidadeId, "r-1");
    assert.equal(log.acao, "ATUALIZACAO");
    assert.deepEqual(log.dadosAntes, { status: "PENDENTE_PAGAMENTO" });
    assert.deepEqual(log.dadosDepois, { status: "CONFIRMADA" });
    assert.equal(log.usuarioId, "u-1");
    assert.equal(log.ip, "203.0.113.7");
    assert.equal(log.criadoEm.getTime(), T(0).getTime());
  });

  test("criação tem só 'depois'; exclusão tem só 'antes'; atualização tem os dois", () => {
    assert.doesNotThrow(() => AuditoriaLog.registrar({ ...base, acao: "CRIACAO", dadosDepois: { a: 1 } }, T(0)));
    assert.doesNotThrow(() => AuditoriaLog.registrar({ ...base, acao: "EXCLUSAO", dadosAntes: { a: 1 } }, T(0)));
    const ruins = [
      { acao: "CRIACAO", dadosAntes: { a: 1 }, dadosDepois: { a: 2 } },
      { acao: "CRIACAO" },
      { acao: "EXCLUSAO", dadosAntes: { a: 1 }, dadosDepois: { a: 1 } },
      { acao: "EXCLUSAO" },
      { acao: "ATUALIZACAO", dadosAntes: { a: 1 } },
      { acao: "ATUALIZACAO", dadosDepois: { a: 1 } },
    ];
    for (const ruim of ruins) {
      assert.throws(() => AuditoriaLog.registrar({ ...base, ...ruim } as never, T(0)), RangeError, JSON.stringify(ruim));
    }
  });

  test("recusa entidade, id, ação e data inválidos", () => {
    const ok = { ...base, acao: "CRIACAO" as const, dadosDepois: { a: 1 } };
    assert.throws(() => AuditoriaLog.registrar({ ...ok, entidade: " " }, T(0)), RangeError);
    assert.throws(() => AuditoriaLog.registrar({ ...ok, entidadeId: "" }, T(0)), RangeError);
    assert.throws(() => AuditoriaLog.registrar({ ...ok, acao: "REMOCAO" as never }, T(0)), RangeError);
    assert.throws(() => AuditoriaLog.registrar(ok, new Date("lixo")), RangeError);
    assert.deepEqual([...ACOES_DE_AUDITORIA], ["CRIACAO", "ATUALIZACAO", "EXCLUSAO"]);
  });

  test("usuário e IP são opcionais (ação do sistema)", () => {
    const log = AuditoriaLog.registrar({ entidade: "reserva", entidadeId: "r-1", acao: "CRIACAO", dadosDepois: { a: 1 } }, T(0));
    assert.equal(log.usuarioId, null);
    assert.equal(log.ip, null);
  });

  test("imutável: os dados são copiados e congelados, e mexer no original não altera a trilha", () => {
    const antes = { valor: 4800, periodo: { fim: "16:00" } };
    const log = AuditoriaLog.registrar({ ...base, acao: "ATUALIZACAO", dadosAntes: antes, dadosDepois: { valor: 6000, periodo: { fim: "18:00" } } }, T(0));
    antes.valor = 1;
    antes.periodo.fim = "99:99";
    assert.deepEqual(log.dadosAntes, { valor: 4800, periodo: { fim: "16:00" } });
    assert.ok(Object.isFrozen(log.dadosAntes));
    assert.ok(Object.isFrozen((log.dadosAntes as { periodo: object }).periodo));
    assert.throws(() => {
      "use strict";
      (log.dadosAntes as { valor: number }).valor = 0;
    }, TypeError);
    log.criadoEm.setUTCFullYear(1999);
    assert.equal(log.criadoEm.getUTCFullYear(), 2026);
    assert.deepEqual(Object.keys(log), []);
  });

  test("nunca guarda segredo: senhas e tokens viram [REDIGIDO] em qualquer nível", () => {
    const log = AuditoriaLog.registrar(
      {
        ...base,
        entidade: "usuario",
        acao: "ATUALIZACAO",
        dadosAntes: { nome: "Ana", senhaHash: "scrypt$abc", aninhado: { token: "t0k3n", lista: [{ senha: "x" }] } },
        dadosDepois: { nome: "Ana", senha_hash: "scrypt$def" },
      },
      T(0),
    );
    const texto = JSON.stringify(log.dadosAntes) + JSON.stringify(log.dadosDepois);
    assert.ok(!texto.includes("scrypt"));
    assert.ok(!texto.includes("t0k3n"));
    assert.equal((log.dadosAntes as { senhaHash: string }).senhaHash, REDIGIDO);
    assert.equal((log.dadosDepois as { senha_hash: string }).senha_hash, REDIGIDO);
  });

  test("datas viram texto ISO; função, símbolo e bigint são recusados", () => {
    const log = AuditoriaLog.registrar({ ...base, acao: "CRIACAO", dadosDepois: { quando: T(5) } }, T(0));
    assert.equal((log.dadosDepois as { quando: string }).quando, "2026-11-14T12:05:00.000Z");
    for (const ruim of [() => 1, Symbol("x"), BigInt(10)]) {
      assert.throws(() => AuditoriaLog.registrar({ ...base, acao: "CRIACAO", dadosDepois: { ruim } }, T(0)), RangeError);
    }
  });
});

describe("AuditoriaLog.diferencas", () => {
  test("lista só os campos que mudaram, em ordem alfabética", () => {
    const log = AuditoriaLog.registrar(
      {
        ...base,
        acao: "ATUALIZACAO",
        dadosAntes: { valor: 4800, status: "PENDENTE_PAGAMENTO", codigo: "BIC-1" },
        dadosDepois: { valor: 6000, status: "CONFIRMADA", codigo: "BIC-1" },
      },
      T(0),
    );
    assert.deepEqual(log.diferencas(), [
      { campo: "status", antes: "PENDENTE_PAGAMENTO", depois: "CONFIRMADA" },
      { campo: "valor", antes: 4800, depois: 6000 },
    ]);
  });

  test("campo que apareceu ou sumiu conta como diferença", () => {
    const log = AuditoriaLog.registrar(
      { ...base, acao: "ATUALIZACAO", dadosAntes: { a: 1, b: 2 }, dadosDepois: { a: 1, c: 3 } },
      T(0),
    );
    assert.deepEqual(log.diferencas(), [
      { campo: "b", antes: 2, depois: undefined },
      { campo: "c", antes: undefined, depois: 3 },
    ]);
  });

  test("atualização sem mudança não tem diferenças; criação e exclusão listam tudo", () => {
    const igual = AuditoriaLog.registrar({ ...base, acao: "ATUALIZACAO", dadosAntes: { a: 1 }, dadosDepois: { a: 1 } }, T(0));
    assert.deepEqual(igual.diferencas(), []);
    const criacao = AuditoriaLog.registrar({ ...base, acao: "CRIACAO", dadosDepois: { a: 1 } }, T(0));
    assert.deepEqual(criacao.diferencas(), [{ campo: "a", antes: undefined, depois: 1 }]);
    const exclusao = AuditoriaLog.registrar({ ...base, acao: "EXCLUSAO", dadosAntes: { a: 1 } }, T(0));
    assert.deepEqual(exclusao.diferencas(), [{ campo: "a", antes: 1, depois: undefined }]);
  });
});

describe("AuditoriaLog.consultar", () => {
  const logs = [
    AuditoriaLog.registrar({ entidade: "reserva", entidadeId: "r-1", acao: "CRIACAO", dadosDepois: { a: 1 }, usuarioId: "u-1" }, T(0)),
    AuditoriaLog.registrar({ entidade: "reserva", entidadeId: "r-1", acao: "ATUALIZACAO", dadosAntes: { a: 1 }, dadosDepois: { a: 2 }, usuarioId: "u-2" }, T(10)),
    AuditoriaLog.registrar({ entidade: "bicicleta", entidadeId: "b-1", acao: "CRIACAO", dadosDepois: { a: 1 }, usuarioId: "u-1" }, T(20)),
    AuditoriaLog.registrar({ entidade: "reserva", entidadeId: "r-2", acao: "EXCLUSAO", dadosAntes: { a: 1 }, usuarioId: "u-1" }, T(30)),
  ];

  test("sem filtro devolve tudo, do mais novo para o mais antigo", () => {
    assert.deepEqual(
      AuditoriaLog.consultar(logs).map((l) => l.criadoEm.getUTCMinutes()),
      [30, 20, 10, 0],
    );
  });

  test("filtra por entidade e id", () => {
    assert.equal(AuditoriaLog.consultar(logs, { entidade: "reserva" }).length, 3);
    assert.equal(AuditoriaLog.consultar(logs, { entidade: "reserva", entidadeId: "r-1" }).length, 2);
    assert.equal(AuditoriaLog.consultar(logs, { entidade: "inexistente" }).length, 0);
  });

  test("filtra por usuário e por ação", () => {
    assert.equal(AuditoriaLog.consultar(logs, { usuarioId: "u-1" }).length, 3);
    assert.equal(AuditoriaLog.consultar(logs, { acao: "CRIACAO" }).length, 2);
    assert.equal(AuditoriaLog.consultar(logs, { usuarioId: "u-1", acao: "CRIACAO" }).length, 2);
  });

  test("filtra por período, com as duas pontas incluídas", () => {
    assert.equal(AuditoriaLog.consultar(logs, { desde: T(10), ate: T(20) }).length, 2);
    assert.equal(AuditoriaLog.consultar(logs, { desde: T(21) }).length, 1);
    assert.equal(AuditoriaLog.consultar(logs, { ate: T(0) }).length, 1);
  });

  test("não altera a lista recebida", () => {
    const antes = logs.map((l) => l.criadoEm.getUTCMinutes());
    AuditoriaLog.consultar(logs);
    assert.deepEqual(logs.map((l) => l.criadoEm.getUTCMinutes()), antes);
  });
});
