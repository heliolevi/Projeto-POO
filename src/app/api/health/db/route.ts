import { verificarBanco } from "@/shared/db/verificar";
import { AppError, NotFoundError, UnauthorizedError } from "@/shared/http/errors";
import { Resposta } from "@/shared/http/resposta";
import { SegredoBearer } from "@/shared/http/segredo";

// Consulta o banco a cada chamada; não pode ser servida do cache.
export const dynamic = "force-dynamic";

// Mostra o nome do banco, a versão do PostGIS e quantas migrations rodaram, e cada chamada
// consulta o banco. Por isso só responde a quem enviar HEALTH_DB_SECRET no header
// "Authorization: Bearer <segredo>". Sem a variável configurada, a rota fica desligada (404).
export async function GET(request: Request) {
  const segredo = new SegredoBearer(process.env.HEALTH_DB_SECRET);
  if (!segredo.ativo) {
    return Resposta.deErro(new NotFoundError());
  }
  if (!segredo.confere(request.headers.get("authorization"))) {
    return Resposta.deErro(new UnauthorizedError());
  }

  try {
    return Resposta.ok(await verificarBanco(), { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    // O detalhe (host, credenciais, mensagem do driver) fica só no log do servidor.
    console.error("Falha ao verificar o banco:", erro);
    return Resposta.deErro(
      new AppError("DATABASE_UNAVAILABLE", "Banco de dados indisponível", 503),
    );
  }
}
