import {
  EXPERIENCIAS,
  NOME_ATIVIDADE,
  NOME_EXPERIENCIA,
  type Experiencia,
  type PerfilCiclista,
} from "./perfil.ts";
import type { TipoCandidato } from "./recomendacao.ts";

// Pesos iniciais da pontuação (soma 100), a calibrar com a locadora.
export const PESOS = { altura: 50, atividade: 30, experiencia: 20 } as const;

type FaixaDeAltura = Pick<TipoCandidato, "alturaMinCm" | "alturaMaxCm">;

export function cabeNaAltura(alturaCm: number, tipo: FaixaDeAltura): boolean {
  return alturaCm >= tipo.alturaMinCm && alturaCm <= tipo.alturaMaxCm;
}

// Ajuste da altura dentro da faixa do tipo: 1 no centro, caindo em linha reta até 0 nas
// pontas. Faixa de um valor só (mínimo igual ao máximo) é ajuste perfeito.
export function ajusteDeAltura(alturaCm: number, tipo: FaixaDeAltura): number {
  if (!cabeNaAltura(alturaCm, tipo)) return 0;
  const meiaFaixa = (tipo.alturaMaxCm - tipo.alturaMinCm) / 2;
  if (meiaFaixa === 0) return 1;
  const centro = tipo.alturaMinCm + meiaFaixa;
  return 1 - Math.abs(alturaCm - centro) / meiaFaixa;
}

export function experienciaSuficiente(cliente: Experiencia, recomendado: Experiencia): boolean {
  return EXPERIENCIAS.indexOf(cliente) >= EXPERIENCIAS.indexOf(recomendado);
}

// O que um critério diz de um tipo para um cliente: quantos pontos dá e o motivo em texto.
export type Avaliacao = { pontos: number; motivo: string };

// Contrato de um critério da recomendação. Cada critério é uma classe que implementa esta interface
// e o RecomendacaoService só sabe somar avaliações: um critério novo (por exemplo, "peso do
// ciclista") entra na lista sem alterar o serviço. Devolve null quando falta o dado do cliente:
// dado que falta não pontua e não gera motivo, para a ordem continuar justa entre os tipos.
export interface CriterioDeRecomendacao {
  readonly nome: string;
  readonly peso: number;
  avaliar(perfil: PerfilCiclista, tipo: TipoCandidato): Avaliacao | null;
}

export class CriterioAltura implements CriterioDeRecomendacao {
  readonly nome = "altura";
  readonly peso: number = PESOS.altura;

  avaliar(perfil: PerfilCiclista, tipo: TipoCandidato): Avaliacao | null {
    if (perfil.alturaCm === null) return null;
    const ajuste = ajusteDeAltura(perfil.alturaCm, tipo);
    return {
      pontos: this.peso * ajuste,
      motivo:
        ajuste >= 0.5
          ? `Cabe bem na sua altura de ${perfil.alturaCm} cm`
          : `Cabe na sua altura de ${perfil.alturaCm} cm, perto do limite da faixa (${tipo.alturaMinCm} a ${tipo.alturaMaxCm} cm)`,
    };
  }
}

export class CriterioAtividade implements CriterioDeRecomendacao {
  readonly nome = "atividade";
  readonly peso: number = PESOS.atividade;

  avaliar(perfil: PerfilCiclista, tipo: TipoCandidato): Avaliacao | null {
    if (perfil.atividade === null) return null;
    const nome = NOME_ATIVIDADE[perfil.atividade];
    return tipo.atividades.includes(perfil.atividade)
      ? { pontos: this.peso, motivo: `Boa para ${nome}` }
      : { pontos: 0, motivo: `Não é a mais indicada para ${nome}` };
  }
}

export class CriterioExperiencia implements CriterioDeRecomendacao {
  readonly nome = "experiência";
  readonly peso: number = PESOS.experiencia;

  avaliar(perfil: PerfilCiclista, tipo: TipoCandidato): Avaliacao | null {
    if (perfil.experiencia === null) return null;
    return experienciaSuficiente(perfil.experiencia, tipo.nivelRecomendado)
      ? { pontos: this.peso, motivo: `Adequada ao seu nível (${NOME_EXPERIENCIA[perfil.experiencia]})` }
      : { pontos: 0, motivo: `Recomendada a partir do nível ${NOME_EXPERIENCIA[tipo.nivelRecomendado]}` };
  }
}

// A ordem da lista é a ordem dos motivos devolvidos ao cliente.
export function criteriosPadrao(): CriterioDeRecomendacao[] {
  return [new CriterioAltura(), new CriterioAtividade(), new CriterioExperiencia()];
}
