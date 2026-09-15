-- =============================================================================
-- ENGRENAGENS QUEBRADAS DA OS E DO ESTOQUE — provadas no banco em 14/09
-- =============================================================================
--
-- Antes de o sistema ir para a internet, 24 passos do roteiro de teste foram
-- executados DIRETO NO BANCO (em blocos desfeitos no fim, sem deixar rastro),
-- para não esperar o teste de tela. Cinco falharam. Esta migration conserta o
-- que os cinco apontaram, mais um sexto defeito da mesma família achado na
-- auditoria de segurança do mesmo dia.
--
-- 1. CANCELAR OS COM PEÇA, "CLIENTE NÃO APROVOU" E AJUSTE MANUAL DE ESTOQUE
--    NUNCA FUNCIONARAM (desde 01/09 e desde 18/08, respectivamente).
--    As duas funções montam o tipo do movimento de estoque com
--    `CASE WHEN ... THEN 'entrada' ELSE 'saida' END`. Dentro de um INSERT, o
--    Postgres trata o resultado desse CASE como TEXTO — e a coluna `tipo` é
--    do tipo `movimento_tipo`. O banco recusa: "column tipo is of type
--    movimento_tipo but expression is of type text". Um `'entrada'` sozinho
--    no VALUES passa (o banco adivinha o tipo pela coluna); dentro de CASE,
--    não. Consequência real: qualquer OS que tivesse peça de estoque não
--    podia ser cancelada, não aceitava "cliente não aprovou" e não voltava
--    da recusa; e o ajuste manual de estoque (Estoque > Ajustar) falhava
--    para todo mundo, inclusive administrador. A correção é uma conversão
--    explícita, `(CASE ... END)::public.movimento_tipo`, nas duas funções.
--
-- 2. O TÉCNICO NÃO CONSEGUIA DEVOLVER À BANCADA UMA OS JÁ DECIDIDA.
--    Em 01/09 a tela passou a mostrar "Aprovado" para o técnico quando o
--    cliente JÁ tinha respondido (`laudo_aprovado` preenchido) — voltar para
--    "Aprovado / Executar" nesse caso é rotina de bancada, não aprovação. Mas
--    o gatilho do banco (`validar_aprovacao_orcamento_os`, de 20/08) continuou
--    exigindo `orders.approve` para QUALQUER chegada em "aprovado". Resultado:
--    a tela oferecia a etapa e o banco respondia "Sem permissão". Agora o
--    gatilho lê a mesma coluna que a tela: decisão registrada, a volta é
--    livre; decisão em aberto, continua exigindo a permissão.
--
--    No mesmo gatilho, o buraco do outro lado, achado pela auditoria: uma OS
--    em "Aguardando aprovação" podia ser empurrada pelo técnico direto para
--    "Finalizado" (ou "Aguardando peça", "Terceirizada"), pulando a resposta
--    do cliente. A regra que faltava: sair de "aguardando_aprovacao" para
--    qualquer etapa da frente exige que a resposta do cliente esteja
--    registrada — ou a permissão de quem registra. Voltar para a análise e
--    cancelar seguem com as regras que já tinham.
--
-- 3. O TÍTULO FINANCEIRO DA OS ENTREGUE INCLUÍA O TROCO.
--    `gerar_titulo_ao_entregar_os` gravava como recebido a SOMA dos
--    pagamentos. Orçamento de R$ 200 pago com R$ 220 em dinheiro (troco de
--    R$ 20): o caixa descontava o troco, o título dizia R$ 220. E, pela API,
--    um pagamento de R$ 100.000 numa OS de R$ 900 virava R$ 100.000 de
--    receita. O que a loja recebeu por uma OS é o orçamento dela — nunca mais.
--
-- 4. OS ENTREGUE TINHA O VALOR EDITÁVEL PELA API.
--    A tela tranca o orçamento depois da entrega; o banco não trancava nada.
--    Com `orders.edit` dava para reescrever `total_orcamento`, o tipo (paga →
--    garantia) e o valor pago de uma OS já entregue e já no financeiro. Agora
--    um gatilho segura esses campos enquanto a OS estiver entregue. Reabrir
--    (mudar a etapa) continua permitido a quem edita OS — o que muda é que,
--    entregue, o dinheiro dela é história.
--
--    Duas regras irmãs, no mesmo gatilho:
--    • `laudo_aprovado` não se marca à mão. Só `registrar_decisao_do_laudo`
--      (que exige `orders.approve`) preenche essa coluna; um UPDATE direto
--      por quem só tem `orders.edit` deixava o técnico "aprovar" o próprio
--      orçamento. A exceção é a volta da recusa (`desfazer_recusa_ao_reabrir_os`
--      zera a coluna quando a OS recusada volta para a análise) — esse
--      caminho é do sistema e continua livre.
--    • Depois que o cliente aprovou um valor, BAIXAR esse valor (ou virar a OS
--      em garantia/cortesia) exige `orders.approve`. O técnico executa o que
--      foi aprovado; mexer no combinado com o cliente é decisão do balcão.
--      Quem tem `orders.approve` continua podendo (desconto pós-aprovação
--      acontece de verdade). Falta uma permissão própria para isso — está
--      anotado no plano.
--
-- 5. PEÇA DE OUTRA LOJA NUMA VENDA OU OS DESTA.
--    `baixar_estoque_venda` e `baixar_estoque_os` buscavam o produto só pelo
--    id, sem conferir a loja. Com o id de um produto da loja vizinha, um
--    vendedor descontava o estoque dela. Hoje só existe uma loja, mas o
--    sistema vai ser vendido para outras — e a conferência custa uma linha.
--
-- Tudo conferido no fim por um bloco que executa o ajuste de estoque e o
-- estorno de peça de OS de verdade (num rascunho que é desfeito) — se
-- qualquer um ainda falhar, a migration inteira é recusada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. O TIPO DO MOVIMENTO, CONVERTIDO POR EXTENSO
-- -----------------------------------------------------------------------------
-- Mesmo corpo de 20260901120000; só a linha do CASE muda.
CREATE OR REPLACE FUNCTION public.mover_pecas_da_os(
  _os_id uuid, _numero_os text, _devolver boolean, _motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item    RECORD;
  v_produto RECORD;
  v_sinal   INTEGER := CASE WHEN _devolver THEN 1 ELSE -1 END;
BEGIN
  FOR v_item IN
    SELECT produto_id, SUM(quantidade) AS quantidade
      FROM public.service_order_items
     WHERE os_id = _os_id
       AND produto_id IS NOT NULL
     GROUP BY produto_id
  LOOP
    SELECT estoque_atual, custo, tenant_id
      INTO v_produto
      FROM public.produtos
     WHERE id = v_item.produto_id
     FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF NOT _devolver AND v_produto.estoque_atual < v_item.quantidade THEN
      RAISE EXCEPTION
        'A peça desta OS voltou ao estoque quando o orçamento foi recusado e não está mais disponível (tem %, a OS precisa de %). Reponha o estoque antes de reabrir a OS.',
        v_produto.estoque_atual, v_item.quantidade
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.produtos
       SET estoque_atual = estoque_atual + (v_sinal * v_item.quantidade)
     WHERE id = v_item.produto_id;

    INSERT INTO public.movimentos_estoque (
      tenant_id, produto_id, tipo, quantidade,
      custo_unitario, valor_total,
      motivo, origem, usuario_id,
      saldo_anterior, saldo_depois
    ) VALUES (
      v_produto.tenant_id,
      v_item.produto_id,
      -- A conversão explícita é o conserto inteiro (ver cabeçalho, item 1).
      (CASE WHEN _devolver THEN 'entrada' ELSE 'saida' END)::public.movimento_tipo,
      v_item.quantidade,
      v_produto.custo,
      v_produto.custo * v_item.quantidade,
      _motivo,
      CASE WHEN _devolver THEN 'estorno:os:' ELSE 'os:' END
        || COALESCE(_numero_os, _os_id::text),
      auth.uid(),
      v_produto.estoque_atual,
      v_produto.estoque_atual + (v_sinal * v_item.quantidade)
    );
  END LOOP;
END;
$$;

-- Mesmo corpo de 20260818110000; só a linha do CASE muda.
CREATE OR REPLACE FUNCTION public.ajustar_estoque_produto(
  _produto_id uuid, _nova_quantidade integer, _motivo text DEFAULT 'Ajuste manual'
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

  IF v_produto.tenant_id <> public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Produto não pertence à sua loja.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission(auth.uid(), 'inventory.adjust') THEN
    RAISE EXCEPTION 'Seu acesso não permite ajustar estoque.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _nova_quantidade < 0 THEN
    RAISE EXCEPTION 'Estoque não pode ser negativo.';
  END IF;

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
    (CASE WHEN _nova_quantidade > v_produto.estoque_atual THEN 'entrada' ELSE 'saida' END)::public.movimento_tipo,
    ABS(_nova_quantidade - v_produto.estoque_atual),
    v_produto.custo,
    v_produto.custo * ABS(_nova_quantidade - v_produto.estoque_atual),
    _motivo,
    'ajuste_manual',
    auth.uid(),
    v_produto.estoque_atual,
    _nova_quantidade
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. APROVAÇÃO: O BANCO LÊ A MESMA COLUNA QUE A TELA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_aprovacao_orcamento_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decidido BOOLEAN := NEW.laudo_aprovado IS NOT NULL;
BEGIN
  -- Chamada de dentro do banco (rotina, sem ninguém logado): não é o cenário.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Chegar em "aprovado" só é APROVAR quando a resposta do cliente ainda não
  -- foi registrada. Decidida (aprovou ou recusou), "Aprovado / Executar" é a
  -- bancada, e voltar para lá é rotina de quem edita OS.
  IF NEW.status = 'aprovado'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT v_decidido
     AND NOT public.has_permission(auth.uid(), 'orders.approve')
  THEN
    RAISE EXCEPTION 'Sem permissão para aprovar orçamento de OS.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'aguardando_aprovacao'
     AND NEW.status = 'cancelado'
     AND NOT public.has_permission(auth.uid(), 'orders.approve')
  THEN
    RAISE EXCEPTION 'Sem permissão para recusar orçamento de OS.'
      USING ERRCODE = '42501';
  END IF;

  -- Sair de "aguardando aprovação" para a frente sem a resposta do cliente
  -- registrada é pular a aprovação. Voltar para a análise continua livre;
  -- cancelar tem a regra logo acima.
  IF OLD.status = 'aguardando_aprovacao'
     AND NEW.status NOT IN ('aguardando_aprovacao', 'aguardando_analise', 'cancelado')
     AND NOT v_decidido
     AND NOT public.has_permission(auth.uid(), 'orders.approve')
  THEN
    RAISE EXCEPTION
      'O cliente ainda não respondeu ao orçamento. Registre a resposta dele (Aprovou / Não aprovou) antes de seguir com a OS.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. O TÍTULO DA OS NUNCA PASSA DO ORÇAMENTO
-- -----------------------------------------------------------------------------
-- Mesmo corpo de 20260822100000, com o LEAST no valor recebido.
CREATE OR REPLACE FUNCTION public.gerar_titulo_ao_entregar_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'entregue' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  NEW.data_finalizacao := COALESCE(NEW.data_finalizacao, now());

  IF NEW.tipo <> 'paga' OR NEW.total_orcamento <= 0 THEN
    NEW.valor_final_pago := COALESCE(NEW.valor_final_pago, 0);
    RETURN NEW;
  END IF;

  -- O que a loja recebeu pela OS é o orçamento. A soma dos pagamentos pode
  -- ser maior (troco em dinheiro, ou um valor errado lançado pela API) — o
  -- excedente nunca é receita. `conferir_pagamento_ao_entregar_os` já garante
  -- que a soma não é MENOR.
  NEW.valor_final_pago := LEAST(
    COALESCE(
      NEW.valor_final_pago,
      (SELECT SUM(valor) FROM public.os_pagamentos WHERE os_id = NEW.id),
      NEW.total_orcamento
    ),
    NEW.total_orcamento
  );

  IF NOT EXISTS (SELECT 1 FROM public.titulos_financeiros WHERE os_id = NEW.id) THEN
    INSERT INTO public.titulos_financeiros (
      tenant_id, natureza, descricao, cliente_id, os_id,
      valor, valor_pago, vencimento, competencia, status, pago_em
    ) VALUES (
      NEW.tenant_id, 'receber',
      'OS ' || NEW.numero_os || ' — serviço',
      NEW.cliente_id, NEW.id,
      NEW.valor_final_pago, NEW.valor_final_pago,
      now()::date, now()::date, 'pago', now()::date
    );
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. AS TRAVAS DA OS QUE SÓ EXISTIAM NA TELA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.travas_da_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pode_aprovar BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) Entregue é entregue: o dinheiro da OS não muda mais enquanto ela
  --     estiver nessa etapa. Reabrir (trocar a etapa) é outra ação.
  IF OLD.status = 'entregue' AND NEW.status = 'entregue' THEN
    IF NEW.total_orcamento  IS DISTINCT FROM OLD.total_orcamento
       OR NEW.tipo            IS DISTINCT FROM OLD.tipo
       OR NEW.valor_final_pago IS DISTINCT FROM OLD.valor_final_pago
       OR NEW.laudo_aprovado  IS DISTINCT FROM OLD.laudo_aprovado
       OR NEW.cliente_id      IS DISTINCT FROM OLD.cliente_id
    THEN
      RAISE EXCEPTION
        'Esta OS já foi entregue: o orçamento, o tipo e o valor pago dela não mudam mais. Para corrigir, reabra a OS.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  v_pode_aprovar := public.has_permission(auth.uid(), 'orders.approve');

  -- (b) A resposta do cliente não se marca à mão. A única volta livre é a da
  --     recusa desfeita (OS recusada voltando para a análise), que o próprio
  --     sistema faz em `desfazer_recusa_ao_reabrir_os`.
  IF NEW.laudo_aprovado IS DISTINCT FROM OLD.laudo_aprovado
     AND NOT v_pode_aprovar
     AND NOT (OLD.laudo_aprovado IS FALSE
              AND NEW.laudo_aprovado IS NULL
              AND NEW.status IN ('aguardando_aprovacao', 'aguardando_analise'))
  THEN
    RAISE EXCEPTION
      'A resposta do cliente ao orçamento só é registrada por quem tem a permissão de aprovar orçamento.'
      USING ERRCODE = '42501';
  END IF;

  -- (c) Valor aprovado pelo cliente não baixa sem a permissão de quem aprova.
  --     Subir pode (peça a mais descoberta na bancada vira um novo "aguardando
  --     aprovação" pela tela); baixar, ou virar a OS em garantia/cortesia, é
  --     dar desconto no que foi combinado.
  IF OLD.laudo_aprovado IS TRUE AND NEW.laudo_aprovado IS TRUE
     AND NOT v_pode_aprovar
     AND (NEW.total_orcamento < OLD.total_orcamento
          OR (OLD.tipo = 'paga' AND NEW.tipo IS DISTINCT FROM 'paga'))
  THEN
    RAISE EXCEPTION
      'O cliente aprovou R$ %. Baixar esse valor ou dispensar a cobrança é decisão de quem aprova orçamento.',
      to_char(OLD.total_orcamento, 'FM999G999G990D00')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS travas_da_os ON public.service_orders;
CREATE TRIGGER travas_da_os
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.travas_da_os();

COMMENT ON FUNCTION public.travas_da_os() IS
  'Travas da OS que só existiam na tela (15/09): OS entregue tem orçamento/tipo/valor pago congelados; laudo_aprovado só muda por quem tem orders.approve (fora a volta da recusa, que é do sistema); baixar valor aprovado ou dispensar cobrança exige orders.approve.';

-- -----------------------------------------------------------------------------
-- 5. A PEÇA TEM QUE SER DA MESMA LOJA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.baixar_estoque_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto      RECORD;
  v_venda        RECORD;
BEGIN
  SELECT tenant_id, numero_venda INTO v_venda
  FROM public.vendas
  WHERE id = NEW.venda_id;

  SELECT estoque_atual, custo, tenant_id
  INTO v_produto
  FROM public.produtos
  WHERE id = NEW.produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado ao dar baixa no estoque.', NEW.produto_id;
  END IF;

  -- Roda com chave de dono, então a RLS de produtos não entra em cena aqui:
  -- a pergunta "é da mesma loja?" tem que ser feita por extenso.
  IF v_produto.tenant_id IS DISTINCT FROM v_venda.tenant_id THEN
    RAISE EXCEPTION 'Este produto não é da loja desta venda.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_produto.estoque_atual < NEW.quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: produto tem % unidade(s), venda pede %.',
      v_produto.estoque_atual, NEW.quantidade
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.produtos
  SET estoque_atual = estoque_atual - NEW.quantidade
  WHERE id = NEW.produto_id;

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
    'venda:' || COALESCE(v_venda.numero_venda, NEW.venda_id::text),
    auth.uid(),
    v_produto.estoque_atual,
    v_produto.estoque_atual - NEW.quantidade
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.baixar_estoque_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto    RECORD;
  v_os         RECORD;
BEGIN
  IF NEW.produto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id, numero_os, pecas_estornadas_em IS NOT NULL AS parada
    INTO v_os
    FROM public.service_orders
   WHERE id = NEW.os_id;

  IF v_os.parada THEN
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

  IF v_produto.tenant_id IS DISTINCT FROM v_os.tenant_id THEN
    RAISE EXCEPTION 'Esta peça não é da loja desta OS.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_produto.estoque_atual < NEW.quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: produto tem % unidade(s), OS pede %.',
      v_produto.estoque_atual, NEW.quantidade
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.produtos
  SET estoque_atual = estoque_atual - NEW.quantidade
  WHERE id = NEW.produto_id;

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
    'os:' || COALESCE(v_os.numero_os, NEW.os_id::text),
    auth.uid(),
    v_produto.estoque_atual,
    v_produto.estoque_atual - NEW.quantidade
  );

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- CONFERE QUE AS ENGRENAGENS GIRAM
-- -----------------------------------------------------------------------------
-- Executa de verdade o ajuste de estoque, a baixa de peça em OS e o estorno
-- ao cancelar — num rascunho (produto, OS e item criados só para isto) que é
-- desfeito no fim pelo erro proposital P0999. Qualquer OUTRO erro derruba a
-- migration: é exatamente o que aconteceria na loja.
DO $prova$
DECLARE
  v_tenant  UUID;
  v_admin   UUID;
  v_cliente UUID;
  v_prod    UUID;
  v_os      UUID;
  v_numero  TEXT;
  v_saldo   INTEGER;
BEGIN
  BEGIN
    SELECT id INTO v_tenant FROM public.tenants ORDER BY created_at LIMIT 1;
    SELECT ur.user_id INTO v_admin
      FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'administrador' AND p.ativo AND p.tenant_id = v_tenant
     ORDER BY p.created_at LIMIT 1;
    SELECT id INTO v_cliente FROM public.clientes WHERE tenant_id = v_tenant ORDER BY created_at LIMIT 1;

    IF v_tenant IS NULL OR v_admin IS NULL OR v_cliente IS NULL THEN
      RAISE EXCEPTION 'Banco sem loja, administrador ou cliente para a prova — confira antes de aplicar.';
    END IF;

    -- Age como o administrador: é o que a tela faz.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    INSERT INTO public.produtos (tenant_id, nome, custo, preco, estoque_atual, ativo)
    VALUES (v_tenant, '__prova da migration 15/09 (desfeita)', 10, 20, 5, false)
    RETURNING id INTO v_prod;

    -- (1) ajuste manual: 5 -> 3 (saída) e 3 -> 8 (entrada): os dois lados do CASE
    PERFORM public.ajustar_estoque_produto(v_prod, 3, 'prova (desfeita)');
    PERFORM public.ajustar_estoque_produto(v_prod, 8, 'prova (desfeita)');
    SELECT estoque_atual INTO v_saldo FROM public.produtos WHERE id = v_prod;
    IF v_saldo <> 8 THEN
      RAISE EXCEPTION 'ajustar_estoque_produto deixou o saldo em % em vez de 8', v_saldo;
    END IF;

    -- (2) peça em OS: baixa 2, depois cancela e a peça volta (o estorno era o
    --     caminho quebrado)
    INSERT INTO public.service_orders (tenant_id, cliente_id, defeito_cliente, status, tipo, total_orcamento)
    VALUES (v_tenant, v_cliente, 'prova da migration (desfeita)', 'aguardando_analise', 'paga', 100)
    RETURNING id, numero_os INTO v_os, v_numero;

    INSERT INTO public.service_order_items (os_id, produto_id, descricao, quantidade, preco_cobrado, tipo_item)
    VALUES (v_os, v_prod, 'peça de prova', 2, 50, 'peca');

    SELECT estoque_atual INTO v_saldo FROM public.produtos WHERE id = v_prod;
    IF v_saldo <> 6 THEN
      RAISE EXCEPTION 'baixar_estoque_os deixou o saldo em % em vez de 6', v_saldo;
    END IF;

    UPDATE public.service_orders SET status = 'cancelado' WHERE id = v_os;

    SELECT estoque_atual INTO v_saldo FROM public.produtos WHERE id = v_prod;
    IF v_saldo <> 8 THEN
      RAISE EXCEPTION 'cancelar a OS não devolveu a peça: saldo % em vez de 8', v_saldo;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.movimentos_estoque
                    WHERE produto_id = v_prod AND tipo = 'entrada' AND origem = 'estorno:os:' || v_numero) THEN
      RAISE EXCEPTION 'o estorno da peça não ficou registrado no extrato do estoque';
    END IF;

    -- (3) a trava da OS entregue e a do laudo existem
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'travas_da_os' AND tgrelid = 'public.service_orders'::regclass) THEN
      RAISE EXCEPTION 'gatilho travas_da_os não foi criado';
    END IF;

    -- Tudo certo: desfaz o rascunho inteiro.
    RAISE EXCEPTION 'prova concluída' USING ERRCODE = 'P0999';
  EXCEPTION
    WHEN SQLSTATE 'P0999' THEN
      NULL;
  END;

  -- O crachá simulado morre com o sub-bloco, mas não custa garantir.
  PERFORM set_config('request.jwt.claims', '', true);
END
$prova$;

NOTIFY pgrst, 'reload schema';
