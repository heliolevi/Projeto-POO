import {
  ATIVIDADES,
  EXPERIENCIAS,
  alturaValida,
  ehAtividade,
  ehExperiencia,
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
  type Atividade,
  type Experiencia,
} from "../../../shared/dominio/ciclista.ts";

export type ErrosPorCampo = Record<string, string>;

// Status que a API aceita para uma bicicleta. ALUGADA existe no enum do banco, mas no MVP não
// é usada: a disponibilidade vem das reservas, e o status só marca manutenção ou bloqueio
// (docs/contrato-api-mvp.md).
export const STATUS_BICICLETA = ["DISPONIVEL", "MANUTENCAO", "BLOQUEADA", "BAIXADA"] as const;
export type StatusBicicleta = (typeof STATUS_BICICLETA)[number];

// As colunas de preço são integer (32 bits) no banco: acima disso o INSERT falharia com 500.
export const CENTAVOS_MAX = 2_147_483_647;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

function objeto(entrada: unknown): Record<string, unknown> | null {
  return entrada && typeof entrada === "object" && !Array.isArray(entrada)
    ? (entrada as Record<string, unknown>)
    : null;
}

const ERRO_CORPO = "Envie um objeto JSON.";

// Texto livre opcional: tira os espaços das pontas; vazio ou ausente vira null.
function textoOpcional(
  valor: unknown,
  max: number,
  mensagem: string,
): { valor: string | null } | { erro: string } {
  if (valor === undefined || valor === null) return { valor: null };
  if (typeof valor !== "string") return { erro: mensagem };
  const limpo = valor.trim();
  if (limpo.length > max) return { erro: mensagem };
  return { valor: limpo === "" ? null : limpo };
}

function centavos(valor: unknown): valor is number {
  return Number.isSafeInteger(valor) && (valor as number) >= 0 && (valor as number) <= CENTAVOS_MAX;
}

// ---------------------------------------------------------------------------
// Tipo de bicicleta (POST e PUT /api/admin/tipos)
// ---------------------------------------------------------------------------
export type DadosTipo = {
  nome: string;
  atividades: Atividade[];
  alturaMinCm: number;
  alturaMaxCm: number;
  precoHoraCentavos: number;
  precoDiaCentavos: number;
  // Opcionais: undefined = não veio no corpo. No POST valem os padrões (descrição vazia,
  // INICIANTE, caução 0 e ativo); no PUT o tipo MANTÉM o valor que já tinha, para quem só quer
  // mudar o preço não zerar a caução sem querer. `descricao: null` apaga a descrição de propósito.
  descricao?: string | null;
  nivelRecomendado?: Experiencia;
  valorCaucaoCentavos?: number;
  ativo?: boolean;
};

export function validarTipo(
  entrada: unknown,
): { dados: DadosTipo } | { erros: ErrosPorCampo } {
  const corpo = objeto(entrada);
  if (!corpo) return { erros: { corpo: ERRO_CORPO } };
  const erros: ErrosPorCampo = {};

  const nome = typeof corpo.nome === "string" ? corpo.nome.trim().replace(/\s+/g, " ") : "";
  if (nome.length < 2 || nome.length > 80) erros.nome = "Informe o nome do tipo (2 a 80 caracteres).";

  let descricao: string | null | undefined;
  if (corpo.descricao !== undefined) {
    const lida = textoOpcional(corpo.descricao, 500, "A descrição pode ter até 500 caracteres.");
    if ("erro" in lida) erros.descricao = lida.erro;
    else descricao = lida.valor;
  }

  const atividades: Atividade[] = [];
  if (!Array.isArray(corpo.atividades) || corpo.atividades.length === 0) {
    erros.atividades = `Informe ao menos uma atividade: ${ATIVIDADES.join(", ")}.`;
  } else if (!corpo.atividades.every(ehAtividade)) {
    erros.atividades = `Atividade inválida. Use estes valores: ${ATIVIDADES.join(", ")}.`;
  } else {
    // repetida não muda nada; guarda uma vez só, na ordem em que veio
    for (const atividade of corpo.atividades) {
      if (!atividades.includes(atividade)) atividades.push(atividade);
    }
  }

  const faixa = `Altura deve ser um inteiro entre ${ALTURA_MIN_CM} e ${ALTURA_MAX_CM} (cm).`;
  if (!alturaValida(corpo.alturaMinCm)) erros.alturaMinCm = faixa;
  if (!alturaValida(corpo.alturaMaxCm)) erros.alturaMaxCm = faixa;
  if (
    alturaValida(corpo.alturaMinCm) &&
    alturaValida(corpo.alturaMaxCm) &&
    corpo.alturaMinCm > corpo.alturaMaxCm
  ) {
    erros.alturaMaxCm = "A altura máxima precisa ser maior ou igual à mínima.";
  }

  let nivelRecomendado: Experiencia | undefined;
  if (corpo.nivelRecomendado !== undefined && corpo.nivelRecomendado !== null) {
    if (ehExperiencia(corpo.nivelRecomendado)) nivelRecomendado = corpo.nivelRecomendado;
    else erros.nivelRecomendado = `Nível inválido. Use um destes valores: ${EXPERIENCIAS.join(", ")}.`;
  }

  const mensagemPreco = "Informe o valor em centavos, como inteiro maior ou igual a zero (ex.: 5000 é R$ 50,00).";
  if (!centavos(corpo.precoHoraCentavos)) erros.precoHoraCentavos = mensagemPreco;
  if (!centavos(corpo.precoDiaCentavos)) erros.precoDiaCentavos = mensagemPreco;
  let valorCaucaoCentavos: number | undefined;
  if (corpo.valorCaucaoCentavos !== undefined && corpo.valorCaucaoCentavos !== null) {
    if (centavos(corpo.valorCaucaoCentavos)) valorCaucaoCentavos = corpo.valorCaucaoCentavos;
    else erros.valorCaucaoCentavos = mensagemPreco;
  }

  let ativo: boolean | undefined;
  if (corpo.ativo !== undefined && corpo.ativo !== null) {
    if (typeof corpo.ativo === "boolean") ativo = corpo.ativo;
    else erros.ativo = "ativo precisa ser true ou false.";
  }

  if (Object.keys(erros).length > 0) return { erros };
  return {
    dados: {
      nome,
      descricao,
      atividades,
      alturaMinCm: corpo.alturaMinCm as number,
      alturaMaxCm: corpo.alturaMaxCm as number,
      nivelRecomendado,
      precoHoraCentavos: corpo.precoHoraCentavos as number,
      precoDiaCentavos: corpo.precoDiaCentavos as number,
      valorCaucaoCentavos,
      ativo,
    },
  };
}

// ---------------------------------------------------------------------------
// Bicicleta (POST /api/admin/bicicletas)
// ---------------------------------------------------------------------------
export type DadosNovaBicicleta = {
  tipoId: string;
  pontoId: string;
  codigo: string;
  numeroSerie: string | null;
  tamanhoQuadro: string | null;
  observacoes: string | null;
};

// O código é o número colado na bicicleta: letras, números e . _ - / com espaços no meio. Vai
// para maiúsculas para "bic-001" e "BIC-001" não virarem duas bicicletas no balcão.
const CODIGO = /^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u;

export function validarNovaBicicleta(
  entrada: unknown,
): { dados: DadosNovaBicicleta } | { erros: ErrosPorCampo } {
  const corpo = objeto(entrada);
  if (!corpo) return { erros: { corpo: ERRO_CORPO } };
  const erros: ErrosPorCampo = {};

  if (!ehUuid(corpo.tipoId)) erros.tipoId = "Informe o tipoId (UUID).";
  if (!ehUuid(corpo.pontoId)) erros.pontoId = "Informe o pontoId (UUID).";

  const codigo = typeof corpo.codigo === "string" ? corpo.codigo.trim().replace(/\s+/g, " ").toUpperCase() : "";
  if (codigo.length < 1 || codigo.length > 40 || !CODIGO.test(codigo)) {
    erros.codigo = "Informe o código da bicicleta (até 40 caracteres: letras, números, espaço e . _ - /).";
  }

  const numeroSerie = textoOpcional(corpo.numeroSerie, 60, "O número de série pode ter até 60 caracteres.");
  if ("erro" in numeroSerie) erros.numeroSerie = numeroSerie.erro;
  const tamanhoQuadro = textoOpcional(corpo.tamanhoQuadro, 20, "O tamanho do quadro pode ter até 20 caracteres.");
  if ("erro" in tamanhoQuadro) erros.tamanhoQuadro = tamanhoQuadro.erro;
  const observacoes = textoOpcional(corpo.observacoes, 500, "As observações podem ter até 500 caracteres.");
  if ("erro" in observacoes) erros.observacoes = observacoes.erro;

  if (Object.keys(erros).length > 0) return { erros };
  return {
    dados: {
      tipoId: corpo.tipoId as string,
      pontoId: corpo.pontoId as string,
      codigo,
      numeroSerie: (numeroSerie as { valor: string | null }).valor,
      tamanhoQuadro: (tamanhoQuadro as { valor: string | null }).valor,
      observacoes: (observacoes as { valor: string | null }).valor,
    },
  };
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/bicicletas/{id}: status e/ou observações
// ---------------------------------------------------------------------------
export type DadosAtualizacaoBicicleta = {
  // undefined = não mexer
  status?: StatusBicicleta;
  // undefined = não mexer; null = apagar
  observacoes?: string | null;
};

export function validarAtualizacaoBicicleta(
  entrada: unknown,
): { dados: DadosAtualizacaoBicicleta } | { erros: ErrosPorCampo } {
  const corpo = objeto(entrada);
  if (!corpo) return { erros: { corpo: ERRO_CORPO } };
  const erros: ErrosPorCampo = {};
  const dados: DadosAtualizacaoBicicleta = {};

  if (corpo.status !== undefined) {
    if ((STATUS_BICICLETA as readonly unknown[]).includes(corpo.status)) {
      dados.status = corpo.status as StatusBicicleta;
    } else {
      erros.status = `Status inválido. Use um destes valores: ${STATUS_BICICLETA.join(", ")}.`;
    }
  }
  if (corpo.observacoes !== undefined) {
    const observacoes = textoOpcional(corpo.observacoes, 500, "As observações podem ter até 500 caracteres.");
    if ("erro" in observacoes) erros.observacoes = observacoes.erro;
    else dados.observacoes = observacoes.valor;
  }

  if (Object.keys(erros).length === 0 && dados.status === undefined && dados.observacoes === undefined) {
    erros.corpo = "Informe ao menos um campo: status ou observacoes.";
  }
  if (Object.keys(erros).length > 0) return { erros };
  return { dados };
}

// ---------------------------------------------------------------------------
// Filtros de GET /api/admin/bicicletas
// ---------------------------------------------------------------------------
export type FiltroBicicletas = { tipoId: string | null; status: StatusBicicleta | null };

export function validarFiltroBicicletas(
  parametros: { tipoId?: string | null; status?: string | null },
): { dados: FiltroBicicletas } | { erros: ErrosPorCampo } {
  const erros: ErrosPorCampo = {};
  const tipoId = parametros.tipoId ?? null;
  const status = parametros.status ?? null;

  if (tipoId !== null && !ehUuid(tipoId)) erros.tipoId = "tipoId precisa ser um UUID.";
  if (status !== null && !(STATUS_BICICLETA as readonly string[]).includes(status)) {
    erros.status = `Status inválido. Use um destes valores: ${STATUS_BICICLETA.join(", ")}.`;
  }

  if (Object.keys(erros).length > 0) return { erros };
  return { dados: { tipoId, status: status as StatusBicicleta | null } };
}
