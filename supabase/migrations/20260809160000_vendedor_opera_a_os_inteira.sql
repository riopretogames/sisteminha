-- =============================================================================
-- Sisteminha (RP System.IO) — O vendedor opera a OS inteira
-- =============================================================================
--
-- DESFAZ A MIGRATION 20260809150000, aplicada hoje mais cedo.
--
-- Naquela, o Felipe tinha dito "o vendedor apenas pode marcar como entregue", e
-- eu criei uma permissão só para o ato da entrega, com gatilho impedindo o
-- resto. Ele revisou a regra na sequência, e o motivo é melhor que o meu
-- desenho:
--
--   "o vendedor cria OS, aprova OS e finaliza OS, também adiciona serviço, faz
--    tudo. Não compensa deixar nada travado, pois o vendedor é quem tem contato
--    com o cliente, o técnico não tem."
--
-- É a operação real de uma loja pequena: quem atende o balcão é quem fala com o
-- dono do aparelho, negocia o orçamento e fecha. Um sistema que obriga a chamar
-- o técnico para clicar em "aprovado" não protege nada — só ensina a equipe a
-- compartilhar login, que é bem pior do que a permissão que se queria proteger.
--
-- Some, portanto: a permissão `orders.deliver`, o gatilho que a acompanhava e a
-- policy afrouxada. Tudo nasceu e morreu no mesmo dia, sem nunca ter sido usado
-- na operação — trocar por algo mais simples agora é mais barato do que manter
-- uma trava que ninguém pediu.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O VENDEDOR PASSA A OPERAR A OS
-- -----------------------------------------------------------------------------
-- `orders.edit` cobre mudar etapa, lançar peça e serviço, e mexer no orçamento.
-- `orders.approve` é a permissão dedicada de aprovar orçamento — que, aliás,
-- continua sem ser conferida por nenhuma tela (item aberto do plano).

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('vendedor', 'orders.edit'),
  ('vendedor', 'orders.approve')
ON CONFLICT DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. SAI A TRAVA DE ENTREGA
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_limitar_alteracao_os ON public.service_orders;
DROP FUNCTION IF EXISTS public.limitar_alteracao_de_os();

DROP POLICY IF EXISTS "Quem edita OS atualiza" ON public.service_orders;

CREATE POLICY "Quem edita OS atualiza"
  ON public.service_orders FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'orders.edit')
  );

-- A permissão sai do catálogo: sem gatilho e sem policy que a use, ela viraria
-- exatamente o tipo de configuração decorativa que este projeto vem tirando do
-- caminho — aparece na tela de perfis, alguém marca, e não faz nada.
DELETE FROM public.role_permissions WHERE permission_key = 'orders.deliver';
DELETE FROM public.permissions     WHERE key            = 'orders.deliver';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- 1) O vendedor consegue operar a OS?
--    SELECT permission_key FROM public.role_permissions
--     WHERE role = 'vendedor' AND permission_key LIKE 'orders.%'
--     ORDER BY permission_key;
--    -- esperado: orders.approve, orders.create, orders.edit, orders.view
--
-- 2) A permissão de entrega sumiu?
--    SELECT count(*) FROM public.permissions WHERE key = 'orders.deliver';
--    -- esperado: 0
-- =============================================================================
