-- =============================================================================
-- Sisteminha (RPG System.IO) — fecha bypass de aprovação e duplicidade no Caixa
-- =============================================================================
--
-- Dois achados da revisão geral de 20/08 (pós-fusão de duas frentes de
-- trabalho paralelas), os dois descritos em detalhe no PLANO-DE-ACAO.md e
-- deixados sem correção pelos agentes que os acharam — a instrução deles
-- era nunca mexer em migration sem confirmar comigo. Aplico agora.
--
--
-- 1. BYPASS DE APROVAÇÃO DE ORÇAMENTO — a trava de 17/08 só cobria 1/4 do
--    caminho de verdade
-- -----------------------------------------------------------------------------
-- `validar_aprovacao_orcamento_os` (migration 20260817140000) só bloqueava
-- virar "aprovado"/"cancelado" quando a OS estava JUSTAMENTE em
-- "aguardando_aprovacao". Mas as telas sempre ofereceram "Aprovado" como
-- destino a partir de QUALQUER etapa (de propósito — "voltar uma etapa" ou
-- "pular pra etapa extra da loja" precisa disso). Ou seja: uma OS recém-
-- aberta em "Aguardando análise" podia ir direto pra "Aprovado" num passo
-- só, sem nunca passar por "Aguardando aprovação" — e o gatilho não via
-- problema nenhum, porque só olhava se `OLD.status = 'aguardando_aprovacao'`.
-- Um técnico (tem `orders.edit`, nunca tem `orders.approve`) driblava a
-- permissão inteira com um único clique no seletor ou arrastando o card.
--
-- As 3 telas (TrocarEtapaOS.tsx, OrdensServico.tsx, OSTableView.tsx) já
-- foram corrigidas nesta mesma revisão pra esconder "Aprovado" de quem não
-- tem `orders.approve`, vindo de qualquer etapa — mas tela é conveniência,
-- banco é a trava de verdade. Sem isto, chamada direta à API continua
-- aprovando orçamento sem a permissão.
--
-- Correção: virar "aprovado" passa a exigir `orders.approve` sempre, não
-- importa de onde veio. "Cancelado" continua com a regra estreita de
-- antes — cancelar só é "recusar orçamento" (e por isso exige
-- `orders.approve`) quando sai especificamente de "aguardando_aprovacao";
-- cancelar de qualquer outra etapa é ação comum, sempre foi permitida com
-- `orders.edit`, e não deveria passar a exigir mais que isso.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validar_aprovacao_orcamento_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'aprovado'
     AND NEW.status IS DISTINCT FROM OLD.status
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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validar_aprovacao_orcamento_os() IS
  'Exige orders.approve pra QUALQUER transição que resulte em "aprovado" (de qualquer etapa de origem — achado de 20/08, a versão original só cobria vindo de aguardando_aprovacao) e pra "recusar" (aguardando_aprovacao -> cancelado, a única saída de cancelamento que representa decisão de orçamento). Cancelar de outra etapa continua exigindo só orders.edit.';


-- -----------------------------------------------------------------------------
-- 2. DUPLICIDADE NO CAIXA — venda com troca em duas instruções, e OS
--    reaberta/reentregue, podiam lançar dinheiro a mais
-- -----------------------------------------------------------------------------
-- Os dois gatilhos de 18/08 (`registrar_pagamentos_venda_no_caixa` e
-- `registrar_pagamento_os_no_caixa`, migration 20260818100000)
-- funcionavam com o modelo "calcula uma vez, trava, nunca mais mexe" —
-- suficiente pro caso mais simples, mas com dois buracos achados na
-- revisão de 20/08:
--
--   a) PDV: o checkout grava pagamento em MAIS de uma instrução SQL
--      separada quando há produto recebido em troca (uma chamada RPC por
--      item de troca, depois um INSERT em lote dos pagamentos manuais). O
--      gatilho de venda é FOR EACH STATEMENT — cada instrução separada
--      "disputa" a trava de uma-vez-só. A ordem foi corrigida no código do
--      PDV nesta mesma revisão (troca antes do lote manual), o que já
--      resolve o caso de 1 item de troca — mas com 2+ itens de troca, a
--      PRIMEIRA chamada RPC já consome a trava sozinha, vendo só aquele
--      item, sem os demais nem o lote manual.
--   b) OS: reabrir uma OS entregue e entregar de novo (fluxo legítimo,
--      ver `reabrirOS.ts`) faz o gatilho de OS recalcular e LANÇAR DE NOVO
--      o valor cheio no Caixa, mesmo sem nenhum pagamento novo — porque
--      esse gatilho nunca teve a trava de "já lancei isso antes" que o de
--      venda tem.
--
-- Correção: os dois gatilhos passam de "calcula uma vez e trava" para
-- "recalcula sempre a partir de TUDO que existe agora, e ajusta o
-- lançamento existente em vez de duplicar" — independente de quantas
-- instruções separadas gravaram pagamento, e independente de quantas
-- vezes a OS for entregue de novo.
--
-- Regra de ouro que os dois passam a seguir: **sessão de caixa FECHADA
-- nunca é alterada** (seguindo a mesma trava de 17/08 que impede editar
-- caixa_sessoes fechada) — se o lançamento já registrado pertence a uma
-- sessão que já fechou, o valor antigo fica como está pra sempre; só
-- dinheiro GENUINAMENTE NOVO (a diferença, se houver) vira um lançamento
-- novo na sessão que estiver aberta agora. Sessão ainda aberta pode
-- corrigir o valor no lugar — a conferência daquele dia ainda não fechou.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_pagamentos_venda_no_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda_id       UUID;
  v_venda_tenant   UUID;
  v_venda_status   TEXT;
  v_venda_total    DECIMAL(10,2);
  v_venda_numero   TEXT;
  v_sessao_id      UUID;
  v_total_pago     DECIMAL(10,2);
  v_troco          DECIMAL(10,2);
  v_cash_sum       DECIMAL(10,2);
  v_cash_liquido   DECIMAL(10,2);
  v_mov_id         UUID;
  v_mov_sessao     UUID;
  v_mov_valor      DECIMAL(10,2);
  v_mov_sessao_status TEXT;
BEGIN
  FOR v_venda_id IN SELECT DISTINCT venda_id FROM inserted LOOP
    SELECT tenant_id, status, total, numero_venda
      INTO v_venda_tenant, v_venda_status, v_venda_total, v_venda_numero
    FROM public.vendas WHERE id = v_venda_id;

    IF v_venda_status IS DISTINCT FROM 'pago' THEN
      CONTINUE;
    END IF;

    -- Recalcula com TUDO que já está gravado agora pra esta venda — pega
    -- automaticamente qualquer pagamento de uma leva anterior (troca em
    -- várias chamadas RPC + lote manual, em qualquer ordem).
    SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
    FROM public.pagamentos_venda WHERE venda_id = v_venda_id;

    v_troco := GREATEST(0, v_total_pago - v_venda_total);

    SELECT COALESCE(SUM(pv.valor), 0) INTO v_cash_sum
    FROM public.pagamentos_venda pv
    JOIN public.formas_pagamento fp ON fp.id = pv.forma_pagamento_id
    WHERE pv.venda_id = v_venda_id AND fp.entra_no_caixa = true;

    v_cash_liquido := GREATEST(0, v_cash_sum - v_troco);

    SELECT id, sessao_id, valor INTO v_mov_id, v_mov_sessao, v_mov_valor
    FROM public.caixa_movimentos
    WHERE venda_id = v_venda_id AND tipo = 'venda'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_mov_id IS NOT NULL THEN
      SELECT status INTO v_mov_sessao_status FROM public.caixa_sessoes WHERE id = v_mov_sessao;

      IF v_mov_sessao_status = 'aberto' THEN
        -- Sessão ainda aberta: corrige o valor no próprio lançamento — não
        -- é retroativo, a conferência daquele dia ainda não fechou.
        IF v_cash_liquido > 0 THEN
          UPDATE public.caixa_movimentos SET valor = v_cash_liquido WHERE id = v_mov_id;
        ELSE
          DELETE FROM public.caixa_movimentos WHERE id = v_mov_id;
        END IF;
        CONTINUE;
      END IF;

      -- Sessão já fechada: o lançamento registrado ali é imutável (mesma
      -- regra da migration 20260817160000). Só entra lançamento novo se
      -- apareceu dinheiro GENUINAMENTE NOVO desde então.
      IF v_cash_liquido <= v_mov_valor THEN
        CONTINUE;
      END IF;
      v_cash_liquido := v_cash_liquido - v_mov_valor;
    END IF;

    IF v_cash_liquido <= 0 THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_sessao_id
    FROM public.caixa_sessoes
    WHERE tenant_id = v_venda_tenant AND status = 'aberto'
    LIMIT 1;

    IF v_sessao_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, venda_id, usuario_id)
    VALUES (v_sessao_id, 'venda', 'Venda ' || COALESCE(v_venda_numero, ''), v_cash_liquido, v_venda_id, auth.uid());
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_os_no_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao_id      UUID;
  v_total_pago     DECIMAL(10,2);
  v_troco          DECIMAL(10,2);
  v_cash_sum       DECIMAL(10,2);
  v_cash_liquido   DECIMAL(10,2);
  v_titulo_id      UUID;
  v_mov_id         UUID;
  v_mov_sessao     UUID;
  v_mov_valor      DECIMAL(10,2);
  v_mov_sessao_status TEXT;
BEGIN
  IF NEW.status <> 'entregue' OR OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo <> 'paga' OR NEW.total_orcamento <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_titulo_id FROM public.titulos_financeiros WHERE os_id = NEW.id LIMIT 1;

  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
  FROM public.os_pagamentos WHERE os_id = NEW.id;

  v_troco := GREATEST(0, v_total_pago - NEW.total_orcamento);

  SELECT COALESCE(SUM(op.valor), 0) INTO v_cash_sum
  FROM public.os_pagamentos op
  JOIN public.formas_pagamento fp ON fp.id = op.forma_pagamento_id
  WHERE op.os_id = NEW.id AND fp.entra_no_caixa = true;

  v_cash_liquido := GREATEST(0, v_cash_sum - v_troco);

  SELECT id, sessao_id, valor INTO v_mov_id, v_mov_sessao, v_mov_valor
  FROM public.caixa_movimentos
  WHERE titulo_id = v_titulo_id AND tipo = 'recebimento'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_mov_id IS NOT NULL THEN
    SELECT status INTO v_mov_sessao_status FROM public.caixa_sessoes WHERE id = v_mov_sessao;

    IF v_mov_sessao_status = 'aberto' THEN
      IF v_cash_liquido > 0 THEN
        UPDATE public.caixa_movimentos SET valor = v_cash_liquido WHERE id = v_mov_id;
      ELSE
        DELETE FROM public.caixa_movimentos WHERE id = v_mov_id;
      END IF;
      RETURN NEW;
    END IF;

    -- Sessão já fechada: imutável. Reabrir e reentregar a OS sem
    -- pagamento novo (o caso que motivou esta correção) cai exatamente
    -- aqui — v_cash_liquido bate com v_mov_valor, então não faz nada.
    IF v_cash_liquido <= v_mov_valor THEN
      RETURN NEW;
    END IF;
    v_cash_liquido := v_cash_liquido - v_mov_valor;
  END IF;

  IF v_cash_liquido <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_sessao_id
  FROM public.caixa_sessoes
  WHERE tenant_id = NEW.tenant_id AND status = 'aberto'
  LIMIT 1;

  IF v_sessao_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, titulo_id, usuario_id)
  VALUES (v_sessao_id, 'recebimento', 'OS ' || NEW.numero_os, v_cash_liquido, v_titulo_id, auth.uid());

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
