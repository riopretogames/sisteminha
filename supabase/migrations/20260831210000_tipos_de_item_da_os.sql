-- =============================================================================
-- OS ITENS DA OS GANHAM TIPO: PEÇA, SERVIÇO E OUTRO CUSTO
-- =============================================================================
--
-- Dois pedidos do Felipe em 31/08:
--
--   "Tem peças que às vezes a gente pega no fornecedor no dia, então não
--    precisa necessariamente ser só peças do estoque. Tem como adicionar na
--    mão também."
--
--   E os "valores complementares" do sistema antigo: linhas livres com
--   descrição, custo e valor de venda.
--
-- -----------------------------------------------------------------------------
-- POR QUE UMA COLUNA DE TIPO, E NÃO "TEM produto_id OU NÃO"
-- -----------------------------------------------------------------------------
-- Até agora o sistema distinguia peça de serviço olhando se a linha tinha
-- produto do estoque. Isso funcionava porque só existiam dois casos. Com a
-- peça comprada no dia, essa conta quebra: ela É peça e não tem produto no
-- estoque — ficaria contada como serviço, inflando o faturamento de mão de
-- obra e sumindo do custo de peça em todo relatório.
--
-- Três tipos, e cada um responde a uma pergunta diferente da loja:
--
--   peca         o que foi TROCADO no aparelho (do estoque ou comprada no dia)
--   servico      a MÃO DE OBRA, o que a bancada fez
--   complementar o que a loja PAGOU e repassa: frete da peça, terceirização,
--                taxa de fornecedor. Não é trabalho nosso nem peça nossa.
--
-- Misturar os três num balde só é o que faz "serviço mais feito da loja"
-- aparecer com frete no meio.

ALTER TABLE public.service_order_items
  ADD COLUMN IF NOT EXISTS tipo_item TEXT NOT NULL DEFAULT 'servico'
    CHECK (tipo_item IN ('peca', 'servico', 'complementar'));

COMMENT ON COLUMN public.service_order_items.tipo_item IS
  'peca (do estoque ou comprada no dia), servico (mão de obra) ou complementar (custo que a loja repassa: frete, terceirização). Antes disto o sistema deduzia pelo produto_id, e a peça comprada no dia era contada como serviço.';

-- As linhas que já existem: quem tem produto do estoque é peça; o resto é
-- serviço, que era a única outra coisa que dava para lançar até hoje. Nenhuma
-- vira "complementar" — esse tipo não existia, e inventar seria reescrever o
-- passado.
UPDATE public.service_order_items
   SET tipo_item = CASE WHEN produto_id IS NOT NULL THEN 'peca' ELSE 'servico' END
 WHERE tipo_item = 'servico';

-- A consulta que a ficha da OS faz o tempo todo: os itens de uma OS, na ordem
-- em que entraram.
CREATE INDEX IF NOT EXISTS idx_service_order_items_os
  ON public.service_order_items(os_id, created_at);
