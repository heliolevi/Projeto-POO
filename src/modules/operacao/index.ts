/**
 * Módulo operacao — Retirada e devolução com checklist e fotos; ocorrências.
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export { abrirOcorrencia } from "./domain/abrir-ocorrencia";
export { Atraso, TOLERANCIA_DE_ATRASO_MS } from "./domain/atraso";
export { Dano } from "./domain/dano";
export { Furto } from "./domain/furto";
export {
  Ocorrencia,
  OcorrenciaInvalida,
  STATUS_DE_OCORRENCIA,
  TIPOS_DE_OCORRENCIA,
  type DivisaoDaCobranca,
  type OcorrenciaDto,
  type StatusDeOcorrencia,
  type TipoDeOcorrencia,
} from "./domain/ocorrencia";
export {
  Checklist,
  ItemDoChecklist,
  MAXIMO_DE_ITENS,
  TAMANHO_MAXIMO_DAS_OBSERVACOES,
  TAMANHO_MAXIMO_DO_NOME,
  type ItemDoChecklistDto,
} from "./domain/checklist";
export {
  Movimentacao,
  MovimentacaoInvalida,
  type MovimentacaoParaPersistir,
  type TipoMovimentacao,
} from "./domain/movimentacao";
export {
  OperacaoService,
  type DependenciasOperacao,
  type ReservaComBicicleta,
} from "./application/operacao-service";
export { postDevolucao, postRetirada } from "./http/handlers";
