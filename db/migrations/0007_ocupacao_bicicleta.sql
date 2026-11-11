-- migrate:up

-- ---------------------------------------------------------------------------
-- Ocupação das bicicletas (busca de disponibilidade e recomendação)
--
-- Para recomendar, o backend precisa saber quais bicicletas estão ocupadas no período buscado.
-- Mas a RLS de reserva (0006) mostra a cada cliente só as próprias reservas: um cliente que
-- consultasse reserva direto veria como livre uma bicicleta ocupada por outra pessoa. Por isso a
-- busca lê esta view, que expõe apenas o necessário (qual bicicleta e qual período), sem cliente,
-- valores nem código da reserva.
--
-- Roda com os direitos de quem criou a view (como bicicleta_livre e empresa_publica), e por isso
-- enxerga todas as reservas; security_barrier impede que condições de quem consulta rodem antes
-- do filtro.
--
-- Uma reserva segura a bicicleta quando está CONFIRMADA ou EM_ANDAMENTO, ou PENDENTE_PAGAMENTO há
-- menos de 15 minutos (o prazo do Pix, docs/contrato-api-mvp.md). A pendente vencida só vira
-- EXPIRADA quando alguém atualiza o status; até lá a exclusion constraint ainda a considera, mas
-- para a busca ela já libera a bicicleta, e a criação de uma reserva nova expira as vencidas antes
-- de reservar. Se o prazo mudar, mude aqui e na expiração da reserva.
-- ---------------------------------------------------------------------------
CREATE VIEW bicicleta_ocupada WITH (security_barrier = true) AS
  SELECT bicicleta_id, periodo
  FROM reserva
  WHERE status IN ('CONFIRMADA', 'EM_ANDAMENTO')
     OR (status = 'PENDENTE_PAGAMENTO' AND criado_em > now() - interval '15 minutes');

COMMENT ON VIEW bicicleta_ocupada IS 'Bicicleta e período das reservas que seguram a bicicleta (confirmadas, em andamento e pendentes ainda dentro dos 15 minutos). Sem dados do cliente. A busca de disponibilidade lê esta view, nunca a tabela reserva.';

GRANT SELECT ON bicicleta_ocupada TO app_backend;

-- migrate:down

DROP VIEW IF EXISTS bicicleta_ocupada;
