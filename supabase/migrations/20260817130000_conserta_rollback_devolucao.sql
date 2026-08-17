-- =============================================================================
-- Sisteminha (RP System.IO) — conserta o rollback de troca/devolução com falha
-- =============================================================================
--
-- Achado na revisão adversarial de 17/08, ao conferir a migration
-- 20260817120000 (gatilho `registrar_devolucao_no_caixa`) junto com o código
-- de TrocaDevolucao.tsx. Dois problemas, os dois de RLS/FK — não do React:
--
-- 1. `devolucoes` nunca teve policy de DELETE. TrocaDevolucao.tsx tenta
--    desfazer o registro quando o insert de `devolucao_itens` falha DEPOIS
--    que `devolucoes` já tinha sido gravada com sucesso
--    (`supabase.from('devolucoes').delete().eq('id', devolucao.id)`), com o
--    comentário "não tem efeito colateral próprio, só a numeração gerada".
--    Sem policy de DELETE, esse delete roda sem erro nenhum (RLS filtra a
--    linha fora da visão de DELETE quando não existe policy pra ela) mas
--    afeta ZERO linhas — o registro incompleto (sem nenhum item associado)
--    ficava pra trás pra sempre.
--
-- 2. Pior: desde que o gatilho de Caixa passou a existir (20260817120000),
--    se a devolução tinha `valor_devolvido_cliente > 0` e existia caixa
--    aberto no momento, o INSERT em `devolucoes` já tinha lançado a saída
--    no Caixa ANTES do insert de itens falhar. Como o "delete" de
--    compensação não fazia nada (item 1), essa saída ficava lançada pra
--    sempre, sem devolução nenhuma por trás — e se o usuário tentasse de
--    novo (o fluxo normal depois de um erro), o dinheiro saía do Caixa DUAS
--    vezes pra uma devolução só.
--
-- Correção: cria a policy de DELETE que faltava (mesmo gate de permissão do
-- INSERT, `sales.cancel`) e troca o `ON DELETE SET NULL` de
-- `caixa_movimentos.devolucao_id` por `CASCADE`. As duas resolvem o
-- problema junto: o manual do Postgres garante que checagem de integridade
-- referencial (FK, inclusive ações CASCADE) sempre ignora RLS — então,
-- assim que a policy nova permitir apagar a devolução, o CASCADE remove o
-- movimento de Caixa órfão junto, automaticamente.
-- =============================================================================

CREATE POLICY "Quem cancela venda desfaz devolucao"
  ON public.devolucoes FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'sales.cancel')
  );

ALTER TABLE public.caixa_movimentos
  DROP CONSTRAINT caixa_movimentos_devolucao_id_fkey;

ALTER TABLE public.caixa_movimentos
  ADD CONSTRAINT caixa_movimentos_devolucao_id_fkey
  FOREIGN KEY (devolucao_id) REFERENCES public.devolucoes(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.caixa_movimentos.devolucao_id IS
  'Preenchido só nos movimentos gerados automaticamente pelo gatilho de devolução. NULL em todo movimento manual (sangria, suprimento, pagamento, recebimento). CASCADE (não SET NULL): se a devolução em si for desfeita (rollback de uma troca que falhou no meio do registro), o movimento de Caixa que ela gerou desaparece junto — não fica saída de dinheiro órfã, sem devolução nenhuma por trás.';

NOTIFY pgrst, 'reload schema';
