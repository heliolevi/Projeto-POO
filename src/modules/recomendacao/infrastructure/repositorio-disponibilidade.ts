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
  ativo: boolean;
  unidades_livres: number;
};

// Tipos ativos com a contagem de unidades livres no período. Uma unidade está livre quando:
// - está DISPONIVEL e é de um tipo ativo, em um ponto ativo (view bicicleta_livre, mais o ponto);
// - e NÃO EXISTE reserva ativa cujo período se sobreponha ao buscado.
//
// O NOT EXISTS lê a view bicicleta_ocupada (migration 0007), e não a tabela reserva: a RLS de
// reserva só mostra a cada cliente as próprias reservas, e a consulta daria "livre" para uma
// bicicleta ocupada por outra pessoa. A view já descarta a pendente de pagamento vencida (mais de
// 15 minutos), que a exclusion constraint só libera quando alguém muda o status dela.
//
// O período é [início, fim): uma reserva que termina no minuto em que a busca começa não conflita.
// Datas vão como parâmetros (ISO), nunca dentro do texto SQL.
const BUSCAR_TIPOS = `
  SELECT * FROM (
    SELECT t.id, t.nome, t.descricao, t.atividades::text[] AS atividades, t.altura_min_cm,
           t.altura_max_cm, t.nivel_recomendado, t.preco_hora_centavos, t.preco_dia_centavos,
           t.valor_caucao_centavos, t.ativo,
           (
             SELECT count(*)::int
               FROM bicicleta_livre b
              WHERE b.tipo_id = t.id
                AND EXISTS (SELECT 1 FROM ponto p WHERE p.id = b.ponto_id AND p.ativo)
                AND NOT EXISTS (
                  SELECT 1
                    FROM bicicleta_ocupada o
                   WHERE o.bicicleta_id = b.id
                     AND o.periodo && tstzrange($1::timestamptz, $2::timestamptz, '[)')
                )
           ) AS unidades_livres
      FROM tipo_bicicleta t
     WHERE t.ativo
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
      ativo: l.ativo,
      unidadesLivres: l.unidades_livres,
    }));
  });
}
