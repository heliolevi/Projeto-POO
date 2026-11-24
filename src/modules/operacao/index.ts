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
