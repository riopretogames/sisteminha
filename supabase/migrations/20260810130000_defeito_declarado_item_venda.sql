-- =============================================================================
-- RPG System.IO — Defeito declarado por item vendido
-- =============================================================================
--
-- Pedido pelo Felipe (10/08) ao desenhar o comprovante de venda: a nota que
-- a loja já usa (formato antigo, replicado no PDF de exemplo) tem uma
-- coluna "Defeito?" por item — prática real de disclosure ao revender
-- seminovo (o cliente assina ciente de que aquele item específico tem um
-- defeito conhecido, não é surpresa depois).
--
-- Esse dado NÃO existia em `itens_venda`. Em vez de mostrar "Não" pra todo
-- mundo no comprovante novo (o que seria uma afirmação falsa — a loja
-- nunca foi perguntada, então "Não" implicaria uma garantia que ninguém
-- deu), a coluna nasce com o dado de verdade: um switch no carrinho do
-- PDV, desligado por padrão (a maioria dos itens não tem defeito
-- conhecido), que o vendedor liga quando for o caso.
-- =============================================================================

ALTER TABLE public.itens_venda
  ADD COLUMN defeito_declarado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.itens_venda.defeito_declarado IS
  'Vendedor marcou que este item específico tem defeito conhecido, avisado ao cliente na venda — aparece na coluna "Defeito?" do comprovante. Default false: item vendido sem ressalva.';
