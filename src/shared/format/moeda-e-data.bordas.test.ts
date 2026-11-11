import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  formatarReais,
  formatarDataHora,
  formatarPeriodo,
  localParaIso,
  formatarDuracao,
} from "./moeda-e-data.ts";

// Bordas e propriedades. Os casos principais estão em moeda-e-data.test.ts.

// ---------- formatarReais ----------

test("formatarReais: separador de milhar em todas as ordens de grandeza", () => {
  assert.equal(formatarReais(99), "R$ 0,99");
  assert.equal(formatarReais(100), "R$ 1,00");
  assert.equal(formatarReais(99_999), "R$ 999,99");
  assert.equal(formatarReais(100_000), "R$ 1.000,00");
  assert.equal(formatarReais(123_456_789), "R$ 1.234.567,89");
  assert.equal(formatarReais(100_000_000_000), "R$ 1.000.000.000,00");
});

test("formatarReais: negativos levam o sinal antes do R$", () => {
  assert.equal(formatarReais(-5), "-R$ 0,05");
  assert.equal(formatarReais(-123_456), "-R$ 1.234,56");
});

test("formatarReais: -0 é tratado como zero, sem sinal", () => {
  assert.equal(formatarReais(-0), "R$ 0,00");
});

test("formatarReais recusa Infinity e valores não numéricos", () => {
  assert.throws(() => formatarReais(Infinity), RangeError);
  assert.throws(() => formatarReais(-Infinity), RangeError);
  assert.throws(() => formatarReais("100" as unknown as number), RangeError);
  assert.throws(() => formatarReais(undefined as unknown as number), RangeError);
});

test("formatarReais: valores do contrato (R$ 10, 50 e 150)", () => {
  assert.equal(formatarReais(1000), "R$ 10,00");
  assert.equal(formatarReais(5000), "R$ 50,00");
  assert.equal(formatarReais(15000), "R$ 150,00");
});

test("formatarReais: de 0 a 99.999 centavos sempre há exatamente duas casas decimais", () => {
  for (let c = 0; c < 100_000; c++) {
    const texto = formatarReais(c);
    assert.match(texto, /^R\$ \d{1,3}(\.\d{3})*,\d{2}$/, `centavos=${c}`);
    // volta para centavos e confere
    const volta = Number(texto.replace("R$ ", "").replace(/\./g, "").replace(",", ""));
    assert.equal(volta, c);
  }
});

// ---------- formatarDataHora ----------

test("formatarDataHora: meia-noite local é 00:00, nunca 24:00", () => {
  assert.equal(formatarDataHora("2026-11-14T03:00:00Z"), "14/11/2026 00:00");
  assert.equal(formatarDataHora("2026-11-14T03:59:00Z"), "14/11/2026 00:59");
});

test("formatarDataHora: 23:59 local e o minuto seguinte", () => {
  assert.equal(formatarDataHora("2026-11-15T02:59:00Z"), "14/11/2026 23:59");
  assert.equal(formatarDataHora("2026-11-15T03:00:00Z"), "15/11/2026 00:00");
});

test("formatarDataHora: virada de ano em UTC ainda é 31/12 localmente", () => {
  assert.equal(formatarDataHora("2027-01-01T02:59:00Z"), "31/12/2026 23:59");
  assert.equal(formatarDataHora("2027-01-01T03:00:00Z"), "01/01/2027 00:00");
});

test("formatarDataHora: dia bissexto de 2028 e a virada para 01/03", () => {
  assert.equal(formatarDataHora("2028-02-29T15:00:00Z"), "29/02/2028 12:00");
  assert.equal(formatarDataHora("2028-03-01T02:59:00Z"), "29/02/2028 23:59");
  assert.equal(formatarDataHora("2028-03-01T03:00:00Z"), "01/03/2028 00:00");
});

test("formatarDataHora: dia, mês e hora de um dígito saem com zero à esquerda", () => {
  assert.equal(formatarDataHora("2026-01-05T11:05:00Z"), "05/01/2026 08:05");
});

test("formatarDataHora: ignora segundos e milissegundos", () => {
  assert.equal(formatarDataHora("2026-11-14T12:00:59.999Z"), "14/11/2026 09:00");
});

test("formatarDataHora: ISO com offset de entrada é normalizado para São Luís", () => {
  assert.equal(formatarDataHora("2026-11-14T09:00:00-03:00"), "14/11/2026 09:00");
  assert.equal(formatarDataHora("2026-11-14T12:00:00+00:00"), "14/11/2026 09:00");
  assert.equal(formatarDataHora("2026-11-14T21:00:00+09:00"), "14/11/2026 09:00");
});

test("formatarDataHora: São Luís nunca teve horário de verão, mesmo antes de 2019", () => {
  // São Paulo estava em UTC-2 nesses dias; São Luís sempre esteve em UTC-3.
  // Sem isto, trocar America/Fortaleza por America/Sao_Paulo passaria despercebido.
  assert.equal(formatarDataHora("2018-12-15T15:00:00Z"), "15/12/2018 12:00");
  assert.equal(formatarDataHora("2018-01-10T15:00:00Z"), "10/01/2018 12:00");
});

test("formatarDataHora recusa Date inválida, string vazia e lixo", () => {
  assert.throws(() => formatarDataHora(new Date("x")), RangeError);
  assert.throws(() => formatarDataHora(""), RangeError);
  assert.throws(() => formatarDataHora("2026-13-45T00:00:00Z"), RangeError);
});

// ---------- formatarPeriodo ----------

test("formatarPeriodo: 23:59 → 00:00 locais cruza o dia e mostra as duas datas", () => {
  assert.equal(
    formatarPeriodo("2026-11-15T02:59:00Z", "2026-11-15T03:00:00Z"),
    "14/11/2026 23:59 às 15/11/2026 00:00",
  );
});

test("formatarPeriodo: reserva de 7 dias (limite do contrato)", () => {
  assert.equal(
    formatarPeriodo("2026-11-14T12:00:00Z", "2026-11-21T12:00:00Z"),
    "14/11/2026 09:00 às 21/11/2026 09:00",
  );
});

test("formatarPeriodo: aceita Date e ISO misturados", () => {
  assert.equal(
    formatarPeriodo(new Date("2026-11-14T12:00:00Z"), "2026-11-14T16:00:00.000Z"),
    "14/11/2026, 09:00 às 13:00",
  );
});

test("formatarPeriodo recusa data inválida em qualquer ponta", () => {
  assert.throws(() => formatarPeriodo("x", "2026-11-14T16:00:00Z"), RangeError);
  assert.throws(() => formatarPeriodo("2026-11-14T12:00:00Z", "x"), RangeError);
});

// ---------- localParaIso ----------

test("localParaIso: 29/02 só em ano bissexto", () => {
  assert.equal(localParaIso("2028-02-29", "10:00"), "2028-02-29T10:00:00-03:00");
  assert.equal(localParaIso("2000-02-29", "10:00"), "2000-02-29T10:00:00-03:00"); // 2000 é bissexto
  assert.throws(() => localParaIso("2026-02-29", "10:00"), RangeError);
  assert.throws(() => localParaIso("2100-02-29", "10:00"), RangeError); // 2100 não é
});

test("localParaIso: dia 31 só nos meses de 31 dias", () => {
  for (const mes of ["01", "03", "05", "07", "08", "10", "12"]) {
    assert.doesNotThrow(() => localParaIso(`2026-${mes}-31`, "10:00"), `mês ${mes}`);
  }
  for (const mes of ["02", "04", "06", "09", "11"]) {
    assert.throws(() => localParaIso(`2026-${mes}-31`, "10:00"), RangeError, `mês ${mes}`);
  }
});

test("localParaIso: dia 00 e mês 00 não existem", () => {
  assert.throws(() => localParaIso("2026-11-00", "10:00"), RangeError);
  assert.throws(() => localParaIso("2026-00-10", "10:00"), RangeError);
});

test("localParaIso: 00:00 e 23:59 valem; 23:60, 24:00 e 99:99 não", () => {
  assert.equal(localParaIso("2026-11-14", "00:00"), "2026-11-14T00:00:00-03:00");
  assert.equal(localParaIso("2026-11-14", "23:59"), "2026-11-14T23:59:00-03:00");
  assert.throws(() => localParaIso("2026-11-14", "23:60"), RangeError);
  assert.throws(() => localParaIso("2026-11-14", "24:00"), RangeError);
  assert.throws(() => localParaIso("2026-11-14", "99:99"), RangeError);
});

test("localParaIso recusa vazio, espaços, quebra de linha e caracteres extras", () => {
  const invalidos: Array<[string, string]> = [
    ["", "09:00"],
    ["2026-11-14", ""],
    [" 2026-11-14", "09:00"],
    ["2026-11-14 ", "09:00"],
    ["2026-11-14\n", "09:00"],
    ["2026-11-14", "09:00\n"],
    ["2026-11-14", " 09:00"],
    ["2026-11-14T09:00", "09:00"],
    ["2026-1-14", "09:00"],
    ["26-11-14", "09:00"],
    ["2026-11-14", "9:00"],
    ["2026-11-14", "09:0"],
    ["2026-11-14", "09h00"],
    ["2026-11-14", "09:00-03:00"],
  ];
  for (const [d, h] of invalidos) {
    assert.throws(() => localParaIso(d, h), RangeError, JSON.stringify([d, h]));
  }
});

test("localParaIso: exemplo de reserva do contrato (09:00 a 13:00) vira 12:00Z a 16:00Z", () => {
  assert.equal(
    new Date(localParaIso("2026-11-14", "09:00")).toISOString(),
    "2026-11-14T12:00:00.000Z",
  );
  assert.equal(
    new Date(localParaIso("2026-11-14", "13:00")).toISOString(),
    "2026-11-14T16:00:00.000Z",
  );
});

test("localParaIso: o resultado segue o formato de data do contrato", () => {
  assert.match(
    localParaIso("2026-11-14", "09:00"),
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/,
  );
});

// ---------- propriedades ----------

test("propriedade: cada minuto de dias-chave faz ida e volta (local → ISO → UTC → local)", () => {
  const dias = ["2026-11-14", "2026-12-31", "2027-01-01", "2028-02-29", "2028-03-01", "2026-06-30"];
  for (const dia of dias) {
    const [a, m, d] = dia.split("-");
    for (let h = 0; h < 24; h++) {
      for (let min = 0; min < 60; min++) {
        const hora = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        const iso = localParaIso(dia, hora);
        const utcMs = Date.UTC(Number(a), Number(m) - 1, Number(d), h + 3, min);
        assert.equal(new Date(iso).getTime(), utcMs, `UTC de ${dia} ${hora}`);
        assert.equal(formatarDataHora(iso), `${d}/${m}/${a} ${hora}`, `volta de ${dia} ${hora}`);
      }
    }
  }
});

test("propriedade: o dia em UTC avança exatamente quando a hora local é >= 21:00", () => {
  for (let h = 0; h < 24; h++) {
    const iso = localParaIso("2026-11-14", `${String(h).padStart(2, "0")}:00`);
    const diaUtc = new Date(iso).toISOString().slice(0, 10);
    assert.equal(diaUtc, h >= 21 ? "2026-11-15" : "2026-11-14", `hora local ${h}`);
  }
});

// ---------- formatarDuracao ----------

test("formatarDuracao: limites do contrato, 1 hora e 7 dias", () => {
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T13:00:00Z"), "1 h");
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-21T12:00:00Z"), "7 dias");
});

test("formatarDuracao: 23 h não vira dia; 24 h vira 1 dia; 25 h vira 1 dia 1 h", () => {
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-15T11:00:00Z"), "23 h");
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-15T12:00:00Z"), "1 dia");
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-15T13:00:00Z"), "1 dia 1 h");
});

test("formatarDuracao: dias, horas e minutos juntos", () => {
  assert.equal(
    formatarDuracao("2026-11-14T12:00:00Z", "2026-11-16T14:15:00Z"),
    "2 dias 2 h 15 min",
  );
});

test("formatarDuracao: segundos são descartados, não arredondados", () => {
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T13:00:59Z"), "1 h");
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T12:01:59Z"), "1 min");
});

test("formatarDuracao: menos de 1 minuto não vira texto vazio", () => {
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T12:00:30Z"), "0 min");
});

test("formatarDuracao: aceita Date e atravessa a virada de ano", () => {
  assert.equal(
    formatarDuracao(new Date("2026-12-31T23:00:00Z"), new Date("2027-01-01T02:00:00Z")),
    "3 h",
  );
});

test("formatarDuracao recusa data inválida em qualquer ponta", () => {
  assert.throws(() => formatarDuracao("x", "2026-11-14T12:00:00Z"), RangeError);
  assert.throws(() => formatarDuracao("2026-11-14T12:00:00Z", "x"), RangeError);
});

test("formatarDuracao: só depende dos instantes, não do offset em que foram escritos", () => {
  const a = formatarDuracao("2026-11-14T09:00:00-03:00", "2026-11-14T13:00:00-03:00");
  const b = formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T16:00:00Z");
  assert.equal(a, "4 h");
  assert.equal(a, b);
});

// ---------- independência do fuso da máquina ----------

test("o resultado é o mesmo qualquer que seja o fuso do processo (TZ)", () => {
  const modulo = pathToFileURL(fileURLToPath(new URL("./moeda-e-data.ts", import.meta.url))).href;
  const script = `
    import { formatarDataHora, formatarPeriodo, localParaIso, formatarDuracao } from ${JSON.stringify(modulo)};
    const iso = localParaIso("2026-11-14", "23:30");
    console.log(JSON.stringify([
      iso,
      new Date(iso).toISOString(),
      formatarDataHora("2026-11-15T02:30:00.000Z"),
      formatarPeriodo("2026-11-15T01:00:00.000Z", "2026-11-15T03:30:00.000Z"),
      formatarDuracao("2026-11-14T12:00:00Z", "2026-11-15T15:00:00Z"),
    ]));
  `;
  const esperado = JSON.stringify([
    "2026-11-14T23:30:00-03:00",
    "2026-11-15T02:30:00.000Z",
    "14/11/2026 23:30",
    "14/11/2026 22:00 às 15/11/2026 00:30",
    "1 dia 3 h",
  ]);
  for (const tz of ["UTC", "America/Sao_Paulo", "America/New_York", "Asia/Tokyo", "Pacific/Auckland"]) {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `TZ=${tz}: ${r.stderr}`);
    assert.equal(r.stdout.trim(), esperado, `TZ=${tz}`);
  }
});
