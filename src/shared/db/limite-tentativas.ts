import { TooManyRequestsError } from "../http/errors.ts";
import type { ExecutorDeConsultas } from "./executor-de-consultas.ts";

export type RegraLimite = {
  // quantas tentativas cabem na janela
  max: number;
  janelaSegundos: number;
};

const REGISTRAR = `
  INSERT INTO limite_tentativas AS l (chave, janela_inicio, contagem)
  VALUES ($1, now(), 1)
  ON CONFLICT (chave) DO UPDATE SET
    janela_inicio = CASE
      WHEN l.janela_inicio <= now() - ($2::int * interval '1 second') THEN now()
      ELSE l.janela_inicio END,
    contagem = CASE
      WHEN l.janela_inicio <= now() - ($2::int * interval '1 second') THEN 1
      ELSE l.contagem + 1 END
  RETURNING
    contagem,
    GREATEST(1, ceil(extract(epoch FROM
      (l.janela_inicio + ($2::int * interval '1 second') - now()))))::int AS restante
`;

// Limite de tentativas por janela fixa, guardado na tabela limite_tentativas. Fica no banco
// porque em ambiente serverless a memória de uma instância não é vista pelas outras. O banco entra
// pelo construtor (normalmente o BancoDeDados.padrao) para a lógica poder ser testada.
export class LimiteDeTentativas {
  readonly #banco: ExecutorDeConsultas;

  constructor(banco: ExecutorDeConsultas) {
    this.#banco = banco;
  }

  // Conta uma tentativa para a chave e recusa (429) quando passar do limite da janela.
  async exigirDentroDoLimite(chave: string, regra: RegraLimite): Promise<void> {
    const { rows } = await this.#banco.consultar(REGISTRAR, [chave.slice(0, 128), regra.janelaSegundos]);
    const contagem = Number(rows[0].contagem);
    if (contagem > regra.max) {
      throw new TooManyRequestsError(Number(rows[0].restante));
    }
    await this.#limparAntigas();
  }

  // Zera a contagem de uma chave (por exemplo, depois de um login que deu certo).
  async limpar(chave: string): Promise<void> {
    await this.#banco.consultar("DELETE FROM limite_tentativas WHERE chave = $1", [chave.slice(0, 128)]);
  }

  // Em 1% das chamadas, apaga as janelas antigas para a tabela não crescer sem fim. Espera
  // terminar (em ambiente serverless, uma consulta solta pode ser cortada quando a resposta
  // sai) e, se falhar, só ignora: a limpeza não pode derrubar a requisição.
  async #limparAntigas(): Promise<void> {
    if (Math.random() >= 0.01) return;
    try {
      await this.#banco.consultar("DELETE FROM limite_tentativas WHERE janela_inicio < now() - interval '1 day'", []);
    } catch {
      // tenta de novo numa próxima chamada
    }
  }
}
