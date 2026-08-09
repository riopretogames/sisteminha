-- =============================================================================
-- Sisteminha (RP System.IO) — Vendedor da venda aponta para o cadastro de pessoas
-- =============================================================================
--
-- MESMO PROBLEMA QUE O TÉCNICO DA OS TINHA, achado hoje mais cedo: a coluna
-- referencia `auth.users` (a tabela de LOGIN), enquanto o nome da pessoa mora
-- em `public.profiles`. Sem ligação declarada entre as duas, a API não
-- consegue trazer o nome junto com a venda.
--
-- Apareceu agora ao montar o filtro por vendedor no histórico de vendas: o
-- filtro precisa listar nomes, e não havia caminho para eles.
--
-- É o terceiro campo do mesmo tipo no sistema (técnico da OS, vendedor da OS,
-- vendedor da venda). Os dois primeiros já apontam para `profiles`; este era o
-- último fora do padrão.
--
-- `profiles.id` é o mesmo id de `auth.users`, então a troca não converte nem
-- perde dado — só declara a ligação que já existia de fato.
-- =============================================================================

-- Vendedor apontando para um login sem cadastro de pessoa impediria criar a
-- nova ligação. Limpa a referência solta em vez de falhar.
UPDATE public.vendas
   SET vendedor_id = NULL
 WHERE vendedor_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = vendedor_id);

ALTER TABLE public.vendas
  DROP CONSTRAINT IF EXISTS vendas_vendedor_id_fkey;

ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_vendedor_id_fkey
  FOREIGN KEY (vendedor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vendas.vendedor_id IS
  'Quem fez a venda. Aponta para `profiles` (cadastro de pessoas) — antes '
  'apontava para `auth.users` e por isso o nome não podia ser trazido junto '
  'com a venda.';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- Os três campos de pessoa apontam para o mesmo lugar?
--   SELECT conrelid::regclass AS tabela, conname, confrelid::regclass AS aponta_para
--     FROM pg_constraint
--    WHERE conname IN ('vendas_vendedor_id_fkey',
--                      'service_orders_tecnico_id_fkey',
--                      'service_orders_vendedor_id_fkey');
--   -- os três têm que apontar para `profiles`
-- =============================================================================
