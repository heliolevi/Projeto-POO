import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ValidadorDeNovaReserva } from "./validador-de-nova-reserva.ts";

const TIPO = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
// "agora" fixo: 14/11/2026, 08:00 em São Luís
const AGORA = new Date("2026-11-14T11:00:00.000Z");
const CORPO = { tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T13:00:00-03:00" };
const validador = ValidadorDeNovaReserva.padrao;

describe("ValidadorDeNovaReserva", () => {
  test("aceita o corpo do contrato e devolve as datas em UTC", () => {
    const r = validador.validar(CORPO, AGORA);
    assert.ok("dados" in r);
    assert.equal(r.dados.tipoId, TIPO);
    assert.equal(r.dados.inicio.toISOString(), "2026-11-14T12:00:00.000Z");
    assert.equal(r.dados.fim.toISOString(), "2026-11-14T16:00:00.000Z");
  });

  test("campos extras (valor, bicicletaId) são ignorados e não chegam aos dados", () => {
    const r = validador.validar({ ...CORPO, valorAluguelCentavos: 1, bicicletaId: "x", clienteId: "y" }, AGORA);
    assert.ok("dados" in r);
    assert.deepEqual(Object.keys(r.dados).sort(), ["fim", "inicio", "tipoId"]);
  });

  test("corpo que não é objeto é recusado", () => {
    for (const corpo of [null, undefined, "texto", 42, true, [], [CORPO]]) {
      const r = validador.validar(corpo, AGORA);
      assert.ok("erros" in r, String(corpo));
      assert.ok(r.erros.tipoId && r.erros.inicio && r.erros.fim, "um erro por campo");
    }
  });

  test("tipoId ausente, de outro tipo ou que não é UUID dá erro no campo tipoId", () => {
    for (const tipoId of [undefined, null, "", 7, "abc", `${TIPO}x`, "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6", { a: 1 }]) {
      const r = validador.validar({ ...CORPO, tipoId }, AGORA);
      assert.ok("erros" in r, String(tipoId));
      assert.equal(r.erros.tipoId, "Informe o tipoId da bicicleta (um UUID).");
      assert.equal(r.erros.inicio, undefined);
    }
  });

  test("aceita UUID em maiúsculas", () => {
    assert.ok("dados" in validador.validar({ ...CORPO, tipoId: TIPO.toUpperCase() }, AGORA));
  });

  test("período no passado, fim antes do início, menor que 1 h, maior que 7 dias e sem fuso dão 400 por campo", () => {
    const casos: [string, Record<string, unknown>, "inicio" | "fim"][] = [
      ["passado", { inicio: "2026-11-14T07:00:00-03:00", fim: "2026-11-14T13:00:00-03:00" }, "inicio"],
      ["fim antes do início", { inicio: "2026-11-14T13:00:00-03:00", fim: "2026-11-14T09:00:00-03:00" }, "fim"],
      ["menor que 1 hora", { inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T09:59:00-03:00" }, "fim"],
      ["maior que 7 dias", { inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-21T09:01:00-03:00" }, "fim"],
      ["sem fuso", { inicio: "2026-11-14T09:00:00", fim: "2026-11-14T13:00:00" }, "inicio"],
      ["não é string", { inicio: 1763100000, fim: 1763114400 }, "inicio"],
    ];
    for (const [nome, periodo, campo] of casos) {
      const r = validador.validar({ tipoId: TIPO, ...periodo }, AGORA);
      assert.ok("erros" in r, nome);
      assert.ok(r.erros[campo], nome);
    }
  });

  test("os limites do período valem: exatamente 1 hora e exatamente 7 dias passam", () => {
    assert.ok("dados" in validador.validar({ tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T10:00:00-03:00" }, AGORA));
    assert.ok("dados" in validador.validar({ tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-21T09:00:00-03:00" }, AGORA));
  });

  test("vários campos errados voltam todos juntos", () => {
    const r = validador.validar({ tipoId: "x", inicio: "ontem", fim: "amanhã" }, AGORA);
    assert.ok("erros" in r);
    assert.deepEqual(Object.keys(r.erros).sort(), ["fim", "inicio", "tipoId"]);
  });

  test("o período é validado por quem entra no construtor, com o `agora` recebido", () => {
    const chamadas: Array<{ parametros: unknown; agora: Date }> = [];
    const falso = new ValidadorDeNovaReserva({
      validar(parametros, agora) {
        chamadas.push({ parametros, agora });
        return { erros: { fim: "do falso" } };
      },
    });
    const r = falso.validar({ tipoId: TIPO, inicio: "a", fim: "b" }, AGORA);
    assert.deepEqual(r, { erros: { fim: "do falso" } });
    assert.deepEqual(chamadas, [{ parametros: { inicio: "a", fim: "b" }, agora: AGORA }]);
  });

  test("encapsulamento: a instância não expõe campos", () => {
    assert.deepEqual(Object.keys(validador), []);
  });
});
