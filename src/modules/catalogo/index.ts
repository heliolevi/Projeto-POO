/**
 * Módulo catalogo — Tipos de bicicleta, unidades, preços, regras de caução e disponibilidade por período.
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export {
  getAdminBicicletas,
  getAdminTipos,
  getTiposPublicos,
  patchAdminBicicleta,
  postAdminBicicletas,
  postAdminTipos,
  putAdminTipo,
} from "./http/handlers";
export type { BicicletaAdmin, TipoAdmin, TipoPublico } from "./domain/catalogo";
export { STATUS_BICICLETA, type StatusBicicleta } from "./domain/validacao";
