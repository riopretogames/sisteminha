-- =============================================================================
-- Sisteminha (RP System.IO) — trava sessão de caixa fechada e audita movimento
-- =============================================================================
--
-- Achado na revisão completa de 18/08: a policy "Operar o caixa" (FOR ALL em
-- caixa_sessoes) permite UPDATE e DELETE em QUALQUER sessão, aberta ou
-- fechada, sem distinção nenhuma. Na prática isso significa que, depois do
-- caixa fechado e a diferença já apurada, dá pra editar o valor contado (ou
-- qualquer outro campo, inclusive apagar a sessão inteira) — exatamente o
-- tipo de alteração que devia ser impossível, não só registrada. Isso muda o
-- resultado de "bateu"/"não bateu" depois do fato.
--
-- A tabela já tem gatilho de auditoria (`audit_caixa_sessoes`), mas
-- auditoria é detetive, não cadeado: ela mostra quem mexeu DEPOIS, não
-- impede a alteração. Confirmado no código (FinanceiroCaixa.tsx) que a
-- única alteração legítima em caixa_sessoes é a própria transição
-- aberto → fechado (a função `fechar`); não existe nenhum fluxo no sistema
-- que apague uma sessão. Então a correção certa é duas partes:
--
-- 1. Trocar a policy única por INSERT (livre, é a abertura) + UPDATE
--    restrito a sessão que EXISTE como 'aberto' no momento da alteração
--    (permite a transição aberto→fechado, bloqueia qualquer update depois
--    disso). Sem policy de DELETE nenhuma — RLS nega por padrão o que não
--    tem policy, então apagar sessão de caixa passa a ser impossível pela
--    API, ponto.
--
-- 2. `caixa_movimentos` (as entradas/saídas de dentro do caixa: sangria,
--    suprimento, pagamento, recebimento, devolução) é a única tabela
--    financeira do sistema sem gatilho de auditoria nenhum — mesmo sem
--    policy de UPDATE/DELETE hoje (só existe INSERT e SELECT, então já não
--    dá pra alterar por aqui), fica sem registro de auditoria se um dia
--    alguém abrir uma policy de UPDATE/DELETE por engano. Fecha essa
--    lacuna agora, com uma função de auditoria própria — a genérica
--    (`registrar_auditoria`) não serve aqui porque `caixa_movimentos` não
--    tem coluna `tenant_id` direta (só tem via `sessao_id`), e a genérica
--    leria NULL de tenant (mesmo problema documentado do `user_roles`).
-- =============================================================================

DROP POLICY "Operar o caixa" ON public.caixa_sessoes;

CREATE POLICY "Abrir caixa"
  ON public.caixa_sessoes FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'finance.cashier.close')
  );

-- USING é avaliado contra o estado ATUAL da linha (antes da alteração) — por
-- isso `status = 'aberto'` aqui permite a transição aberto→fechado (a linha
-- ainda está 'aberto' no momento em que a policy é checada) e bloqueia
-- qualquer tentativa de update numa sessão que já esteja 'fechado'.
CREATE POLICY "Fechar caixa aberto"
  ON public.caixa_sessoes FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND status = 'aberto'
    AND public.has_permission(auth.uid(), 'finance.cashier.close')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'finance.cashier.close')
  );

COMMENT ON TABLE public.caixa_sessoes IS
  'Sessão de caixa (abertura/fechamento do dia). Só existe INSERT (abrir) e UPDATE restrito a sessão ainda aberta (fechar) — sem policy de DELETE, então apagar sessão de caixa é bloqueado pela API. Depois de fechada, nenhuma alteração passa pela RLS.';

-- ---------------------------------------------------------------------------
-- Auditoria própria de caixa_movimentos (deriva tenant via sessao_id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_auditoria_caixa_movimentos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes  JSONB;
  v_depois JSONB;
  v_tenant UUID;
  v_id     UUID;
  v_sessao UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_antes := to_jsonb(OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_depois := to_jsonb(NEW);
  END IF;

  v_id     := COALESCE(v_depois ->> 'id',        v_antes ->> 'id')::UUID;
  v_sessao := COALESCE(v_depois ->> 'sessao_id',  v_antes ->> 'sessao_id')::UUID;

  SELECT tenant_id INTO v_tenant
  FROM public.caixa_sessoes
  WHERE id = v_sessao;

  INSERT INTO public.auditoria (tenant_id, usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  VALUES (v_tenant, auth.uid(), TG_OP, TG_TABLE_NAME, v_id, v_antes, v_depois);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_caixa_movimentos
  AFTER INSERT OR UPDATE OR DELETE ON public.caixa_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_caixa_movimentos();

NOTIFY pgrst, 'reload schema';
