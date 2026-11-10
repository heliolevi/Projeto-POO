import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularValorAluguel, horasCobradas } from "./preco.ts";

// Tipo "Passeio" do seed de desenvolvimento: R$ 12,00 por hora e R$ 60,00 por dia.
const PASSEIO = { precoHoraCentavos: 1200, precoDiaCentavos: 6000 };

const INICIO = new Date("2026-11-14T12:00:00.000Z");
const depois = (ms: number) => new Date(INICIO.getTime() + ms);
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

const valor = (duracaoMs: number, precos = PASSEIO) =>
  calcularValorAluguel({ inicio: INICIO, fim: depois(duracaoMs) }, precos);

// ---------- os casos pedidos na tarefa ----------

test("1 hora: cobra 1 hora", () => {
  assert.equal(valor(HORA), 1200);
});

test("3 h 10 min: arredonda para 4 horas", () => {
  assert.equal(valor(3 * HORA + 10 * MIN), 4800); // 4 x 1200, menor que 1 dia (6000)
});

test("exatamente 24 h: cobra 1 dia, não 24 horas", () => {
  assert.equal(valor(DIA), 6000);
});

test("25 h: 1 diária pelas primeiras 24 h mais 1 hora pelo que sobra", () => {
  assert.equal(valor(25 * HORA), 7200); // 6000 + 1200
});

test("7 dias: cobra 7 diárias", () => {
  assert.equal(valor(7 * DIA), 42000);
});

test("diária mais barata que as horas: vale a diária mesmo em poucas horas", () => {
  const diariaBarata = { precoHoraCentavos: 1200, precoDiaCentavos: 3000 };
  assert.equal(valor(3 * HORA, diariaBarata), 3000); // 3 x 1200 = 3600 > 3000
  assert.equal(valor(2 * HORA, diariaBarata), 2400); // 2 x 1200 = 2400 < 3000
});

// ---------- cada bloco de 24 h vale uma diária; o que sobra nunca passa de uma diária ----------

test("empate entre horas e diária: o valor é o mesmo", () => {
  assert.equal(valor(5 * HORA), 6000); // 5 x 1200 = 1 x 6000
});

test("23 h custa 1 diária; 24 h também; 25 h passa a 1 diária + 1 hora", () => {
  assert.equal(valor(23 * HORA), 6000);
  assert.equal(valor(24 * HORA), 6000);
  assert.equal(valor(25 * HORA), 7200);
});

test("depois do primeiro dia, as horas que sobram seguem a mesma regra", () => {
  assert.equal(valor(26 * HORA), 8400); // 6000 + 2 x 1200
  assert.equal(valor(29 * HORA), 12000); // 6000 + 5 x 1200 (= uma diária)
  assert.equal(valor(47 * HORA), 12000); // 6000 + 6000 (as 23 h que sobram valem 1 diária)
  assert.equal(valor(48 * HORA), 12000); // 2 diárias
  assert.equal(valor(49 * HORA), 13200); // 2 diárias + 1 hora
});

test("o valor nunca mistura mais de uma diária de sobra: 47 h custa o mesmo que 48 h", () => {
  assert.equal(valor(47 * HORA), valor(48 * HORA));
});

test("preço por hora maior que o da diária: nunca cobra mais que a diária", () => {
  const horaCara = { precoHoraCentavos: 9000, precoDiaCentavos: 5000 };
  assert.equal(valor(HORA, horaCara), 5000);
  assert.equal(valor(30 * HORA, horaCara), 10000);
});

test("preço zero em uma das pontas é aceito", () => {
  assert.equal(valor(3 * HORA, { precoHoraCentavos: 0, precoDiaCentavos: 6000 }), 0);
  assert.equal(valor(3 * HORA, { precoHoraCentavos: 1200, precoDiaCentavos: 0 }), 0);
});

// ---------- arredondamento das horas ----------

test("qualquer fração de hora conta como hora inteira", () => {
  assert.equal(valor(1 * MIN), 1200); // 1 minuto = 1 hora
  assert.equal(valor(59 * MIN + 59_999), 1200);
  assert.equal(valor(HORA + 1), 2400); // 1 ms a mais = 2 horas
});

test("24 h e 1 ms contam 25 horas: 1 diária + 1 hora", () => {
  assert.equal(valor(DIA + 1), 7200);
});

test("horasCobradas arredonda para cima, inclusive 1 ms", () => {
  const horas = (ms: number) => horasCobradas({ inicio: INICIO, fim: depois(ms) });
  assert.equal(horas(HORA), 1);
  assert.equal(horas(3 * HORA + 10 * MIN), 4);
  assert.equal(horas(4 * HORA + 1), 5);
  assert.equal(horas(7 * DIA), 168);
});

test("só importa o intervalo, não o fuso em que as datas foram escritas", () => {
  const a = calcularValorAluguel(
    { inicio: new Date("2026-11-14T09:00:00-03:00"), fim: new Date("2026-11-14T13:00:00-03:00") },
    PASSEIO,
  );
  const b = calcularValorAluguel(
    { inicio: new Date("2026-11-14T12:00:00Z"), fim: new Date("2026-11-14T16:00:00Z") },
    PASSEIO,
  );
  assert.equal(a, 4800);
  assert.equal(a, b);
});

// ---------- inteiro, sempre ----------

test("o valor é sempre um inteiro em centavos, em todos os minutos de 1 min a 7 dias", () => {
  const precos = { precoHoraCentavos: 1333, precoDiaCentavos: 7777 };
  for (let min = 1; min <= 7 * 24 * 60; min++) {
    const v = valor(min * MIN, precos);
    assert.ok(Number.isSafeInteger(v), `${min} min => ${v}`);
  }
});

test("bate com um oráculo independente: a forma mais barata de cobrir as horas com diárias e horas avulsas", () => {
  // Força bruta: para cada quantidade de diárias, as horas que faltam saem pelo preço da hora.
  // Vale quando a diária não custa mais que 24 horas avulsas (é o caso de todo tipo do catálogo).
  const precos = { precoHoraCentavos: 1333, precoDiaCentavos: 7777 };
  for (let h = 1; h <= 168; h++) {
    let maisBarato = Infinity;
    for (let diarias = 0; diarias <= Math.ceil(h / 24); diarias++) {
      const faltam = Math.max(0, h - diarias * 24);
      maisBarato = Math.min(maisBarato, diarias * precos.precoDiaCentavos + faltam * precos.precoHoraCentavos);
    }
    assert.equal(valor(h * HORA, precos), maisBarato, `${h} h`);
  }
});

test("o valor nunca diminui quando o período aumenta", () => {
  let anterior = 0;
  for (let min = 1; min <= 7 * 24 * 60; min += 7) {
    const v = valor(min * MIN);
    assert.ok(v >= anterior, `${min} min`);
    anterior = v;
  }
});

test("nunca passa de pagar tudo por hora nem de pagar todas as diárias iniciadas", () => {
  for (let h = 1; h <= 168; h++) {
    const v = valor(h * HORA);
    assert.ok(v <= h * PASSEIO.precoHoraCentavos, `${h} h acima do preço por hora`);
    assert.ok(v <= Math.ceil(h / 24) * PASSEIO.precoDiaCentavos, `${h} h acima das diárias iniciadas`);
  }
});

// ---------- entradas inválidas (erro de programação, não de usuário) ----------

test("recusa fim igual ou anterior ao início", () => {
  assert.throws(() => valor(0), RangeError);
  assert.throws(() => valor(-HORA), RangeError);
});

test("recusa data inválida", () => {
  const ruim = new Date("não é data");
  assert.throws(() => calcularValorAluguel({ inicio: ruim, fim: depois(HORA) }, PASSEIO), RangeError);
  assert.throws(() => calcularValorAluguel({ inicio: INICIO, fim: ruim }, PASSEIO), RangeError);
  assert.throws(() => horasCobradas({ inicio: ruim, fim: depois(HORA) }), RangeError);
});

test("recusa preço negativo, decimal, NaN ou que não seja número", () => {
  for (const ruim of [-1, 10.5, Number.NaN, Infinity, "1200" as unknown as number]) {
    assert.throws(() => valor(HORA, { precoHoraCentavos: ruim, precoDiaCentavos: 6000 }), RangeError, `hora=${String(ruim)}`);
    assert.throws(() => valor(HORA, { precoHoraCentavos: 1200, precoDiaCentavos: ruim }), RangeError, `dia=${String(ruim)}`);
  }
});

test("preço decimal é recusado mesmo quando o produto daria inteiro (10,5 x 2 h = 21)", () => {
  assert.throws(() => valor(2 * HORA, { precoHoraCentavos: 10.5, precoDiaCentavos: 6000 }), RangeError);
  assert.throws(() => valor(2 * HORA, { precoHoraCentavos: 1200, precoDiaCentavos: 10.5 }), RangeError);
});

test("recusa quando o resultado deixaria de ser um inteiro exato", () => {
  const enorme = { precoHoraCentavos: Number.MAX_SAFE_INTEGER, precoDiaCentavos: Number.MAX_SAFE_INTEGER };
  assert.throws(() => valor(7 * DIA, enorme), RangeError);
});

test("uma conta enorme não atrapalha quando o resultado é exato pela outra", () => {
  // A hora custa o maior inteiro seguro, mas a diária é R$ 60,00: o valor é a diária.
  const horaAbsurda = { precoHoraCentavos: Number.MAX_SAFE_INTEGER, precoDiaCentavos: 6000 };
  assert.equal(valor(3 * HORA, horaAbsurda), 6000);
  assert.equal(valor(30 * HORA, horaAbsurda), 12000); // 1 diária + (6 horas limitadas a 1 diária)
  // e o contrário: diária enorme, hora barata
  const diariaAbsurda = { precoHoraCentavos: 1200, precoDiaCentavos: Number.MAX_SAFE_INTEGER };
  assert.equal(valor(3 * HORA, diariaAbsurda), 3600);
});
