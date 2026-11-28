/**
 * Módulo administracao — Auditoria de reservas, estoque e valores.
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export {
  ACOES_DE_AUDITORIA,
  AuditoriaLog,
  type AcaoDeAuditoria,
  type FiltroDeAuditoria,
} from "./domain/auditoria-log";
