import { query } from "@/shared/db/pool";
import { ipDoCliente, lerTextoLimitado } from "@/shared/http/corpo";
import { ValidationError } from "@/shared/http/errors";
import { created, errorResponse, noContent, ok } from "@/shared/http/response";
import { aceitarTermos } from "../application/aceitar-termos";
import { criarAlterarSenha } from "../application/alterar-senha";
import { atualizarAltura } from "../application/atualizar-altura";
import { autenticar } from "../application/autenticar";
import { cadastrarCliente } from "../application/cadastrar-cliente";
import { desativarConta } from "../application/desativar-conta";
import { criarExigirSessao } from "../application/exigir-sessao";
import {
  atualizarSenha,
  buscarSenhaHashPorId,
  buscarSituacaoPorId,
} from "../infrastructure/repositorio-usuarios";
import { gerarHashSenha, verificarSenha } from "../infrastructure/senha";

const exigirSessao = criarExigirSessao(buscarSituacaoPorId);

const alterarSenha = criarAlterarSenha({
  executar: query,
  buscarSenhaHash: buscarSenhaHashPorId,
  salvarSenhaHash: atualizarSenha,
  verificarSenha,
  gerarHashSenha,
});

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

export async function postAlterarSenha(request: Request) {
  try {
    const sessao = await exigirSessao(request);
    await alterarSenha(sessao.usuarioId, await lerJson(request));
    return noContent();
  } catch (erro) {
    return errorResponse(erro);
  }
}

export async function postDesativar(request: Request) {
  try {
    const sessao = await exigirSessao(request);
    await desativarConta(sessao.usuarioId);
    return noContent();
  } catch (erro) {
    return errorResponse(erro);
  }
}

export async function postAtualizarAltura(request: Request) {
  try {
    const sessao = await exigirSessao(request);
    await atualizarAltura(sessao.usuarioId, await lerJson(request));
    return noContent();
  } catch (erro) {
    return errorResponse(erro);
  }
}

export async function postAceitarTermos(request: Request) {
  try {
    const sessao = await exigirSessao(request);
    await aceitarTermos(sessao.usuarioId, await lerJson(request));
    return noContent();
  } catch (erro) {
    return errorResponse(erro);
  }
}
