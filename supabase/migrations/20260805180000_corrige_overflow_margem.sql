-- =============================================================================
-- RPG System.IO — Corrige overflow em produtos.margem_percent
-- =============================================================================
--
-- Achado ao vivo (05/08): cadastrar um produto com custo muito baixo perto do
-- preço (ex.: custo R$0,01, preço R$50) faz o cálculo automático de margem
-- passar de 999,99% — o limite de `DECIMAL(5,2)` — e o INSERT inteiro falha
-- com "numeric field overflow", sem nenhuma mensagem amigável pro usuário.
--
-- Fix: a margem passa a ser limitada (clamp) entre -9999,99% e 9999,99% em
-- vez de deixar o Postgres estourar. Qualquer custo/preço agora salva sem
-- erro; casos extremos só mostram a margem "no teto", que já é informação
-- suficiente (ninguém precisa saber se é 5.000% ou 50.000.000% — os dois
-- significam "o custo está errado ou é um preço promocional gigante").
-- =============================================================================

ALTER TABLE public.produtos DROP COLUMN margem_percent;

ALTER TABLE public.produtos ADD COLUMN margem_percent DECIMAL(6,2) GENERATED ALWAYS AS (
  CASE
    WHEN custo > 0 THEN LEAST(GREATEST(((preco - custo) / custo * 100), -9999.99), 9999.99)
    ELSE 0
  END
) STORED;

COMMENT ON COLUMN public.produtos.margem_percent IS
  'Margem calculada automaticamente a partir de custo/preco. Limitada entre -9999,99% e 9999,99% para nunca estourar o cadastro — valores fora dessa faixa indicam custo ou preço digitado errado.';
