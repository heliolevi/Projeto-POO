import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buscarEmpresa,
  enderecoDoPonto,
  lerEmpresa,
  opcoesDePonto,
  pontoPrincipal,
  resumirHorarios,
  type EmpresaPublica,
  type HorarioDoPonto,
  type PontoPublico,
} from "./empresa.ts";

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

function ponto(extra: Partial<PontoPublico> = {}): PontoPublico {
  return {
    id: "p-1",
    nome: "Ponto Litorânea",
    logradouro: "Av. Litorânea",
    numero: "100",
    complemento: null,
    bairro: "Calhau",
    cep: "65071380",
    cidade: "São Luís",
    uf: "MA",
    telefone: null,
    horarios: [],
    ...extra,
  };
}

const h = (diaSemana: number, abre: string, fecha: string): HorarioDoPonto => ({ diaSemana, abre, fecha });

// ---------------------------------------------------------------------------------------------
// lerEmpresa: a resposta da API é desconhecida (unknown) até passar por aqui
// ---------------------------------------------------------------------------------------------

test("lerEmpresa lê a resposta do contrato inteira", () => {
  const empresa = lerEmpresa(corpoApi());
  assert.ok(empresa);
  assert.equal(empresa.nomeFantasia, "Bike Ilha Club");
  assert.equal(empresa.telefone, "(98) 90000-0000");
  assert.equal(empresa.email, "contato@bikeilha.test");
  assert.equal(empresa.pontos.length, 1);
  assert.equal(empresa.pontos[0].nome, "Ponto Litorânea");
  assert.equal(empresa.pontos[0].horarios.length, 7);
});

test("lerEmpresa recusa o que não é um objeto com data", () => {
  for (const corpo of [null, undefined, 0, 1, "texto", true, [], [corpoApi()], {}, { data: null }, { data: [] }, { data: "x" }]) {
    assert.equal(lerEmpresa(corpo), null, JSON.stringify(corpo));
  }
});

test("lerEmpresa recusa empresa sem nome fantasia", () => {
  for (const nome of [undefined, null, "", "   ", 42, {}, []]) {
    assert.equal(lerEmpresa(corpoApi({ nomeFantasia: nome })), null, String(nome));
  }
});

test("lerEmpresa não quebra quando pontos some ou vem torto (a tela de reserva já caiu por isso)", () => {
  for (const pontos of [undefined, null, "x", 7, {}, true]) {
    const empresa = lerEmpresa(corpoApi({ pontos }));
    assert.ok(empresa, String(pontos));
    assert.deepEqual(empresa.pontos, []);
  }
});

test("lerEmpresa descarta o ponto inválido e mantém os bons", () => {
  const empresa = lerEmpresa(
    corpoApi({
      pontos: [
        null,
        "x",
        42,
        [],
        pontoApi({ id: "" }),
        pontoApi({ id: 7 }),
        pontoApi({ nome: "  " }),
        pontoApi({ id: "ok", nome: "Ponto bom" }),
      ],
    }),
  );
  assert.ok(empresa);
  assert.deepEqual(
    empresa.pontos.map((p) => p.id),
    ["ok"],
  );
});

test("lerEmpresa completa com vazio os campos de endereço que faltam", () => {
  const empresa = lerEmpresa(corpoApi({ pontos: [{ id: "p", nome: "Só o nome" }] }));
  assert.ok(empresa);
  const p = empresa.pontos[0];
  assert.equal(p.logradouro, "");
  assert.equal(p.numero, "");
  assert.equal(p.bairro, "");
  assert.equal(p.cidade, "");
  assert.equal(p.uf, "");
  assert.equal(p.complemento, null);
  assert.equal(p.telefone, null);
  assert.deepEqual(p.horarios, []);
});

test("lerEmpresa trata telefone ausente, vazio ou de outro tipo como null", () => {
  for (const telefone of [undefined, null, "", "  ", 98, {}]) {
    const empresa = lerEmpresa(corpoApi({ telefone, pontos: [pontoApi({ telefone })] }));
    assert.ok(empresa);
    assert.equal(empresa.telefone, null, String(telefone));
    assert.equal(empresa.pontos[0].telefone, null, String(telefone));
  }
});

test("lerEmpresa tira os espaços das pontas dos textos", () => {
  const empresa = lerEmpresa(corpoApi({ nomeFantasia: "  Bike Ilha Club  ", pontos: [pontoApi({ nome: "  Ponto  " })] }));
  assert.ok(empresa);
  assert.equal(empresa.nomeFantasia, "Bike Ilha Club");
  assert.equal(empresa.pontos[0].nome, "Ponto");
});

test("lerEmpresa só devolve os campos do contrato (nada de CNPJ, conta ou campo desconhecido)", () => {
  const empresa = lerEmpresa(
    corpoApi({
      cnpj: "00.000.000/0001-00",
      razaoSocial: "Razão",
      contaRecebimento: "abc",
      pontos: [pontoApi({ ativo: true, localizacao: "x", segredo: "y" })],
    }),
  );
  assert.ok(empresa);
  assert.deepEqual(Object.keys(empresa).sort(), ["email", "nomeFantasia", "pontos", "telefone"]);
  assert.deepEqual(Object.keys(empresa.pontos[0]).sort(), [
    "bairro", "cep", "cidade", "complemento", "horarios", "id", "logradouro", "nome", "numero", "telefone", "uf",
  ]);
});

test("lerEmpresa não é enganada por __proto__ nem constructor vindos no JSON", () => {
  const corpo = JSON.parse(
    '{"data":{"nomeFantasia":"X","email":"a@b.c","pontos":[],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}}',
  );
  const empresa = lerEmpresa(corpo);
  assert.ok(empresa);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(empresa, "polluted"), false);
});

test("lerEmpresa não altera o objeto recebido", () => {
  const corpo = corpoApi();
  const antes = JSON.stringify(corpo);
  lerEmpresa(corpo);
  assert.equal(JSON.stringify(corpo), antes);
});

test("lerEmpresa guarda texto com HTML como texto (o React escapa na tela)", () => {
  const empresa = lerEmpresa(corpoApi({ pontos: [pontoApi({ nome: "<img src=x onerror=alert(1)>" })] }));
  assert.ok(empresa);
  assert.equal(empresa.pontos[0].nome, "<img src=x onerror=alert(1)>");
});

test("lerEmpresa descarta horário inválido: dia fora de 0 a 6, não inteiro ou de outro tipo", () => {
  const ruins = [7, -1, 1.5, "1", null, undefined, NaN, Infinity, {}, []].map((d) => ({
    diaSemana: d,
    abre: "08:00",
    fecha: "18:00",
  }));
  const empresa = lerEmpresa(corpoApi({ pontos: [pontoApi({ horarios: [...ruins, { diaSemana: 3, abre: "08:00", fecha: "18:00" }] })] }));
  assert.ok(empresa);
  assert.deepEqual(empresa.pontos[0].horarios, [h(3, "08:00", "18:00")]);
});

test("lerEmpresa descarta horário com hora impossível, mal escrita ou que fecha antes de abrir", () => {
  const ruins = [
    ["25:00", "26:00"],
    ["08:60", "18:00"],
    ["8h", "18h"],
    ["", ""],
    [null, "18:00"],
    ["08:00", undefined],
    ["18:00", "08:00"],
    ["08:00", "08:00"],
    ["08:00:00", "18:00"],
  ].map(([abre, fecha]) => ({ diaSemana: 1, abre, fecha }));
  const empresa = lerEmpresa(corpoApi({ pontos: [pontoApi({ horarios: ruins })] }));
  assert.ok(empresa);
  assert.deepEqual(empresa.pontos[0].horarios, []);
});

test("lerEmpresa escreve a hora sempre com dois dígitos", () => {
  const empresa = lerEmpresa(corpoApi({ pontos: [pontoApi({ horarios: [{ diaSemana: 1, abre: "8:00", fecha: "9:30" }] })] }));
  assert.ok(empresa);
  assert.deepEqual(empresa.pontos[0].horarios, [h(1, "08:00", "09:30")]);
});

test("lerEmpresa aceita horarios fora de lista como ponto sem horário", () => {
  for (const horarios of [undefined, null, "x", 3, {}]) {
    const empresa = lerEmpresa(corpoApi({ pontos: [pontoApi({ horarios })] }));
    assert.ok(empresa, String(horarios));
    assert.deepEqual(empresa.pontos[0].horarios, []);
  }
});

test("estresse: lerEmpresa com 5 mil pontos de 7 horários cada termina rápido", () => {
  const pontos = Array.from({ length: 5000 }, (_, i) => pontoApi({ id: `p${i}`, nome: `Ponto ${i}` }));
  const inicio = performance.now();
  const empresa = lerEmpresa(corpoApi({ pontos }));
  const ms = performance.now() - inicio;
  assert.ok(empresa);
  assert.equal(empresa.pontos.length, 5000);
  assert.ok(ms < 1000, `demorou ${Math.round(ms)} ms`);
});

test("estresse: um ponto com 100 mil horários repetidos é lido e resumido sem travar nem repetir linha", () => {
  const horarios = Array.from({ length: 100_000 }, (_, i) => ({ diaSemana: i % 7, abre: "08:00", fecha: "18:00" }));
  const inicio = performance.now();
  const empresa = lerEmpresa(corpoApi({ pontos: [pontoApi({ horarios })] }));
  assert.ok(empresa);
  const linhas = resumirHorarios(empresa.pontos[0].horarios);
  const ms = performance.now() - inicio;
  assert.deepEqual(linhas, [{ dias: "Todos os dias", horario: "08:00 às 18:00" }]);
  assert.ok(ms < 1000, `demorou ${Math.round(ms)} ms`);
});

test("estresse: texto de 100 mil caracteres não derruba a leitura", () => {
  const longo = "a".repeat(100_000);
  const empresa = lerEmpresa(corpoApi({ nomeFantasia: longo, pontos: [pontoApi({ nome: longo, logradouro: longo })] }));
  assert.ok(empresa);
  assert.equal(empresa.nomeFantasia.length, 100_000);
});

// ---------------------------------------------------------------------------------------------
// resumirHorarios: 0 = domingo; a semana aparece de segunda a domingo
// ---------------------------------------------------------------------------------------------

test("resumirHorarios agrupa os dias do seed como a página inicial mostrava", () => {
  const empresa = lerEmpresa(corpoApi());
  assert.ok(empresa);
  assert.deepEqual(resumirHorarios(empresa.pontos[0].horarios), [
    { dias: "Segunda a sexta", horario: "08:00 às 18:00" },
    { dias: "Sábado", horario: "08:00 às 16:00" },
    { dias: "Domingo", horario: "08:00 às 14:00" },
  ]);
});

test("resumirHorarios não depende da ordem em que os dias chegam", () => {
  const esperado = resumirHorarios([h(1, "08:00", "18:00"), h(2, "08:00", "18:00"), h(6, "08:00", "16:00"), h(0, "08:00", "14:00")]);
  const embaralhado = resumirHorarios([h(0, "08:00", "14:00"), h(6, "08:00", "16:00"), h(2, "08:00", "18:00"), h(1, "08:00", "18:00")]);
  assert.deepEqual(embaralhado, esperado);
  assert.deepEqual(esperado[0], { dias: "Segunda e terça", horario: "08:00 às 18:00" });
});

test("resumirHorarios usa 'e' para dois dias seguidos e 'a' para três ou mais", () => {
  assert.deepEqual(resumirHorarios([h(6, "08:00", "12:00"), h(0, "08:00", "12:00")]), [
    { dias: "Sábado e domingo", horario: "08:00 às 12:00" },
  ]);
  assert.deepEqual(resumirHorarios([h(1, "09:00", "17:00"), h(2, "09:00", "17:00"), h(3, "09:00", "17:00")]), [
    { dias: "Segunda a quarta", horario: "09:00 às 17:00" },
  ]);
});

test("resumirHorarios diz 'Todos os dias' quando a semana inteira é igual", () => {
  const semana = [0, 1, 2, 3, 4, 5, 6].map((d) => h(d, "07:00", "19:00"));
  assert.deepEqual(resumirHorarios(semana), [{ dias: "Todos os dias", horario: "07:00 às 19:00" }]);
});

test("resumirHorarios não junta dias separados por um dia de folga", () => {
  assert.deepEqual(resumirHorarios([h(1, "08:00", "18:00"), h(3, "08:00", "18:00")]), [
    { dias: "Segunda", horario: "08:00 às 18:00" },
    { dias: "Quarta", horario: "08:00 às 18:00" },
  ]);
});

test("resumirHorarios não junta dias seguidos com horários diferentes", () => {
  assert.deepEqual(resumirHorarios([h(1, "08:00", "18:00"), h(2, "09:00", "18:00")]), [
    { dias: "Segunda", horario: "08:00 às 18:00" },
    { dias: "Terça", horario: "09:00 às 18:00" },
  ]);
});

test("resumirHorarios devolve lista vazia sem horários (a tela diz 'não informado')", () => {
  assert.deepEqual(resumirHorarios([]), []);
});

test("resumirHorarios com o mesmo dia repetido vale o primeiro e não duplica linha", () => {
  assert.deepEqual(resumirHorarios([h(1, "08:00", "18:00"), h(1, "10:00", "12:00")]), [
    { dias: "Segunda", horario: "08:00 às 18:00" },
  ]);
});

test("resumirHorarios não altera a lista recebida", () => {
  const lista = [h(6, "08:00", "16:00"), h(0, "08:00", "14:00")];
  const antes = JSON.stringify(lista);
  resumirHorarios(lista);
  assert.equal(JSON.stringify(lista), antes);
});

// ---------------------------------------------------------------------------------------------
// enderecoDoPonto
// ---------------------------------------------------------------------------------------------

test("enderecoDoPonto mantém o formato que a tela de reserva já usava", () => {
  assert.equal(enderecoDoPonto(ponto()), "Av. Litorânea, 100, Calhau, São Luís/MA");
  assert.equal(enderecoDoPonto(ponto({ complemento: "loja 2" })), "Av. Litorânea, 100 (loja 2), Calhau, São Luís/MA");
});

test("enderecoDoPonto não deixa vírgula sobrando quando falta parte do endereço", () => {
  assert.equal(enderecoDoPonto(ponto({ numero: "" })), "Av. Litorânea, Calhau, São Luís/MA");
  assert.equal(enderecoDoPonto(ponto({ bairro: "" })), "Av. Litorânea, 100, São Luís/MA");
  assert.equal(enderecoDoPonto(ponto({ uf: "" })), "Av. Litorânea, 100, Calhau, São Luís");
  assert.equal(enderecoDoPonto(ponto({ cidade: "" })), "Av. Litorânea, 100, Calhau, MA");
  assert.equal(enderecoDoPonto(ponto({ logradouro: "", numero: "" })), "Calhau, São Luís/MA");
  assert.equal(enderecoDoPonto(ponto({ logradouro: "", numero: "", bairro: "", cidade: "", uf: "" })), "");
});

test("enderecoDoPonto não escreve 'undefined' nem 'null' com campos ausentes", () => {
  const torto = { id: "p", nome: "x" } as unknown as PontoPublico;
  assert.equal(enderecoDoPonto(torto), "");
});

// ---------------------------------------------------------------------------------------------
// pontoPrincipal e opcoesDePonto
// ---------------------------------------------------------------------------------------------

test("pontoPrincipal é o primeiro ponto, ou null sem ponto", () => {
  const base: EmpresaPublica = { nomeFantasia: "X", telefone: null, email: "a@b.c", pontos: [ponto({ id: "a" }), ponto({ id: "b" })] };
  assert.equal(pontoPrincipal(base)?.id, "a");
  assert.equal(pontoPrincipal({ ...base, pontos: [] }), null);
  assert.equal(pontoPrincipal(null), null);
});

const estoque = [
  { id: "velho", nome: "Ponto antigo (pode estar inativo)" },
  { id: "p-1", nome: "Ponto Litorânea" },
];

test("opcoesDePonto usa os pontos da locadora quando a API respondeu", () => {
  const empresa: EmpresaPublica = { nomeFantasia: "X", telefone: null, email: "a@b.c", pontos: [ponto({ id: "p-1" }), ponto({ id: "p-2", nome: "Outro" })] };
  assert.deepEqual(opcoesDePonto({ tipo: "pronto", empresa }, estoque), [
    { id: "p-1", nome: "Ponto Litorânea" },
    { id: "p-2", nome: "Outro" },
  ]);
});

test("opcoesDePonto com a locadora sem ponto ativo não oferece o ponto do estoque (a API recusaria)", () => {
  const empresa: EmpresaPublica = { nomeFantasia: "X", telefone: null, email: "a@b.c", pontos: [] };
  assert.deepEqual(opcoesDePonto({ tipo: "pronto", empresa }, estoque), []);
});

test("opcoesDePonto sem cadastro da locadora devolve lista vazia", () => {
  assert.deepEqual(opcoesDePonto({ tipo: "semCadastro" }, estoque), []);
});

test("opcoesDePonto com a API fora do ar cai nos pontos das bicicletas", () => {
  assert.deepEqual(opcoesDePonto({ tipo: "erro" }, estoque), estoque);
});

test("opcoesDePonto devolve null enquanto a API ainda não respondeu", () => {
  assert.equal(opcoesDePonto(null, estoque), null);
});

// ---------------------------------------------------------------------------------------------
// buscarEmpresa: toda falha de rede ou de resposta vira um resultado, nunca uma exceção
// ---------------------------------------------------------------------------------------------

function resposta(status: number, corpo: unknown, bruto = false): Response {
  return new Response(bruto ? String(corpo) : JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("buscarEmpresa devolve pronto com a locadora lida", async () => {
  const r = await buscarEmpresa({ fetcher: async () => resposta(200, corpoApi()) });
  assert.equal(r.tipo, "pronto");
  if (r.tipo === "pronto") assert.equal(r.empresa.nomeFantasia, "Bike Ilha Club");
});

test("buscarEmpresa chama GET /api/empresa sem token (a rota é pública) e sem cache", async () => {
  let url = "";
  let init: RequestInit | undefined;
  await buscarEmpresa({
    fetcher: async (u, i) => {
      url = String(u);
      init = i;
      return resposta(200, corpoApi());
    },
  });
  assert.equal(url, "/api/empresa");
  assert.ok(init?.method === undefined || init.method === "GET");
  assert.equal(init?.cache, "no-store");
  const cabecalhos = new Headers(init?.headers);
  assert.equal(cabecalhos.get("authorization"), null);
});

test("buscarEmpresa trata 404 como locadora ainda não cadastrada", async () => {
  const r = await buscarEmpresa({
    fetcher: async () => resposta(404, { error: { code: "NOT_FOUND", message: "Dados da locadora não cadastrados." } }),
  });
  assert.deepEqual(r, { tipo: "semCadastro" });
});

test("buscarEmpresa trata qualquer outro status de erro como erro", async () => {
  for (const status of [400, 401, 403, 408, 429, 500, 502, 503, 504]) {
    const r = await buscarEmpresa({ fetcher: async () => resposta(status, { error: { code: "X", message: "m" } }) });
    assert.deepEqual(r, { tipo: "erro" }, String(status));
  }
});

test("buscarEmpresa trata rede caída como erro", async () => {
  const r = await buscarEmpresa({
    fetcher: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  assert.deepEqual(r, { tipo: "erro" });
});

test("buscarEmpresa trata exceção de qualquer tipo como erro (inclusive valor que não é Error)", async () => {
  for (const lancado of ["texto", 42, null, undefined, { a: 1 }]) {
    const r = await buscarEmpresa({
      fetcher: async () => {
        throw lancado;
      },
    });
    assert.deepEqual(r, { tipo: "erro" });
  }
});

test("buscarEmpresa trata 200 com corpo que não é JSON como erro", async () => {
  const r = await buscarEmpresa({ fetcher: async () => resposta(200, "<html>Bad gateway</html>", true) });
  assert.deepEqual(r, { tipo: "erro" });
});

test("buscarEmpresa trata 200 com corpo vazio como erro", async () => {
  const r = await buscarEmpresa({ fetcher: async () => resposta(200, "", true) });
  assert.deepEqual(r, { tipo: "erro" });
});

test("buscarEmpresa trata 200 com formato errado como erro", async () => {
  for (const corpo of [null, [], { data: null }, { data: { nomeFantasia: "" } }, { erro: true }]) {
    const r = await buscarEmpresa({ fetcher: async () => resposta(200, corpo) });
    assert.deepEqual(r, { tipo: "erro" }, JSON.stringify(corpo));
  }
});

test("buscarEmpresa desiste de uma resposta que nunca chega (timeout) e não fica carregando para sempre", async () => {
  const inicio = performance.now();
  const r = await buscarEmpresa({ fetcher: () => new Promise<Response>(() => {}), tempoLimiteMs: 30 });
  assert.deepEqual(r, { tipo: "erro" });
  assert.ok(performance.now() - inicio < 1000);
});

test("buscarEmpresa cancela o pedido pendente quando estoura o tempo", async () => {
  let cancelado = false;
  const r = await buscarEmpresa({
    fetcher: (_u, i) =>
      new Promise<Response>((_res, rej) => {
        i?.signal?.addEventListener("abort", () => {
          cancelado = true;
          rej(new DOMException("abortado", "AbortError"));
        });
      }),
    tempoLimiteMs: 20,
  });
  assert.deepEqual(r, { tipo: "erro" });
  assert.equal(cancelado, true);
});

test("buscarEmpresa não deixa timer pendurado depois de responder (o processo precisa poder terminar)", async () => {
  const r = await buscarEmpresa({ fetcher: async () => resposta(200, corpoApi()), tempoLimiteMs: 60_000 });
  assert.equal(r.tipo, "pronto");
  // Se o timer de 60 s ficasse ativo, o runner de testes esperaria 60 s para encerrar.
});

test("estresse: 200 chamadas ao mesmo tempo, com respostas misturadas, cada uma recebe a sua", async () => {
  const respostas = [
    () => resposta(200, corpoApi()),
    () => resposta(404, {}),
    () => resposta(500, {}),
    () => resposta(200, "lixo", true),
    () => {
      throw new TypeError("rede");
    },
  ];
  const esperado = ["pronto", "semCadastro", "erro", "erro", "erro"];
  const resultados = await Promise.all(
    Array.from({ length: 200 }, (_, i) => buscarEmpresa({ fetcher: async () => respostas[i % 5]() })),
  );
  resultados.forEach((r, i) => assert.equal(r.tipo, esperado[i % 5], `chamada ${i}`));
});
