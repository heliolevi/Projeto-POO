import { ValidationError } from "@/shared/http/errors";
import { created, errorResponse, ok } from "@/shared/http/response";
import { autenticar } from "../application/autenticar";
import { cadastrarCliente } from "../application/cadastrar-cliente";

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

async function lerJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("O corpo da requisição precisa ser um JSON válido.");
  }
}

export async function postCadastro(request: Request) {
  try {
    return created(await cadastrarCliente(await lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

export async function postLogin(request: Request) {
  try {
    return ok(await autenticar(await lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}
