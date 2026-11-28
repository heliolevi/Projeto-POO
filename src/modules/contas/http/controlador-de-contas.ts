import type { Autenticador } from "../application/autenticador.ts";
import type { CadastroDeCliente } from "../application/cadastro-de-cliente.ts";
import type { ManutencaoDaConta } from "../application/manutencao-da-conta.ts";
import type { PerfilDoCiclista } from "../application/perfil-do-ciclista.ts";
import type { SessaoDaRequisicao } from "../application/sessao-da-requisicao.ts";
import { ClienteDaRequisicao } from "../../../shared/http/cliente-da-requisicao.ts";
import type { LeitorDeCorpo } from "../../../shared/http/leitor-de-corpo.ts";
import { PerfisPermitidos } from "../../../shared/http/perfis-permitidos.ts";
import { Resposta } from "../../../shared/http/resposta.ts";

export type DependenciasDoControlador = {
  sessoes: Pick<SessaoDaRequisicao, "exigir">;
  cadastro: Pick<CadastroDeCliente, "cadastrar">;
  autenticador: Pick<Autenticador, "autenticar">;
  perfil: Pick<PerfilDoCiclista, "consultarConta" | "atualizar">;
  manutencao: Pick<ManutencaoDaConta, "alterarSenha" | "atualizarAltura" | "aceitarTermos" | "desativar">;
  leitor: Pick<LeitorDeCorpo, "lerJson">;
};

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

// A porta HTTP das contas (rotas 1 a 8 do contrato). Cada método só traduz: lê o corpo, descobre quem
// chamou, entrega ao caso de uso e monta a resposta; qualquer erro vira a resposta do contrato (o
// inesperado vira 500 genérico). As rotas que mexem na conta do cliente exigem o perfil CLIENTE (403).
export class ControladorDeContas {
  readonly #deps: DependenciasDoControlador;
  readonly #soCliente = new PerfisPermitidos("CLIENTE");

  constructor(deps: DependenciasDoControlador) {
    this.#deps = deps;
  }

  async cadastro(request: Request): Promise<Response> {
    try {
      const contexto = { ip: new ClienteDaRequisicao(request.headers).ip };
      return Resposta.criada(await this.#deps.cadastro.cadastrar(await this.#deps.leitor.lerJson(request), contexto), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  async login(request: Request): Promise<Response> {
    try {
      const contexto = { ip: new ClienteDaRequisicao(request.headers).ip };
      return Resposta.ok(await this.#deps.autenticador.autenticar(await this.#deps.leitor.lerJson(request), contexto), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  async alterarSenha(request: Request): Promise<Response> {
    try {
      const sessao = await this.#deps.sessoes.exigir(request);
      await this.#deps.manutencao.alterarSenha(sessao.usuarioId, await this.#deps.leitor.lerJson(request));
      return Resposta.semConteudo();
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  async desativar(request: Request): Promise<Response> {
    try {
      const sessao = await this.#deps.sessoes.exigir(request);
      await this.#deps.manutencao.desativar(sessao.usuarioId);
      return Resposta.semConteudo();
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  async atualizarAltura(request: Request): Promise<Response> {
    try {
      const sessao = this.#soCliente.exigir(await this.#deps.sessoes.exigir(request));
      await this.#deps.manutencao.atualizarAltura(sessao.usuarioId, await this.#deps.leitor.lerJson(request));
      return Resposta.semConteudo();
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  async aceitarTermos(request: Request): Promise<Response> {
    try {
      const sessao = this.#soCliente.exigir(await this.#deps.sessoes.exigir(request));
      await this.#deps.manutencao.aceitarTermos(sessao.usuarioId, await this.#deps.leitor.lerJson(request));
      return Resposta.semConteudo();
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** GET /api/conta/me: qualquer perfil logado; `ciclista` só vem para CLIENTE. */
  async me(request: Request): Promise<Response> {
    try {
      const sessao = await this.#deps.sessoes.exigir(request);
      return Resposta.ok(await this.#deps.perfil.consultarConta(sessao.usuarioId), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** PUT /api/conta/perfil-ciclista: só CLIENTE, sempre na própria conta (o id vem do token). */
  async atualizarPerfilCiclista(request: Request): Promise<Response> {
    try {
      const sessao = this.#soCliente.exigir(await this.#deps.sessoes.exigir(request));
      const corpo = await this.#deps.leitor.lerJson(request);
      return Resposta.ok(await this.#deps.perfil.atualizar(sessao.usuarioId, corpo), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }
}
