-- =============================================================================
-- Sisteminha (RP System.IO) — Caixa passa a refletir venda do PDV e OS paga
-- =============================================================================
--
-- Achado mais antigo e mais completo desta revisão (confirmado com 7 pontos
-- de verificação em 17-18/08): o fechamento de Caixa nunca refletia venda do
-- PDV nem título de OS pago — só devolução (17/08) entrava. A "conferência
-- cega" comparava a gaveta contada à mão contra um número que ignorava quase
-- todo o dinheiro do dia.
--
-- O schema já vinha preparado pra isso desde o início (`caixa_movimentos` já
-- tinha `venda_id`/`titulo_id`/`forma_pagamento_id`, o enum `tipo_mov_caixa`
-- já tinha 'venda'/'recebimento', `formas_pagamento` já tinha
-- `entra_no_caixa`) — só faltavam os gatilhos que de fato usam isso. É
-- exatamente o que esta migration entrega.
--
-- Duas decisões do Felipe (18/08), depois de eu perguntar diretamente:
--
--   1. "Só dinheiro físico é 'o Caixa'." A conferência cega (contar a
--      gaveta) continua sendo só sobre dinheiro físico — PIX, cartão e
--      demais formas eletrônicas NÃO entram nesse número (mesmo estando
--      marcadas `entra_no_caixa=true` hoje — essa marcação estava com o
--      valor errado pro que ela realmente decide agora, corrigido abaixo).
--      Elas aparecem à parte, como resumo informativo do dia (ver
--      `vw_caixa_resumo_formas`), sem entrar na conta que se compara com a
--      gaveta contada à mão.
--   2. "Quando faz a opção de pagamento [na entrega da OS], tem que ter
--      todas as opções de pagamento, todo detalhamento completo. Além
--      disso, isso entra pra contabilidade... tudo certinho." Ou seja: a
--      entrega de OS ganha uma captura de pagamento tão completa quanto o
--      PDV — inclusive pagamento dividido em mais de uma forma — não um
--      campo único simplificado. É a tabela `os_pagamentos` criada aqui,
--      espelhando `pagamentos_venda`.
--
-- ACHADO NOVO NO MEIO DO CAMINHO (durante o desenho desta correção): o PDV
-- já permite pagar em dinheiro com um valor MAIOR que o total da venda,
-- esperando troco de volta (`troco = totalPago - total`, calculado e
-- mostrado na tela) — mas o troco nunca foi registrado em lugar nenhum como
-- saída de caixa. Se esta migration lançasse o valor BRUTO de cada
-- pagamento em dinheiro sem descontar o troco, o Caixa calculado ficaria
-- ALTO DEMAIS toda vez que o cliente pagasse com uma nota maior que a
-- venda — o oposto do que esta correção existe pra resolver. Por isso os
-- gatilhos abaixo descontam o troco do total em dinheiro antes de lançar no
-- Caixa (ver `v_troco`/`v_cash_liquido` nas duas funções de venda/OS).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Corrige o que "entra no caixa" realmente significa
-- -----------------------------------------------------------------------------
-- `entra_no_caixa` nasceu (migration 20260801000003) marcado `true` pra quase
-- toda forma — inclusive PIX e cartão — quando na prática, pelo que o Felipe
-- confirmou hoje, só dinheiro físico afeta a gaveta. Corrige o dado (não é
-- feature nova, é dado errado desde o começo, agora que a regra de verdade
-- ficou clara) — deixa só 'dinheiro' com `entra_no_caixa=true`. Continua
-- editável em Configurações > Formas de Pagamento, então se algum caso
-- específico da loja precisar de outro ajuste, dá pra mudar por lá sem
-- precisar de migration nova.

UPDATE public.formas_pagamento
SET entra_no_caixa = false
WHERE forma_enum <> 'dinheiro';

COMMENT ON COLUMN public.formas_pagamento.entra_no_caixa IS
  'Essa forma de pagamento afeta o dinheiro FÍSICO da gaveta? Corrigido em 18/08: só "Dinheiro" deveria estar como true — PIX, cartão e demais formas eletrônicas nunca estão fisicamente na gaveta, então não entram na conferência cega do fechamento de Caixa (aparecem à parte, em vw_caixa_resumo_formas). Editável em Configurações > Formas de Pagamento.';


-- -----------------------------------------------------------------------------
-- 2. os_pagamentos — captura de pagamento na entrega da OS, espelhando
--    pagamentos_venda (decisão do Felipe: "todo detalhamento completo")
-- -----------------------------------------------------------------------------

CREATE TABLE public.os_pagamentos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id              UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  forma_pagamento_id UUID NOT NULL REFERENCES public.formas_pagamento(id),
  -- Mesma categoria ampla (enum) que pagamentos_venda.forma usa, pelo mesmo
  -- motivo: relatório/contabilidade que agrupam por essa categoria ampla
  -- funcionam igual pros dois tipos de receita (venda e OS).
  forma              public.forma_pagamento NOT NULL,
  valor              DECIMAL(10,2) NOT NULL CHECK (valor > 0),
  parcelas           INTEGER NOT NULL DEFAULT 1,
  usuario_id         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_os_pagamentos_os ON public.os_pagamentos(os_id);

COMMENT ON TABLE public.os_pagamentos IS
  'Pagamento(s) recebido(s) ao entregar uma OS — espelha pagamentos_venda, inclusive suportando pagamento dividido em mais de uma forma. INSERT só é permitido enquanto a OS ainda NÃO está "entregue" (ver policy) — depois de entregue, os_pagamentos fica congelado, igual caixa_sessoes fechada.';

ALTER TABLE public.os_pagamentos ENABLE ROW LEVEL SECURITY;

-- Só INSERT e SELECT de propósito: uma vez entregue a OS, o pagamento
-- registrado não pode ser alterado nem apagado (mesmo raciocínio da
-- migration 20260817160000 pra caixa_sessoes fechada — "isso entra pra
-- contabilidade, tudo certinho" não combina com poder reescrever depois).
-- Só `orders.edit`: a permissão `orders.deliver` foi removida do catálogo em
-- 09/08 (migration 20260809160000, "o vendedor opera a OS inteira") — quem
-- move OS pra "entregue" hoje (vendedor, técnico, gerente, administrador)
-- sempre tem `orders.edit`. Checar `orders.deliver` aqui ficaria morto (a
-- permissão não existe mais em `permissions`, então a checagem nunca dá
-- verdadeiro) — deixar a referência confundiria quem ler depois, achando que
-- existe um papel "só entrega" que não tem mais.
CREATE POLICY "Quem entrega OS registra pagamento"
  ON public.os_pagamentos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders s
      WHERE s.id = os_id
        AND s.tenant_id = public.get_user_tenant_id(auth.uid())
        AND s.status <> 'entregue'
    )
    AND public.has_permission(auth.uid(), 'orders.edit')
  );

CREATE POLICY "Ver pagamentos da OS"
  ON public.os_pagamentos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders s
      WHERE s.id = os_id
        AND s.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'orders.view')
  );

-- Auditoria própria (mesmo motivo do caixa_movimentos em 20260817160000:
-- não tem tenant_id direto, só via os_id).
CREATE OR REPLACE FUNCTION public.registrar_auditoria_os_pagamentos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.service_orders WHERE id = NEW.os_id;

  INSERT INTO public.auditoria (tenant_id, usuario_id, acao, tabela, registro_id, dados_depois)
  VALUES (v_tenant, auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_os_pagamentos
  AFTER INSERT ON public.os_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_os_pagamentos();


-- -----------------------------------------------------------------------------
-- 3. Trava: OS só vira "entregue" com pagamento já registrado o suficiente
-- -----------------------------------------------------------------------------
-- BEFORE UPDATE, nomeado pra rodar ANTES de "gerar_titulo_ao_entregar" na
-- ordem alfabética (Postgres dispara múltiplos gatilhos BEFORE UPDATE na
-- mesma tabela em ordem alfabética de nome — mesmo raciocínio documentado
-- na migration 20260809150000 pra trg_limitar_alteracao_os). Assim, se o
-- pagamento não bate, a exceção impede a OS de virar "entregue" e o título
-- nunca chega a ser criado.

CREATE OR REPLACE FUNCTION public.conferir_pagamento_ao_entregar_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago DECIMAL(10,2);
BEGIN
  IF NEW.status <> 'entregue' OR OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  -- Garantia/cortesia e orçamento zerado não cobram nada — nada pra
  -- conferir (mesmo critério de gerar_titulo_ao_entregar_os).
  IF NEW.tipo <> 'paga' OR NEW.total_orcamento <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_pago
  FROM public.os_pagamentos
  WHERE os_id = NEW.id;

  IF v_pago < NEW.total_orcamento THEN
    RAISE EXCEPTION
      'Registre o pagamento do orçamento (R$ %) antes de marcar a OS como entregue — falta R$ %.',
      NEW.total_orcamento, (NEW.total_orcamento - v_pago)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER conferir_pagamento_ao_entregar
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.conferir_pagamento_ao_entregar_os();

-- valor_final_pago agora reflete o que foi realmente registrado em
-- os_pagamentos (nunca menos que total_orcamento, garantido pelo gatilho
-- acima), em vez de sempre cair no total_orcamento mesmo quando o pagamento
-- de verdade foi diferente (ex.: pagamento dividido com arredondamento).
CREATE OR REPLACE FUNCTION public.gerar_titulo_ao_entregar_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'entregue' OR OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  NEW.data_finalizacao := COALESCE(NEW.data_finalizacao, now());

  IF NEW.tipo <> 'paga' OR NEW.total_orcamento <= 0 THEN
    NEW.valor_final_pago := COALESCE(NEW.valor_final_pago, 0);
    RETURN NEW;
  END IF;

  NEW.valor_final_pago := COALESCE(
    NEW.valor_final_pago,
    (SELECT SUM(valor) FROM public.os_pagamentos WHERE os_id = NEW.id),
    NEW.total_orcamento
  );

  IF NOT EXISTS (SELECT 1 FROM public.titulos_financeiros WHERE os_id = NEW.id) THEN
    INSERT INTO public.titulos_financeiros (
      tenant_id, natureza, descricao, os_id, cliente_id,
      valor, valor_pago, vencimento, status, pago_em, criado_por
    ) VALUES (
      NEW.tenant_id,
      'receber',
      'OS ' || NEW.numero_os,
      NEW.id,
      NEW.cliente_id,
      NEW.total_orcamento,
      NEW.total_orcamento,
      CURRENT_DATE,
      'pago',
      CURRENT_DATE,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. Venda paga lança a parte em dinheiro no Caixa (líquida de troco)
-- -----------------------------------------------------------------------------
-- Gatilho de ESTATÍSTICA (FOR EACH STATEMENT, com tabela de transição): o PDV
-- insere todos os pagamentos de uma venda numa única chamada
-- (`.insert([...])`, várias linhas de uma vez, ver PDV.tsx). Um gatilho POR
-- LINHA (FOR EACH ROW) veria cada pagamento isolado, sem saber quanto no
-- total já foi pago pra essa venda — e o cálculo de troco (que depende do
-- total pago somado) ficaria errado. Por isso este gatilho roda uma vez por
-- COMANDO, com acesso a todas as linhas inseridas juntas.

CREATE OR REPLACE FUNCTION public.registrar_pagamentos_venda_no_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda_id     UUID;
  v_venda_tenant UUID;
  v_venda_status TEXT;
  v_venda_total  DECIMAL(10,2);
  v_venda_numero TEXT;
  v_sessao_id    UUID;
  v_total_pago   DECIMAL(10,2);
  v_troco        DECIMAL(10,2);
  v_cash_sum     DECIMAL(10,2);
  v_cash_liquido DECIMAL(10,2);
BEGIN
  FOR v_venda_id IN SELECT DISTINCT venda_id FROM inserted LOOP
    -- Idempotência: só lança uma vez por venda. Cobre o caso comum (todos
    -- os pagamentos chegam numa leva só) sem tentar suportar pagamento
    -- adicionado aos pedaços depois — se isso um dia existir, precisa de
    -- gatilho novo que saiba somar só a diferença.
    IF EXISTS (SELECT 1 FROM public.caixa_movimentos WHERE venda_id = v_venda_id AND tipo = 'venda') THEN
      CONTINUE;
    END IF;

    SELECT tenant_id, status, total, numero_venda
      INTO v_venda_tenant, v_venda_status, v_venda_total, v_venda_numero
    FROM public.vendas WHERE id = v_venda_id;

    IF v_venda_status IS DISTINCT FROM 'pago' THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_sessao_id
    FROM public.caixa_sessoes
    WHERE tenant_id = v_venda_tenant AND status = 'aberto'
    LIMIT 1;

    IF v_sessao_id IS NULL THEN
      CONTINUE; -- sem caixa aberto, não tem onde lançar (mesma regra da devolução)
    END IF;

    -- Troco só existe quando o total pago (todas as formas, inclusive
    -- entrada de produto em troca) passa do total da venda — e só pode ter
    -- vindo do dinheiro (não dá pra dar troco de cartão/PIX).
    SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
    FROM public.pagamentos_venda WHERE venda_id = v_venda_id;

    v_troco := GREATEST(0, v_total_pago - v_venda_total);

    SELECT COALESCE(SUM(pv.valor), 0) INTO v_cash_sum
    FROM public.pagamentos_venda pv
    JOIN public.formas_pagamento fp ON fp.id = pv.forma_pagamento_id
    WHERE pv.venda_id = v_venda_id AND fp.entra_no_caixa = true;

    v_cash_liquido := GREATEST(0, v_cash_sum - v_troco);

    IF v_cash_liquido > 0 THEN
      INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, venda_id, usuario_id)
      VALUES (v_sessao_id, 'venda', 'Venda ' || COALESCE(v_venda_numero, ''), v_cash_liquido, v_venda_id, auth.uid());
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE TRIGGER lancar_pagamentos_venda_no_caixa
  AFTER INSERT ON public.pagamentos_venda
  REFERENCING NEW TABLE AS inserted
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.registrar_pagamentos_venda_no_caixa();


-- -----------------------------------------------------------------------------
-- 5. OS entregue e paga lança a parte em dinheiro no Caixa (líquida de troco)
-- -----------------------------------------------------------------------------
-- Diferente de venda: os_pagamentos são inseridos ENQUANTO a OS ainda não
-- está "entregue" (é a própria trava da policy de INSERT, seção 2) — então,
-- no momento em que o status vira "entregue", o conjunto de os_pagamentos já
-- está completo e parado (não pode mais crescer). Por isso aqui um gatilho
-- comum FOR EACH ROW, disparado pela mudança de status, é suficiente — sem
-- precisar de tabela de transição.

CREATE OR REPLACE FUNCTION public.registrar_pagamento_os_no_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao_id    UUID;
  v_total_pago   DECIMAL(10,2);
  v_troco        DECIMAL(10,2);
  v_cash_sum     DECIMAL(10,2);
  v_cash_liquido DECIMAL(10,2);
  v_titulo_id    UUID;
BEGIN
  IF NEW.status <> 'entregue' OR OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo <> 'paga' OR NEW.total_orcamento <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_sessao_id
  FROM public.caixa_sessoes
  WHERE tenant_id = NEW.tenant_id AND status = 'aberto'
  LIMIT 1;

  IF v_sessao_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
  FROM public.os_pagamentos WHERE os_id = NEW.id;

  v_troco := GREATEST(0, v_total_pago - NEW.total_orcamento);

  SELECT COALESCE(SUM(op.valor), 0) INTO v_cash_sum
  FROM public.os_pagamentos op
  JOIN public.formas_pagamento fp ON fp.id = op.forma_pagamento_id
  WHERE op.os_id = NEW.id AND fp.entra_no_caixa = true;

  v_cash_liquido := GREATEST(0, v_cash_sum - v_troco);

  IF v_cash_liquido > 0 THEN
    SELECT id INTO v_titulo_id FROM public.titulos_financeiros WHERE os_id = NEW.id LIMIT 1;

    INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, titulo_id, usuario_id)
    VALUES (v_sessao_id, 'recebimento', 'OS ' || NEW.numero_os, v_cash_liquido, v_titulo_id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

-- AFTER (não precisa rodar antes de nada — só lê o que os outros gatilhos já
-- deixaram pronto, como o título gerado por gerar_titulo_ao_entregar).
CREATE TRIGGER lancar_pagamento_os_no_caixa
  AFTER UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_pagamento_os_no_caixa();


-- -----------------------------------------------------------------------------
-- 6. Devolução: só lança no Caixa se o reembolso saiu do dinheiro físico
-- -----------------------------------------------------------------------------
-- Achado ligado ao mesmo problema, na trava que a migration 20260817120000
-- criou: ela lançava a saída de QUALQUER devolução no Caixa, sem checar a
-- forma de pagamento. Estorno em cartão/PIX não tira nota nenhuma da gaveta
-- — sai por fora, então também não deveria mexer no saldo esperado da
-- conferência cega, pela mesma regra desta migration inteira.

CREATE OR REPLACE FUNCTION public.registrar_devolucao_no_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao_id UUID;
  v_entra_no_caixa BOOLEAN;
BEGIN
  IF NEW.valor_devolvido_cliente <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.forma_pagamento_id IS NOT NULL THEN
    SELECT entra_no_caixa INTO v_entra_no_caixa
    FROM public.formas_pagamento WHERE id = NEW.forma_pagamento_id;

    IF v_entra_no_caixa IS NOT TRUE THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT id INTO v_sessao_id
  FROM public.caixa_sessoes
  WHERE tenant_id = NEW.tenant_id AND status = 'aberto'
  LIMIT 1;

  IF v_sessao_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.caixa_movimentos (
    sessao_id, tipo, descricao, valor, forma_pagamento_id, devolucao_id, usuario_id
  ) VALUES (
    v_sessao_id,
    'devolucao',
    'Devolução ' || COALESCE(NEW.numero_devolucao, '')
      || CASE WHEN NEW.motivo IS NOT NULL AND NEW.motivo <> '' THEN ' — ' || NEW.motivo ELSE '' END,
    -NEW.valor_devolvido_cliente,
    NEW.forma_pagamento_id,
    NEW.id,
    NEW.usuario_id
  );

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 7. Resumo do dia por forma de pagamento (informativo, NÃO entra na
--    conferência cega — é só pra "Caixa deixar de ignorar o dinheiro do dia")
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vw_caixa_resumo_formas
WITH (security_barrier = true) AS
WITH pagamentos AS (
  SELECT pv.forma_pagamento_id, pv.valor, pv.created_at, v.tenant_id
  FROM public.pagamentos_venda pv
  JOIN public.vendas v ON v.id = pv.venda_id AND v.status = 'pago'
  UNION ALL
  SELECT op.forma_pagamento_id, op.valor, op.created_at, s.tenant_id
  FROM public.os_pagamentos op
  JOIN public.service_orders s ON s.id = op.os_id
)
SELECT
  cx.id AS sessao_id,
  fp.id AS forma_pagamento_id,
  fp.descricao AS forma_descricao,
  fp.entra_no_caixa,
  COALESCE(SUM(p.valor), 0) AS total
FROM public.caixa_sessoes cx
JOIN public.formas_pagamento fp
  ON fp.tenant_id = cx.tenant_id AND fp.ativo
LEFT JOIN pagamentos p
  ON p.forma_pagamento_id = fp.id
  AND p.tenant_id = cx.tenant_id
  AND p.created_at >= cx.aberto_em
  AND p.created_at <= COALESCE(cx.fechado_em, now())
WHERE cx.tenant_id = public.get_user_tenant_id(auth.uid())
GROUP BY cx.id, fp.id, fp.descricao, fp.entra_no_caixa, fp.ordem
ORDER BY fp.ordem;

COMMENT ON VIEW public.vw_caixa_resumo_formas IS
  'Quanto entrou em cada forma de pagamento (venda do PDV + OS entregue e paga) desde a abertura da sessão de caixa até agora (ou até o fechamento, se já fechada). Puramente informativo — diferente de caixa_movimentos, aqui entram TODAS as formas (inclusive PIX/cartão), porque o objetivo é mostrar o dia inteiro, não só o que afeta a gaveta física.';

GRANT SELECT ON public.vw_caixa_resumo_formas TO authenticated;

NOTIFY pgrst, 'reload schema';
