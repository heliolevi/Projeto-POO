import { query } from "@/shared/db/pool";
import type { DadosCadastro } from "../domain/validacao";
import type { PerfilUsuario, UsuarioComSenha, UsuarioPublico } from "../domain/usuario";

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
