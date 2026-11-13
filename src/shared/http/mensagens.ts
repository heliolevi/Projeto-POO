// Mensagens que o cliente lê quando a API responde com erro. Erros de validação, 401 e 404
// trazem uma frase própria e útil da API, e ela é mantida. Os que são "genéricos" demais para
// uma pessoa (limite, servidor, tamanho, pagamento fora do ar) ganham um texto amigável.

export const MENSAGEM_SEM_CONEXAO = "Sem conexão com a internet. Confira a rede e tente de novo.";

export function mensagemDoErro(status: number, code: string, mensagemDaApi: string): string {
  if (status === 429 || code === "TOO_MANY_REQUESTS") {
    return "Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.";
  }
  if (code === "PAGAMENTO_INDISPONIVEL") {
    return "O pagamento está indisponível agora. Tente de novo em alguns minutos.";
  }
  if (status === 413 || code === "PAYLOAD_TOO_LARGE") {
    return "Os dados enviados são grandes demais. Reduza e tente de novo.";
  }
  if (status >= 500 || code === "INTERNAL_ERROR") {
    return "Algo deu errado do nosso lado. Tente de novo em instantes.";
  }
  return mensagemDaApi;
}
