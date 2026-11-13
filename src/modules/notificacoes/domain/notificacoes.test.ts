import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { RoteadorDeEnvio } from "../application/roteador-de-envio.ts";
import {
  CANAIS_DE_NOTIFICACAO,
  Notificacao,
  NotificacaoInvalida,
  TIPOS_DE_NOTIFICACAO,
  type EnviadorDeNotificacao,
  type MensagemParaEnvio,
} from "./notificacao.ts";

const HORA = new Date("2026-11-14T12:00:00.000Z");
const dados = (parcial = {}) => ({
  id: "n-1",
  usuarioId: "u-1",
  canal: "WHATSAPP" as const,
  tipo: "RESERVA_CONFIRMADA" as const,
  titulo: "  Reserva confirmada  ",
  mensagem: "  Sua bicicleta está reservada.  ",
  agendadaPara: HORA,
  ...parcial,
});

function enviadorQueGrava() {
  const enviadas: MensagemParaEnvio[] = [];
  const enviador: EnviadorDeNotificacao = { enviar: async (m) => void enviadas.push(m) };
  return { enviadas, enviador };
}
const enviadorQueFalha: EnviadorDeNotificacao = {
  enviar: async () => {
    throw new Error("API do WhatsApp: token abc123 inválido");
  },
};

describe("Notificacao", () => {
  test("nasce AGENDADA, com textos aparados e sem tentativas", () => {
    const n = new Notificacao(dados());
    assert.equal(n.status, "AGENDADA");
    assert.equal(n.titulo, "Reserva confirmada");
    assert.equal(n.mensagem, "Sua bicicleta está reservada.");
    assert.equal(n.tentativas, 0);
    assert.equal(n.enviadaEm, null);
    assert.equal(n.lidaEm, null);
  });

  test("recusa dados inválidos", () => {
    const ruins = [
      { id: "" },
      { usuarioId: "" },
      { canal: "SMS" },
      { tipo: "PROMOCAO" },
      { titulo: "  " },
      { mensagem: "" },
      { agendadaPara: new Date("lixo") },
    ];
    for (const ruim of ruins) {
      assert.throws(() => new Notificacao(dados(ruim as never)), RangeError, JSON.stringify(ruim));
    }
    assert.deepEqual([...CANAIS_DE_NOTIFICACAO], ["WEB_PUSH", "WHATSAPP", "EMAIL"]);
    assert.equal(TIPOS_DE_NOTIFICACAO.length, 5);
  });

  test("enviar entrega só o necessário pelo canal e passa para ENVIADA", async () => {
    const { enviadas, enviador } = enviadorQueGrava();
    const n = new Notificacao(dados());
    assert.equal(await n.enviar(enviador, HORA), true);
    assert.equal(n.status, "ENVIADA");
    assert.equal(n.enviadaEm?.getTime(), HORA.getTime());
    assert.equal(n.tentativas, 1);
    assert.deepEqual(enviadas, [
      {
        usuarioId: "u-1",
        canal: "WHATSAPP",
        tipo: "RESERVA_CONFIRMADA",
        titulo: "Reserva confirmada",
        mensagem: "Sua bicicleta está reservada.",
      },
    ]);
  });

  test("só envia a partir da hora marcada", async () => {
    const { enviadas, enviador } = enviadorQueGrava();
    const n = new Notificacao(dados());
    await assert.rejects(() => n.enviar(enviador, new Date(HORA.getTime() - 1)), NotificacaoInvalida);
    assert.equal(n.status, "AGENDADA");
    assert.equal(n.tentativas, 0);
    assert.equal(enviadas.length, 0);
    assert.equal(n.estaNaHora(HORA), true);
    assert.equal(n.estaNaHora(new Date(HORA.getTime() - 1)), false);
  });

  test("se o canal falha: FALHA, tentativa contada, erro não sobe e nada vaza", async () => {
    const n = new Notificacao(dados());
    assert.equal(await n.enviar(enviadorQueFalha, HORA), false);
    assert.equal(n.status, "FALHA");
    assert.equal(n.tentativas, 1);
    assert.equal(n.enviadaEm, null);
    assert.ok(!JSON.stringify(Object.getOwnPropertyNames(n)).includes("abc123"));
  });

  test("uma notificação com falha pode ser reenviada", async () => {
    const { enviador } = enviadorQueGrava();
    const n = new Notificacao(dados());
    await n.enviar(enviadorQueFalha, HORA);
    assert.equal(await n.enviar(enviador, HORA), true);
    assert.equal(n.status, "ENVIADA");
    assert.equal(n.tentativas, 2);
  });

  test("não reenvia o que já foi enviado ou lido", async () => {
    const { enviador } = enviadorQueGrava();
    const n = new Notificacao(dados());
    await n.enviar(enviador, HORA);
    await assert.rejects(() => n.enviar(enviador, HORA), NotificacaoInvalida);
    n.marcarComoLida(HORA);
    await assert.rejects(() => n.enviar(enviador, HORA), NotificacaoInvalida);
  });

  test("marcarComoLida: só depois de enviada, e é idempotente", async () => {
    const { enviador } = enviadorQueGrava();
    const n = new Notificacao(dados());
    assert.throws(() => n.marcarComoLida(HORA), NotificacaoInvalida);
    await n.enviar(enviador, HORA);
    const lida = new Date(HORA.getTime() + 60_000);
    n.marcarComoLida(lida);
    assert.equal(n.status, "LIDA");
    assert.equal(n.lidaEm?.getTime(), lida.getTime());
    n.marcarComoLida(new Date(HORA.getTime() + 999_000));
    assert.equal(n.lidaEm?.getTime(), lida.getTime());
  });

  test("uma notificação com falha não pode ser marcada como lida", async () => {
    const n = new Notificacao(dados());
    await n.enviar(enviadorQueFalha, HORA);
    assert.throws(() => n.marcarComoLida(HORA), NotificacaoInvalida);
  });

  test("encapsulamento: datas devolvidas são cópias", () => {
    const n = new Notificacao(dados());
    n.agendadaPara.setUTCFullYear(1999);
    assert.equal(n.agendadaPara.getUTCFullYear(), 2026);
    assert.deepEqual(Object.keys(n), []);
  });
});

describe("RoteadorDeEnvio (polimorfismo por canal)", () => {
  test("entrega cada mensagem ao enviador do seu canal", async () => {
    const whats = enviadorQueGrava();
    const email = enviadorQueGrava();
    const roteador = new RoteadorDeEnvio({ WHATSAPP: whats.enviador, EMAIL: email.enviador });
    await new Notificacao(dados({ canal: "WHATSAPP" })).enviar(roteador, HORA);
    await new Notificacao(dados({ id: "n-2", canal: "EMAIL" })).enviar(roteador, HORA);
    assert.equal(whats.enviadas.length, 1);
    assert.equal(email.enviadas.length, 1);
    assert.equal(whats.enviadas[0].canal, "WHATSAPP");
    assert.equal(email.enviadas[0].canal, "EMAIL");
    assert.deepEqual(roteador.canaisDisponiveis().sort(), ["EMAIL", "WHATSAPP"]);
  });

  test("canal sem enviador configurado: a notificação vai para FALHA, sem derrubar quem varre", async () => {
    const roteador = new RoteadorDeEnvio({ EMAIL: enviadorQueGrava().enviador });
    const n = new Notificacao(dados({ canal: "WEB_PUSH" }));
    assert.equal(await n.enviar(roteador, HORA), false);
    assert.equal(n.status, "FALHA");
  });

  test("um enviador de teste serve no lugar de qualquer canal (mesma interface)", async () => {
    const { enviadas, enviador } = enviadorQueGrava();
    for (const canal of CANAIS_DE_NOTIFICACAO) {
      await new Notificacao(dados({ id: canal, canal })).enviar(enviador, HORA);
    }
    assert.equal(enviadas.length, 3);
  });
});
