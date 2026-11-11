import { query } from "@/shared/db/pool";
import type { DadosCadastro, DadosPerfilCiclista } from "../domain/validacao";
import type {
  ContaLogada,
  PerfilCiclistaConta,
  PerfilUsuario,
  UsuarioComSenha,
  UsuarioPublico,
} from "../domain/usuario";

type Linha = {
  id: string;
  perfil: PerfilUsuario;
  nome: string;
  email: string;
  senha_hash: string;
  ativo: boolean;
};

export class EmailOuCpfJaCadastrado extends Error {}

export async function criarCliente(
  dados: DadosCadastro,
  senhaHash: string,
  versaoTermos: string,
): Promise<UsuarioPublico> {
  try {
    const { rows } = await query<Linha>(
      `INSERT INTO usuario
         (perfil, nome, email, senha_hash, telefone, cpf, data_nascimento,
          altura_cm, aceite_termos_em, versao_termos)
       VALUES ('CLIENTE', $1, $2, $3, $4, $5, $6, $7, now(), $8)
       RETURNING id, perfil, nome, email`,
      [
        dados.nome,
        dados.email,
        senhaHash,
        dados.telefone,
        dados.cpf,
        dados.dataNascimento,
        dados.alturaCm,
        versaoTermos,
      ],
    );
    const { id, perfil, nome, email } = rows[0];
    return { id, perfil, nome, email };
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") throw new EmailOuCpfJaCadastrado();
    throw erro;
  }
}

export async function buscarSituacaoPorId(
  id: string,
): Promise<{ perfil: PerfilUsuario; ativo: boolean } | null> {
  const { rows } = await query<{ perfil: PerfilUsuario; ativo: boolean }>(
    `SELECT perfil, ativo FROM usuario WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function buscarSenhaHashPorId(id: string): Promise<string | null> {
  const { rows } = await query<{ senha_hash: string }>(
    `SELECT senha_hash FROM usuario WHERE id = $1`,
    [id],
  );
  return rows[0]?.senha_hash ?? null;
}

export async function atualizarSenha(id: string, senhaHash: string): Promise<void> {
  await query(`UPDATE usuario SET senha_hash = $2 WHERE id = $1`, [id, senhaHash]);
}

export async function desativarUsuario(id: string): Promise<void> {
  await query(`UPDATE usuario SET ativo = false WHERE id = $1`, [id]);
}

export async function atualizarAltura(id: string, alturaCm: number): Promise<void> {
  await query(`UPDATE usuario SET altura_cm = $2 WHERE id = $1 AND perfil = 'CLIENTE'`, [
    id,
    alturaCm,
  ]);
}

export async function registrarAceiteTermos(id: string, versao: string): Promise<void> {
  await query(
    `UPDATE usuario SET aceite_termos_em = now(), versao_termos = $2
     WHERE id = $1 AND perfil = 'CLIENTE'`,
    [id, versao],
  );
}

export async function buscarPorEmail(email: string): Promise<UsuarioComSenha | null> {
  const { rows } = await query<Linha>(
    `SELECT id, perfil, nome, email, senha_hash, ativo FROM usuario WHERE email = $1`,
    [email],
  );
  if (rows.length === 0) return null;
  const l = rows[0];
  return {
    id: l.id,
    perfil: l.perfil,
    nome: l.nome,
    email: l.email,
    senhaHash: l.senha_hash,
    ativo: l.ativo,
  };
}

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

export async function buscarConta(id: string): Promise<ContaLogada | null> {
  const { rows } = await query<LinhaConta>(`SELECT ${COLUNAS_CONTA} FROM usuario WHERE id = $1`, [id]);
  return rows[0] ? paraConta(rows[0]) : null;
}

// Grava os três dados do ciclista de uma vez. O filtro por perfil é uma segunda barreira: a rota
// já exige CLIENTE, e a constraint do banco recusaria os dados em outro perfil. Devolve null se
// a conta não for de um cliente.
export async function gravarPerfilCiclista(
  id: string,
  dados: DadosPerfilCiclista,
): Promise<PerfilCiclistaConta | null> {
  const { rows } = await query<LinhaConta>(
    `UPDATE usuario
        SET altura_cm = $2, experiencia = $3, atividade_preferida = $4
      WHERE id = $1 AND perfil = 'CLIENTE'
      RETURNING ${COLUNAS_CONTA}`,
    [id, dados.alturaCm, dados.experiencia, dados.atividade],
  );
  return rows[0] ? (paraConta(rows[0]).ciclista ?? null) : null;
}
