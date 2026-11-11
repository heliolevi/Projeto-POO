import {
  EXPERIENCIAS,
  NOME_ATIVIDADE,
  NOME_EXPERIENCIA,
  type Atividade,
  type Experiencia,
  type PerfilCiclista,
} from "./perfil.ts";

// Recomendação de bicicletas (docs/modelo-de-dados.md, "Dados de recomendação").
//
// Função pura: recebe o perfil do cliente, os tipos do catálogo já com a contagem de
// unidades livres no período e a função que calcula o valor do aluguel, e devolve a lista
// ordenada. Não lê banco nem relógio, então o mesmo pedido dá sempre a mesma resposta e tudo
// pode ser testado.
//
// O preço NÃO é calculado aqui: a regra mora só em src/modules/reservas (calcularValorAluguel),
// a mesma que a reserva usa. Quem chama monta o período e entrega a função pronta, e assim a
// vitrine nunca diverge da cobrança.
//
// 1. Filtro: tipos com unidade livre e cuja faixa de altura inclui a do cliente
//    (sem altura informada, nenhum tipo sai por altura).
// 2. Pontuação de 0 a 100, com os pesos iniciais abaixo (a calibrar com a locadora).
// 3. Ordem: mais pontos primeiro; empate pelo menor preço por dia, depois pelo nome.

export const PESOS = { altura: 50, atividade: 30, experiencia: 20 } as const;

// Quem chama entrega só tipos ATIVOS (a consulta já filtra `WHERE t.ativo`); por isso o tipo não
// carrega o campo `ativo`.
export type TipoCandidato = {
  id: string;
  nome: string;
  descricao: string | null;
  atividades: readonly Atividade[];
  alturaMinCm: number;
  alturaMaxCm: number;
  nivelRecomendado: Experiencia;
  precoHoraCentavos: number;
  precoDiaCentavos: number;
  valorCaucaoCentavos: number;
  // unidades DISPONIVEL sem reserva ativa que se sobreponha ao período da busca
  unidadesLivres: number;
};

export type Recomendacao = {
  tipoId: string;
  nome: string;
  descricao: string | null;
  pontos: number;
  motivos: string[];
  valorAluguelCentavos: number;
  valorCaucaoCentavos: number;
  unidadesLivres: number;
};

// Valor do aluguel de um tipo no período da busca, em centavos.
export type CalcularValorAluguel = (tipo: TipoCandidato) => number;

export function cabeNaAltura(alturaCm: number, tipo: Pick<TipoCandidato, "alturaMinCm" | "alturaMaxCm">) {
  return alturaCm >= tipo.alturaMinCm && alturaCm <= tipo.alturaMaxCm;
}

// Ajuste da altura dentro da faixa do tipo: 1 no centro, caindo em linha reta até 0 nas
// pontas. Faixa de um valor só (mínimo igual ao máximo) é ajuste perfeito.
export function ajusteDeAltura(
  alturaCm: number,
  tipo: Pick<TipoCandidato, "alturaMinCm" | "alturaMaxCm">,
): number {
  if (!cabeNaAltura(alturaCm, tipo)) return 0;
  const meiaFaixa = (tipo.alturaMaxCm - tipo.alturaMinCm) / 2;
  if (meiaFaixa === 0) return 1;
  const centro = tipo.alturaMinCm + meiaFaixa;
  return 1 - Math.abs(alturaCm - centro) / meiaFaixa;
}

export function experienciaSuficiente(cliente: Experiencia, recomendado: Experiencia): boolean {
  return EXPERIENCIAS.indexOf(cliente) >= EXPERIENCIAS.indexOf(recomendado);
}

function avaliar(perfil: PerfilCiclista, tipo: TipoCandidato) {
  const motivos: string[] = [];
  let pontos = 0;

  if (perfil.alturaCm !== null) {
    const ajuste = ajusteDeAltura(perfil.alturaCm, tipo);
    pontos += PESOS.altura * ajuste;
    motivos.push(
      ajuste >= 0.5
        ? `Cabe bem na sua altura de ${perfil.alturaCm} cm`
        : `Cabe na sua altura de ${perfil.alturaCm} cm, perto do limite da faixa (${tipo.alturaMinCm} a ${tipo.alturaMaxCm} cm)`,
    );
  }

  if (perfil.atividade !== null) {
    if (tipo.atividades.includes(perfil.atividade)) {
      pontos += PESOS.atividade;
      motivos.push(`Boa para ${NOME_ATIVIDADE[perfil.atividade]}`);
    } else {
      motivos.push(`Não é a mais indicada para ${NOME_ATIVIDADE[perfil.atividade]}`);
    }
  }

  if (perfil.experiencia !== null) {
    if (experienciaSuficiente(perfil.experiencia, tipo.nivelRecomendado)) {
      pontos += PESOS.experiencia;
      motivos.push(`Adequada ao seu nível (${NOME_EXPERIENCIA[perfil.experiencia]})`);
    } else {
      motivos.push(`Recomendada a partir do nível ${NOME_EXPERIENCIA[tipo.nivelRecomendado]}`);
    }
  }

  return { pontos: Math.round(pontos), motivos };
}

export function recomendar(
  perfil: PerfilCiclista,
  tipos: readonly TipoCandidato[],
  calcularValorAluguel: CalcularValorAluguel,
): Recomendacao[] {
  const candidatos = tipos.filter(
    (tipo) =>
      tipo.unidadesLivres > 0 &&
      (perfil.alturaCm === null || cabeNaAltura(perfil.alturaCm, tipo)),
  );

  return candidatos
    .map((tipo) => {
      const { pontos, motivos } = avaliar(perfil, tipo);
      return {
        tipo,
        resultado: {
          tipoId: tipo.id,
          nome: tipo.nome,
          descricao: tipo.descricao,
          pontos,
          motivos,
          valorAluguelCentavos: calcularValorAluguel(tipo),
          valorCaucaoCentavos: tipo.valorCaucaoCentavos,
          unidadesLivres: tipo.unidadesLivres,
        },
      };
    })
    .sort(
      (a, b) =>
        b.resultado.pontos - a.resultado.pontos ||
        a.tipo.precoDiaCentavos - b.tipo.precoDiaCentavos ||
        a.tipo.nome.localeCompare(b.tipo.nome, "pt-BR") ||
        a.tipo.id.localeCompare(b.tipo.id),
    )
    .map(({ resultado }) => resultado);
}
