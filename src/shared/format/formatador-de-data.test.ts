import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FormatadorDeData } from "./formatador-de-data.ts";

const fmt = new FormatadorDeData("America/Fortaleza", "-03:00");

test("dataHora converte UTC para o horário de São Luís", () => {
  // contrato: a API devolve 12:00Z para 09:00 local
  assert.equal(fmt.dataHora("2026-11-14T12:00:00.000Z"), "14/11/2026 09:00");
});

test("dataHora: 02:30 UTC ainda é 23:30 do dia anterior em São Luís", () => {
  assert.equal(fmt.dataHora("2026-11-15T02:30:00.000Z"), "14/11/2026 23:30");
});

test("dataHora aceita Date", () => {
  assert.equal(fmt.dataHora(new Date("2026-11-14T12:00:00Z")), "14/11/2026 09:00");
});

test("dataHora não usa horário de verão em nenhuma época do ano", () => {
  assert.equal(fmt.dataHora("2026-01-10T15:00:00Z"), "10/01/2026 12:00");
  assert.equal(fmt.dataHora("2026-07-10T15:00:00Z"), "10/07/2026 12:00");
});

test("dataHora recusa data inválida", () => {
  assert.throws(() => fmt.dataHora("não é data"), RangeError);
});

// ---------- formatarPeriodo ----------

test("periodo no mesmo dia local mostra a data uma vez", () => {
  assert.equal(
    fmt.periodo("2026-11-14T12:00:00.000Z", "2026-11-14T16:00:00.000Z"),
    "14/11/2026, 09:00 às 13:00",
  );
});

test("periodo em dias locais diferentes mostra as duas datas", () => {
  assert.equal(
    fmt.periodo("2026-11-14T12:00:00.000Z", "2026-11-15T12:00:00.000Z"),
    "14/11/2026 09:00 às 15/11/2026 09:00",
  );
});

test("periodo compara o dia no fuso local, não em UTC", () => {
  // 23:00 e 23:45 locais de 14/11: em UTC já é dia 15, mas localmente é o mesmo dia
  assert.equal(
    fmt.periodo("2026-11-15T02:00:00.000Z", "2026-11-15T02:45:00.000Z"),
    "14/11/2026, 23:00 às 23:45",
  );
  // 22:00 local de 14/11 até 00:30 local de 15/11: em UTC é tudo dia 15
  assert.equal(
    fmt.periodo("2026-11-15T01:00:00.000Z", "2026-11-15T03:30:00.000Z"),
    "14/11/2026 22:00 às 15/11/2026 00:30",
  );
});

// ---------- localParaIso (o que o cliente digita -> ISO com -03:00) ----------

test("paraIso monta ISO com offset -03:00, no formato do contrato", () => {
  assert.equal(fmt.paraIso("2026-11-14", "09:00"), "2026-11-14T09:00:00-03:00");
});

test("paraIso 23:30 local é 02:30 UTC do dia seguinte", () => {
  const iso = fmt.paraIso("2026-11-14", "23:30");
  assert.equal(iso, "2026-11-14T23:30:00-03:00");
  assert.equal(new Date(iso).toISOString(), "2026-11-15T02:30:00.000Z");
});

test("paraIso vira o ano: 31/12 23:30 local é 01/01 em UTC", () => {
  const iso = fmt.paraIso("2026-12-31", "23:30");
  assert.equal(new Date(iso).toISOString(), "2027-01-01T02:30:00.000Z");
});

test("paraIso 00:00 local é 03:00 UTC do mesmo dia", () => {
  assert.equal(
    new Date(fmt.paraIso("2026-11-14", "00:00")).toISOString(),
    "2026-11-14T03:00:00.000Z",
  );
});

test("paraIso e formatarDataHora são inversos", () => {
  assert.equal(fmt.dataHora(fmt.paraIso("2026-11-14", "23:30")), "14/11/2026 23:30");
});

test("paraIso recusa formatos fora de AAAA-MM-DD e HH:mm", () => {
  assert.throws(() => fmt.paraIso("14/11/2026", "09:00"), RangeError);
  assert.throws(() => fmt.paraIso("2026-11-14", "9:00"), RangeError);
  assert.throws(() => fmt.paraIso("2026-11-14", "09:00:00"), RangeError);
});

test("paraIso recusa data e hora que não existem", () => {
  assert.throws(() => fmt.paraIso("2026-02-30", "09:00"), RangeError);
  assert.throws(() => fmt.paraIso("2026-13-01", "09:00"), RangeError);
  assert.throws(() => fmt.paraIso("2026-11-14", "24:00"), RangeError);
  assert.throws(() => fmt.paraIso("2026-11-14", "09:60"), RangeError);
});

// ---------- formatarDuracao ----------

test("duracao em horas", () => {
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T15:00:00Z"), "3 h");
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T13:00:00Z"), "1 h");
});

test("duracao em dias, com singular e plural", () => {
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-15T12:00:00Z"), "1 dia");
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-16T12:00:00Z"), "2 dias");
});

test("duracao combina dias, horas e minutos quando não é redondo", () => {
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T13:30:00Z"), "1 h 30 min");
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T12:45:00Z"), "45 min");
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-15T15:00:00Z"), "1 dia 3 h");
});

test("duracao funciona com ISO em offsets diferentes", () => {
  assert.equal(
    fmt.duracao("2026-11-14T09:00:00-03:00", "2026-11-14T16:00:00.000Z"),
    "4 h",
  );
});

test("duracao recusa fim que não é depois do início", () => {
  assert.throws(() => fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T12:00:00Z"), RangeError);
  assert.throws(() => fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T11:00:00Z"), RangeError);
});

test("duracao do dia que atravessa a virada em UTC conta o tempo real", () => {
  // 22:00 local até 01:00 local do dia seguinte = 3 h
  assert.equal(
    fmt.duracao(fmt.paraIso("2026-11-14", "22:00"), fmt.paraIso("2026-11-15", "01:00")),
    "3 h",
  );
});
test("dataHora: meia-noite local é 00:00, nunca 24:00", () => {
  assert.equal(fmt.dataHora("2026-11-14T03:00:00Z"), "14/11/2026 00:00");
  assert.equal(fmt.dataHora("2026-11-14T03:59:00Z"), "14/11/2026 00:59");
});

test("dataHora: 23:59 local e o minuto seguinte", () => {
  assert.equal(fmt.dataHora("2026-11-15T02:59:00Z"), "14/11/2026 23:59");
  assert.equal(fmt.dataHora("2026-11-15T03:00:00Z"), "15/11/2026 00:00");
});

test("dataHora: virada de ano em UTC ainda é 31/12 localmente", () => {
  assert.equal(fmt.dataHora("2027-01-01T02:59:00Z"), "31/12/2026 23:59");
  assert.equal(fmt.dataHora("2027-01-01T03:00:00Z"), "01/01/2027 00:00");
});

test("dataHora: dia bissexto de 2028 e a virada para 01/03", () => {
  assert.equal(fmt.dataHora("2028-02-29T15:00:00Z"), "29/02/2028 12:00");
  assert.equal(fmt.dataHora("2028-03-01T02:59:00Z"), "29/02/2028 23:59");
  assert.equal(fmt.dataHora("2028-03-01T03:00:00Z"), "01/03/2028 00:00");
});

test("dataHora: dia, mês e hora de um dígito saem com zero à esquerda", () => {
  assert.equal(fmt.dataHora("2026-01-05T11:05:00Z"), "05/01/2026 08:05");
});

test("dataHora: ignora segundos e milissegundos", () => {
  assert.equal(fmt.dataHora("2026-11-14T12:00:59.999Z"), "14/11/2026 09:00");
});

test("dataHora: ISO com offset de entrada é normalizado para São Luís", () => {
  assert.equal(fmt.dataHora("2026-11-14T09:00:00-03:00"), "14/11/2026 09:00");
  assert.equal(fmt.dataHora("2026-11-14T12:00:00+00:00"), "14/11/2026 09:00");
  assert.equal(fmt.dataHora("2026-11-14T21:00:00+09:00"), "14/11/2026 09:00");
});

test("dataHora: São Luís nunca teve horário de verão, mesmo antes de 2019", () => {
  // São Paulo estava em UTC-2 nesses dias; São Luís sempre esteve em UTC-3.
  // Sem isto, trocar America/Fortaleza por America/Sao_Paulo passaria despercebido.
  assert.equal(fmt.dataHora("2018-12-15T15:00:00Z"), "15/12/2018 12:00");
  assert.equal(fmt.dataHora("2018-01-10T15:00:00Z"), "10/01/2018 12:00");
});

test("dataHora recusa Date inválida, string vazia e lixo", () => {
  assert.throws(() => fmt.dataHora(new Date("x")), RangeError);
  assert.throws(() => fmt.dataHora(""), RangeError);
  assert.throws(() => fmt.dataHora("2026-13-45T00:00:00Z"), RangeError);
});

// ---------- formatarPeriodo ----------

test("periodo: 23:59 → 00:00 locais cruza o dia e mostra as duas datas", () => {
  assert.equal(
    fmt.periodo("2026-11-15T02:59:00Z", "2026-11-15T03:00:00Z"),
    "14/11/2026 23:59 às 15/11/2026 00:00",
  );
});

test("periodo: reserva de 7 dias (limite do contrato)", () => {
  assert.equal(
    fmt.periodo("2026-11-14T12:00:00Z", "2026-11-21T12:00:00Z"),
    "14/11/2026 09:00 às 21/11/2026 09:00",
  );
});

test("periodo: aceita Date e ISO misturados", () => {
  assert.equal(
    fmt.periodo(new Date("2026-11-14T12:00:00Z"), "2026-11-14T16:00:00.000Z"),
    "14/11/2026, 09:00 às 13:00",
  );
});

test("periodo recusa data inválida em qualquer ponta", () => {
  assert.throws(() => fmt.periodo("x", "2026-11-14T16:00:00Z"), RangeError);
  assert.throws(() => fmt.periodo("2026-11-14T12:00:00Z", "x"), RangeError);
});

// ---------- localParaIso ----------

test("paraIso: 29/02 só em ano bissexto", () => {
  assert.equal(fmt.paraIso("2028-02-29", "10:00"), "2028-02-29T10:00:00-03:00");
  assert.equal(fmt.paraIso("2000-02-29", "10:00"), "2000-02-29T10:00:00-03:00"); // 2000 é bissexto
  assert.throws(() => fmt.paraIso("2026-02-29", "10:00"), RangeError);
  assert.throws(() => fmt.paraIso("2100-02-29", "10:00"), RangeError); // 2100 não é
});

test("paraIso: dia 31 só nos meses de 31 dias", () => {
  for (const mes of ["01", "03", "05", "07", "08", "10", "12"]) {
    assert.doesNotThrow(() => fmt.paraIso(`2026-${mes}-31`, "10:00"), `mês ${mes}`);
  }
  for (const mes of ["02", "04", "06", "09", "11"]) {
    assert.throws(() => fmt.paraIso(`2026-${mes}-31`, "10:00"), RangeError, `mês ${mes}`);
  }
});

test("paraIso: dia 00 e mês 00 não existem", () => {
  assert.throws(() => fmt.paraIso("2026-11-00", "10:00"), RangeError);
  assert.throws(() => fmt.paraIso("2026-00-10", "10:00"), RangeError);
});

test("paraIso: 00:00 e 23:59 valem; 23:60, 24:00 e 99:99 não", () => {
  assert.equal(fmt.paraIso("2026-11-14", "00:00"), "2026-11-14T00:00:00-03:00");
  assert.equal(fmt.paraIso("2026-11-14", "23:59"), "2026-11-14T23:59:00-03:00");
  assert.throws(() => fmt.paraIso("2026-11-14", "23:60"), RangeError);
  assert.throws(() => fmt.paraIso("2026-11-14", "24:00"), RangeError);
  assert.throws(() => fmt.paraIso("2026-11-14", "99:99"), RangeError);
});

test("paraIso recusa vazio, espaços, quebra de linha e caracteres extras", () => {
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
    assert.throws(() => fmt.paraIso(d, h), RangeError, JSON.stringify([d, h]));
  }
});

test("paraIso: exemplo de reserva do contrato (09:00 a 13:00) vira 12:00Z a 16:00Z", () => {
  assert.equal(
    new Date(fmt.paraIso("2026-11-14", "09:00")).toISOString(),
    "2026-11-14T12:00:00.000Z",
  );
  assert.equal(
    new Date(fmt.paraIso("2026-11-14", "13:00")).toISOString(),
    "2026-11-14T16:00:00.000Z",
  );
});

test("paraIso: o resultado segue o formato de data do contrato", () => {
  assert.match(
    fmt.paraIso("2026-11-14", "09:00"),
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
        const iso = fmt.paraIso(dia, hora);
        const utcMs = Date.UTC(Number(a), Number(m) - 1, Number(d), h + 3, min);
        assert.equal(new Date(iso).getTime(), utcMs, `UTC de ${dia} ${hora}`);
        assert.equal(fmt.dataHora(iso), `${d}/${m}/${a} ${hora}`, `volta de ${dia} ${hora}`);
      }
    }
  }
});

test("propriedade: o dia em UTC avança exatamente quando a hora local é >= 21:00", () => {
  for (let h = 0; h < 24; h++) {
    const iso = fmt.paraIso("2026-11-14", `${String(h).padStart(2, "0")}:00`);
    const diaUtc = new Date(iso).toISOString().slice(0, 10);
    assert.equal(diaUtc, h >= 21 ? "2026-11-15" : "2026-11-14", `hora local ${h}`);
  }
});

// ---------- formatarDuracao ----------

test("duracao: limites do contrato, 1 hora e 7 dias", () => {
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T13:00:00Z"), "1 h");
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-21T12:00:00Z"), "7 dias");
});

test("duracao: 23 h não vira dia; 24 h vira 1 dia; 25 h vira 1 dia 1 h", () => {
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-15T11:00:00Z"), "23 h");
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-15T12:00:00Z"), "1 dia");
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-15T13:00:00Z"), "1 dia 1 h");
});

test("duracao: dias, horas e minutos juntos", () => {
  assert.equal(
    fmt.duracao("2026-11-14T12:00:00Z", "2026-11-16T14:15:00Z"),
    "2 dias 2 h 15 min",
  );
});

test("duracao: segundos são descartados, não arredondados", () => {
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T13:00:59Z"), "1 h");
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T12:01:59Z"), "1 min");
});

test("duracao: menos de 1 minuto não vira texto vazio", () => {
  assert.equal(fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T12:00:30Z"), "0 min");
});

test("duracao: aceita Date e atravessa a virada de ano", () => {
  assert.equal(
    fmt.duracao(new Date("2026-12-31T23:00:00Z"), new Date("2027-01-01T02:00:00Z")),
    "3 h",
  );
});

test("duracao recusa data inválida em qualquer ponta", () => {
  assert.throws(() => fmt.duracao("x", "2026-11-14T12:00:00Z"), RangeError);
  assert.throws(() => fmt.duracao("2026-11-14T12:00:00Z", "x"), RangeError);
});

test("duracao: só depende dos instantes, não do offset em que foram escritos", () => {
  const a = fmt.duracao("2026-11-14T09:00:00-03:00", "2026-11-14T13:00:00-03:00");
  const b = fmt.duracao("2026-11-14T12:00:00Z", "2026-11-14T16:00:00Z");
  assert.equal(a, "4 h");
  assert.equal(a, b);
});

// ---------- independência do fuso da máquina ----------

test("o resultado é o mesmo qualquer que seja o fuso do processo (TZ)", () => {
  const modulo = pathToFileURL(fileURLToPath(new URL("./formatador-de-data.ts", import.meta.url))).href;
  const script = `
    import { FormatadorDeData } from ${JSON.stringify(modulo)};
    const fmt = new FormatadorDeData("America/Fortaleza", "-03:00");
    const iso = fmt.paraIso("2026-11-14", "23:30");
    console.log(JSON.stringify([
      iso,
      new Date(iso).toISOString(),
      fmt.dataHora("2026-11-15T02:30:00.000Z"),
      fmt.periodo("2026-11-15T01:00:00.000Z", "2026-11-15T03:30:00.000Z"),
      fmt.duracao("2026-11-14T12:00:00Z", "2026-11-15T15:00:00Z"),
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
