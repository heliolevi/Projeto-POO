import { BancoDeDados } from "@/shared/db/banco-de-dados";
import { LimiteDeTentativas } from "@/shared/db/limite-tentativas";
import { ClienteDaRequisicao } from "@/shared/http/cliente-da-requisicao";
import { LeitorDeCorpo } from "@/shared/http/leitor-de-corpo";
import { PerfisPermitidos } from "@/shared/http/perfis-permitidos";
import { Resposta } from "@/shared/http/resposta";
import { aceitarTermos } from "../application/aceitar-termos";
import { criarAlterarSenha } from "../application/alterar-senha";
import { atualizarAltura } from "../application/atualizar-altura";
import { autenticar } from "../application/autenticar";
import { cadastrarCliente } from "../application/cadastrar-cliente";
import { desativarConta } from "../application/desativar-conta";
import { criarPerfilCiclista } from "../application/perfil-ciclista";
import {
  atualizarSenha,
  buscarConta,
  buscarSenhaHashPorId,
  gravarPerfilCiclista,
} from "../infrastructure/repositorio-usuarios";
import { gerarHashSenha, verificarSenha } from "../infrastructure/senha";
import { exigirSessao } from "./sessao";

const leitor = new LeitorDeCorpo();
const soCliente = new PerfisPermitidos("CLIENTE");

const alterarSenha = criarAlterarSenha({
  limite: new LimiteDeTentativas(BancoDeDados.padrao),
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
    const contexto = { ip: new ClienteDaRequisicao(request.headers).ip };
    return Resposta.criada(await cadastrarCliente(await leitor.lerJson(request), contexto), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

export async function postLogin(request: Request) {
  try {
    const contexto = { ip: new ClienteDaRequisicao(request.headers).ip };
    return Resposta.ok(await autenticar(await leitor.lerJson(request), contexto), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

export async function postAlterarSenha(request: Request) {
  try {
    const sessao = await exigirSessao(request);
    await alterarSenha(sessao.usuarioId, await leitor.lerJson(request));
    return Resposta.semConteudo();
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

export async function postDesativar(request: Request) {
  try {
    const sessao = await exigirSessao(request);
    await desativarConta(sessao.usuarioId);
    return Resposta.semConteudo();
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

export async function postAtualizarAltura(request: Request) {
  try {
    const sessao = soCliente.exigir(await exigirSessao(request));
    await atualizarAltura(sessao.usuarioId, await leitor.lerJson(request));
    return Resposta.semConteudo();
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

export async function postAceitarTermos(request: Request) {
  try {
    const sessao = soCliente.exigir(await exigirSessao(request));
    await aceitarTermos(sessao.usuarioId, await leitor.lerJson(request));
    return Resposta.semConteudo();
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

// GET /api/conta/me: qualquer perfil logado; `ciclista` só vem para CLIENTE.
export async function getMe(request: Request) {
  try {
    const sessao = await exigirSessao(request);
    return Resposta.ok(await perfilCiclista.consultarConta(sessao.usuarioId), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

// PUT /api/conta/perfil-ciclista: só CLIENTE, sempre na própria conta (o id vem do token).
export async function putPerfilCiclista(request: Request) {
  try {
    const sessao = soCliente.exigir(await exigirSessao(request));
    const corpo = await leitor.lerJson(request);
    return Resposta.ok(await perfilCiclista.atualizarPerfilCiclista(sessao.usuarioId, corpo), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}
