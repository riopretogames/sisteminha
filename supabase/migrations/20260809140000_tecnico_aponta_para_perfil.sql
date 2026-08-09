-- =============================================================================
-- Sisteminha (RP System.IO) — Técnico da OS aponta para o cadastro de pessoas
-- =============================================================================
--
-- Achado na revisão de 09/08, investigando por que o nome do técnico nunca
-- aparecia no card do Kanban.
--
-- O card lê `tecnico_nome` e a consulta trazia só `tecnico_id`. A causa raiz é
-- mais funda que a consulta: `service_orders.tecnico_id` referencia
-- `auth.users` — a tabela de LOGIN —, enquanto o nome da pessoa mora em
-- `public.profiles`. Sem ligação declarada entre as duas, a API não consegue
-- trazer o nome junto com a OS, por mais que se peça.
--
-- Efeito prático que durou meses: ligar "Técnico Responsável" na configuração
-- do cartão não mostrava nada. Parecia campo sem uso; era campo sem caminho.
--
-- E havia inconsistência dentro da própria tabela: `vendedor_id`, criado
-- ontem, já aponta para `profiles`. Dois campos que guardam "uma pessoa da
-- loja", apontando para lugares diferentes.
--
-- `profiles.id` é o mesmo id de `auth.users` (é assim que o cadastro de
-- pessoas foi montado), então a troca não perde nem converte dado nenhum —
-- só passa a declarar a ligação que já existia de fato.
-- =============================================================================

-- Segurança: técnico apontando para um login sem cadastro de pessoa impediria
-- criar a nova ligação. Limpa a referência solta em vez de falhar.
UPDATE public.service_orders
   SET tecnico_id = NULL
 WHERE tecnico_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = tecnico_id);

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS service_orders_tecnico_id_fkey;

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_tecnico_id_fkey
  FOREIGN KEY (tecnico_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.service_orders.tecnico_id IS
  'Quem conserta. Aponta para `profiles` (cadastro de pessoas), igual a '
  '`vendedor_id` — antes apontava para `auth.users` e por isso o nome não '
  'podia ser trazido junto com a OS.';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- SELECT conname, confrelid::regclass AS aponta_para
--   FROM pg_constraint
--  WHERE conrelid = 'public.service_orders'::regclass
--    AND conname IN ('service_orders_tecnico_id_fkey',
--                    'service_orders_vendedor_id_fkey');
--  -- as duas têm que apontar para `profiles`
-- =============================================================================
