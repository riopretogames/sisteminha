-- =============================================================================
-- RPG System.IO — Origem da Venda
-- =============================================================================
--
-- Achado desde a revisão técnica: o catálogo "Origem da Venda" (Balcão,
-- Site, WhatsApp, Instagram, Shopee — migration 20260801000003) existe e
-- tem dados reais desde o começo, mas `vendas` nunca teve coluna pra
-- guardar isso. Órfão desde sempre — ninguém tinha ligado.
--
-- Mesmo padrão de `clientes.origem_id`/`motivo_compra_id`: FK opcional pra
-- `catalogos`, com CHECK garantindo que só aceita item do tipo certo
-- (reaproveita `catalogo_e_do_tipo`, já existente).
-- =============================================================================

ALTER TABLE public.vendas
  ADD COLUMN origem_venda_id UUID REFERENCES public.catalogos(id) ON DELETE SET NULL;

ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_origem_venda_valida
  CHECK (public.catalogo_e_do_tipo(origem_venda_id, 'origem_venda'));

COMMENT ON COLUMN public.vendas.origem_venda_id IS
  'De onde a venda veio (Balcão/Site/WhatsApp/Instagram/Shopee/...) — catálogo tipo origem_venda em Listas do Sistema. Opcional, nulo em venda antiga.';
