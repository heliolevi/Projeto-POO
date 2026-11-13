import { UnauthorizedError } from "../../../shared/http/errors.ts";
import type { PerfilUsuario, UsuarioPublico } from "./usuario.ts";

// O que cada perfil pode fazer. Cada subclasse de Usuario devolve a sua lista em permissoes():
// é o ponto de polimorfismo que substitui os `if (perfil === ...)` espalhados pelo código.
export const PERMISSOES = [
  "reserva:criar",
  "reserva:ver-proprias",
  "reserva:cancelar-propria",
  "recomendacao:buscar",
  "conta:gerir-propria",
  "reserva:ver-todas",
  "operacao:registrar-retirada",
  "operacao:registrar-devolucao",
  "ocorrencia:abrir",
  "ocorrencia:resolver",
  "catalogo:gerir",
  "empresa:editar",
  "auditoria:consultar",
] as const;
export type Permissao = (typeof PERMISSOES)[number];

// Quem sabe conferir e gerar hash de senha (scrypt, em contas/infrastructure). O domínio só conhece
// este contrato: assim ele não depende de criptografia e os testes usam um serviço de mentira.
export type ServicoDeSenha = {
  verificar(senha: string, hash: string): Promise<boolean>;
  gerarHash(senha: string): Promise<string>;
};

export type DadosUsuario = {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  ativo: boolean;
};

// Erro de regra do domínio: a senha atual informada na troca de senha não confere.
export class SenhaAtualIncorreta extends UnauthorizedError {
  constructor() {
    super("Senha atual incorreta.");
  }
}

// Classe abstrata: não existe "um usuário qualquer", só cliente, operador ou administrador.
// Guarda o que é comum (identidade, senha e situação da conta) e deixa para as subclasses o que
// muda de perfil para perfil (perfil e permissoes).
//
// Encapsulamento: todos os campos são privados. A senha só muda por alterarSenha() e a conta só
// é desativada por desativar(); nenhum código de fora altera esses dados direto.
export abstract class Usuario {
  readonly #id: string;
  readonly #nome: string;
  readonly #email: string;
  #senhaHash: string;
  #ativo: boolean;

  protected constructor(dados: DadosUsuario) {
    if (!dados.id) throw new RangeError("O usuário precisa de um id.");
    if (dados.nome.trim().length === 0) throw new RangeError("O usuário precisa de um nome.");
    if (!dados.email.includes("@")) throw new RangeError("O e-mail do usuário é inválido.");
    this.#id = dados.id;
    this.#nome = dados.nome;
    this.#email = dados.email;
    this.#senhaHash = dados.senhaHash;
    this.#ativo = dados.ativo;
  }

  abstract get perfil(): PerfilUsuario;
  abstract permissoes(): readonly Permissao[];

  get id(): string {
    return this.#id;
  }
  get nome(): string {
    return this.#nome;
  }
  get email(): string {
    return this.#email;
  }
  get ativo(): boolean {
    return this.#ativo;
  }

  temPermissao(permissao: Permissao): boolean {
    return this.permissoes().includes(permissao);
  }

  // A senha é sempre conferida, mesmo com a conta inativa, para o tempo de resposta não revelar
  // se a conta existe ou está desativada. Conta inativa nunca autentica.
  async autenticar(senha: string, servico: ServicoDeSenha): Promise<boolean> {
    const confere = await servico.verificar(senha, this.#senhaHash);
    return confere && this.#ativo;
  }

  // Confere a senha atual e troca pela nova. Devolve o novo hash para quem persiste gravar.
  async alterarSenha(atual: string, nova: string, servico: ServicoDeSenha): Promise<string> {
    if (!(await servico.verificar(atual, this.#senhaHash))) throw new SenhaAtualIncorreta();
    this.#senhaHash = await servico.gerarHash(nova);
    return this.#senhaHash;
  }

  // Idempotente: desativar uma conta já inativa não muda nada.
  desativar(): void {
    this.#ativo = false;
  }

  // O hash só sai por aqui, para o repositório gravar; nenhuma resposta da API o usa.
  hashParaPersistir(): string {
    return this.#senhaHash;
  }

  paraPublico(): UsuarioPublico {
    return { id: this.#id, perfil: this.perfil, nome: this.#nome, email: this.#email };
  }
}
