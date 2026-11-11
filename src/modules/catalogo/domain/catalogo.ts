import type { Atividade, Experiencia } from "../../../shared/dominio/ciclista.ts";
import type { StatusBicicleta } from "./validacao.ts";

// Como a API devolve um tipo de bicicleta (docs/contrato-api-mvp.md, rotas 10 e 19 a 21).
export type TipoAdmin = {
  id: string;
  nome: string;
  descricao: string | null;
  atividades: Atividade[];
  alturaMinCm: number;
  alturaMaxCm: number;
  nivelRecomendado: Experiencia;
  precoHoraCentavos: number;
  precoDiaCentavos: number;
  valorCaucaoCentavos: number;
  ativo: boolean;
};

// O catálogo público não mostra `ativo`: só os tipos ativos aparecem nele.
export type TipoPublico = Omit<TipoAdmin, "ativo">;

// Campo a campo, de propósito: um campo novo em TipoAdmin não vaza para o público sem alguém decidir.
export function paraPublico(tipo: TipoAdmin): TipoPublico {
  return {
    id: tipo.id,
    nome: tipo.nome,
    descricao: tipo.descricao,
    atividades: tipo.atividades,
    alturaMinCm: tipo.alturaMinCm,
    alturaMaxCm: tipo.alturaMaxCm,
    nivelRecomendado: tipo.nivelRecomendado,
    precoHoraCentavos: tipo.precoHoraCentavos,
    precoDiaCentavos: tipo.precoDiaCentavos,
    valorCaucaoCentavos: tipo.valorCaucaoCentavos,
  };
}

// Como a API devolve uma unidade da frota (rotas 22 a 24). Só a equipe vê estes dados.
export type BicicletaAdmin = {
  id: string;
  codigo: string;
  tipo: { id: string; nome: string };
  ponto: { id: string; nome: string };
  numeroSerie: string | null;
  tamanhoQuadro: string | null;
  // STATUS_BICICLETA mais ALUGADA, que existe no banco mas a API não cria
  status: StatusBicicleta | "ALUGADA";
  observacoes: string | null;
};
