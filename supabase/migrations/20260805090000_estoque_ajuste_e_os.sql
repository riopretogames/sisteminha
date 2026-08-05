-- =============================================================================
-- RPG System.IO — Passo 2: ajuste manual, entrada inicial e peça de OS
-- =============================================================================
--
-- Mesmo princípio do Passo 1 (20260804120000): cada caminho que muda estoque
-- ganha seu PRÓPRIO gatilho/função, contextualizado, em vez de um gatilho
-- genérico em cima de `produtos.estoque_atual` (o que foi removido em
-- 20260801000004 exatamente por não saber o motivo da mudança).
--
-- Três coisas aqui:
--   1. Entrada inicial: cadastrar um produto já com estoque > 0 grava uma
--      movimentação de entrada (hoje isso não deixava rastro nenhum).
--   2. Ajuste manual: função dedicada que a tela de Estoque chama para mudar
--      a quantidade de um produto já existente, sempre com auditoria.
--   3. Peça em OS: gatilho em `service_order_items` — ainda SEM tela que crie
--      essas linhas hoje (não existe UI pra isso no app), mas a base fica
--      pronta pra quando essa tela for construída.
-- =============================================================================


-- =============================================================================
-- 1. ENTRADA INICIAL — ao cadastrar produto já com estoque
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_entrada_inicial_produto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estoque_atual > 0 THEN
    INSERT INTO public.movimentos_estoque (
      tenant_id, produto_id, tipo, quantidade,
      custo_unitario, valor_total,
      motivo, origem, usuario_id,
      saldo_anterior, saldo_depois
    ) VALUES (
      NEW.tenant_id,
      NEW.id,
      'entrada',
      NEW.estoque_atual,
      NEW.custo,
      NEW.custo * NEW.estoque_atual,
      'Cadastro inicial',
      'cadastro:' || NEW.id::text,
      auth.uid(),
      0,
      NEW.estoque_atual
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.registrar_entrada_inicial_produto() IS
  'Grava a entrada em movimentos_estoque quando um produto é cadastrado já com estoque > 0.';

CREATE TRIGGER registrar_entrada_ao_cadastrar_produto
  AFTER INSERT ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_entrada_inicial_produto();


-- =============================================================================
-- 2. AJUSTE MANUAL — função que a tela de Estoque chama pra mudar quantidade
-- =============================================================================
-- Por que uma função em vez de a tela fazer dois UPDATE/INSERT separados:
-- atomicidade (ou os dois acontecem, ou nenhum) e trava a linha do produto
-- (FOR UPDATE) contra edição concorrente. SECURITY DEFINER não é necessário
-- pra permissão aqui (admin já tem UPDATE em produtos e INSERT em
-- movimentos_estoque via RLS), mas mantém o padrão do Passo 1 e centraliza a
-- lógica de auditoria num único lugar.

CREATE OR REPLACE FUNCTION public.ajustar_estoque_produto(
  _produto_id UUID,
  _nova_quantidade INTEGER,
  _motivo TEXT DEFAULT 'Ajuste manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto RECORD;
BEGIN
  SELECT estoque_atual, custo, tenant_id
  INTO v_produto
  FROM public.produtos
  WHERE id = _produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado.', _produto_id;
  END IF;

  IF _nova_quantidade < 0 THEN
    RAISE EXCEPTION 'Estoque não pode ser negativo.';
  END IF;

  -- Sem diferença: não grava movimentação vazia (ex.: usuário abriu o
  -- formulário e salvou sem mudar a quantidade).
  IF _nova_quantidade = v_produto.estoque_atual THEN
    RETURN;
  END IF;

  UPDATE public.produtos
  SET estoque_atual = _nova_quantidade
  WHERE id = _produto_id;

  INSERT INTO public.movimentos_estoque (
    tenant_id, produto_id, tipo, quantidade,
    custo_unitario, valor_total,
    motivo, origem, usuario_id,
    saldo_anterior, saldo_depois
  ) VALUES (
    v_produto.tenant_id,
    _produto_id,
    'ajuste',
    _nova_quantidade - v_produto.estoque_atual, -- pode ser negativo (saída) ou positivo (entrada)
    v_produto.custo,
    v_produto.custo * abs(_nova_quantidade - v_produto.estoque_atual),
    _motivo,
    'ajuste:manual',
    auth.uid(),
    v_produto.estoque_atual,
    _nova_quantidade
  );
END;
$$;

COMMENT ON FUNCTION public.ajustar_estoque_produto(UUID, INTEGER, TEXT) IS
  'Muda estoque_atual de um produto e grava a auditoria em movimentos_estoque, tudo atômico. Chamada pela tela de Estoque ao editar quantidade.';


-- =============================================================================
-- 3. PEÇA USADA EM OS — gatilho pronto, SEM tela ainda usando
-- =============================================================================
-- Confirmei em 05/08: `service_order_items` existe no schema desde a
-- migration inicial, mas nenhuma tela do app cria linha nessa tabela hoje —
-- não há "adicionar peça" na Nova OS nem no Kanban. Este gatilho fica pronto
-- para quando essa tela existir; até lá, não dispara porque não há INSERT.
--
-- `produto_id` é opcional em service_order_items (pode ser só descrição de
-- mão de obra, sem produto do estoque vinculado) — o gatilho só age quando
-- houver produto de fato.

CREATE OR REPLACE FUNCTION public.baixar_estoque_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto    RECORD;
  v_numero_os  TEXT;
BEGIN
  IF NEW.produto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT estoque_atual, custo, tenant_id
  INTO v_produto
  FROM public.produtos
  WHERE id = NEW.produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado ao dar baixa por OS.', NEW.produto_id;
  END IF;

  IF v_produto.estoque_atual < NEW.quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: produto tem % unidade(s), OS pede %.',
      v_produto.estoque_atual, NEW.quantidade
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.produtos
  SET estoque_atual = estoque_atual - NEW.quantidade
  WHERE id = NEW.produto_id;

  SELECT numero_os INTO v_numero_os
  FROM public.service_orders
  WHERE id = NEW.os_id;

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
    'Peça usada em OS',
    'os:' || COALESCE(v_numero_os, NEW.os_id::text),
    auth.uid(),
    v_produto.estoque_atual,
    v_produto.estoque_atual - NEW.quantidade
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.baixar_estoque_os() IS
  'Desconta estoque e grava auditoria quando uma peça do estoque é usada num item de OS. Só age se produto_id não for nulo. Ainda sem tela que crie service_order_items (05/08/2026).';

CREATE TRIGGER baixar_estoque_ao_usar_em_os
  AFTER INSERT ON public.service_order_items
  FOR EACH ROW
  WHEN (NEW.produto_id IS NOT NULL)
  EXECUTE FUNCTION public.baixar_estoque_os();
