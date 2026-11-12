import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aderenciaDosPontos,
  montarConsulta,
  periodoDaBusca,
  validarBusca,
  type FormularioBusca,
} from "./busca.ts";

const agora = new Date("2026-11-14T10:00:00-03:00");
const valido: FormularioBusca = {
  data: "2026-11-15",
  hora: "09:00",
  duracao: "240",
  atividade: "",
};

test("aceita uma busca completa e no futuro", () => {
  assert.deepEqual(validarBusca(valido, agora), {});
});

test("pede os campos que faltam", () => {
  const erros = validarBusca({ data: "", hora: "", duracao: "", atividade: "" }, agora);
  assert.ok(erros.data && erros.hora && erros.duracao);
});

test("recusa retirada no passado ou agora mesmo", () => {
  assert.ok(validarBusca({ ...valido, data: "2026-11-13" }, agora).data);
  assert.ok(validarBusca({ ...valido, data: "2026-11-14", hora: "10:00" }, agora).data);
  assert.deepEqual(validarBusca({ ...valido, data: "2026-11-14", hora: "10:01" }, agora), {});
});

test("recusa data que não existe e atividade fora da lista", () => {
  assert.ok(validarBusca({ ...valido, data: "2026-02-30" }, agora).data);
  assert.ok(validarBusca({ ...valido, atividade: "VOO" }, agora).atividade);
  assert.ok(validarBusca({ ...valido, duracao: "5" }, agora).duracao);
});

test("periodoDaBusca soma a duração ao início, no fuso de São Luís", () => {
  assert.deepEqual(periodoDaBusca(valido), {
    inicio: "2026-11-15T09:00:00-03:00",
    fim: "2026-11-15T16:00:00.000Z",
  });
});

test("montarConsulta só manda a atividade quando escolhida", () => {
  const sem = new URLSearchParams(montarConsulta(valido));
  assert.equal(sem.get("inicio"), "2026-11-15T09:00:00-03:00");
  assert.equal(sem.get("fim"), "2026-11-15T16:00:00.000Z");
  assert.equal(sem.has("atividade"), false);

  const com = new URLSearchParams(montarConsulta({ ...valido, atividade: "TRILHA" }));
  assert.equal(com.get("atividade"), "TRILHA");
});

test("aderenciaDosPontos separa em três faixas", () => {
  assert.equal(aderenciaDosPontos(100).variant, "sucesso");
  assert.equal(aderenciaDosPontos(80).variant, "sucesso");
  assert.equal(aderenciaDosPontos(79).variant, "info");
  assert.equal(aderenciaDosPontos(50).variant, "info");
  assert.equal(aderenciaDosPontos(49).variant, "neutro");
});
