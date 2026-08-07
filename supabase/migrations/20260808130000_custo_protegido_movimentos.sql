-- =============================================================================
-- Sisteminha (RP System.IO) — Custo protegido: movimentos de estoque
-- =============================================================================
--
-- QUARTO VAZAMENTO, NÃO APONTADO PELA REVISÃO TÉCNICA.
--
-- A revisão de 06/08 listou 4 lugares onde custo escapa por API direta:
-- `produtos.custo`, `produtos.margem_percent`, `servicos.custo_estimado` e
-- `service_order_items.custo_unitario`. Faltou `movimentos_estoque`, que
-- guarda `custo_unitario` E `valor_total` de cada entrada e saída.
--
-- É o mesmo vazamento, e nesse caso até mais fácil de explorar: o histórico
-- de movimentações tem uma linha por produto que já entrou ou saiu, com o
-- custo daquele momento. Dá pra reconstruir a tabela de custo inteira da loja
-- por ali, sem nunca tocar em `produtos`.
--
-- A tela `EstoqueMovimentacoes.tsx` já esconde a coluna de quem não tem
-- `inventory.cost.view` (`veCusto` na linha 38) — ou seja, o comportamento
-- visível está certo desde sempre; o que faltava era a trava real. Exatamente
-- o mesmo padrão dos outros três.
--
-- Achado ao preparar a Parte 2: trancar 3 tabelas e deixar a quarta aberta
-- seria meia tranca — o custo continuaria acessível por outro caminho.
--
-- Mesmo desenho das views da migration 20260808110000: sem `security_invoker`
-- (senão perderia o acesso à coluna junto com todo mundo na Parte 2), filtro
-- de tenant explícito no WHERE, `security_barrier` contra função esperta no
-- filtro de quem consulta, e a checagem de permissão resolvida uma vez por
-- consulta e não uma vez por linha.
-- =============================================================================

CREATE OR REPLACE VIEW public.vw_movimentos_estoque
WITH (security_barrier = true) AS
SELECT
  m.id,
  m.tenant_id,
  m.produto_id,
  m.tipo,
  m.quantidade,
  m.motivo,
  m.origem,
  m.usuario_id,
  m.saldo_anterior,
  m.saldo_depois,
  m.created_at,
  CASE WHEN (SELECT public.has_permission(auth.uid(), 'inventory.cost.view'))
       THEN m.custo_unitario END AS custo_unitario,
  CASE WHEN (SELECT public.has_permission(auth.uid(), 'inventory.cost.view'))
       THEN m.valor_total END AS valor_total
FROM public.movimentos_estoque m
WHERE m.tenant_id = public.get_user_tenant_id(auth.uid());

COMMENT ON VIEW public.vw_movimentos_estoque IS
  'Leitura do histórico de movimentações com custo_unitario e valor_total protegidos por inventory.cost.view. Escrita continua indo direto em movimentos_estoque (na prática, só os gatilhos gravam lá).';

GRANT SELECT ON public.vw_movimentos_estoque TO authenticated;
