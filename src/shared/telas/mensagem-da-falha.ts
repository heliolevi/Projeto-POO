import { ApiError } from "../http/api-cliente.ts";

// O texto que a tela mostra quando uma chamada à API falha: a mensagem da própria API quando o
// erro veio dela; qualquer outra falha (rede, código) mostra o texto padrão da tela. Só tem
// método estático (não guarda estado), então não se cria instância.
export class MensagemDaFalha {
  private constructor() {
    throw new Error("MensagemDaFalha só tem métodos estáticos.");
  }

  static de(erro: unknown, padrao: string): string {
    return erro instanceof ApiError ? erro.message : padrao;
  }
}
