-- =============================================================================
-- RPG System.IO — Estorna estoque quando uma venda é cancelada
-- =============================================================================
--
-- Achado na revisão técnica de 06/08 (PLANO-DE-REFINAMENTO.md, Vendas/PDV):
-- o gatilho `baixar_estoque_ao_vender` (20260804120000) desconta estoque na
-- criação de `itens_venda`, mas não existia NENHUM gatilho de reversão. O
-- catch automático de PDV.tsx marca a venda como 'cancelado' quando
-- itens/pagamento falham depois da venda já criada — mas se os itens já
-- tinham sido inseridos com sucesso (estoque já descontado) e só o
-- pagamento falhou depois, o estoque saía de verdade numa venda que fica
-- marcada como cancelada, sem nenhum rastro do porquê.
--
-- Mesmo raciocínio de sempre neste projeto: gatilho ESPECÍFICO por contexto
-- (dispara só na transição pra 'cancelado'), não um gatilho genérico em
-- cima de qualquer UPDATE em vendas.status — assim, sabe exatamente que é
-- estorno, não "ajuste" ou "saída" genérica.
--
-- Cobre qualquer caminho que cancele uma venda, não só o catch automático
-- de hoje — inclusive um futuro botão de "cancelar venda" manual (a
-- permissão `sales.cancel` já existe, só não tem UI ainda).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.estornar_estoque_venda_cancelada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item    RECORD;
  v_produto RECORD;
BEGIN
  -- Devolve estoque de cada item da venda, um produto de cada vez, com
  -- trava de linha (mesma cautela do gatilho de baixa original).
  FOR v_item IN
    SELECT produto_id, quantidade
    FROM public.itens_venda
    WHERE venda_id = NEW.id
  LOOP
    SELECT estoque_atual, custo, tenant_id
    INTO v_produto
    FROM public.produtos
    WHERE id = v_item.produto_id
    FOR UPDATE;

    IF NOT FOUND THEN
      -- Produto pode ter sido excluído desde a venda — não trava o
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
      'Estorno de venda cancelada',
      'estorno:venda:' || COALESCE(NEW.numero_venda, NEW.id::text),
      auth.uid(),
      v_produto.estoque_atual,
      v_produto.estoque_atual + v_item.quantidade
    );
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.estornar_estoque_venda_cancelada() IS
  'Devolve estoque e grava auditoria em movimentos_estoque quando uma venda com itens já lançados é cancelada. Espelha baixar_estoque_venda() no sentido contrário.';

CREATE TRIGGER estornar_estoque_ao_cancelar_venda
  AFTER UPDATE ON public.vendas
  FOR EACH ROW
  WHEN (NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado')
  EXECUTE FUNCTION public.estornar_estoque_venda_cancelada();
