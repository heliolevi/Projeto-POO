/**
 * Módulo notificacoes — Avisos ao cliente por web push, WhatsApp e e-mail.
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export {
  CANAIS_DE_NOTIFICACAO,
  Notificacao,
  NotificacaoInvalida,
  TIPOS_DE_NOTIFICACAO,
  type CanalDeNotificacao,
  type EnviadorDeNotificacao,
  type StatusDeNotificacao,
  type TipoDeNotificacao,
} from "./domain/notificacao";
export { RoteadorDeEnvio } from "./application/roteador-de-envio";
