-- =============================================================================
-- RPG System.IO — Exceções de permissão por usuário
-- =============================================================================
--
-- Até aqui, permissão vinha só do perfil: mudou "Vendedor", mudou para todos os
-- vendedores. Isso resolve 90% dos casos e é o que se deve usar por padrão.
--
-- Os outros 10% são reais numa loja: "o Pedro pode dar desconto, os demais
-- vendedores não". Criar um perfil "Vendedor Sênior" só por causa de uma
-- permissão multiplica perfis até ninguém mais saber a diferença entre eles.
--
-- A solução é uma EXCEÇÃO explícita e visível, por pessoa, sobre o perfil:
--
--     permissão efetiva = exceção do usuário, se existir
--                         senão, o que o perfil concede
--
-- Regra de uso: exceção é exceção. Se você está criando a mesma exceção para
-- três pessoas, o que falta é um perfil novo — não mais exceções.
-- =============================================================================


-- =============================================================================
-- 1. TABELA DE EXCEÇÕES
-- =============================================================================

CREATE TABLE public.user_permissions (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  -- true  = concede ALÉM do que o perfil dá
  -- false = REMOVE algo que o perfil daria
  concedida      BOOLEAN NOT NULL,
  motivo         TEXT,
  definida_por   UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);

COMMENT ON TABLE public.user_permissions IS
  'Exceções de permissão por pessoa, sobre o que o perfil concede. Use com parcimônia — o padrão é o perfil.';
COMMENT ON COLUMN public.user_permissions.concedida IS
  'true concede além do perfil; false tira algo que o perfil daria. Ausência de linha = segue o perfil.';

CREATE INDEX idx_user_permissions_user ON public.user_permissions(user_id);


-- =============================================================================
-- 2. has_permission COM EXCEÇÕES E TRAVA DE USUÁRIO INATIVO
-- =============================================================================
-- Substitui a versão da migration 20260801000002. Toda policy de RLS do sistema
-- passa por aqui, então mudar esta função muda o acesso no banco inteiro — que
-- é exatamente a intenção de ter um ponto único.

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Usuário desativado não tem permissão nenhuma, qualquer que seja o perfil.
    -- Desligou alguém? Basta desmarcar "Ativo" — não precisa mexer em papel,
    -- nem apagar a conta, nem perder o histórico do que a pessoa fez.
    WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND p.ativo
    ) THEN false

    ELSE COALESCE(
      -- 1º) exceção explícita para esta pessoa, se houver
      (
        SELECT up.concedida
        FROM public.user_permissions up
        WHERE up.user_id = _user_id
          AND up.permission_key = _permission
      ),
      -- 2º) senão, o que o perfil concede
      EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role = ur.role
        WHERE ur.user_id = _user_id
          AND rp.permission_key = _permission
      )
    )
  END
$$;


-- =============================================================================
-- 3. PERMISSÕES EFETIVAS DO USUÁRIO LOGADO
-- =============================================================================
-- O front precisa saber o que a pessoa pode, para montar menu e esconder botão.
-- Antes ele lia `role_permissions` direto — o que agora daria resposta errada,
-- porque ignoraria exceções e usuário inativo.
--
-- Esta função devolve o resultado JÁ RESOLVIDO, usando a mesma has_permission
-- que o RLS usa. Front e banco não têm como divergir.

CREATE OR REPLACE FUNCTION public.minhas_permissoes()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.key
  FROM public.permissions p
  WHERE public.has_permission(auth.uid(), p.key)
$$;

COMMENT ON FUNCTION public.minhas_permissoes IS
  'Permissões efetivas do usuário logado (perfil + exceções, respeitando ativo). É o que o front consome.';


-- =============================================================================
-- 4. RLS
-- =============================================================================

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Cada um enxerga as próprias exceções (o front precisa para exibir o porquê
-- de um botão estar liberado ou não).
CREATE POLICY "Ver as proprias excecoes"
  ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Quem gerencia perfis vê e edita as de todo mundo do mesmo tenant.
CREATE POLICY "Quem gerencia perfis administra excecoes"
  ON public.user_permissions FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'roles.manage')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_id
        AND p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'roles.manage')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_id
        AND p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  );

-- Para a tela de Usuários listar os papéis de todo mundo, e não só os próprios.
CREATE POLICY "Quem gerencia usuarios ve todos os papeis"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'users.view')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_id
        AND p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  );
