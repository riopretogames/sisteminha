-- =============================================================================
-- DEVOLUÇÃO TAMBÉM É VENDA — só quem pode ver venda vê devolução
-- =============================================================================
--
-- Rabo do achado "o que só a tela escondia" (auditoria de 15/09). A migration
-- 20260915110000 fechou a leitura de vendas, itens e pagamentos exigindo
-- permissão — e itens/pagamentos fecharam junto porque a regra deles passa
-- pela venda. Ficou faltando a devolução: a regra de leitura dela só perguntava
-- "é da mesma loja?", então um técnico (que não vê venda) ainda lia todas as
-- trocas e devoluções — com o valor devolvido ao cliente e o que ele pagou a
-- mais. Provado no banco em 15/09: com as três migrations aplicadas, o técnico
-- lia vendas=0, itens=0, pagamentos=0, mas devoluções=4.
--
-- A devolução é informação de venda: quem a lê é quem lê venda. Os itens da
-- devolução já passam pela devolução (a regra deles faz EXISTS na devolucoes),
-- então fecham junto; mesmo assim a gente amarra explícito, para a intenção
-- ficar escrita e não depender de ninguém lembrar da cadeia.
-- =============================================================================

ALTER POLICY "Ver devolucoes do tenant" ON public.devolucoes
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'sales.view')
      OR public.has_permission(auth.uid(), 'sales.create')
      OR public.has_permission(auth.uid(), 'sales.cancel')
      OR public.has_permission(auth.uid(), 'dashboards.sales.view')
      OR public.has_permission(auth.uid(), 'finance.view')
      OR public.has_permission(auth.uid(), 'finance.cashflow.view')
      OR public.has_permission(auth.uid(), 'reports.view')
      OR public.has_permission(auth.uid(), 'audit.view')
    )
  );

ALTER POLICY "Ver itens de devolucao do tenant" ON public.devolucao_itens
  USING (
    EXISTS (
      SELECT 1 FROM public.devolucoes d
      WHERE d.id = devolucao_itens.devolucao_id
        AND d.tenant_id = public.get_user_tenant_id(auth.uid())
        AND (
          public.has_permission(auth.uid(), 'sales.view')
          OR public.has_permission(auth.uid(), 'sales.create')
          OR public.has_permission(auth.uid(), 'sales.cancel')
          OR public.has_permission(auth.uid(), 'dashboards.sales.view')
          OR public.has_permission(auth.uid(), 'finance.view')
          OR public.has_permission(auth.uid(), 'finance.cashflow.view')
          OR public.has_permission(auth.uid(), 'reports.view')
          OR public.has_permission(auth.uid(), 'audit.view')
        )
    )
  );

-- -----------------------------------------------------------------------------
-- CONFERE (estrutural — nada de SET ROLE dentro de migration: ele vaza para o
-- INSERT de registro do `supabase db push` e derruba tudo com "permission
-- denied for schema supabase_migrations". Custou uma reversão em 15/09.)
-- -----------------------------------------------------------------------------
DO $verifica$
DECLARE v_txt TEXT;
BEGIN
  SELECT qual INTO v_txt FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'devolucoes' AND policyname = 'Ver devolucoes do tenant';
  IF v_txt IS NULL OR v_txt NOT LIKE '%has_permission%' THEN
    RAISE EXCEPTION 'a leitura de devoluções não passou a exigir permissão';
  END IF;

  SELECT qual INTO v_txt FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'devolucao_itens' AND policyname = 'Ver itens de devolucao do tenant';
  IF v_txt IS NULL OR v_txt NOT LIKE '%has_permission%' THEN
    RAISE EXCEPTION 'a leitura dos itens de devolução não passou a exigir permissão';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
