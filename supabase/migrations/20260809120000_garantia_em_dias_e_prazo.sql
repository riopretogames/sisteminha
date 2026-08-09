-- =============================================================================
-- Sisteminha (RP System.IO) — Garantia em dias e prazo prometido
-- =============================================================================
--
-- Decisão do Felipe em 09/08: prazo e garantia voltam para a abertura da OS.
-- Garantia padrão da loja: **90 dias**. Opções: 30, 60, 90, 180 e 1 ano.
--
-- POR QUE UMA COLUNA NOVA EM DIAS, E NÃO A `garantia_meses` QUE JÁ EXISTE:
--
-- A coluna antiga guarda MESES (padrão 3). Parece a mesma coisa, mas não é na
-- hora de contar o vencimento: 90 dias e 3 meses caem em datas diferentes
-- dependendo do mês — fevereiro tem 28. Garantia é prazo que a loja promete e
-- que o cliente cobra; discussão de balcão sobre "venceu ou não venceu" é o que
-- essa precisão evita.
--
-- Como o Felipe falou em dias, e é em dias que o laudo vai sair, a coluna nova
-- guarda dias. `garantia_meses` fica marcada como legada — apagar coluna com
-- dado real exige confirmação dele.
--
-- SEM AUTOMAÇÃO, DE PROPÓSITO. A garantia vai passar a contar a partir do
-- momento em que o cliente retira o aparelho e paga, e isso depende dos status
-- da assistência, que ainda vão ser desenhados. Esta migration só guarda o
-- prazo escolhido — nenhum gatilho, nenhum cálculo de vencimento ainda.
-- =============================================================================

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS garantia_dias INTEGER NOT NULL DEFAULT 90;

COMMENT ON COLUMN public.service_orders.garantia_dias IS
  'Dias de garantia prometidos ao cliente. Padrão da loja: 90. A contagem '
  'começa quando o cliente retira o aparelho — regra ainda a implementar, '
  'junto com os status da assistência.';

COMMENT ON COLUMN public.service_orders.garantia_meses IS
  'LEGADO — use `garantia_dias`. Guardava meses, o que não fecha com o prazo '
  'em dias que a loja promete (90 dias ≠ 3 meses em todo mês).';

-- Traz o que já existia para a unidade nova, para nenhuma OS antiga ficar
-- parecendo sem garantia. 3 meses viram 90 dias.
UPDATE public.service_orders
   SET garantia_dias = garantia_meses * 30
 WHERE garantia_meses IS NOT NULL
   AND garantia_meses > 0
   AND garantia_dias = 90
   AND garantia_meses <> 3;

COMMENT ON COLUMN public.service_orders.prazo_previsto IS
  'Data prometida de entrega, combinada no balcão. Sai no laudo. Não é '
  'calculada por ninguém: quem atende é que sabe a fila da bancada.';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'service_orders'
--    AND column_name IN ('garantia_dias', 'garantia_meses', 'prazo_previsto');
-- =============================================================================
