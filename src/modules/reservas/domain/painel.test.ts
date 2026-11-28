import assert from "node:assert/strict";
import { test } from "node:test";
import { FiltroDoPainel } from "./filtro-do-painel.ts";
import { ReservaDoPainel, type DadosDaReservaDoPainel } from "./reserva-do-painel.ts";
import { RegrasDeReserva } from "./reserva.ts";

const lido = (parametros: { status?: unknown; data?: unknown }) => FiltroDoPainel.validar(parametros);
const filtroOuFalha = (parametros: { status?: unknown; data?: unknown }) => {
  const r = lido(parametros);
  assert.ok("filtro" in r, JSON.stringify(r));
  return r.filtro;
};
const errosOuFalha = (parametros: { status?: unknown; data?: unknown }) => {
  const r = lido(parametros);
  assert.ok("erros" in r, "deveria recusar");
  return r.erros;
};

// ---------------------------------------------------------------- FiltroDoPainel
test("sem parâmetros (ausentes, nulos ou vazios) não há filtro", () => {
  for (const p of [{}, { status: null, data: null }, { status: "", data: "" }, { status: undefined, data: undefined }]) {
    const f = filtroOuFalha(p);
    assert.equal(f.vazio, true);
    assert.equal(f.status, null);
    assert.equal(f.inicioDoDia, null);
    assert.equal(f.fimDoDia, null);
  }
});

test("aceita cada status do contrato", () => {
  for (const status of RegrasDeReserva.STATUS) assert.equal(filtroOuFalha({ status }).status, status);
});

test("recusa status que não existe, em minúsculo, com espaço, de outro tipo ou com SQL", () => {
  for (const status of ["confirmada", " CONFIRMADA", "CONFIRMADA ", "ALUGADA", "x", 1, true, {}, [], ["CONFIRMADA"], "CONFIRMADA' OR '1'='1", "a".repeat(10_000)]) {
    const erros = errosOuFalha({ status });
    assert.match(erros.status, /Status inválido/, String(status).slice(0, 30));
    assert.ok(erros.status.includes("CONFIRMADA"), "lista os valores aceitos");
  }
});

test("o dia vira o intervalo [00:00, 00:00 do dia seguinte) no horário de São Luís (UTC-3)", () => {
  const f = filtroOuFalha({ data: "2026-11-14" });
  assert.equal(f.inicioDoDia?.toISOString(), "2026-11-14T03:00:00.000Z");
  assert.equal(f.fimDoDia?.toISOString(), "2026-11-15T03:00:00.000Z");
  assert.equal(f.vazio, false);
});

test("o dia vira mês e ano certo, e o 29/02 só existe em ano bissexto", () => {
  assert.equal(filtroOuFalha({ data: "2026-12-31" }).fimDoDia?.toISOString(), "2027-01-01T03:00:00.000Z");
  assert.equal(filtroOuFalha({ data: "2026-11-30" }).fimDoDia?.toISOString(), "2026-12-01T03:00:00.000Z");
  assert.equal(filtroOuFalha({ data: "2028-02-29" }).inicioDoDia?.toISOString(), "2028-02-29T03:00:00.000Z");
  assert.equal(filtroOuFalha({ data: "2028-02-28" }).fimDoDia?.toISOString(), "2028-02-29T03:00:00.000Z");
  assert.ok(errosOuFalha({ data: "2026-02-29" }).data);
});

test("recusa data que não existe, mal escrita, fora da faixa ou de outro tipo", () => {
  const ruins: unknown[] = [
    "2026-02-30", "2026-13-01", "2026-00-10", "2026-11-00", "2026-11-31", "2026-04-31",
    "14/11/2026", "2026-1-4", "26-11-14", " 2026-11-14", "2026-11-14 ", "2026-11-14\n", "2026-11-14T10:00", "2026-11-14T00:00:00-03:00",
    "abc", "0000-01-01", "1999-12-31", "2101-01-01", "9999-12-31", "-2026-11-14",
    20261114, true, {}, [], ["2026-11-14"], "2026-11-14'; DROP TABLE reserva;--", "2".repeat(5000),
  ];
  for (const data of ruins) assert.match(errosOuFalha({ data }).data, /AAAA-MM-DD/, String(data).slice(0, 30));
});

test("os limites da faixa de anos (2000 e 2100) são aceitos", () => {
  assert.ok(filtroOuFalha({ data: "2000-01-01" }));
  assert.ok(filtroOuFalha({ data: "2100-12-31" }));
});

test("status e data juntos valem os dois; erros dos dois campos vêm juntos", () => {
  const f = filtroOuFalha({ status: "EM_ANDAMENTO", data: "2026-11-14" });
  assert.equal(f.status, "EM_ANDAMENTO");
  assert.ok(f.inicioDoDia);
  const erros = errosOuFalha({ status: "x", data: "y" });
  assert.deepEqual(Object.keys(erros).sort(), ["data", "status"]);
});

test("as datas devolvidas são cópias: mexer nelas não muda o filtro", () => {
  const f = filtroOuFalha({ data: "2026-11-14" });
  f.inicioDoDia?.setUTCFullYear(1999);
  f.fimDoDia?.setUTCFullYear(1999);
  assert.equal(f.inicioDoDia?.toISOString(), "2026-11-14T03:00:00.000Z");
  assert.equal(f.fimDoDia?.toISOString(), "2026-11-15T03:00:00.000Z");
});

test("FiltroDoPainel é encapsulado: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(filtroOuFalha({ status: "CONFIRMADA" })), []);
});

// ---------------------------------------------------------------- ReservaDoPainel
const DADOS: DadosDaReservaDoPainel = {
  id: "r-1",
  codigo: "BIC-7K2F9Q",
  status: "CONFIRMADA",
  clienteId: "c-1",
  clienteNome: "Maria da Silva",
  tipoId: "t-1",
  tipoNome: "Urbana",
  bicicletaId: "b-3",
  bicicletaCodigo: "BIC-003",
  inicio: new Date("2026-11-14T12:00:00.000Z"),
  fim: new Date("2026-11-14T16:00:00.000Z"),
  valorAluguelCentavos: 4000,
};

test("paraDto devolve exatamente o formato da rota 25 do contrato", () => {
  assert.deepEqual(new ReservaDoPainel(DADOS).paraDto(), {
    id: "r-1",
    codigo: "BIC-7K2F9Q",
    status: "CONFIRMADA",
    cliente: { id: "c-1", nome: "Maria da Silva" },
    tipo: { id: "t-1", nome: "Urbana" },
    bicicleta: { id: "b-3", codigo: "BIC-003" },
    periodo: { inicio: "2026-11-14T12:00:00.000Z", fim: "2026-11-14T16:00:00.000Z" },
    valorAluguelCentavos: 4000,
  });
});

test("não existe inválida: sem id, status desconhecido, período invertido, valor quebrado ou negativo", () => {
  const ruins: Partial<DadosDaReservaDoPainel>[] = [
    { id: "" }, { codigo: "  " }, { clienteId: "" }, { tipoId: "" }, { bicicletaId: "" }, { bicicletaCodigo: "" },
    { status: "ALUGADA" as never },
    { inicio: DADOS.fim, fim: DADOS.inicio },
    { fim: DADOS.inicio },
    { inicio: new Date("x") },
    { valorAluguelCentavos: -1 }, { valorAluguelCentavos: 10.5 }, { valorAluguelCentavos: NaN },
  ];
  for (const ruim of ruins) assert.throws(() => new ReservaDoPainel({ ...DADOS, ...ruim }), RangeError, JSON.stringify(ruim));
});

test("é encapsulada: nenhum campo visível e o JSON sai igual ao paraDto", () => {
  const r = new ReservaDoPainel(DADOS);
  assert.deepEqual(Object.keys(r), []);
  assert.equal(JSON.stringify(r), JSON.stringify(r.paraDto()));
});

test("mudar as datas de origem depois não altera a reserva", () => {
  const inicio = new Date(DADOS.inicio);
  const r = new ReservaDoPainel({ ...DADOS, inicio });
  inicio.setUTCFullYear(1999);
  assert.equal(r.paraDto().periodo.inicio, "2026-11-14T12:00:00.000Z");
});

test("o dto devolvido é cópia: alterá-lo não muda a reserva", () => {
  const r = new ReservaDoPainel(DADOS);
  const dto = r.paraDto();
  dto.cliente.nome = "Outro";
  dto.periodo.inicio = "x";
  assert.equal(r.paraDto().cliente.nome, "Maria da Silva");
  assert.equal(r.paraDto().periodo.inicio, "2026-11-14T12:00:00.000Z");
});

test("o nome do cliente com HTML ou acentos sai como veio (a tela escapa)", () => {
  const nome = "<b>Zé</b> & Cia 🚲";
  assert.equal(new ReservaDoPainel({ ...DADOS, clienteNome: nome }).paraDto().cliente.nome, nome);
});
