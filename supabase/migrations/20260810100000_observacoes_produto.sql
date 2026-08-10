-- =============================================================================
-- Sisteminha (RP System.IO) — Observação livre no produto
-- =============================================================================
--
-- Pedido do Felipe (10/08): a ficha do produto precisa mostrar "todas as
-- informações do produto" — o sistema antigo (OK Cells) tem um campo de
-- observação livre no cadastro que o nosso não tinha. Útil principalmente
-- pra produto recebido em troca (ex.: "bateria testada, viciada aos 85%").
-- =============================================================================

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

COMMENT ON COLUMN public.produtos.observacoes IS
  'Anotação livre sobre o produto (estado, defeito conhecido, etc.). Sem uso automático — só leitura/escrita pela ficha.';

NOTIFY pgrst, 'reload schema';
