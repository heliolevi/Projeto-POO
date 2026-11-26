// Dados públicos da locadora (GET /api/empresa, rota 9 do contrato). Tudo aqui é função pura, sem
// React nem DOM, para os testes rodarem direto. O que vem da rede entra como `unknown` e só sai
// daqui no formato do contrato: campo que faltar ou vier torto não derruba a tela.

export type HorarioDoPonto = {
  /** 0 = domingo, 1 = segunda ... 6 = sábado (a mesma convenção do banco e da agenda de retirada). */
  diaSemana: number;
  /** "HH:MM", sempre com dois dígitos. */
  abre: string;
  fecha: string;
};

export type PontoPublico = {
  id: string;
  nome: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cep: string;
  cidade: string;
  uf: string;
  telefone: string | null;
  horarios: HorarioDoPonto[];
};

export type EmpresaPublica = {
  nomeFantasia: string;
  telefone: string | null;
  email: string;
  pontos: PontoPublico[];
};

export type ResultadoEmpresa =
  | { tipo: "pronto"; empresa: EmpresaPublica }
  | { tipo: "semCadastro" }
  | { tipo: "erro" };

// ---------------------------------------------------------------------------------------------
// Leitura defensiva da resposta
// ---------------------------------------------------------------------------------------------

type Objeto = Record<string, unknown>;

function ehObjeto(valor: unknown): valor is Objeto {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Texto sem as pontas em branco, ou "" se não for texto. */
function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/** Texto sem as pontas em branco, ou null se não for texto ou ficar vazio. */
function textoOuNulo(valor: unknown): string | null {
  const limpo = texto(valor);
  return limpo === "" ? null : limpo;
}

const HORA = /^(\d{1,2}):(\d{2})$/;

function minutosDoDia(valor: unknown): number | null {
  if (typeof valor !== "string") return null;
  const partes = HORA.exec(valor.trim());
  if (!partes) return null;
  const hora = Number(partes[1]);
  const minuto = Number(partes[2]);
  if (hora > 23 || minuto > 59) return null;
  return hora * 60 + minuto;
}

function escreverHora(minutos: number): string {
  const hora = String(Math.floor(minutos / 60)).padStart(2, "0");
  const minuto = String(minutos % 60).padStart(2, "0");
  return `${hora}:${minuto}`;
}

function lerHorario(bruto: unknown): HorarioDoPonto | null {
  if (!ehObjeto(bruto)) return null;
  const dia = bruto.diaSemana;
  if (typeof dia !== "number" || !Number.isInteger(dia) || dia < 0 || dia > 6) return null;
  const abre = minutosDoDia(bruto.abre);
  const fecha = minutosDoDia(bruto.fecha);
  if (abre === null || fecha === null || fecha <= abre) return null;
  return { diaSemana: dia, abre: escreverHora(abre), fecha: escreverHora(fecha) };
}

function lerPonto(bruto: unknown): PontoPublico | null {
  if (!ehObjeto(bruto)) return null;
  const id = texto(bruto.id);
  const nome = texto(bruto.nome);
  if (id === "" || nome === "") return null;
  const horarios: HorarioDoPonto[] = [];
  if (Array.isArray(bruto.horarios)) {
    for (const item of bruto.horarios) {
      const horario = lerHorario(item);
      if (horario) horarios.push(horario);
    }
  }
  return {
    id,
    nome,
    logradouro: texto(bruto.logradouro),
    numero: texto(bruto.numero),
    complemento: textoOuNulo(bruto.complemento),
    bairro: texto(bruto.bairro),
    cep: texto(bruto.cep),
    cidade: texto(bruto.cidade),
    uf: texto(bruto.uf),
    telefone: textoOuNulo(bruto.telefone),
    horarios,
  };
}

/**
 * Lê o corpo de GET /api/empresa. Devolve null quando não dá para confiar no corpo (não é o
 * formato `{ data: {...} }` ou falta o nome da locadora). Ponto ou horário inválido é descartado
 * sozinho; `pontos` ausente vira lista vazia. Só os campos do contrato saem daqui.
 */
export function lerEmpresa(corpo: unknown): EmpresaPublica | null {
  if (!ehObjeto(corpo) || !ehObjeto(corpo.data)) return null;
  const dados = corpo.data;
  const nomeFantasia = texto(dados.nomeFantasia);
  if (nomeFantasia === "") return null;

  const pontos: PontoPublico[] = [];
  if (Array.isArray(dados.pontos)) {
    for (const item of dados.pontos) {
      const ponto = lerPonto(item);
      if (ponto) pontos.push(ponto);
    }
  }
  return {
    nomeFantasia,
    telefone: textoOuNulo(dados.telefone),
    email: texto(dados.email),
    pontos,
  };
}

// ---------------------------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------------------------

// A semana aparece de segunda a domingo (o banco usa 0 = domingo).
const SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;
const NOME_DO_DIA: Record<number, string> = {
  0: "domingo",
  1: "segunda",
  2: "terça",
  3: "quarta",
  4: "quinta",
  5: "sexta",
  6: "sábado",
};

function maiuscula(valor: string): string {
  return valor.charAt(0).toUpperCase() + valor.slice(1);
}

function nomeDoGrupo(primeiro: number, ultimo: number, quantos: number): string {
  if (quantos === 7) return "Todos os dias";
  if (quantos === 1) return maiuscula(NOME_DO_DIA[primeiro]);
  if (quantos === 2) return `${maiuscula(NOME_DO_DIA[primeiro])} e ${NOME_DO_DIA[ultimo]}`;
  return `${maiuscula(NOME_DO_DIA[primeiro])} a ${NOME_DO_DIA[ultimo]}`;
}

/**
 * Junta os dias seguidos que abrem e fecham na mesma hora: "Segunda a sexta: 08:00 às 18:00".
 * Se o mesmo dia vier duas vezes, vale o primeiro. A lista recebida não é alterada.
 */
export function resumirHorarios(horarios: readonly HorarioDoPonto[]): { dias: string; horario: string }[] {
  const porDia = new Map<number, HorarioDoPonto>();
  for (const horario of horarios) {
    if (!porDia.has(horario.diaSemana)) porDia.set(horario.diaSemana, horario);
  }

  const linhas: { dias: string; horario: string }[] = [];
  let indice = 0;
  while (indice < SEMANA.length) {
    const inicio = porDia.get(SEMANA[indice]);
    if (!inicio) {
      indice += 1;
      continue;
    }
    let fim = indice;
    while (fim + 1 < SEMANA.length) {
      const proximo = porDia.get(SEMANA[fim + 1]);
      if (!proximo || proximo.abre !== inicio.abre || proximo.fecha !== inicio.fecha) break;
      fim += 1;
    }
    linhas.push({
      dias: nomeDoGrupo(SEMANA[indice], SEMANA[fim], fim - indice + 1),
      horario: `${inicio.abre} às ${inicio.fecha}`,
    });
    indice = fim + 1;
  }
  return linhas;
}

/** "Av. Litorânea, 100 (loja 2), Calhau, São Luís/MA", sem vírgula sobrando se faltar parte. */
export function enderecoDoPonto(
  ponto: Pick<PontoPublico, "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf">,
): string {
  const rua = [ponto.logradouro, ponto.numero].filter(Boolean).join(", ");
  const comComplemento = ponto.complemento ? (rua ? `${rua} (${ponto.complemento})` : ponto.complemento) : rua;
  const cidade = [ponto.cidade, ponto.uf].filter(Boolean).join("/");
  return [comComplemento, ponto.bairro, cidade].filter(Boolean).join(", ");
}

/** O ponto de retirada que a tela mostra: o primeiro (a locadora tem um só no MVP). */
export function pontoPrincipal(empresa: EmpresaPublica | null | undefined): PontoPublico | null {
  return empresa?.pontos[0] ?? null;
}

/**
 * Pontos que o painel do admin oferece ao cadastrar uma bicicleta. Com a resposta da API, valem só
 * os pontos ativos dela (a API recusa bicicleta em ponto inativo). Só se a API falhar caímos nos
 * pontos das bicicletas já cadastradas. `null` = ainda carregando.
 */
export function opcoesDePonto(
  resultado: ResultadoEmpresa | null,
  doEstoque: readonly { id: string; nome: string }[],
): { id: string; nome: string }[] | null {
  if (resultado === null) return null;
  if (resultado.tipo === "pronto") return resultado.empresa.pontos.map((p) => ({ id: p.id, nome: p.nome }));
  if (resultado.tipo === "semCadastro") return [];
  return doEstoque.map((p) => ({ id: p.id, nome: p.nome }));
}

// ---------------------------------------------------------------------------------------------
// Busca na API
// ---------------------------------------------------------------------------------------------

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const TEMPO_LIMITE_PADRAO_MS = 10_000;

/**
 * Busca os dados da locadora. Nunca lança: 404 vira `semCadastro`; rede caída, status de erro,
 * corpo que não é JSON, formato errado e resposta que não chega no tempo viram `erro`. A rota é
 * pública, então não envia o token.
 */
export async function buscarEmpresa(
  opcoes: { fetcher?: Fetcher; tempoLimiteMs?: number } = {},
): Promise<ResultadoEmpresa> {
  const fetcher: Fetcher = opcoes.fetcher ?? ((url, init) => fetch(url, init));
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS;
  const controle = new AbortController();
  let relogio: ReturnType<typeof setTimeout> | undefined;

  const carregar = async (): Promise<ResultadoEmpresa> => {
    try {
      const resposta = await fetcher("/api/empresa", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controle.signal,
      });
      if (resposta.status === 404) return { tipo: "semCadastro" };
      if (!resposta.ok) return { tipo: "erro" };
      const empresa = lerEmpresa(await resposta.json());
      return empresa ? { tipo: "pronto", empresa } : { tipo: "erro" };
    } catch {
      return { tipo: "erro" };
    }
  };

  const estouro = new Promise<ResultadoEmpresa>((resolver) => {
    relogio = setTimeout(() => {
      controle.abort();
      resolver({ tipo: "erro" });
    }, tempoLimiteMs);
  });

  try {
    return await Promise.race([carregar(), estouro]);
  } finally {
    clearTimeout(relogio);
  }
}
