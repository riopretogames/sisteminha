-- =============================================================================
-- RPG System.IO — Baixa automática de estoque na venda
-- =============================================================================
--
-- Contexto (ver 20260801000004_laudo_e_numeracao.sql, seção 3): a migration
-- anterior removeu `track_stock_movement()` de propósito, porque era um
-- gatilho genérico em cima de qualquer UPDATE em `produtos.estoque_atual` —
-- não sabia o motivo da mudança e gravava tudo como "ajuste".
--
-- Este gatilho é diferente: dispara especificamente quando um ITEM DE VENDA é
-- criado (`itens_venda`), então sempre sabe exatamente o contexto (é uma
-- venda, é saída, é desta venda) — o problema que motivou a remoção anterior
-- não se aplica aqui.
--
-- Por que isso precisa ser SECURITY DEFINER e não só um `.update()` do front:
--   1. A policy de RLS em `produtos` só permite UPDATE para quem tem papel
--      'admin' ("Admins can manage products"). Um vendedor fechando uma
--      venda no PDV nunca teve permissão de descontar o próprio estoque —
--      o `.update()` que existia em PDV.tsx falhava silenciosamente pra
--      qualquer usuário que não fosse admin.
--   2. `FOR UPDATE` trava a linha do produto durante a checagem de estoque,
--      pra dois caixas não venderem a mesma última unidade ao mesmo tempo.
--   3. Fica registrado em `movimentos_estoque` com motivo e origem corretos
--      — hoje isso não existia em lugar nenhum.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.baixar_estoque_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto      RECORD;
  v_numero_venda TEXT;
BEGIN
  -- Trava a linha do produto até o fim desta transação: evita que duas
  -- vendas simultâneas leiam o mesmo saldo e vendam a mesma unidade duas
  -- vezes (condição de corrida clássica de PDV).
  SELECT estoque_atual, custo, tenant_id
  INTO v_produto
  FROM public.produtos
  WHERE id = NEW.produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado ao dar baixa no estoque.', NEW.produto_id;
  END IF;

  IF v_produto.estoque_atual < NEW.quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: produto tem % unidade(s), venda pede %.',
      v_produto.estoque_atual, NEW.quantidade
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.produtos
  SET estoque_atual = estoque_atual - NEW.quantidade
  WHERE id = NEW.produto_id;

  SELECT numero_venda INTO v_numero_venda
  FROM public.vendas
  WHERE id = NEW.venda_id;

  INSERT INTO public.movimentos_estoque (
    tenant_id, produto_id, tipo, quantidade,
    custo_unitario, valor_total,
    motivo, origem, usuario_id,
    saldo_anterior, saldo_depois
  ) VALUES (
    v_produto.tenant_id,
    NEW.produto_id,
    'saida',
    NEW.quantidade,
    v_produto.custo,
    v_produto.custo * NEW.quantidade,
    'Venda',
    'venda:' || COALESCE(v_numero_venda, NEW.venda_id::text),
    auth.uid(),
    v_produto.estoque_atual,
    v_produto.estoque_atual - NEW.quantidade
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.baixar_estoque_venda() IS
  'Desconta estoque e grava auditoria em movimentos_estoque toda vez que um item de venda é criado. SECURITY DEFINER porque vendedor comum não tem permissão de UPDATE direto em produtos.';

CREATE TRIGGER baixar_estoque_ao_vender
  AFTER INSERT ON public.itens_venda
  FOR EACH ROW
  EXECUTE FUNCTION public.baixar_estoque_venda();
