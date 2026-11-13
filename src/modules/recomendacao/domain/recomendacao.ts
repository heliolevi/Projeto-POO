import {
  ajusteDeAltura,
  cabeNaAltura,
  criteriosPadrao,
  experienciaSuficiente,
  PESOS,
  type CriterioDeRecomendacao,
} from "./criterios.ts";
import type { Atividade, Experiencia, PerfilCiclista } from "./perfil.ts";

// Os critérios e os pesos moram em criterios.ts; reexportados aqui para o endereço antigo continuar valendo.
export { ajusteDeAltura, cabeNaAltura, experienciaSuficiente, PESOS };

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
// 1. Filtro: tipos ativos, com unidade livre e cuja faixa de altura inclui a do cliente
//    (sem altura informada, nenhum tipo sai por altura).
// 2. Pontuação de 0 a 100, com os pesos iniciais abaixo (a calibrar com a locadora).
// 3. Ordem: mais pontos primeiro; empate pelo menor preço por dia, depois pelo nome.

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
  ativo: boolean;
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

// Serviço da recomendação: filtra os tipos que servem ao cliente, pontua cada um pelos critérios
// e ordena. Os critérios chegam pelo construtor (por padrão, altura, atividade e experiência);
// o serviço trata todos pela mesma interface (polimorfismo) e não sabe qual é qual.
export class RecomendacaoService {
  readonly #criterios: readonly CriterioDeRecomendacao[];

  constructor(criterios: readonly CriterioDeRecomendacao[] = criteriosPadrao()) {
    this.#criterios = [...criterios];
  }

  // Soma os pontos dos critérios (0 a 100) e arredonda para inteiro no fim.
  pontuar(tipo: TipoCandidato, perfil: PerfilCiclista): number {
    return this.#avaliar(perfil, tipo).pontos;
  }

  // O motivo de cada critério que se aplica, na ordem da lista de critérios.
  motivos(tipo: TipoCandidato, perfil: PerfilCiclista): string[] {
    return this.#avaliar(perfil, tipo).motivos;
  }

  #avaliar(perfil: PerfilCiclista, tipo: TipoCandidato): { pontos: number; motivos: string[] } {
    const motivos: string[] = [];
    let pontos = 0;
    for (const criterio of this.#criterios) {
      const avaliacao = criterio.avaliar(perfil, tipo);
      if (avaliacao === null) continue; // dado que falta não pontua
      pontos += avaliacao.pontos;
      motivos.push(avaliacao.motivo);
    }
    return { pontos: Math.round(pontos), motivos };
  }

  recomendar(
    perfil: PerfilCiclista,
    tipos: readonly TipoCandidato[],
    calcularValorAluguel: CalcularValorAluguel,
  ): Recomendacao[] {
    const candidatos = tipos.filter(
      (tipo) =>
        tipo.ativo &&
        tipo.unidadesLivres > 0 &&
        (perfil.alturaCm === null || cabeNaAltura(perfil.alturaCm, tipo)),
    );

    return candidatos
      .map((tipo) => {
        const { pontos, motivos } = this.#avaliar(perfil, tipo);
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
}

const servicoPadrao = new RecomendacaoService();

// Atalho com os critérios padrão: é o que a busca (GET /api/recomendacao) usa.
export function recomendar(
  perfil: PerfilCiclista,
  tipos: readonly TipoCandidato[],
  calcularValorAluguel: CalcularValorAluguel,
): Recomendacao[] {
  return servicoPadrao.recomendar(perfil, tipos, calcularValorAluguel);
}
