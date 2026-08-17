-- =============================================================================
-- Sisteminha (RP System.IO) — Caixa ganha o tipo "devolução"
-- =============================================================================
--
-- Achado em TrocaDevolucao.tsx (08/08), corrigido a pedido do Felipe em
-- 17/08: o dinheiro devolvido numa troca/devolução não entrava na
-- conferência de Caixa — `devolucoes.valor_devolvido_cliente` não tinha
-- caminho nenhum até `caixa_movimentos`.
--
-- Escopo desta correção: só o DINHEIRO QUE SAI pra devolver ao cliente
-- (`valor_devolvido_cliente`). Quando o cliente paga a mais numa troca
-- (`valor_cliente_pagou_a_mais`), isso já vira um pagamento normal na venda
-- nova (`pagamentos_venda`) — e pagamento de venda ainda não entra no Caixa
-- pra NENHUMA venda, é o achado maior e já conhecido ("Caixa não reflete
-- venda/OS real", registrado à parte no plano). Resolver aquele é decisão
-- maior, fora do que foi pedido agora; esta migration fecha só a parte que
-- é exclusiva de devolução (não existe outro caminho pra esse dinheiro sair
-- registrado em lugar nenhum, mesmo depois que o achado maior for corrigido).
--
-- `ALTER TYPE ... ADD VALUE` não pode ser usado na mesma transação em que o
-- valor novo é lido/gravado — por isso o gatilho que usa 'devolucao' fica
-- numa migration separada, com timestamp posterior.
-- =============================================================================

ALTER TYPE public.tipo_mov_caixa ADD VALUE 'devolucao';

ALTER TABLE public.caixa_movimentos
  ADD COLUMN devolucao_id UUID REFERENCES public.devolucoes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.caixa_movimentos.devolucao_id IS
  'Preenchido só nos movimentos gerados automaticamente pelo gatilho de devolução (ver migration seguinte). NULL em todo movimento manual (sangria, suprimento, pagamento, recebimento).';

NOTIFY pgrst, 'reload schema';
