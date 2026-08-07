-- =============================================================================
-- RPG System.IO — Corrige tipo de status em service_order_history
-- =============================================================================
--
-- Achado na revisão técnica de 06/08: `service_orders.status` virou TEXT na
-- migration 20260128002757 (pra suportar status customizável por loja, via
-- `os_status_config`), mas `service_order_history.status_anterior`/
-- `status_novo` continuaram como o ENUM antigo `os_status` — e o gatilho
-- `track_os_status_change()` (que grava um registro de histórico em toda
-- troca de status) insere o valor de `NEW.status`/`OLD.status` direto nessas
-- colunas.
--
-- Hoje isso não quebra nada porque os únicos status em uso (recebido,
-- diagnostico, aguardando_peca, aguardando_aprovacao, em_reparo, pronto,
-- entregue, cancelado) são exatamente os 8 valores originais do ENUM — o
-- cast implícito TEXT→ENUM funciona porque o texto bate com um rótulo válido.
--
-- Mas a tela "Gerenciar Status" (StatusManagerDialog.tsx) permite cadastrar
-- um status totalmente novo (label livre, vira uma chave nova tipo
-- "peca_chegou"). No momento em que uma OS mudar PRA ou DE um status assim,
-- o INSERT em service_order_history vai falhar com "invalid input value for
-- enum os_status: ..." — e como o gatilho roda na mesma transação da
-- atualização de service_orders, a troca de status inteira falha, com um
-- erro cru de Postgres na tela.
--
-- Fix: alargar as duas colunas de ENUM pra TEXT, igual já foi feito em
-- service_orders.status. É uma mudança segura — todo valor de enum existente
-- já é um texto válido, então o cast na migração não perde nem transforma
-- nenhum dado histórico.
-- =============================================================================

ALTER TABLE public.service_order_history
  ALTER COLUMN status_anterior TYPE TEXT USING status_anterior::TEXT,
  ALTER COLUMN status_novo TYPE TEXT USING status_novo::TEXT;

COMMENT ON COLUMN public.service_order_history.status_anterior IS
  'Texto livre — espelha o tipo de service_orders.status desde que status customizável por loja existe (os_status_config). Era ENUM os_status até esta migration, o que quebrava a troca de status pra qualquer status customizado além dos 8 originais.';

COMMENT ON COLUMN public.service_order_history.status_novo IS
  'Texto livre — mesma nota de status_anterior.';
