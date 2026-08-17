-- =============================================================================
-- Sisteminha (RP System.IO) — faturamento real de uma venda de troca
-- =============================================================================
--
-- Achado em TrocaDevolucao.tsx (08/08), corrigido a pedido do Felipe em
-- 17/08: quando uma troca leva produto novo, a venda nova grava o preço
-- CHEIO do produto em `total` — precisa disso pra não perder a contagem de
-- vendas por produto nos dashboards (quantas unidades de X foram vendidas).
-- Só que quem soma `vendas.total` como "faturamento" (VendasHistorico,
-- DashboardVenda, Dashboard Home, RelatorioVendas) contava esse valor DUAS
-- vezes: uma na venda original, outra na venda nova da troca — mesmo que só
-- a diferença tenha sido cobrada de verdade (ou nada, se a troca bateu
-- certinho, ou até dinheiro tenha voltado pro cliente).
--
-- `valor_faturamento_real` guarda quanto entrou de dinheiro NOVO de
-- verdade nessa venda. NULL em toda venda comum (o normal) — os relatórios
-- devem ler `COALESCE(valor_faturamento_real, total)`. Só a venda nova de
-- uma troca preenche isto (feito em TrocaDevolucao.tsx, não por gatilho):
-- a diferença cobrada do cliente quando ele paga a mais, ou 0 quando a
-- troca não gerou cobrança nova nenhuma.
--
-- Contagem de vendas por produto (itens_venda.total, lido em DashboardVenda/
-- IeComercial/IeEstoque) continua usando o preço cheio de propósito — isso
-- não é o problema que esta coluna resolve, é uma limitação assumida à
-- parte (documentada em TrocaDevolucao.tsx).
-- =============================================================================

ALTER TABLE public.vendas
  ADD COLUMN valor_faturamento_real DECIMAL(10,2)
  CHECK (
    valor_faturamento_real IS NULL
    OR (valor_faturamento_real >= 0 AND valor_faturamento_real <= total)
  );

COMMENT ON COLUMN public.vendas.valor_faturamento_real IS
  'NULL = usar total normalmente (toda venda comum). Só a venda nova de uma troca (TrocaDevolucao.tsx) preenche: quanto entrou de dinheiro novo de verdade (a diferença cobrada do cliente, ou 0). Relatórios de faturamento agregado devem somar COALESCE(valor_faturamento_real, total), não total sozinho.';

NOTIFY pgrst, 'reload schema';
