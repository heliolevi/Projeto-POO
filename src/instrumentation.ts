// O Next chama register() uma vez, quando o servidor sobe. Se faltar variável de ambiente, o app
// não sobe em silêncio e falha no primeiro login: ele para aqui, com a lista do que falta.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // O build do Next não tem as variáveis de produção (elas existem só onde o app roda).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { garantirAmbiente } = await import("./shared/config/ambiente");
  garantirAmbiente();
}
