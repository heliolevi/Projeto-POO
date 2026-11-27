/**
 * Módulo catalogo — Tipos de bicicleta, unidades, preços, regras de caução e disponibilidade por período.
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export {
  getAdminBicicletas,
  getEmpresaPublica,
  getAdminTipos,
  getTiposPublicos,
  patchAdminBicicleta,
  postAdminBicicletas,
  postAdminTipos,
  putAdminTipo,
} from "./http/handlers";
export type { BicicletaAdmin, EmpresaPublica, TipoAdmin, TipoPublico } from "./domain/catalogo";
export { STATUS_BICICLETA, type StatusBicicleta } from "./domain/validacao";
export { Bicicleta, TransicaoDeBicicletaInvalida } from "./domain/bicicleta";
export { Empresa } from "./domain/empresa";
export { Ponto, horarioDoBanco, type Horario, type HorarioDoBanco } from "./domain/ponto";
export { TipoBicicleta } from "./domain/tipo-bicicleta";
