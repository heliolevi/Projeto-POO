import type {
  CanalDeNotificacao,
  EnviadorDeNotificacao,
  MensagemParaEnvio,
} from "../domain/notificacao.ts";

// Um EnviadorDeNotificacao que escolhe o enviador certo pelo canal da mensagem. Assim a Notificacao
// recebe um só enviador e não precisa saber quantos canais existem; um canal novo é só mais uma
// entrada no mapa.
export class RoteadorDeEnvio implements EnviadorDeNotificacao {
  readonly #porCanal: Map<CanalDeNotificacao, EnviadorDeNotificacao>;

  constructor(enviadores: Partial<Record<CanalDeNotificacao, EnviadorDeNotificacao>>) {
    this.#porCanal = new Map(
      Object.entries(enviadores).filter(
        (par): par is [CanalDeNotificacao, EnviadorDeNotificacao] => par[1] !== undefined,
      ),
    );
  }

  canaisDisponiveis(): CanalDeNotificacao[] {
    return [...this.#porCanal.keys()];
  }

  async enviar(mensagem: MensagemParaEnvio): Promise<void> {
    const enviador = this.#porCanal.get(mensagem.canal);
    if (!enviador) throw new Error(`Não há enviador configurado para o canal ${mensagem.canal}.`);
    await enviador.enviar(mensagem);
  }
}
