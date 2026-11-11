import { query } from "@/shared/db/pool";
import { ipDoCliente } from "@/shared/http/corpo";
import { lerJson } from "@/shared/http/json";
import { created, errorResponse, noContent, ok } from "@/shared/http/response";
import { aceitarTermos } from "../application/aceitar-termos";
import { criarAlterarSenha } from "../application/alterar-senha";
import { atualizarAltura } from "../application/atualizar-altura";
import { autenticar } from "../application/autenticar";
import { cadastrarCliente } from "../application/cadastrar-cliente";
import { desativarConta } from "../application/desativar-conta";
import { exigirPerfil } from "../application/exigir-sessao";
import { criarPerfilCiclista } from "../application/perfil-ciclista";
import {
  atualizarSenha,
  buscarConta,
  buscarSenhaHashPorId,
  gravarPerfilCiclista,
} from "../infrastructure/repositorio-usuarios";
import { gerarHashSenha, verificarSenha } from "../infrastructure/senha";
import { exigirSessao } from "./sessao";

const alterarSenha = criarAlterarSenha({
  executar: query,
  buscarSenhaHash: buscarSenhaHashPorId,
  salvarSenhaHash: atualizarSenha,
  verificarSenha,
  gerarHashSenha,
});

// Exportado para outros módulos (a recomendação lê o perfil do ciclista) pelo index.ts.
export const perfilCiclista = criarPerfilCiclista({ buscarConta, gravarPerfilCiclista });

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

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
    const sessao = exigirPerfil(await exigirSessao(request), "CLIENTE");
    await atualizarAltura(sessao.usuarioId, await lerJson(request));
    return noContent();
  } catch (erro) {
    return errorResponse(erro);
  }
}

export async function postAceitarTermos(request: Request) {
  try {
    const sessao = exigirPerfil(await exigirSessao(request), "CLIENTE");
    await aceitarTermos(sessao.usuarioId, await lerJson(request));
    return noContent();
  } catch (erro) {
    return errorResponse(erro);
  }
}

// GET /api/conta/me: qualquer perfil logado; `ciclista` só vem para CLIENTE.
export async function getMe(request: Request) {
  try {
    const sessao = await exigirSessao(request);
    return ok(await perfilCiclista.consultarConta(sessao.usuarioId), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// PUT /api/conta/perfil-ciclista: só CLIENTE, sempre na própria conta (o id vem do token).
export async function putPerfilCiclista(request: Request) {
  try {
    const sessao = exigirPerfil(await exigirSessao(request), "CLIENTE");
    const corpo = await lerJson(request);
    return ok(await perfilCiclista.atualizarPerfilCiclista(sessao.usuarioId, corpo), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}
