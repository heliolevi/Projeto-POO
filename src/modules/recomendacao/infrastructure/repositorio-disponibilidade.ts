import { comSessao, type SessaoBanco } from "@/shared/db/sessao";
import type { Atividade, Experiencia } from "@/shared/dominio/ciclista";
import type { TipoCandidato } from "../domain/recomendacao";

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
  unidades_livres: number;
};

// Disponibilidade vem de duas funções do banco (migrations 0008 e 0009), ambas SECURITY DEFINER:
// a RLS de reserva só mostra a cada cliente as próprias reservas, e uma consulta direta daria
// "livre" para uma bicicleta ocupada por outra pessoa.
//
// 1. expirar_reservas_vencidas() marca como EXPIRADA a pendente de pagamento criada há 15 minutos
//    ou mais. Sem isso, a pendente vencida ainda seguraria a bicicleta: a exclusion constraint só
//    a libera quando o status muda (CT-REC-20).
// 2. unidades_livres_por_tipo(inicio, fim, ponto) devolve só contagens por tipo: unidade DISPONIVEL
//    de tipo ativo, sem reserva pendente, confirmada ou em andamento que se sobreponha ao período
//    [início, fim). A função é chamada por PONTO ATIVO: bicicleta de ponto inativo não é
//    oferecida, e a função, sem o ponto, contaria a frota toda.
//
// Datas vão como parâmetros (ISO), nunca dentro do texto SQL.
const EXPIRAR_VENCIDAS = `SELECT expirar_reservas_vencidas()`;

const BUSCAR_TIPOS = `
  SELECT * FROM (
    SELECT t.id, t.nome, t.descricao, t.atividades::text[] AS atividades, t.altura_min_cm,
           t.altura_max_cm, t.nivel_recomendado, t.preco_hora_centavos, t.preco_dia_centavos,
           t.valor_caucao_centavos,
           sum(u.unidades_livres)::int AS unidades_livres
      FROM tipo_bicicleta t
      JOIN ponto p ON p.ativo
     CROSS JOIN LATERAL unidades_livres_por_tipo($1::timestamptz, $2::timestamptz, p.id) u
     WHERE t.ativo
       AND u.tipo_id = t.id
     GROUP BY t.id
  ) x
  WHERE x.unidades_livres > 0
  ORDER BY x.nome
`;

export async function buscarTiposComUnidadesLivres(
  sessao: SessaoBanco,
  inicio: Date,
  fim: Date,
): Promise<TipoCandidato[]> {
  return comSessao(sessao, async (client) => {
    await client.query(EXPIRAR_VENCIDAS);
    const { rows } = await client.query<LinhaTipo>(BUSCAR_TIPOS, [
      inicio.toISOString(),
      fim.toISOString(),
    ]);
    return rows.map((l) => ({
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
      unidadesLivres: l.unidades_livres,
    }));
  });
}
