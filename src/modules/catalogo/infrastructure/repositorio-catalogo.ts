import type { PoolClient } from "pg";
import { comSessao, type SessaoBanco } from "@/shared/db/sessao";
import type { Atividade, Experiencia } from "@/shared/dominio/ciclista";
import type { RepositorioCatalogo } from "../application/catalogo";
import type { BicicletaAdmin, TipoAdmin } from "../domain/catalogo";
import {
  CodigoDeBicicletaJaExiste,
  NomeDeTipoJaExiste,
  PontoInexistente,
  TipoInexistente,
} from "../domain/erros";

// Todas as consultas rodam dentro de comSessao: as políticas de RLS (migrations 0004 e 0005)
// leem o perfil e o usuário declarados ali. SQL sempre com parâmetros ($1, $2...), nunca texto
// do usuário dentro da consulta.

type LinhaTipo = {
  id: string;
  nome: string;
  descricao: string | null;
  atividades: Atividade[];
  altura_min_cm: number;
  altura_max_cm: number;
  nivel_recomendado: Experiencia;
  preco_hora_centavos: number;
  preco_dia_centavos: number;
  valor_caucao_centavos: number;
  ativo: boolean;
};

// atividades é um array de enum; o driver só o converte em array de JS com o cast para text[].
const COLUNAS_TIPO = `id, nome, descricao, atividades::text[] AS atividades, altura_min_cm,
  altura_max_cm, nivel_recomendado, preco_hora_centavos, preco_dia_centavos,
  valor_caucao_centavos, ativo`;

function paraTipo(l: LinhaTipo): TipoAdmin {
  return {
    id: l.id,
    nome: l.nome,
    descricao: l.descricao,
    atividades: l.atividades,
    alturaMinCm: l.altura_min_cm,
    alturaMaxCm: l.altura_max_cm,
    nivelRecomendado: l.nivel_recomendado,
    precoHoraCentavos: l.preco_hora_centavos,
    precoDiaCentavos: l.preco_dia_centavos,
    valorCaucaoCentavos: l.valor_caucao_centavos,
    ativo: l.ativo,
  };
}

type LinhaBicicleta = {
  id: string;
  codigo: string;
  tipo_id: string;
  tipo_nome: string;
  ponto_id: string;
  ponto_nome: string;
  numero_serie: string | null;
  tamanho_quadro: string | null;
  status: BicicletaAdmin["status"];
  observacoes: string | null;
};

const SELECT_BICICLETA = `
  SELECT b.id, b.codigo, b.numero_serie, b.tamanho_quadro, b.status, b.observacoes,
         t.id AS tipo_id, t.nome AS tipo_nome, p.id AS ponto_id, p.nome AS ponto_nome
    FROM bicicleta b
    JOIN tipo_bicicleta t ON t.id = b.tipo_id
    JOIN ponto p ON p.id = b.ponto_id`;

function paraBicicleta(l: LinhaBicicleta): BicicletaAdmin {
  return {
    id: l.id,
    codigo: l.codigo,
    tipo: { id: l.tipo_id, nome: l.tipo_nome },
    ponto: { id: l.ponto_id, nome: l.ponto_nome },
    numeroSerie: l.numero_serie,
    tamanhoQuadro: l.tamanho_quadro,
    status: l.status,
    observacoes: l.observacoes,
  };
}

async function buscarBicicleta(client: PoolClient, id: string): Promise<BicicletaAdmin> {
  const { rows } = await client.query<LinhaBicicleta>(`${SELECT_BICICLETA} WHERE b.id = $1`, [id]);
  return paraBicicleta(rows[0]);
}

function codigoDoErro(erro: unknown): { code?: string; constraint?: string } {
  return erro as { code?: string; constraint?: string };
}

export const repositorioCatalogo: RepositorioCatalogo = {
  listarTipos(sessao: SessaoBanco, { apenasAtivos }) {
    return comSessao(sessao, async (client) => {
      const { rows } = await client.query<LinhaTipo>(
        `SELECT ${COLUNAS_TIPO} FROM tipo_bicicleta
          WHERE ($1::boolean = false OR ativo)
          ORDER BY nome`,
        [apenasAtivos],
      );
      return rows.map(paraTipo);
    });
  },

  criarTipo(sessao, dados) {
    return comSessao(sessao, async (client) => {
      try {
        const { rows } = await client.query<LinhaTipo>(
          `INSERT INTO tipo_bicicleta
             (nome, descricao, atividades, altura_min_cm, altura_max_cm, nivel_recomendado,
              preco_hora_centavos, preco_dia_centavos, valor_caucao_centavos, ativo)
           VALUES ($1, $2, $3::atividade[], $4, $5, $6, $7, $8, $9, COALESCE($10::boolean, true))
           RETURNING ${COLUNAS_TIPO}`,
          [
            dados.nome,
            dados.descricao,
            dados.atividades,
            dados.alturaMinCm,
            dados.alturaMaxCm,
            dados.nivelRecomendado,
            dados.precoHoraCentavos,
            dados.precoDiaCentavos,
            dados.valorCaucaoCentavos,
            dados.ativo,
          ],
        );
        return paraTipo(rows[0]);
      } catch (erro) {
        if (codigoDoErro(erro).code === "23505") throw new NomeDeTipoJaExiste();
        throw erro;
      }
    });
  },

  atualizarTipo(sessao, id, dados) {
    return comSessao(sessao, async (client) => {
      try {
        const { rows } = await client.query<LinhaTipo>(
          `UPDATE tipo_bicicleta
              SET nome = $2, descricao = $3, atividades = $4::atividade[], altura_min_cm = $5,
                  altura_max_cm = $6, nivel_recomendado = $7, preco_hora_centavos = $8,
                  preco_dia_centavos = $9, valor_caucao_centavos = $10,
                  ativo = COALESCE($11::boolean, ativo)
            WHERE id = $1
            RETURNING ${COLUNAS_TIPO}`,
          [
            id,
            dados.nome,
            dados.descricao,
            dados.atividades,
            dados.alturaMinCm,
            dados.alturaMaxCm,
            dados.nivelRecomendado,
            dados.precoHoraCentavos,
            dados.precoDiaCentavos,
            dados.valorCaucaoCentavos,
            dados.ativo,
          ],
        );
        return rows[0] ? paraTipo(rows[0]) : null;
      } catch (erro) {
        if (codigoDoErro(erro).code === "23505") throw new NomeDeTipoJaExiste();
        throw erro;
      }
    });
  },

  listarBicicletas(sessao, filtro) {
    return comSessao(sessao, async (client) => {
      const { rows } = await client.query<LinhaBicicleta>(
        `${SELECT_BICICLETA}
          WHERE ($1::uuid IS NULL OR b.tipo_id = $1)
            AND ($2::status_bicicleta IS NULL OR b.status = $2)
          ORDER BY b.codigo`,
        [filtro.tipoId, filtro.status],
      );
      return rows.map(paraBicicleta);
    });
  },

  criarBicicleta(sessao, dados) {
    return comSessao(sessao, async (client) => {
      // confere antes, para dizer qual dos dois não existe; a FK continua valendo como rede
      const { rows: existe } = await client.query<{ tipo: boolean; ponto: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM tipo_bicicleta WHERE id = $1) AS tipo,
                EXISTS (SELECT 1 FROM ponto WHERE id = $2) AS ponto`,
        [dados.tipoId, dados.pontoId],
      );
      if (!existe[0].tipo) throw new TipoInexistente();
      if (!existe[0].ponto) throw new PontoInexistente();
      try {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO bicicleta (tipo_id, ponto_id, codigo, numero_serie, tamanho_quadro, observacoes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [dados.tipoId, dados.pontoId, dados.codigo, dados.numeroSerie, dados.tamanhoQuadro, dados.observacoes],
        );
        return await buscarBicicleta(client, rows[0].id);
      } catch (erro) {
        const { code, constraint } = codigoDoErro(erro);
        if (code === "23505") throw new CodigoDeBicicletaJaExiste();
        if (code === "23503") {
          throw constraint?.includes("ponto") ? new PontoInexistente() : new TipoInexistente();
        }
        throw erro;
      }
    });
  },

  atualizarBicicleta(sessao, id, dados) {
    return comSessao(sessao, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `UPDATE bicicleta
            SET status = COALESCE($2::status_bicicleta, status),
                observacoes = CASE WHEN $3::boolean THEN $4 ELSE observacoes END
          WHERE id = $1
          RETURNING id`,
        [id, dados.status ?? null, dados.observacoes !== undefined, dados.observacoes ?? null],
      );
      return rows[0] ? await buscarBicicleta(client, rows[0].id) : null;
    });
  },
};
