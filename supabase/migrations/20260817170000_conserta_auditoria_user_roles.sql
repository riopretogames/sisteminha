-- =============================================================================
-- Sisteminha (RP System.IO) — conserta auditoria de troca de perfil de usuário
-- =============================================================================
--
-- Achado na revisão completa de 18/08: a tela Logs/Auditoria já espera
-- (TABELA_LABEL) mostrar troca de perfil de usuário ("user_roles"), e o
-- gatilho `audit_user_roles` (migration 20260801000005) já grava uma linha
-- toda vez que alguém ganha ou perde um cargo. O problema é que NADA disso
-- aparece pra ninguém: `user_roles` não tem coluna `tenant_id` (só
-- `user_id` e `role`), então a função genérica `registrar_auditoria` grava
-- `tenant_id = NULL` pra toda troca de perfil — e a policy de leitura
-- ("Ver auditoria") exige `tenant_id = get_user_tenant_id(auth.uid())`, uma
-- comparação que nunca é verdadeira contra NULL. Resultado: linha gravada,
-- porém invisível pra sempre, pra qualquer usuário, mesmo dono da loja.
--
-- Correção: `user_roles` não precisa de coluna própria de tenant_id — o
-- sistema já é "um login = um tenant só" (é assim que `get_user_tenant_id`
-- funciona, lendo de `profiles`), então o tenant de uma troca de perfil é
-- sempre o tenant do usuário afetado (`profiles.tenant_id` de `user_id`).
-- Uma função de auditoria própria pra essa tabela, no mesmo molde da que a
-- migration 20260817160000 criou pra `caixa_movimentos` (deriva o tenant por
-- fora em vez de ler direto da linha), resolve sem precisar mexer no
-- desenho da tabela. E a re-gravação (UPDATE ... SET tenant_id = ...) no
-- final conserta o histórico já perdido, não só as trocas daqui pra frente.
-- =============================================================================

DROP TRIGGER audit_user_roles ON public.user_roles;

CREATE OR REPLACE FUNCTION public.registrar_auditoria_user_roles()
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
  v_user   UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_antes := to_jsonb(OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_depois := to_jsonb(NEW);
  END IF;

  v_id   := COALESCE(v_depois ->> 'id',      v_antes ->> 'id')::UUID;
  v_user := COALESCE(v_depois ->> 'user_id', v_antes ->> 'user_id')::UUID;

  SELECT tenant_id INTO v_tenant
  FROM public.profiles
  WHERE id = v_user;

  INSERT INTO public.auditoria (tenant_id, usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  VALUES (v_tenant, auth.uid(), TG_OP, TG_TABLE_NAME, v_id, v_antes, v_depois);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_user_roles();

-- Conserta o histórico: toda linha de auditoria de user_roles gravada antes
-- desta correção tem tenant_id NULL e ficou invisível. Recalcula a partir do
-- user_id salvo em dados_depois (INSERT/UPDATE) ou dados_antes (DELETE).
UPDATE public.auditoria a
SET tenant_id = p.tenant_id
FROM public.profiles p
WHERE a.tabela = 'user_roles'
  AND a.tenant_id IS NULL
  AND p.id = COALESCE(
    (a.dados_depois ->> 'user_id')::UUID,
    (a.dados_antes  ->> 'user_id')::UUID
  );

NOTIFY pgrst, 'reload schema';
