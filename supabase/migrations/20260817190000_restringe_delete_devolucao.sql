-- =============================================================================
-- Sisteminha (RP System.IO) — restringe DELETE de devolucao a registro órfão
-- =============================================================================
--
-- Achado na revisão completa de 18/08, continuação do mesmo problema da
-- migration 20260817160000: a policy "Quem cancela venda desfaz devolucao"
-- (criada em 20260817130000, pra permitir o rollback de uma devolução que
-- falhou no meio do registro) não tem NENHUMA restrição de idade ou estado
-- — qualquer devolução, de qualquer data, pode ser apagada por quem tem
-- `sales.cancel`, levando junto (CASCADE) o lançamento de caixa que ela
-- gerou. Isso é bem mais largo do que o caso que a policy foi criada pra
-- resolver.
--
-- O caso real de rollback (TrocaDevolucao.tsx) só acontece quando o INSERT
-- em `devolucoes` teve sucesso mas o INSERT seguinte em `devolucao_itens`
-- falhou — ou seja, o único cenário legítimo de DELETE é uma devolução SEM
-- NENHUM item associado. Uma devolução completa de verdade sempre tem pelo
-- menos 1 item (a tela não deixa salvar sem marcar item nenhum). Restringe
-- a policy a esse caso exato: só deixa apagar devolução órfã (0 itens).
-- =============================================================================

DROP POLICY "Quem cancela venda desfaz devolucao" ON public.devolucoes;

CREATE POLICY "Quem cancela venda desfaz devolucao orfa"
  ON public.devolucoes FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'sales.cancel')
    AND NOT EXISTS (
      SELECT 1 FROM public.devolucao_itens di WHERE di.devolucao_id = devolucoes.id
    )
  );

COMMENT ON TABLE public.devolucoes IS
  'DELETE restrito a devolução órfã (sem nenhum devolucao_itens) — é só o caso de rollback de um registro que falhou no meio (TrocaDevolucao.tsx). Uma devolução completa sempre tem pelo menos 1 item, então nunca pode ser apagada por aqui.';

NOTIFY pgrst, 'reload schema';
