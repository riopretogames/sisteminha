-- =============================================================================
-- Sisteminha (RPG System.IO) — estorna peça quando a OS é cancelada
-- =============================================================================
--
-- ACHADO NA VERIFICAÇÃO POR CÓDIGO DE 22/08 (roteiro de teste, passo 30):
-- `baixar_estoque_os()` (migration 20260805090000) desconta estoque quando
-- uma peça do estoque é lançada num item de OS (`service_order_items`), mas
-- nunca existiu o gatilho inverso — cancelar a OS trava o valor do orçamento
-- e os itens (migration de 21/08), só que a peça já descontada NUNCA volta
-- pro estoque. Mesmo defeito que existia em vendas antes da correção
-- 20260807040000 (`estorna_estoque_venda_cancelada`) — aqui é o espelho
-- exato dela, só que pro lado de `service_order_items`.
--
-- Consequência real: peça lançada numa OS que depois é cancelada (cliente
-- desistiu, orçamento não aprovado) some do estoque pra sempre — a loja
-- comprou a peça, ela saiu da prateleira digital, e não voltou nem pro
-- estoque nem pra venda nenhuma.
--
-- Mesmo princípio de sempre neste projeto: gatilho ESPECÍFICO na transição
-- pra 'cancelado', não um gatilho genérico em cima de qualquer UPDATE em
-- service_orders.status.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.estornar_estoque_os_cancelada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item    RECORD;
  v_produto RECORD;
BEGIN
  FOR v_item IN
    SELECT produto_id, quantidade
    FROM public.service_order_items
    WHERE os_id = NEW.id
      AND produto_id IS NOT NULL
  LOOP
    SELECT estoque_atual, custo, tenant_id
    INTO v_produto
    FROM public.produtos
    WHERE id = v_item.produto_id
    FOR UPDATE;

    IF NOT FOUND THEN
      -- Produto pode ter sido excluído desde o lançamento — não trava o
      -- cancelamento por isso, só não tem pra onde devolver o estoque.
      CONTINUE;
    END IF;

    UPDATE public.produtos
    SET estoque_atual = estoque_atual + v_item.quantidade
    WHERE id = v_item.produto_id;

    INSERT INTO public.movimentos_estoque (
      tenant_id, produto_id, tipo, quantidade,
      custo_unitario, valor_total,
      motivo, origem, usuario_id,
      saldo_anterior, saldo_depois
    ) VALUES (
      v_produto.tenant_id,
      v_item.produto_id,
      'entrada',
      v_item.quantidade,
      v_produto.custo,
      v_produto.custo * v_item.quantidade,
      'Estorno de peça de OS cancelada',
      'estorno:os:' || COALESCE(NEW.numero_os, NEW.id::text),
      auth.uid(),
      v_produto.estoque_atual,
      v_produto.estoque_atual + v_item.quantidade
    );
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.estornar_estoque_os_cancelada() IS
  'Devolve ao estoque as peças já descontadas quando uma OS com item de estoque lançado é cancelada, e grava auditoria em movimentos_estoque. Espelha estornar_estoque_venda_cancelada() (20260807040000), só que pro lado de service_order_items.';

DROP TRIGGER IF EXISTS estornar_estoque_ao_cancelar_os ON public.service_orders;

CREATE TRIGGER estornar_estoque_ao_cancelar_os
  AFTER UPDATE ON public.service_orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado')
  EXECUTE FUNCTION public.estornar_estoque_os_cancelada();

NOTIFY pgrst, 'reload schema';
