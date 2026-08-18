-- =============================================================================
-- Sisteminha (RP System.IO) — trava de verdade nos itens de OS
-- =============================================================================
--
-- Dois achados da revisão técnica, confirmados ainda válidos em 17/08,
-- ambos sobre `service_order_items`:
--
-- 1. "Peça não pode ser excluída" só existia na tela (OSDetalhe.tsx só
--    mostra o botão Excluir pra item sem produto_id — serviço avulso).
--    A policy do banco era uma única "FOR ALL" com `orders.edit`, cobrindo
--    SELECT/INSERT/UPDATE/DELETE igual — quem tem orders.edit conseguia
--    excluir uma peça via API direta e reverter a baixa de estoque sem
--    deixar rastro (o gatilho de baixa só cobre INSERT, não DELETE).
--
-- 2. "É possível lançar peça (com baixa real de estoque) numa OS já
--    cancelada — só 'entregue' bloqueia hoje." Conferido: nem
--    "entregue" bloqueia de verdade no banco — `OSDetalhe.tsx` só
--    esconde o botão "Adicionar item" quando `jaFoiEntregue`
--    (client-side); `baixar_estoque_os()` (migration 20260805090000)
--    nunca olha o status da OS. Ou seja, o gap real é mais amplo que o
--    achado original: nenhuma das duas etapas encerradas (entregue OU
--    cancelada) trava lançamento de item no banco, só na tela.
--
-- Correção:
-- 1. A policy "FOR ALL" vira 4 policies (SELECT/INSERT/UPDATE iguais à
--    antiga; DELETE ganha `AND produto_id IS NULL` — só item sem peça
--    vinculada pode ser excluído).
-- 2. Gatilho novo `impedir_item_em_os_encerrada`, BEFORE INSERT em
--    `service_order_items`: recusa lançar qualquer item (peça ou
--    serviço) numa OS com status 'entregue' ou 'cancelado'. Dispara
--    ANTES do gatilho de baixa de estoque (BEFORE roda antes de AFTER),
--    então uma OS encerrada nunca chega a descontar estoque por um
--    lançamento novo.
-- =============================================================================

DROP POLICY IF EXISTS "Quem edita OS gerencia itens" ON public.service_order_items;

CREATE POLICY "Quem edita OS le itens"
  ON public.service_order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = os_id
        AND so.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'orders.edit')
  );

CREATE POLICY "Quem edita OS lanca itens"
  ON public.service_order_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = os_id
        AND so.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'orders.edit')
  );

-- Sem tela usando UPDATE hoje ("item já lançado não tem edição", só
-- exclusão — comentário de OSDetalhe.tsx), mas mantém a policy por
-- paridade, mesma regra de antes.
CREATE POLICY "Quem edita OS atualiza itens"
  ON public.service_order_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = os_id
        AND so.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'orders.edit')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = os_id
        AND so.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'orders.edit')
  );

CREATE POLICY "Quem edita OS exclui item sem peca"
  ON public.service_order_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = os_id
        AND so.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'orders.edit')
    AND produto_id IS NULL
  );

COMMENT ON POLICY "Quem edita OS exclui item sem peca" ON public.service_order_items IS
  'Só item SEM peça vinculada (produto_id nulo, ou seja, serviço avulso) pode ser excluído. Excluir item de peça reverteria a baixa de estoque sem deixar rastro nenhum — o caminho pra corrigir lançamento errado de peça é o ajuste manual de estoque, que é auditado.';

-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.impedir_item_em_os_encerrada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public.service_orders
  WHERE id = NEW.os_id;

  IF v_status IN ('entregue', 'cancelado') THEN
    RAISE EXCEPTION 'Não é possível lançar item numa OS já %.', v_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.impedir_item_em_os_encerrada() IS
  'Recusa INSERT em service_order_items quando a OS já está entregue ou cancelada -- fecha no banco o que OSDetalhe.tsx já escondia só na tela (jaFoiEntregue). Roda antes de baixar_estoque_os (BEFORE vs AFTER), então uma OS encerrada nunca desconta estoque por lançamento novo.';

CREATE TRIGGER impedir_item_em_os_encerrada
  BEFORE INSERT ON public.service_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_item_em_os_encerrada();

NOTIFY pgrst, 'reload schema';
