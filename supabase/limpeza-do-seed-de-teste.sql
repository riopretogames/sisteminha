-- =============================================================================
-- Como apagar a massa de teste criada em 21/08
-- =============================================================================
--
-- ESTE ARQUIVO NÃO É UMA MIGRATION, e está fora da pasta `migrations/` de
-- propósito: ele APAGA LINHAS, e migration destrutiva só roda com o Felipe
-- confirmando. Deixado pronto para o dia em que a massa de teste incomodar.
--
-- Como usar: copiar e colar no SQL Editor do painel do Supabase.
--
-- A ordem importa: filho antes de pai, senão a chave estrangeira reclama.
-- Tudo é identificado pela marca '[SEED-TESTE-21-08]' em observacoes.
-- =============================================================================

BEGIN;

-- Títulos gerados por OS de teste que tenha sido entregue
DELETE FROM public.titulos_financeiros t
 USING public.service_orders o
 WHERE t.os_id = o.id
   AND o.observacoes LIKE '[SEED-TESTE-21-08]%';

-- Pagamentos e itens das OS de teste
DELETE FROM public.os_pagamentos p
 USING public.service_orders o
 WHERE p.os_id = o.id AND o.observacoes LIKE '[SEED-TESTE-21-08]%';

DELETE FROM public.service_order_items i
 USING public.service_orders o
 WHERE i.os_id = o.id AND o.observacoes LIKE '[SEED-TESTE-21-08]%';

DELETE FROM public.service_orders
 WHERE observacoes LIKE '[SEED-TESTE-21-08]%';

-- Pagamentos e itens das vendas de teste
DELETE FROM public.pagamentos_venda p
 USING public.vendas v
 WHERE p.venda_id = v.id AND v.observacoes LIKE '[SEED-TESTE-21-08]%';

DELETE FROM public.itens_venda i
 USING public.vendas v
 WHERE i.venda_id = v.id AND v.observacoes LIKE '[SEED-TESTE-21-08]%';

DELETE FROM public.vendas
 WHERE observacoes LIKE '[SEED-TESTE-21-08]%';

-- Movimentos de estoque dos produtos de teste
DELETE FROM public.movimentos_estoque m
 USING public.produtos p
 WHERE m.produto_id = p.id AND p.observacoes LIKE '[SEED-TESTE-21-08]%';

DELETE FROM public.produtos
 WHERE observacoes LIKE '[SEED-TESTE-21-08]%';

DELETE FROM public.clientes
 WHERE observacoes LIKE '[SEED-TESTE-21-08]%';

-- Confira o que vai sair ANTES de confirmar. Se os números fizerem sentido:
COMMIT;
-- Se não fizerem: ROLLBACK;
