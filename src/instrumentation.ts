// O Next chama register() uma vez, quando o servidor sobe. Se faltar variável de ambiente, o erro
// com a lista do que falta aparece no log do servidor. O processo NÃO encerra: ele continua de pé e
// TODAS as rotas (inclusive /api/health) respondem 500 até a variável ser corrigida e o servidor
// reiniciado. A resposta ao navegador não traz a mensagem, só o log.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // O build do Next não tem as variáveis de produção (elas existem só onde o app roda).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { garantirAmbiente } = await import("./shared/config/ambiente");
  garantirAmbiente();
}
