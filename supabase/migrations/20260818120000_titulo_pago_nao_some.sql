-- =============================================================================
-- Sisteminha (RP System.IO) — título que já movimentou dinheiro não some
-- =============================================================================
--
-- ACHADO NA REVISÃO DE 18/08: a tela de Contas a Pagar/Receber esconde os
-- botões certos (Cancelar só aparece em título 'aberto'; título 'pago' só
-- oferece Reabrir), mas isso é decoração — no banco as policies "Gerenciar
-- contas a pagar" e "Gerenciar contas a receber" são FOR ALL, então uma
-- chamada direta à API pode mudar um título 'pago' para 'cancelado'.
--
-- Por que isso é grave, em termos da loja: título cancelado sai do total
-- "Já pago/recebido" de Contas a Pagar/Receber e some do Fluxo de Caixa. Um
-- pagamento que ENTROU de verdade desapareceria do sistema sem deixar nenhum
-- indício na tela — o dinheiro está na gaveta e o sistema diz que nunca veio.
-- A auditoria (`audit_titulos`) registraria a mudança, mas auditoria é
-- detetive, não cadeado: mostra depois, não impede.
--
-- O mesmo buraco alcança DELETE, e é pior: apaga a linha inteira. O próprio
-- código já declara a intenção contrária — `useTitulos.ts` comenta "Cancela
-- em vez de excluir: título apagado some do histórico financeiro" — e
-- nenhuma tela do sistema apaga título (conferido: nenhum `.delete()` em
-- `titulos_financeiros` no front). A policy FOR ALL permitia assim mesmo.
--
-- CORREÇÃO EM DUAS PARTES:
--
-- 1. Gatilho que valida a MUDANÇA de status. Policy de RLS não serve aqui:
--    USING enxerga a linha antiga e WITH CHECK a nova, mas as duas são
--    avaliadas separadamente — não dá pra escrever "se ANTES era pago,
--    DEPOIS não pode ser cancelado" numa policy. Gatilho tem OLD e NEW
--    juntos, então é a ferramenta certa.
--
--    As transições permitidas são exatamente as três que a tela oferece
--    (conferido em `TitulosPage.tsx:299-330`):
--      aberto → pago      (dar baixa)
--      aberto → cancelado (cancelar título que ninguém pagou)
--      pago   → aberto    (desfazer baixa errada — fica visível como devendo)
--    Bloqueadas:
--      pago      → cancelado  (o achado: apaga o rastro do dinheiro)
--      cancelado → qualquer   ('cancelado' é estado final)
--    Alterar outros campos sem mexer no status continua livre.
--
--    Conferido antes de escrever: NENHUM gatilho ou função do banco faz
--    UPDATE em titulos_financeiros (o título nasce por INSERT, inclusive o
--    gerado ao entregar OS). Então esta trava não atrapalha automação
--    interna nenhuma.
--
-- 2. Tirar o DELETE das policies. Troca as duas FOR ALL por INSERT + UPDATE
--    explícitos — a RLS nega por padrão o que não tem policy, então apagar
--    título passa a ser impossível pela API. A leitura não é afetada: já
--    existe a policy dedicada "Ver titulos conforme a natureza", e policies
--    somam entre si.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validar_mudanca_status_titulo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Não mexeu no status: nada a validar (edição comum de descrição, valor,
  -- vencimento, categoria...).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'cancelado' THEN
    RAISE EXCEPTION
      'Este título está cancelado e não pode voltar atrás. Se o cancelamento foi engano, lance um título novo.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'pago' AND NEW.status = 'cancelado' THEN
    RAISE EXCEPTION
      'Este título já foi pago e não pode ser cancelado — isso apagaria o registro de que o dinheiro entrou ou saiu. Use "Reabrir" primeiro, se a baixa foi engano.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validar_mudanca_status_titulo() IS
  'Permite só as transições de status que a tela oferece: aberto→pago, aberto→cancelado e pago→aberto. Impede que um título já pago vire cancelado (sumiria dos totais sem indício) e que um cancelado seja ressuscitado.';

DROP TRIGGER IF EXISTS trg_status_titulo ON public.titulos_financeiros;
CREATE TRIGGER trg_status_titulo
  BEFORE UPDATE ON public.titulos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.validar_mudanca_status_titulo();

-- ---------------------------------------------------------------------------
-- Sem DELETE: título se cancela, não se apaga
-- ---------------------------------------------------------------------------

DROP POLICY "Gerenciar contas a pagar"   ON public.titulos_financeiros;
DROP POLICY "Gerenciar contas a receber" ON public.titulos_financeiros;

CREATE POLICY "Lancar conta a pagar"
  ON public.titulos_financeiros FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'pagar'
    AND public.has_permission(auth.uid(), 'finance.payable.manage')
  );

CREATE POLICY "Alterar conta a pagar"
  ON public.titulos_financeiros FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'pagar'
    AND public.has_permission(auth.uid(), 'finance.payable.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'pagar'
    AND public.has_permission(auth.uid(), 'finance.payable.manage')
  );

CREATE POLICY "Lancar conta a receber"
  ON public.titulos_financeiros FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'receber'
    AND public.has_permission(auth.uid(), 'finance.receivable.manage')
  );

CREATE POLICY "Alterar conta a receber"
  ON public.titulos_financeiros FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'receber'
    AND public.has_permission(auth.uid(), 'finance.receivable.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'receber'
    AND public.has_permission(auth.uid(), 'finance.receivable.manage')
  );

COMMENT ON TABLE public.titulos_financeiros IS
  'Contas a pagar e a receber. Título não se apaga: não existe policy de DELETE, de propósito — cancelar preserva o histórico, apagar sumiria com ele. A mudança de status é validada por trg_status_titulo.';

NOTIFY pgrst, 'reload schema';
