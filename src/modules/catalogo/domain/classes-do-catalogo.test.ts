import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictError } from "../../../shared/http/errors.ts";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { Periodo } from "../../../shared/dominio/periodo-aluguel.ts";
import { Bicicleta, TransicaoDeBicicletaInvalida } from "./bicicleta.ts";
import { paraPublico } from "./catalogo.ts";
import type { BicicletaAdmin, TipoAdmin } from "./catalogo.ts";
import { somenteDigitos } from "../../../shared/format/cpf.ts";
import { Empresa, cnpjValido } from "./empresa.ts";
import { Ponto, type DadosPonto } from "./ponto.ts";
import { TipoBicicleta } from "./tipo-bicicleta.ts";

const PASSEIO: TipoAdmin = {
  id: "t-passeio",
  nome: "Passeio",
  descricao: "Para passear",
  atividades: ["PASSEIO", "TURISMO"],
  alturaMinCm: 145,
  alturaMaxCm: 190,
  nivelRecomendado: "INICIANTE",
  precoHoraCentavos: 1200,
  precoDiaCentavos: 6000,
  valorCaucaoCentavos: 15000,
  ativo: true,
};

const T = (hora: number, min = 0, dia = 14) => new Date(Date.UTC(2026, 10, dia, hora, min));

describe("TipoBicicleta", () => {
  test("expõe os dados e converte preços para Dinheiro", () => {
    const t = new TipoBicicleta(PASSEIO);
    assert.equal(t.nome, "Passeio");
    assert.equal(t.precoHora.centavos, 1200);
    assert.ok(t.precoDia.igual(Dinheiro.deCentavos(6000)));
    assert.equal(t.valorCaucao.formatar(), "R$ 150,00");
    assert.deepEqual(t.atividades, ["PASSEIO", "TURISMO"]);
    assert.equal(t.ativo, true);
  });

  test("servePara inclui as duas pontas da faixa de altura", () => {
    const t = new TipoBicicleta(PASSEIO);
    assert.ok(t.servePara(145));
    assert.ok(t.servePara(190));
    assert.ok(t.servePara(170));
    assert.ok(!t.servePara(144));
    assert.ok(!t.servePara(191));
  });

  test("serveParaAtividade", () => {
    const t = new TipoBicicleta(PASSEIO);
    assert.ok(t.serveParaAtividade("TURISMO"));
    assert.ok(!t.serveParaAtividade("TRILHA"));
  });

  test("calcularPreco usa a regra única de preço (4 h de Passeio = R$ 48,00)", () => {
    const t = new TipoBicicleta(PASSEIO);
    assert.equal(t.calcularPreco({ inicio: T(9), fim: T(13) }).centavos, 4800);
    assert.equal(t.calcularPreco(Periodo.de(T(9), T(13))).centavos, 4800);
  });

  test("calcularPreco: 25 horas são 1 diária mais 1 hora; muitas horas nunca passam da diária", () => {
    const t = new TipoBicicleta(PASSEIO);
    assert.equal(t.calcularPreco({ inicio: T(0), fim: T(1, 0, 15) }).centavos, 6000 + 1200);
    assert.equal(t.calcularPreco({ inicio: T(0), fim: T(12) }).centavos, 6000);
  });

  test("calcularPreco recusa período inválido", () => {
    const t = new TipoBicicleta(PASSEIO);
    assert.throws(() => t.calcularPreco({ inicio: T(10), fim: T(9) }), RangeError);
  });

  test("o construtor recusa dados que o banco também recusaria", () => {
    const ruins: Partial<TipoAdmin>[] = [
      { id: "" },
      { nome: "  " },
      { atividades: [] },
      { alturaMinCm: 99 },
      { alturaMaxCm: 251 },
      { alturaMinCm: 150.5 },
      { alturaMinCm: 190, alturaMaxCm: 150 },
      { precoHoraCentavos: -1 },
      { precoDiaCentavos: 10.5 },
      { valorCaucaoCentavos: Number.NaN },
      { nivelRecomendado: "MESTRE" as never },
    ];
    for (const ruim of ruins) {
      assert.throws(() => new TipoBicicleta({ ...PASSEIO, ...ruim }), RangeError, JSON.stringify(ruim));
    }
  });

  test("faixa de um valor só (mínimo igual ao máximo) é aceita", () => {
    const t = new TipoBicicleta({ ...PASSEIO, alturaMinCm: 170, alturaMaxCm: 170 });
    assert.ok(t.servePara(170));
    assert.ok(!t.servePara(171));
  });

  test("paraAdmin devolve exatamente o formato da API, e é o mesmo que entrou", () => {
    assert.deepEqual(new TipoBicicleta(PASSEIO).paraAdmin(), PASSEIO);
  });

  test("paraPublico não tem `ativo` e é igual à função paraPublico do catálogo", () => {
    const publico = new TipoBicicleta(PASSEIO).paraPublico();
    assert.ok(!("ativo" in publico));
    assert.deepEqual(publico, paraPublico(PASSEIO));
  });

  test("encapsulamento: alterar o que a classe devolve não muda o tipo", () => {
    const t = new TipoBicicleta(PASSEIO);
    (t.atividades as string[]).push("TRILHA");
    t.paraAdmin().atividades.push("TRILHA");
    assert.deepEqual(t.atividades, ["PASSEIO", "TURISMO"]);
    const entrada = { ...PASSEIO, atividades: ["PASSEIO" as const] };
    const t2 = new TipoBicicleta(entrada);
    entrada.atividades.push("PASSEIO");
    assert.equal(t2.atividades.length, 1);
    assert.deepEqual(Object.keys(t), []);
  });

  test("desativar e reativar", () => {
    const t = new TipoBicicleta(PASSEIO);
    t.desativar();
    assert.equal(t.ativo, false);
    assert.equal(t.paraAdmin().ativo, false);
    t.reativar();
    assert.equal(t.ativo, true);
  });

  test("alterarPrecos troca os dois valores", () => {
    const t = new TipoBicicleta(PASSEIO);
    t.alterarPrecos(Dinheiro.deCentavos(1500), Dinheiro.deCentavos(7000));
    assert.equal(t.precoHora.centavos, 1500);
    assert.equal(t.calcularPreco({ inicio: T(9), fim: T(11) }).centavos, 3000);
  });
});

const BIKE: BicicletaAdmin = {
  id: "b-1",
  codigo: "BIC-004",
  tipo: { id: "t-passeio", nome: "Passeio" },
  ponto: { id: "p-1", nome: "Ponto Litorânea" },
  numeroSerie: "SN-004",
  tamanhoQuadro: "M",
  status: "DISPONIVEL",
  observacoes: null,
};

describe("Bicicleta", () => {
  test("expõe os dados", () => {
    const b = new Bicicleta(BIKE);
    assert.equal(b.codigo, "BIC-004");
    assert.equal(b.tipoId, "t-passeio");
    assert.equal(b.pontoId, "p-1");
    assert.equal(b.status, "DISPONIVEL");
    assert.equal(b.tamanhoQuadro, "M");
  });

  test("recusa id e código vazios", () => {
    assert.throws(() => new Bicicleta({ ...BIKE, id: "" }), RangeError);
    assert.throws(() => new Bicicleta({ ...BIKE, codigo: " " }), RangeError);
  });

  test("estaDisponivel: sem ocupações, livre", () => {
    assert.ok(new Bicicleta(BIKE).estaDisponivel(Periodo.de(T(9), T(11))));
  });

  test("estaDisponivel: reserva ativa sobreposta ocupa; encostar não ocupa", () => {
    const b = new Bicicleta(BIKE);
    const ocupado = [Periodo.de(T(10), T(12))];
    assert.ok(!b.estaDisponivel(Periodo.de(T(11), T(13)), ocupado));
    assert.ok(b.estaDisponivel(Periodo.de(T(12), T(14)), ocupado));
    assert.ok(b.estaDisponivel(Periodo.de(T(8), T(10)), ocupado));
  });

  test("estaDisponivel: só DISPONIVEL pode ser reservada", () => {
    for (const status of ["MANUTENCAO", "BLOQUEADA", "BAIXADA", "ALUGADA"] as const) {
      assert.ok(!new Bicicleta({ ...BIKE, status }).estaDisponivel(Periodo.de(T(9), T(11))), status);
    }
  });

  test("bloquear anota o motivo, tira de circulação e exige motivo", () => {
    const b = new Bicicleta(BIKE);
    assert.throws(() => b.bloquear("  "), RangeError);
    b.bloquear("  pneu furado  ");
    assert.equal(b.status, "BLOQUEADA");
    assert.equal(b.observacoes, "pneu furado");
    assert.ok(!b.estaDisponivel(Periodo.de(T(9), T(11))));
  });

  test("liberar devolve à circulação e é idempotente", () => {
    const b = new Bicicleta({ ...BIKE, status: "BLOQUEADA" });
    b.liberar();
    assert.equal(b.status, "DISPONIVEL");
    b.liberar();
    assert.equal(b.status, "DISPONIVEL");
  });

  test("enviarParaManutencao", () => {
    const b = new Bicicleta(BIKE);
    b.enviarParaManutencao("revisão");
    assert.equal(b.status, "MANUTENCAO");
    assert.equal(b.observacoes, "revisão");
    b.liberar();
    assert.equal(b.status, "DISPONIVEL");
  });

  test("BAIXADA é definitiva: nada altera", () => {
    const b = new Bicicleta(BIKE);
    b.baixar("vendida");
    assert.equal(b.status, "BAIXADA");
    for (const operacao of [() => b.liberar(), () => b.bloquear("x"), () => b.enviarParaManutencao()]) {
      assert.throws(operacao, TransicaoDeBicicletaInvalida);
    }
    assert.equal(b.status, "BAIXADA");
  });

  test("baixar exige motivo; bicicleta alugada não é alterada", () => {
    assert.throws(() => new Bicicleta(BIKE).baixar(""), RangeError);
    const alugada = new Bicicleta({ ...BIKE, status: "ALUGADA" });
    for (const operacao of [
      () => alugada.baixar("x"),
      () => alugada.bloquear("x"),
      () => alugada.liberar(),
      () => alugada.enviarParaManutencao(),
    ]) {
      assert.throws(operacao, TransicaoDeBicicletaInvalida);
    }
  });

  test("a transição inválida é um ConflictError (409)", () => {
    const b = new Bicicleta({ ...BIKE, status: "BAIXADA" });
    assert.throws(
      () => b.liberar(),
      (erro) => {
        assert.ok(erro instanceof ConflictError);
        assert.equal((erro as ConflictError).status, 409);
        return true;
      },
    );
  });

  test("paraAdmin devolve o formato da API e copia os objetos internos", () => {
    const b = new Bicicleta(BIKE);
    assert.deepEqual(b.paraAdmin(), BIKE);
    b.paraAdmin().tipo.nome = "outro";
    assert.equal(b.paraAdmin().tipo.nome, "Passeio");
  });
});

const ENDERECO = {
  logradouro: "Avenida Litorânea",
  numero: "100",
  bairro: "Calhau",
  cep: "65000000",
  cidade: "São Luís",
  uf: "MA",
};
// Os horários do seed: 0 = domingo.
const HORARIOS = [
  { diaSemana: 0, abre: "08:00", fecha: "14:00" },
  { diaSemana: 1, abre: "08:00", fecha: "18:00" },
  { diaSemana: 2, abre: "08:00", fecha: "18:00" },
  { diaSemana: 3, abre: "08:00", fecha: "18:00" },
  { diaSemana: 4, abre: "08:00", fecha: "18:00" },
  { diaSemana: 5, abre: "08:00", fecha: "18:00" },
  { diaSemana: 6, abre: "08:00", fecha: "16:00" },
];
const DADOS_PONTO: DadosPonto = {
  id: "p-1",
  nome: "Ponto Litorânea",
  endereco: ENDERECO,
  localizacao: { latitude: -2.49, longitude: -44.22 },
  telefone: "98900000000",
  horarios: HORARIOS,
  ativo: true,
};

describe("Ponto", () => {
  // 14/11/2026 é sábado; 15/11 é domingo; 16/11 é segunda. São Luís é UTC-3: 08:00 local = 11:00Z.
  test("estaAberto: dia útil entre 08:00 e 18:00 (horário de São Luís)", () => {
    const p = new Ponto(DADOS_PONTO);
    assert.ok(p.estaAberto(T(11, 0, 16)), "segunda 08:00");
    assert.ok(p.estaAberto(T(20, 59, 16)), "segunda 17:59");
    assert.ok(!p.estaAberto(T(21, 0, 16)), "segunda 18:00 já fechou");
    assert.ok(!p.estaAberto(T(10, 59, 16)), "segunda 07:59 ainda não abriu");
  });

  test("estaAberto: sábado fecha às 16:00 e domingo às 14:00", () => {
    const p = new Ponto(DADOS_PONTO);
    assert.ok(p.estaAberto(T(18, 59, 14)), "sábado 15:59");
    assert.ok(!p.estaAberto(T(19, 0, 14)), "sábado 16:00");
    assert.ok(p.estaAberto(T(16, 59, 15)), "domingo 13:59");
    assert.ok(!p.estaAberto(T(17, 0, 15)), "domingo 14:00");
  });

  test("estaAberto usa o dia da semana local, não o UTC (virada de dia)", () => {
    const p = new Ponto({ ...DADOS_PONTO, horarios: [{ diaSemana: 1, abre: "00:00", fecha: "02:00" }] });
    // 02:30Z de terça é 23:30 de segunda em São Luís: está fora do intervalo da segunda
    assert.ok(!p.estaAberto(T(2, 30, 17)));
    // 03:30Z de terça é 00:30 de terça em São Luís: terça não tem horário
    assert.ok(!p.estaAberto(T(3, 30, 17)));
    // 03:30Z de segunda é 00:30 de segunda em São Luís
    assert.ok(p.estaAberto(T(3, 30, 16)));
  });

  test("ponto inativo nunca está aberto; data inválida também não", () => {
    const p = new Ponto({ ...DADOS_PONTO, ativo: false });
    assert.ok(!p.estaAberto(T(12, 0, 16)));
    assert.ok(!new Ponto(DADOS_PONTO).estaAberto(new Date("lixo")));
  });

  test("dia sem horário cadastrado é fechado", () => {
    const p = new Ponto({ ...DADOS_PONTO, horarios: HORARIOS.filter((h) => h.diaSemana !== 1) });
    assert.ok(!p.estaAberto(T(12, 0, 16)));
  });

  test("desativar e reativar", () => {
    const p = new Ponto(DADOS_PONTO);
    p.desativar();
    assert.equal(p.ativo, false);
    p.reativar();
    assert.equal(p.ativo, true);
  });

  test("enderecoCompleto", () => {
    assert.equal(new Ponto(DADOS_PONTO).enderecoCompleto(), "Avenida Litorânea, 100, Calhau, São Luís (MA)");
    const comComplemento = new Ponto({ ...DADOS_PONTO, endereco: { ...ENDERECO, complemento: "Loja 2" } });
    assert.equal(comComplemento.enderecoCompleto(), "Avenida Litorânea, 100, Loja 2, Calhau, São Luís (MA)");
  });

  test("recusa dados inválidos", () => {
    const ruins: Partial<DadosPonto>[] = [
      { id: "" },
      { nome: " " },
      { endereco: { ...ENDERECO, cep: "123" } },
      { endereco: { ...ENDERECO, uf: "ma" } },
      { horarios: [{ diaSemana: 7, abre: "08:00", fecha: "18:00" }] },
      { horarios: [{ diaSemana: 1, abre: "18:00", fecha: "08:00" }] },
      { horarios: [{ diaSemana: 1, abre: "8h", fecha: "18:00" }] },
      { horarios: [{ diaSemana: 1, abre: "08:00", fecha: "25:00" }] },
      { horarios: [HORARIOS[1], HORARIOS[1]] },
      { localizacao: { latitude: 91, longitude: 0 } },
      { localizacao: { latitude: 0, longitude: 181 } },
    ];
    for (const ruim of ruins) {
      assert.throws(() => new Ponto({ ...DADOS_PONTO, ...ruim }), RangeError, JSON.stringify(ruim));
    }
  });

  test("encapsulamento: endereço e horários devolvidos são cópias", () => {
    const p = new Ponto(DADOS_PONTO);
    p.endereco.cidade = "Outra";
    (p.horarios as unknown as { abre: string }[])[1].abre = "00:00";
    p.localizacao!.latitude = 0;
    assert.equal(p.endereco.cidade, "São Luís");
    assert.equal(p.horarios[1].abre, "08:00");
    assert.equal(p.localizacao!.latitude, -2.49);
  });

  test("sem localização (opcional)", () => {
    assert.equal(new Ponto({ ...DADOS_PONTO, localizacao: null }).localizacao, null);
  });
});

describe("Empresa", () => {
  const DADOS = {
    razaoSocial: "Bike Ilha Club Locação de Bicicletas Ltda",
    nomeFantasia: "Bike Ilha Club",
    cnpj: "12.345.678/0001-95",
    email: "contato@bikeilha.test",
    telefone: "(98) 90000-0000",
    documentosExigidos: ["Documento de identidade com foto", "CPF"],
    contaRecebimentoId: "mp-123",
  };

  test("cnpjValido confere os dígitos verificadores", () => {
    assert.ok(cnpjValido("12.345.678/0001-95"));
    assert.ok(cnpjValido("12345678000195"));
    assert.ok(cnpjValido("11.222.333/0001-81"));
    assert.ok(!cnpjValido("12.345.678/0001-96"));
    assert.ok(!cnpjValido("11111111111111"));
    assert.ok(!cnpjValido("123"));
    assert.ok(!cnpjValido(""));
  });

  test("somenteDigitos", () => {
    assert.equal(somenteDigitos("12.345.678/0001-95"), "12345678000195");
  });

  test("guarda o CNPJ só com dígitos e apara os textos", () => {
    const e = new Empresa({ ...DADOS, razaoSocial: "  Bike Ilha Club Ltda  " });
    assert.equal(e.cnpj, "12345678000195");
    assert.equal(e.razaoSocial, "Bike Ilha Club Ltda");
    assert.deepEqual(e.documentosExigidos, ["Documento de identidade com foto", "CPF"]);
  });

  test("atualizarDados troca tudo; se algo é inválido, não altera nada", () => {
    const e = new Empresa(DADOS);
    assert.throws(() => e.atualizarDados({ ...DADOS, nomeFantasia: "Novo Nome", cnpj: "123" }), RangeError);
    assert.equal(e.nomeFantasia, "Bike Ilha Club");
    e.atualizarDados({ ...DADOS, nomeFantasia: "Novo Nome", telefone: null });
    assert.equal(e.nomeFantasia, "Novo Nome");
    assert.equal(e.telefone, null);
  });

  test("recusa razão social, nome fantasia e e-mail inválidos", () => {
    for (const ruim of [{ razaoSocial: " " }, { nomeFantasia: "" }, { email: "sem-arroba" }]) {
      assert.throws(() => new Empresa({ ...DADOS, ...ruim }), RangeError, JSON.stringify(ruim));
    }
  });

  test("paraPublico não mostra CNPJ, razão social nem conta de recebimento", () => {
    const publico = new Empresa(DADOS).paraPublico();
    const texto = JSON.stringify(publico);
    assert.ok(!texto.includes("12345678000195"));
    assert.ok(!texto.includes("Ltda"));
    assert.ok(!texto.includes("mp-123"));
    assert.equal(publico.nomeFantasia, "Bike Ilha Club");
  });

  test("encapsulamento: a lista de documentos devolvida é cópia", () => {
    const e = new Empresa(DADOS);
    (e.documentosExigidos as string[]).push("RG");
    assert.equal(e.documentosExigidos.length, 2);
  });
});
