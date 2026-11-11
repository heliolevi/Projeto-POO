/**
 * Módulo recomendacao — Tipos de bicicleta livres no período, ordenados pela adequação ao perfil do cliente (altura, experiência e atividade).
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export {
  ATIVIDADES,
  EXPERIENCIAS,
  ehAtividade,
  ehExperiencia,
  type Atividade,
  type Experiencia,
  type PerfilCiclista,
} from "./domain/perfil";
export { validarBusca, type BuscaValidada } from "./domain/periodo";
export {
  PESOS,
  recomendar,
  type CalcularValorAluguel,
  type Recomendacao,
  type TipoCandidato,
} from "./domain/recomendacao";
export { getRecomendacao } from "./http/handlers";
