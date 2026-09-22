-- =============================================================================
-- A loja passa a cadastrar as próprias metas, e cada vendedor ganha a dele
-- =============================================================================
--
-- Como era até aqui: a meta da loja (Bronze/Prata/Ouro/Diamante) só existia
-- porque foi semeada dentro de uma migration em 06/08. A tabela tinha policy
-- de LEITURA e mais nada — ou seja, ninguém no sistema conseguia cadastrar,
-- corrigir ou apagar meta nenhuma pela tela. Quando 2027 chegasse, o painel
-- ia mostrar "meta deste mês ainda não foi cadastrada" para sempre.
--
-- E a meta individual não existia: o painel dividia a meta da loja pelo número
-- de gente que vendeu no mês e chamava de "estimativa". Isso não é a meta de
-- ninguém — é uma conta de padaria que muda sozinha quando alguém entra de
-- férias.
--
-- O que esta migration faz, por ordem do Felipe em 22/09:
--
--   1. Cria a permissão "cadastrar metas" (`dashboards.goals.manage`) e dá a
--      administrador e gerente — são eles que definem meta.
--   2. Abre gravação em `metas_faturamento` para quem tem essa permissão.
--   3. Cria `metas_vendedor`: a meta de cada pessoa, por mês.
--
-- Quem NÃO tem a permissão continua só olhando, e o vendedor enxerga a própria
-- meta mesmo sem enxergar a dos colegas — a régua dele não é segredo, a dos
-- outros não é da conta dele.
--
-- A meta continua sendo cadastrada por MÊS. A apuração quinzenal que a loja usa
-- na premiação é mostrada na tela dividindo o mês em duas metades (dias 1 a 15 e
-- 16 ao fim) — não vira cadastro separado, para não ter dois lugares dizendo a
-- mesma coisa e divergindo.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A permissão nova
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (key, modulo, descricao) VALUES
  ('dashboards.goals.manage', 'Dashboards', 'Cadastrar e alterar as metas da loja e dos vendedores')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('administrador', 'dashboards.goals.manage'),
  ('gerente',       'dashboards.goals.manage')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Gravação nas metas da loja
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `WITH CHECK` no INSERT e no UPDATE garante que ninguém grave meta numa loja
-- que não é a sua — o `tenant_id` vem sempre de quem está logado, não do que a
-- tela mandou.

CREATE POLICY "Cadastrar meta da loja"
  ON public.metas_faturamento FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'dashboards.goals.manage')
  );

CREATE POLICY "Alterar meta da loja"
  ON public.metas_faturamento FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'dashboards.goals.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'dashboards.goals.manage')
  );

CREATE POLICY "Apagar meta da loja"
  ON public.metas_faturamento FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'dashboards.goals.manage')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A meta de cada vendedor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.metas_vendedor (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ano         INTEGER NOT NULL,
  mes         INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_meta  DECIMAL(12,2) NOT NULL CHECK (valor_meta >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Uma meta por pessoa por mês: sem isso, dois cadastros da mesma pessoa no
  -- mesmo mês fariam o painel escolher um deles sem critério.
  UNIQUE (tenant_id, user_id, ano, mes)
);

COMMENT ON TABLE public.metas_vendedor IS
  'Meta individual de faturamento, por pessoa e por mês. Cadastrada por administrador ou gerente (dashboards.goals.manage). Cada pessoa enxerga a própria; quem tem dashboards.goals.view enxerga todas.';

CREATE INDEX idx_metas_vendedor_periodo ON public.metas_vendedor(tenant_id, ano, mes);

CREATE TRIGGER update_metas_vendedor_updated_at
  BEFORE UPDATE ON public.metas_vendedor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.metas_vendedor ENABLE ROW LEVEL SECURITY;

-- Leitura: a própria meta sempre; a dos outros só com dashboards.goals.view.
CREATE POLICY "Ver metas de vendedor da loja"
  ON public.metas_vendedor FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      user_id = auth.uid()
      OR public.has_permission(auth.uid(), 'dashboards.goals.view')
    )
  );

CREATE POLICY "Cadastrar meta de vendedor"
  ON public.metas_vendedor FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'dashboards.goals.manage')
  );

CREATE POLICY "Alterar meta de vendedor"
  ON public.metas_vendedor FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'dashboards.goals.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'dashboards.goals.manage')
  );

CREATE POLICY "Apagar meta de vendedor"
  ON public.metas_vendedor FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'dashboards.goals.manage')
  );

-- A regra das portas fechadas (14/09): o `anon` não tem nada em `public`, e
-- tabela nova nasce com os privilégios do padrão de fábrica se ninguém mexer.
REVOKE ALL ON public.metas_vendedor FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_vendedor TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Conferência — a migration derruba a si mesma se algo saiu torto
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Policy sem `TO authenticated` vale para `public`, que inclui quem não fez
  -- login. Já aconteceu antes; por isso a conferência ficou.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('metas_vendedor', 'metas_faturamento')
      AND roles::text NOT LIKE '%authenticated%'
  ) THEN
    RAISE EXCEPTION 'Policy de meta aberta para quem não fez login';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = 'administrador' AND permission_key = 'dashboards.goals.manage'
  ) THEN
    RAISE EXCEPTION 'O administrador ficou sem a permissão de cadastrar metas';
  END IF;
END $$;
