-- =============================================================================
-- Sisteminha (RP System.IO) — conserta o relógio de "Aguardando Retirada"
-- =============================================================================
--
-- Achado na revisão completa de 18/08: `vw_os_aguardando_retirada`
-- (migration 20260809150000) conta os dias parados a partir de
-- `COALESCE(s.data_finalizacao, s.updated_at, s.created_at)`. O problema é
-- que `data_finalizacao` só é preenchida quando a OS chega em "entregue"
-- (gatilho da migration 20260805150000) — e esta view só mostra OS com
-- status = 'finalizado' (ainda NÃO entregue). Ou seja: pra TODA linha que
-- esta view devolve, `data_finalizacao` é sempre NULL, e o COALESCE cai
-- sempre em `updated_at` — que muda a qualquer edição na OS (corrigir um
-- texto, mexer numa observação, qualquer coisa). Resultado: o relógio de
-- "há quantos dias esse aparelho está pronto esperando o cliente buscar"
-- reinicia sozinho a cada edição cosmética, mesmo que a OS nunca tenha
-- saído de "finalizado" — os alertas de 30/90/180 dias (atenção, crítico,
-- abandonado) nunca disparam direito.
--
-- Correção: em vez de `updated_at` (que reflete qualquer edição), busca em
-- `service_order_history` — que já grava, de forma confiável, toda troca de
-- status via o gatilho `track_os_status_change` — a última vez que esta OS
-- ENTROU em 'finalizado' (MAX, não MIN: se uma OS foi reaberta e finalizada
-- de novo, o relógio reinicia a partir da entrada mais recente, que é o
-- comportamento certo). Fallback pra `updated_at`/`created_at` continua
-- existindo, sem mudança de comportamento, pro caso raro de uma OS antiga
-- sem nenhum registro de histórico (o gatilho só existe desde o início do
-- schema, mas roda só em UPDATE — uma OS criada já como 'finalizado', se
-- isso um dia acontecer, cai no mesmo fallback de antes).
-- =============================================================================

CREATE OR REPLACE VIEW public.vw_os_aguardando_retirada
WITH (security_barrier = true) AS
SELECT
  s.id,
  s.tenant_id,
  s.numero_os,
  s.status,
  s.marca,
  s.modelo,
  s.numero_serie,
  s.total_orcamento,
  s.cliente_id,
  c.nome AS cliente_nome,
  COALESCE(c.telefones[1], '') AS cliente_telefone,
  COALESCE(h.entrou_finalizado, s.updated_at, s.created_at) AS pronto_desde,
  (CURRENT_DATE - COALESCE(h.entrou_finalizado, s.updated_at, s.created_at)::date) AS dias_parado,
  CASE
    WHEN (CURRENT_DATE - COALESCE(h.entrou_finalizado, s.updated_at, s.created_at)::date) >= 180
      THEN 'abandonado'
    WHEN (CURRENT_DATE - COALESCE(h.entrou_finalizado, s.updated_at, s.created_at)::date) >= 90
      THEN 'critico'
    WHEN (CURRENT_DATE - COALESCE(h.entrou_finalizado, s.updated_at, s.created_at)::date) >= 30
      THEN 'atencao'
    ELSE 'normal'
  END AS faixa
FROM public.service_orders s
LEFT JOIN public.clientes c ON c.id = s.cliente_id
LEFT JOIN LATERAL (
  SELECT MAX(sh.created_at) AS entrou_finalizado
  FROM public.service_order_history sh
  WHERE sh.os_id = s.id
    AND sh.status_novo = 'finalizado'
) h ON true
WHERE s.status = 'finalizado'
  AND s.tenant_id = public.get_user_tenant_id(auth.uid());

COMMENT ON VIEW public.vw_os_aguardando_retirada IS
  'Aparelhos prontos que o cliente ainda não buscou, com há quantos dias estão '
  'parados. O relógio conta a partir de quando a OS ENTROU em "finalizado" '
  '(via service_order_history, não via updated_at — editar a OS não reinicia '
  'a contagem). Faixas: 30 dias = atenção, 90 = crítico, 180 = abandonado (a '
  'loja descarta ou vende para cobrar o reparo). Uma conta só, para a tela e '
  'para a automação não divergirem.';

GRANT SELECT ON public.vw_os_aguardando_retirada TO authenticated;

NOTIFY pgrst, 'reload schema';
