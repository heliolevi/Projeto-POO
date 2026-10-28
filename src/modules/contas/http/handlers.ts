import { ipDoCliente, lerTextoLimitado } from "@/shared/http/corpo";
import { ValidationError } from "@/shared/http/errors";
import { created, errorResponse, ok } from "@/shared/http/response";
import { autenticar } from "../application/autenticar";
import { cadastrarCliente } from "../application/cadastrar-cliente";

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

// Cadastro e login recebem poucos campos de texto; passar disso é abuso.
const LIMITE_CORPO_BYTES = 16 * 1024;

async function lerJson(request: Request): Promise<unknown> {
  const texto = await lerTextoLimitado(request, LIMITE_CORPO_BYTES);
  try {
    return JSON.parse(texto);
  } catch {
    throw new ValidationError("O corpo da requisição precisa ser um JSON válido.");
  }
}

export async function postCadastro(request: Request) {
  try {
    const contexto = { ip: ipDoCliente(request.headers) };
    return created(await cadastrarCliente(await lerJson(request), contexto), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

export async function postLogin(request: Request) {
  try {
    const contexto = { ip: ipDoCliente(request.headers) };
    return ok(await autenticar(await lerJson(request), contexto), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}
