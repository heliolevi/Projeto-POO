import { TooManyRequestsError } from "../http/errors.ts";

// Limite de tentativas por janela fixa, guardado na tabela limite_tentativas. Fica no banco
// porque em ambiente serverless a memória de uma instância não é vista pelas outras.
// A consulta é injetada (normalmente o query() do pool) para a lógica poder ser testada.
export type Executar = (
  sql: string,
  valores: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

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

// Conta uma tentativa para a chave e recusa (429) quando passar do limite da janela.
export async function exigirDentroDoLimite(
  executar: Executar,
  chave: string,
  regra: RegraLimite,
): Promise<void> {
  const { rows } = await executar(REGISTRAR, [chave.slice(0, 128), regra.janelaSegundos]);
  const contagem = Number(rows[0].contagem);
  if (contagem > regra.max) {
    throw new TooManyRequestsError(Number(rows[0].restante));
  }
  await limparAntigas(executar);
}

// Zera a contagem de uma chave (por exemplo, depois de um login que deu certo).
export async function limparTentativas(executar: Executar, chave: string): Promise<void> {
  await executar("DELETE FROM limite_tentativas WHERE chave = $1", [chave.slice(0, 128)]);
}

// Em 1% das chamadas, apaga as janelas antigas para a tabela não crescer sem fim. Espera
// terminar (em ambiente serverless, uma consulta solta pode ser cortada quando a resposta
// sai) e, se falhar, só ignora: a limpeza não pode derrubar a requisição.
async function limparAntigas(executar: Executar): Promise<void> {
  if (Math.random() >= 0.01) return;
  try {
    await executar("DELETE FROM limite_tentativas WHERE janela_inicio < now() - interval '1 day'", []);
  } catch {
    // tenta de novo numa próxima chamada
  }
}
