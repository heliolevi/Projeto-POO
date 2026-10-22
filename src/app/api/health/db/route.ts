import { verificarBanco } from "@/shared/db/verificar";
import { AppError } from "@/shared/http/errors";
import { errorResponse, ok } from "@/shared/http/response";

// Consulta o banco a cada chamada; não pode ser servida do cache.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await verificarBanco());
  } catch (erro) {
    // O detalhe (host, credenciais, mensagem do driver) fica só no log do servidor.
    console.error("Falha ao verificar o banco:", erro);
    return errorResponse(
      new AppError("DATABASE_UNAVAILABLE", "Banco de dados indisponível", 503),
    );
  }
}
