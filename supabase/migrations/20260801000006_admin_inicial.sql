-- =============================================================================
-- RPG System.IO — Administrador inicial
-- =============================================================================
--
-- Garante o papel `administrador` a e-mails designados, resolvendo os dois
-- casos possíveis:
--
--   • a conta JÁ existe  → o papel é concedido agora, no fim desta migration;
--   • a conta AINDA não existe → o trigger `handle_new_user` concede assim que
--     ela for criada pelo painel do Supabase.
--
-- Sem isso haveria um impasse: só um administrador pode atribuir papéis, mas
-- não existe administrador antes do primeiro ser atribuído.
--
-- NENHUMA SENHA É DEFINIDA AQUI. Migration é código versionado — senha em
-- migration vira senha no Git. A senha é definida no painel do Supabase
-- (Authentication → Users), onde só o dono da conta a vê.
-- =============================================================================


-- =============================================================================
-- 1. LISTA DE BOOTSTRAP
-- =============================================================================
-- Uma tabela em vez de e-mail solto dentro da função: dá para consultar quem
-- está na lista, adicionar um segundo administrador se você perder o acesso, e
-- remover a entrada quando o time estiver montado.

CREATE TABLE public.bootstrap_administradores (
  email      TEXT PRIMARY KEY,
  motivo     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bootstrap_administradores IS
  'E-mails que recebem `administrador` automaticamente ao entrar no sistema. Mantenha curta e revise periodicamente.';

-- RLS ligado e SEM nenhuma policy: a tabela não é acessível pela API.
-- Só o trigger (SECURITY DEFINER) a enxerga. Se fosse legível, entregaria de
-- graça quais contas valem a pena atacar.
ALTER TABLE public.bootstrap_administradores ENABLE ROW LEVEL SECURITY;

INSERT INTO public.bootstrap_administradores (email, motivo) VALUES
  ('felipebottaro@gmail.com', 'Fundador — administrador inicial do sistema')
ON CONFLICT (email) DO NOTHING;


-- =============================================================================
-- 2. PROVISIONAMENTO ATUALIZADO
-- =============================================================================
-- Substitui a versão da migration 20260801000002, acrescentando a checagem da
-- lista de bootstrap. O resto do comportamento é idêntico.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    UUID;
  v_total_papeis INTEGER;
  v_e_bootstrap  BOOLEAN;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at LIMIT 1;

  INSERT INTO public.profiles (id, tenant_id, nome, email)
  VALUES (
    NEW.id,
    v_tenant_id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nome', ''), split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  -- Comparação sem diferenciar maiúsculas: e-mail não é case-sensitive na
  -- parte do domínio, e ninguém lembra como digitou no cadastro.
  SELECT EXISTS (
    SELECT 1 FROM public.bootstrap_administradores b
    WHERE lower(b.email) = lower(NEW.email)
  ) INTO v_e_bootstrap;

  SELECT COUNT(*) INTO v_total_papeis FROM public.user_roles;

  -- Administrador se: está na lista de bootstrap, OU é o primeiro usuário do
  -- sistema (senão ninguém conseguiria atribuir o primeiro papel).
  -- Fora esses dois casos, o usuário nasce SEM papel e um administrador define.
  IF v_e_bootstrap OR v_total_papeis = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrador')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


-- =============================================================================
-- 3. CONTAS QUE JÁ EXISTEM
-- =============================================================================
-- O trigger só dispara em contas novas. Se a conta já foi criada antes desta
-- migration, o papel é concedido aqui.

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'administrador'
FROM auth.users u
JOIN public.bootstrap_administradores b ON lower(b.email) = lower(u.email)
ON CONFLICT (user_id, role) DO NOTHING;

-- E garante que essas contas tenham profile e tenant, caso tenham sido criadas
-- pelo painel do Supabase antes de o trigger existir.
INSERT INTO public.profiles (id, tenant_id, nome, email)
SELECT
  u.id,
  (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1),
  COALESCE(NULLIF(u.raw_user_meta_data->>'nome', ''), split_part(u.email, '@', 1)),
  u.email
FROM auth.users u
JOIN public.bootstrap_administradores b ON lower(b.email) = lower(u.email)
ON CONFLICT (id) DO NOTHING;
