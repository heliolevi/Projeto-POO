import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BuscadorDeEmpresa,
  EmpresaCarregada,
  EmpresaDaLocadora,
  EmpresaIndisponivel,
  EmpresaSemCadastro,
  GradeDeHorarios,
  HorarioDoDia,
  LeitorDeObjeto,
  PontoDeRetirada,
  ResultadoDaEmpresa,
  type Fetcher,
} from "./index.ts";

// Resposta como a rota 9 do contrato devolve (docs/contrato-api-mvp.md).
function pontoApi(extra: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    nome: "Ponto Litorânea",
    logradouro: "Avenida Litorânea",
    numero: "100",
    complemento: null,
    bairro: "Calhau",
    cep: "65071380",
    cidade: "São Luís",
    uf: "MA",
    telefone: "(98) 90000-0000",
    horarios: [
      { diaSemana: 0, abre: "08:00", fecha: "14:00" },
      { diaSemana: 1, abre: "08:00", fecha: "18:00" },
      { diaSemana: 2, abre: "08:00", fecha: "18:00" },
      { diaSemana: 3, abre: "08:00", fecha: "18:00" },
      { diaSemana: 4, abre: "08:00", fecha: "18:00" },
      { diaSemana: 5, abre: "08:00", fecha: "18:00" },
      { diaSemana: 6, abre: "08:00", fecha: "16:00" },
    ],
    ...extra,
  };
}

function corpoApi(extra: Record<string, unknown> = {}) {
  return {
    data: {
      nomeFantasia: "Bike Ilha Club",
      telefone: "(98) 90000-0000",
      email: "contato@bikeilha.test",
      pontos: [pontoApi()],
      ...extra,
    },
  };
}

const h = (dia: number, abre: string, fecha: string) => new HorarioDoDia(dia, abre, fecha);
const grade = (...horarios: HorarioDoDia[]) => new GradeDeHorarios(horarios);
const ponto = (extra: Record<string, unknown> = {}) => PontoDeRetirada.deResposta(pontoApi(extra));
const empresaDe = (extra: Record<string, unknown> = {}) => EmpresaDaLocadora.deResposta(corpoApi(extra));
const pontoOuFalha = (extra: Record<string, unknown> = {}) => {
  const p = ponto(extra);
  assert.ok(p);
  return p;
};
const empresaOuFalha = (extra: Record<string, unknown> = {}) => {
  const e = empresaDe(extra);
  assert.ok(e);
  return e;
};

// ---------------------------------------------------------------------------------------------
// LeitorDeObjeto
// ---------------------------------------------------------------------------------------------

test("LeitorDeObjeto só aceita objeto simples", () => {
  for (const valor of [null, undefined, 0, 1, "texto", true, [], [{}]]) {
    assert.equal(LeitorDeObjeto.de(valor), null, String(valor));
  }
  assert.ok(LeitorDeObjeto.de({}));
});

test("LeitorDeObjeto lê cada campo no tipo certo e devolve o valor neutro quando não bate", () => {
  const l = LeitorDeObjeto.de({ a: "  oi  ", b: 5, c: [1, 2], d: { x: 1 }, e: "   " });
  assert.ok(l);
  assert.equal(l.texto("a"), "oi");
  assert.equal(l.texto("b"), "");
  assert.equal(l.texto("naoExiste"), "");
  assert.equal(l.textoOuNulo("a"), "oi");
  assert.equal(l.textoOuNulo("e"), null);
  assert.equal(l.textoOuNulo("b"), null);
  assert.deepEqual(l.lista("c"), [1, 2]);
  assert.deepEqual(l.lista("a"), []);
  assert.equal(l.objeto("d")?.bruto("x"), 1);
  assert.equal(l.objeto("c"), null);
});

test("LeitorDeObjeto só conta campo próprio: constructor e toString herdados não aparecem", () => {
  const l = LeitorDeObjeto.de({});
  assert.ok(l);
  assert.equal(l.bruto("constructor"), undefined);
  assert.equal(l.bruto("toString"), undefined);
  assert.equal(l.bruto("__proto__"), undefined);
  assert.equal(l.texto("constructor"), "");
});

// ---------------------------------------------------------------------------------------------
// HorarioDoDia
// ---------------------------------------------------------------------------------------------

test("HorarioDoDia guarda dia, abertura e fechamento e escreve a hora com dois dígitos", () => {
  const horario = h(1, "8:00", "9:30");
  assert.equal(horario.diaSemana, 1);
  assert.equal(horario.abre, "08:00");
  assert.equal(horario.fecha, "09:30");
  assert.equal(horario.intervalo, "08:00 às 09:30");
  assert.deepEqual(horario.paraDto(), { diaSemana: 1, abre: "08:00", fecha: "09:30" });
});

test("HorarioDoDia não existe inválido: dia fora de 0 a 6, hora impossível ou que fecha antes de abrir", () => {
  for (const dia of [7, -1, 1.5, NaN, Infinity]) assert.throws(() => h(dia, "08:00", "18:00"), RangeError, String(dia));
  for (const [abre, fecha] of [["25:00", "26:00"], ["08:60", "18:00"], ["8h", "18h"], ["", ""], ["18:00", "08:00"], ["08:00", "08:00"], ["08:00:60", "18:00"], ["08:00:5", "18:00"], ["08:00:000", "18:00"], ["08:00:", "18:00"], ["08:00:30", "08:00:45"]]) {
    assert.throws(() => h(1, abre, fecha), RangeError, `${abre}-${fecha}`);
  }
});

test("HorarioDoDia.deResposta devolve null para item que não serve, sem lançar", () => {
  const ruins: unknown[] = [null, "x", 3, [], {}, { diaSemana: "1", abre: "08:00", fecha: "18:00" }, { diaSemana: 1, abre: null, fecha: "18:00" }, { diaSemana: 9, abre: "08:00", fecha: "18:00" }];
  for (const bruto of ruins) assert.equal(HorarioDoDia.deResposta(bruto), null, JSON.stringify(bruto));
  assert.ok(HorarioDoDia.deResposta({ diaSemana: 3, abre: "08:00", fecha: "18:00" }));
});

test("HorarioDoDia aceita HH:MM:SS (como um banco ou uma API pode devolver) e descarta os segundos", () => {
  const horario = h(1, "08:00:00", "18:30:59");
  assert.equal(horario.abre, "08:00");
  assert.equal(horario.fecha, "18:30");
  assert.equal(horario.intervalo, "08:00 às 18:30");
  assert.deepEqual(HorarioDoDia.deResposta({ diaSemana: 2, abre: "9:00:00", fecha: "17:00:00" })?.paraDto(), { diaSemana: 2, abre: "09:00", fecha: "17:00" });
});

test("a grade não perde todos os horários quando a API manda HH:MM:SS", () => {
  const empresa = EmpresaDaLocadora.deResposta(corpoApi({ pontos: [pontoApi({ horarios: [1, 2, 3].map((d) => ({ diaSemana: d, abre: "08:00:00", fecha: "18:00:00" })) })] }));
  assert.ok(empresa);
  assert.deepEqual(empresa.pontos[0].horarios.resumir(), [{ dias: "Segunda a quarta", horario: "08:00 às 18:00" }]);
});

test("HorarioDoDia compara só a hora, não o dia", () => {
  assert.equal(h(1, "08:00", "18:00").mesmoIntervaloQue(h(5, "08:00", "18:00")), true);
  assert.equal(h(1, "08:00", "18:00").mesmoIntervaloQue(h(1, "09:00", "18:00")), false);
});

test("HorarioDoDia é encapsulado: nenhum campo visível e o JSON sai pelo toJSON", () => {
  const horario = h(2, "08:00", "12:00");
  assert.deepEqual(Object.keys(horario), []);
  assert.equal(JSON.stringify(horario), '{"diaSemana":2,"abre":"08:00","fecha":"12:00"}');
});

// ---------------------------------------------------------------------------------------------
// GradeDeHorarios
// ---------------------------------------------------------------------------------------------

test("GradeDeHorarios agrupa os dias do seed como a página inicial mostrava", () => {
  const p = pontoOuFalha();
  assert.deepEqual(p.horarios.resumir(), [
    { dias: "Segunda a sexta", horario: "08:00 às 18:00" },
    { dias: "Sábado", horario: "08:00 às 16:00" },
    { dias: "Domingo", horario: "08:00 às 14:00" },
  ]);
});

test("GradeDeHorarios não depende da ordem em que os dias chegam", () => {
  const esperado = grade(h(1, "08:00", "18:00"), h(2, "08:00", "18:00"), h(6, "08:00", "16:00"), h(0, "08:00", "14:00")).resumir();
  const embaralhado = grade(h(0, "08:00", "14:00"), h(6, "08:00", "16:00"), h(2, "08:00", "18:00"), h(1, "08:00", "18:00")).resumir();
  assert.deepEqual(embaralhado, esperado);
  assert.deepEqual(esperado[0], { dias: "Segunda e terça", horario: "08:00 às 18:00" });
});

test("GradeDeHorarios usa 'e' para dois dias seguidos e 'a' para três ou mais", () => {
  assert.deepEqual(grade(h(6, "08:00", "12:00"), h(0, "08:00", "12:00")).resumir(), [{ dias: "Sábado e domingo", horario: "08:00 às 12:00" }]);
  assert.deepEqual(grade(h(1, "09:00", "17:00"), h(2, "09:00", "17:00"), h(3, "09:00", "17:00")).resumir(), [{ dias: "Segunda a quarta", horario: "09:00 às 17:00" }]);
});

test("GradeDeHorarios diz 'Todos os dias' quando a semana inteira é igual", () => {
  const semana = [0, 1, 2, 3, 4, 5, 6].map((d) => h(d, "07:00", "19:00"));
  assert.deepEqual(grade(...semana).resumir(), [{ dias: "Todos os dias", horario: "07:00 às 19:00" }]);
});

test("GradeDeHorarios não junta dias separados por um dia de folga", () => {
  assert.deepEqual(grade(h(1, "08:00", "18:00"), h(3, "08:00", "18:00")).resumir(), [
    { dias: "Segunda", horario: "08:00 às 18:00" },
    { dias: "Quarta", horario: "08:00 às 18:00" },
  ]);
});

test("GradeDeHorarios não junta dias seguidos com horários diferentes", () => {
  assert.deepEqual(grade(h(1, "08:00", "18:00"), h(2, "09:00", "18:00")).resumir(), [
    { dias: "Segunda", horario: "08:00 às 18:00" },
    { dias: "Terça", horario: "09:00 às 18:00" },
  ]);
});

test("GradeDeHorarios vazia resume para lista vazia e diz que está vazia", () => {
  assert.deepEqual(grade().resumir(), []);
  assert.equal(grade().vazia, true);
  assert.equal(grade(h(1, "08:00", "18:00")).vazia, false);
});

test("GradeDeHorarios com o mesmo dia repetido vale o primeiro e não duplica linha", () => {
  const g = grade(h(1, "08:00", "18:00"), h(1, "10:00", "12:00"));
  assert.deepEqual(g.resumir(), [{ dias: "Segunda", horario: "08:00 às 18:00" }]);
  assert.equal(g.paraDto().length, 1);
});

test("GradeDeHorarios não é alterada pela lista com que foi criada", () => {
  const lista = [h(6, "08:00", "16:00"), h(0, "08:00", "14:00")];
  const g = new GradeDeHorarios(lista);
  lista.length = 0;
  assert.equal(g.paraDto().length, 2);
});

test("GradeDeHorarios.deResposta descarta o item inválido e trata o que não é lista como vazio", () => {
  const ruins = [7, -1, 1.5, "1", null, undefined, NaN, Infinity, {}, []].map((d) => ({ diaSemana: d, abre: "08:00", fecha: "18:00" }));
  assert.deepEqual(GradeDeHorarios.deResposta([...ruins, { diaSemana: 3, abre: "08:00", fecha: "18:00" }]).paraDto(), [{ diaSemana: 3, abre: "08:00", fecha: "18:00" }]);
  for (const bruto of [undefined, null, "x", 3, {}]) assert.equal(GradeDeHorarios.deResposta(bruto).vazia, true, String(bruto));
});

test("estresse: um ponto com 100 mil horários repetidos é lido e resumido sem travar nem repetir linha", () => {
  const horarios = Array.from({ length: 100_000 }, (_, i) => ({ diaSemana: i % 7, abre: "08:00", fecha: "18:00" }));
  const inicio = performance.now();
  const g = GradeDeHorarios.deResposta(horarios);
  const linhas = g.resumir();
  const ms = performance.now() - inicio;
  assert.deepEqual(linhas, [{ dias: "Todos os dias", horario: "08:00 às 18:00" }]);
  assert.ok(ms < 1000, `demorou ${Math.round(ms)} ms`);
});

// ---------------------------------------------------------------------------------------------
// PontoDeRetirada
// ---------------------------------------------------------------------------------------------

test("PontoDeRetirada.deResposta descarta o ponto sem id ou sem nome", () => {
  for (const bruto of [null, "x", 42, [], pontoApi({ id: "" }), pontoApi({ id: 7 }), pontoApi({ nome: "  " }), pontoApi({ nome: undefined })]) {
    assert.equal(PontoDeRetirada.deResposta(bruto), null, JSON.stringify(bruto));
  }
});

test("PontoDeRetirada não existe sem id nem nome", () => {
  assert.throws(() => new PontoDeRetirada({ id: "", nome: "x" }), RangeError);
  assert.throws(() => new PontoDeRetirada({ id: "x", nome: "  " }), RangeError);
});

test("PontoDeRetirada completa com vazio os campos de endereço que faltam", () => {
  const dto = pontoOuFalha({ id: "p", nome: "Só o nome", logradouro: undefined, numero: undefined, bairro: undefined, cep: undefined, cidade: undefined, uf: undefined, complemento: undefined, telefone: undefined, horarios: undefined }).paraDto();
  assert.deepEqual(dto, { id: "p", nome: "Só o nome", logradouro: "", numero: "", complemento: null, bairro: "", cep: "", cidade: "", uf: "", telefone: null, horarios: [] });
});

test("PontoDeRetirada trata telefone ausente, vazio ou de outro tipo como null", () => {
  for (const telefone of [undefined, null, "", "  ", 98, {}]) assert.equal(pontoOuFalha({ telefone }).telefone, null, String(telefone));
});

test("PontoDeRetirada.endereco mantém o formato que a tela de reserva já usava", () => {
  assert.equal(pontoOuFalha({ logradouro: "Av. Litorânea" }).endereco(), "Av. Litorânea, 100, Calhau, São Luís/MA");
  assert.equal(pontoOuFalha({ logradouro: "Av. Litorânea", complemento: "loja 2" }).endereco(), "Av. Litorânea, 100 (loja 2), Calhau, São Luís/MA");
});

test("PontoDeRetirada.endereco não deixa vírgula sobrando quando falta parte do endereço", () => {
  const base = { logradouro: "Av. Litorânea" };
  assert.equal(pontoOuFalha({ ...base, numero: "" }).endereco(), "Av. Litorânea, Calhau, São Luís/MA");
  assert.equal(pontoOuFalha({ ...base, bairro: "" }).endereco(), "Av. Litorânea, 100, São Luís/MA");
  assert.equal(pontoOuFalha({ ...base, uf: "" }).endereco(), "Av. Litorânea, 100, Calhau, São Luís");
  assert.equal(pontoOuFalha({ ...base, cidade: "" }).endereco(), "Av. Litorânea, 100, Calhau, MA");
  assert.equal(pontoOuFalha({ logradouro: "", numero: "" }).endereco(), "Calhau, São Luís/MA");
  assert.equal(pontoOuFalha({ logradouro: "", numero: "", bairro: "", cidade: "", uf: "" }).endereco(), "");
  assert.equal(pontoOuFalha({ logradouro: "", numero: "", complemento: "Loja 3", bairro: "", cidade: "", uf: "" }).endereco(), "Loja 3");
});

test("PontoDeRetirada guarda texto com HTML como texto (o React escapa na tela)", () => {
  assert.equal(pontoOuFalha({ nome: "<img src=x onerror=alert(1)>" }).nome, "<img src=x onerror=alert(1)>");
});

test("PontoDeRetirada é encapsulado: nenhum campo visível e só os campos do contrato no JSON", () => {
  const p = pontoOuFalha({ ativo: true, localizacao: "x", segredo: "y" });
  assert.deepEqual(Object.keys(p), []);
  assert.deepEqual(Object.keys(p.paraDto()).sort(), ["bairro", "cep", "cidade", "complemento", "horarios", "id", "logradouro", "nome", "numero", "telefone", "uf"]);
  assert.equal(JSON.stringify(p), JSON.stringify(p.paraDto()));
});

test("PontoDeRetirada.opcao devolve só id e nome", () => {
  assert.deepEqual(pontoOuFalha().opcao(), { id: "p-1", nome: "Ponto Litorânea" });
});

// ---------------------------------------------------------------------------------------------
// EmpresaDaLocadora
// ---------------------------------------------------------------------------------------------

test("EmpresaDaLocadora.deResposta lê a resposta do contrato inteira", () => {
  const e = empresaOuFalha();
  assert.equal(e.nomeFantasia, "Bike Ilha Club");
  assert.equal(e.telefone, "(98) 90000-0000");
  assert.equal(e.email, "contato@bikeilha.test");
  assert.equal(e.pontos.length, 1);
  assert.equal(e.pontos[0].nome, "Ponto Litorânea");
  assert.equal(e.pontos[0].horarios.paraDto().length, 7);
});

test("EmpresaDaLocadora.deResposta recusa o que não é um objeto com data", () => {
  for (const corpo of [null, undefined, 0, 1, "texto", true, [], [corpoApi()], {}, { data: null }, { data: [] }, { data: "x" }]) {
    assert.equal(EmpresaDaLocadora.deResposta(corpo), null, JSON.stringify(corpo));
  }
});

test("EmpresaDaLocadora.deResposta recusa empresa sem nome fantasia", () => {
  for (const nome of [undefined, null, "", "   ", 42, {}, []]) assert.equal(empresaDe({ nomeFantasia: nome }), null, String(nome));
});

test("EmpresaDaLocadora não existe sem nome fantasia", () => {
  assert.throws(() => new EmpresaDaLocadora({ nomeFantasia: "  " }), RangeError);
});

test("EmpresaDaLocadora não quebra quando pontos some ou vem torto (a tela de reserva já caiu por isso)", () => {
  for (const pontos of [undefined, null, "x", 7, {}, true]) {
    assert.deepEqual(empresaOuFalha({ pontos }).pontos, [], String(pontos));
  }
});

test("EmpresaDaLocadora descarta o ponto inválido e mantém os bons", () => {
  const e = empresaOuFalha({ pontos: [null, "x", 42, [], pontoApi({ id: "" }), pontoApi({ id: 7 }), pontoApi({ nome: "  " }), pontoApi({ id: "ok", nome: "Ponto bom" })] });
  assert.deepEqual(e.pontos.map((p) => p.id), ["ok"]);
});

test("EmpresaDaLocadora trata telefone ausente, vazio ou de outro tipo como null", () => {
  for (const telefone of [undefined, null, "", "  ", 98, {}]) assert.equal(empresaOuFalha({ telefone }).telefone, null, String(telefone));
});

test("EmpresaDaLocadora tira os espaços das pontas dos textos", () => {
  const e = empresaOuFalha({ nomeFantasia: "  Bike Ilha Club  ", pontos: [pontoApi({ nome: "  Ponto  " })] });
  assert.equal(e.nomeFantasia, "Bike Ilha Club");
  assert.equal(e.pontos[0].nome, "Ponto");
});

test("EmpresaDaLocadora só expõe os campos do contrato (nada de CNPJ, conta ou campo desconhecido)", () => {
  const e = empresaOuFalha({ cnpj: "00.000.000/0001-00", razaoSocial: "Razão", contaRecebimento: "abc" });
  assert.deepEqual(Object.keys(e), []);
  assert.deepEqual(Object.keys(e.paraDto()).sort(), ["email", "nomeFantasia", "pontos", "telefone"]);
  assert.equal(JSON.stringify(e).includes("00.000.000"), false);
});

test("EmpresaDaLocadora não é enganada por __proto__ nem constructor vindos no JSON", () => {
  const corpo = JSON.parse('{"data":{"nomeFantasia":"X","email":"a@b.c","pontos":[],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}}');
  const e = EmpresaDaLocadora.deResposta(corpo);
  assert.ok(e);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.hasOwn(e.paraDto(), "polluted"), false);
});

test("EmpresaDaLocadora.deResposta não altera o objeto recebido", () => {
  const corpo = corpoApi();
  const antes = JSON.stringify(corpo);
  EmpresaDaLocadora.deResposta(corpo);
  assert.equal(JSON.stringify(corpo), antes);
});

test("EmpresaDaLocadora devolve cópia dos pontos: mexer na lista não muda a locadora", () => {
  const e = empresaOuFalha();
  e.pontos.length = 0;
  assert.equal(e.pontos.length, 1);
});

test("EmpresaDaLocadora.pontoPrincipal é o primeiro ponto, ou null sem ponto", () => {
  const dois = empresaOuFalha({ pontos: [pontoApi({ id: "a" }), pontoApi({ id: "b" })] });
  assert.equal(dois.pontoPrincipal()?.id, "a");
  assert.equal(empresaOuFalha({ pontos: [] }).pontoPrincipal(), null);
});

test("EmpresaDaLocadora.telefoneDoPonto usa o do ponto e, se faltar, o da locadora", () => {
  const e = empresaOuFalha({ telefone: "(98) 1111-1111", pontos: [pontoApi({ id: "a", telefone: "(98) 2222-2222" }), pontoApi({ id: "b", telefone: null })] });
  assert.equal(e.telefoneDoPonto(e.pontos[0])?.formatado(), "(98) 2222-2222");
  assert.equal(e.telefoneDoPonto(e.pontos[1])?.formatado(), "(98) 1111-1111");
});

test("estresse: 5 mil pontos de 7 horários cada são lidos rápido", () => {
  const pontos = Array.from({ length: 5000 }, (_, i) => pontoApi({ id: `p${i}`, nome: `Ponto ${i}` }));
  const inicio = performance.now();
  const e = empresaOuFalha({ pontos });
  const ms = performance.now() - inicio;
  assert.equal(e.pontos.length, 5000);
  assert.ok(ms < 1500, `demorou ${Math.round(ms)} ms`);
});

test("estresse: texto de 100 mil caracteres não derruba a leitura", () => {
  const longo = "a".repeat(100_000);
  const e = empresaOuFalha({ nomeFantasia: longo, pontos: [pontoApi({ nome: longo, logradouro: longo })] });
  assert.equal(e.nomeFantasia.length, 100_000);
});

// ---------------------------------------------------------------------------------------------
// ResultadoDaEmpresa: três subclasses que respondem às mesmas perguntas (polimorfismo)
// ---------------------------------------------------------------------------------------------

const estoque = [
  { id: "velho", nome: "Ponto antigo (pode estar inativo)" },
  { id: "p-1", nome: "Ponto Litorânea" },
];

test("os três resultados são ResultadoDaEmpresa e cada um tem o seu tipo", () => {
  const resultados: ResultadoDaEmpresa[] = [new EmpresaCarregada(empresaOuFalha()), new EmpresaSemCadastro(), new EmpresaIndisponivel()];
  assert.deepEqual(resultados.map((r) => r.tipo), ["pronto", "semCadastro", "erro"]);
  for (const r of resultados) assert.ok(r instanceof ResultadoDaEmpresa);
});

test("EmpresaCarregada usa os pontos da API e ignora o estoque (a API recusa ponto inativo)", () => {
  const e = empresaOuFalha({ pontos: [pontoApi({ id: "p-1" }), pontoApi({ id: "p-2", nome: "Outro" })] });
  const r = new EmpresaCarregada(e);
  assert.deepEqual(r.opcoesDePonto(), [{ id: "p-1", nome: "Ponto Litorânea" }, { id: "p-2", nome: "Outro" }]);
  assert.equal(r.pontoPrincipal()?.id, "p-1");
  assert.equal(r.empresa, e);
});

test("EmpresaCarregada sem ponto ativo não oferece o ponto do estoque", () => {
  const r = new EmpresaCarregada(empresaOuFalha({ pontos: [] }));
  assert.deepEqual(r.opcoesDePonto(), []);
  assert.equal(r.pontoPrincipal(), null);
});

test("EmpresaSemCadastro não tem ponto nem opção", () => {
  const r = new EmpresaSemCadastro();
  assert.equal(r.pontoPrincipal(), null);
  assert.deepEqual(r.opcoesDePonto(), []);
});

test("EmpresaIndisponivel não tem ponto principal mas deixa o admin usar os pontos do estoque", () => {
  const r = new EmpresaIndisponivel();
  assert.equal(r.pontoPrincipal(), null);
  assert.deepEqual(r.opcoesDePonto(estoque), estoque);
  assert.notEqual(r.opcoesDePonto(estoque), estoque, "devolve cópia");
});

// ---------------------------------------------------------------------------------------------
// BuscadorDeEmpresa: toda falha de rede ou de resposta vira um resultado, nunca uma exceção
// ---------------------------------------------------------------------------------------------

function resposta(status: number, corpo: unknown, bruto = false): Response {
  return new Response(bruto ? String(corpo) : JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}
const buscar = (fetcher: Fetcher, tempoLimiteMs?: number) => new BuscadorDeEmpresa({ fetcher, tempoLimiteMs }).buscar();

test("BuscadorDeEmpresa devolve EmpresaCarregada com a locadora lida", async () => {
  const r = await buscar(async () => resposta(200, corpoApi()));
  assert.ok(r instanceof EmpresaCarregada);
  assert.equal(r.empresa.nomeFantasia, "Bike Ilha Club");
});

test("BuscadorDeEmpresa chama GET /api/empresa sem token (a rota é pública) e sem cache", async () => {
  let url = "";
  let init: RequestInit | undefined;
  await buscar(async (u, i) => {
    url = String(u);
    init = i;
    return resposta(200, corpoApi());
  });
  assert.equal(url, "/api/empresa");
  assert.ok(init?.method === undefined || init.method === "GET");
  assert.equal(init?.cache, "no-store");
  assert.equal(new Headers(init?.headers).get("authorization"), null);
});

test("BuscadorDeEmpresa trata 404 como locadora ainda não cadastrada", async () => {
  assert.ok((await buscar(async () => resposta(404, { error: { code: "NOT_FOUND", message: "x" } }))) instanceof EmpresaSemCadastro);
});

test("BuscadorDeEmpresa trata qualquer outro status de erro como indisponível", async () => {
  for (const status of [400, 401, 403, 408, 429, 500, 502, 503, 504]) {
    assert.ok((await buscar(async () => resposta(status, { error: {} }))) instanceof EmpresaIndisponivel, String(status));
  }
});

test("BuscadorDeEmpresa trata exceção de qualquer tipo como indisponível (inclusive valor que não é Error)", async () => {
  for (const lancado of [new TypeError("Failed to fetch"), "texto", 42, null, undefined, { a: 1 }]) {
    const r = await buscar(async () => {
      throw lancado;
    });
    assert.ok(r instanceof EmpresaIndisponivel);
  }
});

test("BuscadorDeEmpresa trata 200 com corpo que não é JSON, vazio ou de formato errado como indisponível", async () => {
  assert.ok((await buscar(async () => resposta(200, "<html>Bad gateway</html>", true))) instanceof EmpresaIndisponivel);
  assert.ok((await buscar(async () => resposta(200, "", true))) instanceof EmpresaIndisponivel);
  for (const corpo of [null, [], { data: null }, { data: { nomeFantasia: "" } }, { erro: true }]) {
    assert.ok((await buscar(async () => resposta(200, corpo))) instanceof EmpresaIndisponivel, JSON.stringify(corpo));
  }
});

test("BuscadorDeEmpresa desiste de uma resposta que nunca chega (timeout)", async () => {
  const inicio = performance.now();
  const r = await buscar(() => new Promise<Response>(() => {}), 30);
  assert.ok(r instanceof EmpresaIndisponivel);
  assert.ok(performance.now() - inicio < 1000);
});

test("BuscadorDeEmpresa cancela o pedido pendente quando estoura o tempo", async () => {
  let cancelado = false;
  const r = await buscar(
    (_u, i) =>
      new Promise<Response>((_res, rej) => {
        i?.signal?.addEventListener("abort", () => {
          cancelado = true;
          rej(new DOMException("abortado", "AbortError"));
        });
      }),
    20,
  );
  assert.ok(r instanceof EmpresaIndisponivel);
  assert.equal(cancelado, true);
});

test("BuscadorDeEmpresa não deixa timer pendurado depois de responder (o processo precisa poder terminar)", async () => {
  const r = await buscar(async () => resposta(200, corpoApi()), 60_000);
  assert.ok(r instanceof EmpresaCarregada);
});

test("estresse: 200 buscas ao mesmo tempo, com respostas misturadas, cada uma recebe a sua", async () => {
  const respostas = [() => resposta(200, corpoApi()), () => resposta(404, {}), () => resposta(500, {}), () => resposta(200, "lixo", true), () => { throw new TypeError("rede"); }];
  const esperado = ["pronto", "semCadastro", "erro", "erro", "erro"];
  const resultados = await Promise.all(Array.from({ length: 200 }, (_, i) => buscar(async () => respostas[i % 5]())));
  resultados.forEach((r, i) => assert.equal(r.tipo, esperado[i % 5], `busca ${i}`));
});
