import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AderenciaDaRecomendacao,
  DURACOES,
  FormularioDeBusca,
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
  assert.deepEqual(new FormularioDeBusca(valido).validar(agora), {});
});

test("pede os campos que faltam", () => {
  const erros = new FormularioDeBusca({ data: "", hora: "", duracao: "", atividade: "" }).validar(agora);
  assert.ok(erros.data && erros.hora && erros.duracao);
});

test("recusa retirada no passado ou agora mesmo", () => {
  assert.ok(new FormularioDeBusca({ ...valido, data: "2026-11-13" }).validar(agora).data);
  assert.ok(new FormularioDeBusca({ ...valido, data: "2026-11-14", hora: "10:00" }).validar(agora).data);
  assert.deepEqual(new FormularioDeBusca({ ...valido, data: "2026-11-14", hora: "10:01" }).validar(agora), {});
});

test("recusa data que não existe e atividade fora da lista", () => {
  assert.ok(new FormularioDeBusca({ ...valido, data: "2026-02-30" }).validar(agora).data);
  assert.ok(new FormularioDeBusca({ ...valido, atividade: "VOO" }).validar(agora).atividade);
  assert.ok(new FormularioDeBusca({ ...valido, duracao: "5" }).validar(agora).duracao);
});

test("FormularioDeBusca.periodo soma a duração ao início, no fuso de São Luís", () => {
  assert.deepEqual(new FormularioDeBusca(valido).periodo(), {
    inicio: "2026-11-15T09:00:00-03:00",
    fim: "2026-11-15T16:00:00.000Z",
  });
});

test("FormularioDeBusca.consulta só manda a atividade quando escolhida", () => {
  const sem = new URLSearchParams(new FormularioDeBusca(valido).consulta());
  assert.equal(sem.get("inicio"), "2026-11-15T09:00:00-03:00");
  assert.equal(sem.get("fim"), "2026-11-15T16:00:00.000Z");
  assert.equal(sem.has("atividade"), false);

  const com = new URLSearchParams(new FormularioDeBusca({ ...valido, atividade: "TRILHA" }).consulta());
  assert.equal(com.get("atividade"), "TRILHA");
});

test("AderenciaDaRecomendacao.dosPontos separa em três faixas", () => {
  assert.equal(AderenciaDaRecomendacao.dosPontos(100).variant, "sucesso");
  assert.equal(AderenciaDaRecomendacao.dosPontos(80).variant, "sucesso");
  assert.equal(AderenciaDaRecomendacao.dosPontos(79).variant, "info");
  assert.equal(AderenciaDaRecomendacao.dosPontos(50).variant, "info");
  assert.equal(AderenciaDaRecomendacao.dosPontos(49).variant, "neutro");
});

test("FormularioDeBusca não guarda campo visível e não muda se o objeto de origem mudar", () => {
  const origem: FormularioBusca = { ...valido };
  const form = new FormularioDeBusca(origem);
  assert.deepEqual(Object.keys(form), []);
  origem.data = "2000-01-01";
  assert.deepEqual(form.validar(agora), {});
  const copia = form.dados;
  copia.hora = "23:00";
  assert.equal(form.dados.hora, "09:00");
});

test("FormularioDeBusca devolve mais de um erro de uma vez e só confere a data se data e hora vieram", () => {
  const erros = new FormularioDeBusca({ data: "2026-02-30", hora: "", duracao: "5", atividade: "VOO" }).validar(agora);
  assert.deepEqual(Object.keys(erros).sort(), ["atividade", "duracao", "hora"]);
});

test("FormularioDeBusca aceita todas as durações da lista e nenhuma fora dela", () => {
  for (const d of DURACOES) {
    assert.deepEqual(new FormularioDeBusca({ ...valido, duracao: d.valor }).validar(agora), {}, d.valor);
  }
  assert.ok(new FormularioDeBusca({ ...valido, duracao: "90" }).validar(agora).duracao);
  assert.ok(new FormularioDeBusca({ ...valido, duracao: "" }).validar(agora).duracao);
});

test("FormularioDeBusca usa a mensagem exata de cada erro", () => {
  const vazio = new FormularioDeBusca({ data: "", hora: "", duracao: "", atividade: "" }).validar(agora);
  assert.equal(vazio.data, "Escolha o dia da retirada.");
  assert.equal(vazio.hora, "Escolha o horário de início.");
  assert.equal(vazio.duracao, "Escolha por quanto tempo.");
  assert.equal(new FormularioDeBusca({ ...valido, atividade: "VOO" }).validar(agora).atividade, "Escolha uma das opções.");
  assert.equal(new FormularioDeBusca({ ...valido, data: "2026-02-30" }).validar(agora).data, "Essa data ou hora não existe.");
  assert.equal(new FormularioDeBusca({ ...valido, data: "2026-11-13" }).validar(agora).data, "A retirada precisa ser no futuro.");
});

test("AderenciaDaRecomendacao tem os rótulos e as bordas 80 e 50", () => {
  assert.deepEqual(AderenciaDaRecomendacao.dosPontos(80), { rotulo: "Muito indicada", variant: "sucesso" });
  assert.deepEqual(AderenciaDaRecomendacao.dosPontos(50), { rotulo: "Indicada", variant: "info" });
  assert.deepEqual(AderenciaDaRecomendacao.dosPontos(0), { rotulo: "Possível", variant: "neutro" });
  assert.throws(() => new (AderenciaDaRecomendacao as unknown as new () => unknown)(), /só tem métodos estáticos/);
});
