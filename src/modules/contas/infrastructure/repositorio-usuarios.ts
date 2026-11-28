import { BancoDeDados } from "../../../shared/db/banco-de-dados.ts";
import type { ArmazemDeUsuarios, SituacaoDoUsuario } from "../application/portas.ts";
import type {
  ContaLogada,
  PerfilCiclistaConta,
  PerfilUsuario,
  UsuarioComSenha,
  UsuarioPublico,
} from "../domain/usuario.ts";
import type { DadosCadastro, DadosPerfilCiclista } from "../domain/validador-de-conta.ts";

type Linha = {
  id: string;
  perfil: PerfilUsuario;
  nome: string;
  email: string;
  senha_hash: string;
  ativo: boolean;
};

type LinhaConta = {
  id: string;
  perfil: PerfilUsuario;
  nome: string;
  email: string;
  altura_cm: number | null;
  experiencia: PerfilCiclistaConta["experiencia"];
  atividade_preferida: PerfilCiclistaConta["atividade"];
};

const COLUNAS_CONTA = "id, perfil, nome, email, altura_cm, experiencia, atividade_preferida";

export class EmailOuCpfJaCadastrado extends Error {}

function paraConta(l: LinhaConta): ContaLogada {
  const conta: ContaLogada = { id: l.id, perfil: l.perfil, nome: l.nome, email: l.email };
  // os dados de ciclista só existem para cliente (a constraint usuario_dados_cliente os
  // proíbe nos outros perfis)
  if (l.perfil === "CLIENTE") {
    conta.ciclista = {
      alturaCm: l.altura_cm,
      experiencia: l.experiencia,
      atividade: l.atividade_preferida,
    };
  }
  return conta;
}

// As contas no PostgreSQL. O banco entra pelo construtor (o do app, ou um de mentira nos testes). SQL
// sempre com parâmetros ($1, $2...), nunca texto do usuário dentro da consulta.
export class RepositorioDeUsuarios implements ArmazemDeUsuarios {
  /** O do app. */
  static readonly padrao = new RepositorioDeUsuarios(BancoDeDados.padrao);

  readonly #banco: Pick<BancoDeDados, "consultar">;

  constructor(banco: Pick<BancoDeDados, "consultar">) {
    this.#banco = banco;
  }

  async criarCliente(dados: DadosCadastro, senhaHash: string, versaoTermos: string): Promise<UsuarioPublico> {
    try {
      const { rows } = await this.#banco.consultar<Linha>(
        `INSERT INTO usuario
           (perfil, nome, email, senha_hash, telefone, cpf, data_nascimento,
            altura_cm, aceite_termos_em, versao_termos)
         VALUES ('CLIENTE', $1, $2, $3, $4, $5, $6, $7, now(), $8)
         RETURNING id, perfil, nome, email`,
        [dados.nome, dados.email, senhaHash, dados.telefone, dados.cpf, dados.dataNascimento, dados.alturaCm, versaoTermos],
      );
      const { id, perfil, nome, email } = rows[0];
      return { id, perfil, nome, email };
    } catch (erro) {
      if ((erro as { code?: string }).code === "23505") throw new EmailOuCpfJaCadastrado();
      throw erro;
    }
  }

  async buscarSituacaoPorId(id: string): Promise<SituacaoDoUsuario | null> {
    const { rows } = await this.#banco.consultar<SituacaoDoUsuario>(`SELECT perfil, ativo FROM usuario WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async buscarSenhaHashPorId(id: string): Promise<string | null> {
    const { rows } = await this.#banco.consultar<{ senha_hash: string }>(`SELECT senha_hash FROM usuario WHERE id = $1`, [id]);
    return rows[0]?.senha_hash ?? null;
  }

  async atualizarSenha(id: string, senhaHash: string): Promise<void> {
    await this.#banco.consultar(`UPDATE usuario SET senha_hash = $2 WHERE id = $1`, [id, senhaHash]);
  }

  async desativar(id: string): Promise<void> {
    await this.#banco.consultar(`UPDATE usuario SET ativo = false WHERE id = $1`, [id]);
  }

  async atualizarAltura(id: string, alturaCm: number): Promise<void> {
    await this.#banco.consultar(`UPDATE usuario SET altura_cm = $2 WHERE id = $1 AND perfil = 'CLIENTE'`, [id, alturaCm]);
  }

  async registrarAceiteDeTermos(id: string, versao: string): Promise<void> {
    await this.#banco.consultar(
      `UPDATE usuario SET aceite_termos_em = now(), versao_termos = $2
       WHERE id = $1 AND perfil = 'CLIENTE'`,
      [id, versao],
    );
  }

  async buscarPorEmail(email: string): Promise<UsuarioComSenha | null> {
    const { rows } = await this.#banco.consultar<Linha>(
      `SELECT id, perfil, nome, email, senha_hash, ativo FROM usuario WHERE email = $1`,
      [email],
    );
    if (rows.length === 0) return null;
    const l = rows[0];
    return { id: l.id, perfil: l.perfil, nome: l.nome, email: l.email, senhaHash: l.senha_hash, ativo: l.ativo };
  }

  async buscarConta(id: string): Promise<ContaLogada | null> {
    const { rows } = await this.#banco.consultar<LinhaConta>(`SELECT ${COLUNAS_CONTA} FROM usuario WHERE id = $1`, [id]);
    return rows[0] ? paraConta(rows[0]) : null;
  }

  // Grava os três dados do ciclista de uma vez. O filtro por perfil é uma segunda barreira: a rota
  // já exige CLIENTE, e a constraint do banco recusaria os dados em outro perfil. Devolve null se
  // a conta não for de um cliente.
  async gravarPerfilCiclista(id: string, dados: DadosPerfilCiclista): Promise<PerfilCiclistaConta | null> {
    const { rows } = await this.#banco.consultar<LinhaConta>(
      `UPDATE usuario
          SET altura_cm = $2, experiencia = $3, atividade_preferida = $4
        WHERE id = $1 AND perfil = 'CLIENTE'
        RETURNING ${COLUNAS_CONTA}`,
      [id, dados.alturaCm, dados.experiencia, dados.atividade],
    );
    return rows[0] ? (paraConta(rows[0]).ciclista ?? null) : null;
  }
}
