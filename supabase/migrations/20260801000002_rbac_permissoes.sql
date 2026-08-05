-- =============================================================================
-- RPG System.IO — Etapa 2/2 da reforma de perfis de acesso
-- =============================================================================
--
-- O que este arquivo corrige, em ordem de gravidade:
--
-- 1. Qualquer usuário autenticado podia criar tenants
--    (policy "Users can create their own tenant" WITH CHECK (true)).
--
-- 2. O cadastro de usuário atribuía o papel de admin pelo client (useAuth.tsx),
--    mas a policy de user_roles exigia que quem insere JÁ fosse admin. O insert
--    falhava em silêncio e o usuário ficava sem papel nenhum — e o front tratava
--    "nenhum papel" como admin. Agora profile e papel nascem de um trigger no
--    banco, onde o client não tem voz.
--
-- 3. Permissão era verificada por papel espalhado pelas policies
--    (has_role(uid,'admin')). Passa a ser verificada por PERMISSÃO NOMEADA
--    via has_permission(uid,'chave'), com o mapa papel→permissão centralizado
--    em role_permissions. Trocar o que um Vendedor pode fazer vira UPDATE numa
--    tabela, não migration de policy.
--
-- Papéis definitivos: administrador, gerente, gerente_tecnico, vendedor, tecnico
-- =============================================================================


-- =============================================================================
-- 1. MIGRAÇÃO DOS PAPÉIS EXISTENTES
-- =============================================================================

UPDATE public.user_roles SET role = 'administrador' WHERE role::text = 'admin';
UPDATE public.user_roles SET role = 'vendedor'      WHERE role::text = 'atendente';


-- =============================================================================
-- 2. CATÁLOGO DE PERMISSÕES
-- =============================================================================

CREATE TABLE public.permissions (
  key       TEXT PRIMARY KEY,
  modulo    TEXT NOT NULL,
  descricao TEXT NOT NULL
);

CREATE TABLE public.role_permissions (
  role           public.app_role NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);

COMMENT ON TABLE public.permissions IS
  'Catálogo de permissões. Espelha src/config/permissions.ts — as duas listas devem bater.';
COMMENT ON TABLE public.role_permissions IS
  'Mapa papel→permissão. É a única fonte de verdade de quem pode o quê.';

INSERT INTO public.permissions (key, modulo, descricao) VALUES
  ('home.view',                  'Home',        'Acessar a home do sistema'),

  ('dashboards.view',            'Dashboards',  'Acessar a área de dashboards'),
  ('dashboards.sales.view',      'Dashboards',  'Ver o dashboard de vendas'),
  ('dashboards.stock.view',      'Dashboards',  'Ver o dashboard de estoque'),
  ('dashboards.goals.view',      'Dashboards',  'Ver o dashboard de metas'),

  ('bi.stock.view',              'BI',          'Ver inteligência empresarial de estoque'),
  ('bi.commercial.view',         'BI',          'Ver inteligência empresarial comercial'),
  ('bi.service.view',            'BI',          'Ver inteligência empresarial de serviço'),

  ('reports.view',               'Relatórios',  'Acessar relatórios'),
  ('reports.export',             'Relatórios',  'Exportar relatórios'),

  ('inventory.view',             'Estoque',     'Ver produtos e saldos'),
  ('inventory.create',           'Estoque',     'Cadastrar produto'),
  ('inventory.edit',             'Estoque',     'Editar produto'),
  ('inventory.delete',           'Estoque',     'Excluir produto'),
  ('inventory.adjust',           'Estoque',     'Lançar movimentação e ajuste de estoque'),
  ('inventory.cost.view',        'Estoque',     'Ver custo e margem dos produtos'),

  ('sales.view',                 'Venda',       'Ver vendas'),
  ('sales.create',               'Venda',       'Registrar venda no PDV'),
  ('sales.cancel',               'Venda',       'Cancelar venda'),
  ('sales.discount',             'Venda',       'Aplicar desconto'),

  ('orders.view',                'OS',          'Ver ordens de serviço'),
  ('orders.create',              'OS',          'Abrir ordem de serviço'),
  ('orders.edit',                'OS',          'Editar ordem de serviço'),
  ('orders.delete',              'OS',          'Excluir ordem de serviço'),
  ('orders.approve',             'OS',          'Aprovar orçamento de OS'),
  ('orders.diagnose',            'OS',          'Lançar diagnóstico técnico'),

  ('finance.view',               'Financeiro',  'Acessar o financeiro'),
  ('finance.payable.manage',     'Financeiro',  'Gerenciar contas a pagar'),
  ('finance.receivable.manage',  'Financeiro',  'Gerenciar contas a receber'),
  ('finance.cashflow.view',      'Financeiro',  'Ver fluxo de caixa'),
  ('finance.cashier.close',      'Financeiro',  'Fechar o caixa'),

  ('registry.view',              'Cadastros',   'Ver cadastros'),
  ('registry.customers.manage',  'Cadastros',   'Gerenciar clientes'),
  ('registry.suppliers.manage',  'Cadastros',   'Gerenciar fornecedores'),
  ('registry.products.manage',   'Cadastros',   'Gerenciar produtos'),
  ('registry.services.manage',   'Cadastros',   'Gerenciar serviços'),

  ('company.view',               'Empresa',     'Ver dados da empresa'),
  ('company.edit',               'Empresa',     'Editar dados da empresa'),

  ('settings.view',              'Config',      'Acessar configurações'),
  ('settings.edit',              'Config',      'Alterar configurações do sistema'),
  ('users.view',                 'Config',      'Ver usuários'),
  ('users.manage',               'Config',      'Criar, editar e desativar usuários'),
  ('roles.manage',               'Config',      'Alterar perfis e permissões'),
  ('audit.view',                 'Config',      'Ver logs de auditoria');


-- =============================================================================
-- 3. MAPA PAPEL → PERMISSÃO
-- =============================================================================

-- Administrador: tudo, sem exceção.
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'administrador', key FROM public.permissions;

-- Gerente: opera a loja inteira, mas não mexe em quem pode o quê nem nas
-- configurações estruturais do sistema.
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'gerente', key FROM public.permissions
WHERE key NOT IN ('roles.manage', 'settings.edit', 'company.edit', 'users.manage');

-- Gerente Técnico: manda na assistência e no que ela consome (estoque, peças,
-- serviços). Não vê financeiro nem BI comercial.
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('gerente_tecnico', 'home.view'),
  ('gerente_tecnico', 'dashboards.view'),
  ('gerente_tecnico', 'dashboards.stock.view'),
  ('gerente_tecnico', 'dashboards.goals.view'),
  ('gerente_tecnico', 'bi.stock.view'),
  ('gerente_tecnico', 'bi.service.view'),
  ('gerente_tecnico', 'reports.view'),
  ('gerente_tecnico', 'reports.export'),
  ('gerente_tecnico', 'inventory.view'),
  ('gerente_tecnico', 'inventory.create'),
  ('gerente_tecnico', 'inventory.edit'),
  ('gerente_tecnico', 'inventory.adjust'),
  ('gerente_tecnico', 'inventory.cost.view'),
  ('gerente_tecnico', 'orders.view'),
  ('gerente_tecnico', 'orders.create'),
  ('gerente_tecnico', 'orders.edit'),
  ('gerente_tecnico', 'orders.delete'),
  ('gerente_tecnico', 'orders.approve'),
  ('gerente_tecnico', 'orders.diagnose'),
  ('gerente_tecnico', 'registry.view'),
  ('gerente_tecnico', 'registry.customers.manage'),
  ('gerente_tecnico', 'registry.products.manage'),
  ('gerente_tecnico', 'registry.services.manage'),
  ('gerente_tecnico', 'registry.suppliers.manage'),
  ('gerente_tecnico', 'company.view');

-- Vendedor: PDV, clientes e o que precisa consultar pra vender.
-- Não cancela venda nem dá desconto por conta própria.
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('vendedor', 'home.view'),
  ('vendedor', 'dashboards.view'),
  ('vendedor', 'dashboards.sales.view'),
  ('vendedor', 'dashboards.goals.view'),
  ('vendedor', 'inventory.view'),
  ('vendedor', 'sales.view'),
  ('vendedor', 'sales.create'),
  ('vendedor', 'orders.view'),
  ('vendedor', 'orders.create'),
  ('vendedor', 'registry.view'),
  ('vendedor', 'registry.customers.manage');

-- Técnico: bancada. Diagnostica e atualiza OS, consulta estoque de peças.
-- Não vê custo, não vê venda, não aprova orçamento.
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('tecnico', 'home.view'),
  ('tecnico', 'dashboards.view'),
  ('tecnico', 'dashboards.stock.view'),
  ('tecnico', 'inventory.view'),
  ('tecnico', 'orders.view'),
  ('tecnico', 'orders.edit'),
  ('tecnico', 'orders.diagnose'),
  ('tecnico', 'registry.view');


-- =============================================================================
-- 4. FUNÇÃO CENTRAL DE VERIFICAÇÃO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id
      AND rp.permission_key = _permission
  )
$$;

COMMENT ON FUNCTION public.has_permission IS
  'Única forma autorizada de verificar permissão em policy. Não use has_role diretamente.';

-- Catálogo é legível por qualquer autenticado (o front monta o menu com ele);
-- alterar exige a permissão roles.manage.
ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem o catalogo de permissoes"
  ON public.permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados leem o mapa papel-permissao"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Quem gerencia perfis altera o mapa"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'roles.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'roles.manage'));


-- =============================================================================
-- 5. TENANT ÚNICO
-- =============================================================================
-- A estrutura multi-tenant fica de pé (permite licenciar o sistema no futuro),
-- mas a criação de tenant sai da API. Hoje existe uma loja: Rio Preto Games.

DROP POLICY IF EXISTS "Users can create their own tenant" ON public.tenants;

INSERT INTO public.tenants (nome_loja, ativo)
SELECT 'Rio Preto Games', true
WHERE NOT EXISTS (SELECT 1 FROM public.tenants);

DROP POLICY IF EXISTS "Admins can update their tenant" ON public.tenants;
CREATE POLICY "Quem edita empresa atualiza o tenant"
  ON public.tenants FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_tenant(auth.uid(), id)
    AND public.has_permission(auth.uid(), 'company.edit')
  );


-- =============================================================================
-- 6. PROVISIONAMENTO DE USUÁRIO NO BANCO (não mais no client)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id     UUID;
  v_total_papeis  INTEGER;
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

  -- Bootstrap: o primeiro usuário do sistema nasce administrador, senão
  -- ninguém conseguiria criar o primeiro. Do segundo em diante, o usuário
  -- nasce SEM papel — um administrador atribui em Configurações → Usuários.
  SELECT COUNT(*) INTO v_total_papeis FROM public.user_roles;

  IF v_total_papeis = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrador')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Resgate da base atual: se a conta já existe mas ficou sem papel por causa do
-- insert que falhava em silêncio, o perfil mais antigo vira administrador.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'administrador'
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles)
ORDER BY p.created_at
LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;

-- Perfis órfãos (criados antes do trigger) passam a apontar pro tenant único.
UPDATE public.profiles
SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1)
WHERE tenant_id IS NULL;


-- =============================================================================
-- 7. POLICIES REESCRITAS EM CIMA DE PERMISSÃO
-- =============================================================================

-- ── profiles ────────────────────────────────────────────────────────────────
-- O client não insere mais profile (quem faz é o trigger).
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Quem gerencia usuarios administra perfis"
  ON public.profiles FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'users.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'users.manage')
  );

-- ── user_roles ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage roles in their tenant" ON public.user_roles;

CREATE POLICY "Quem gerencia perfis atribui papeis"
  ON public.user_roles FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_id
        AND p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'roles.manage')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_id
        AND p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'roles.manage')
  );

-- ── clientes ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert clients in their tenant" ON public.clientes;
DROP POLICY IF EXISTS "Users can update clients in their tenant" ON public.clientes;
DROP POLICY IF EXISTS "Admins can delete clients"                ON public.clientes;

CREATE POLICY "Quem gerencia clientes cadastra"
  ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.customers.manage')
  );

CREATE POLICY "Quem gerencia clientes edita"
  ON public.clientes FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.customers.manage')
  );

CREATE POLICY "Quem gerencia clientes exclui"
  ON public.clientes FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.customers.manage')
  );

-- ── produtos ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage products" ON public.produtos;

CREATE POLICY "Quem cria produto insere"
  ON public.produtos FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'inventory.create')
  );

CREATE POLICY "Quem edita produto atualiza"
  ON public.produtos FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'inventory.edit')
  );

CREATE POLICY "Quem exclui produto remove"
  ON public.produtos FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'inventory.delete')
  );

-- ── movimentos_estoque ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert movements in their tenant" ON public.movimentos_estoque;

CREATE POLICY "Quem ajusta estoque lanca movimento"
  ON public.movimentos_estoque FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'inventory.adjust')
  );

-- ── vendas ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Sellers can create sales"     ON public.vendas;
DROP POLICY IF EXISTS "Sellers can update their sales" ON public.vendas;

CREATE POLICY "Quem vende registra venda"
  ON public.vendas FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'sales.create')
  );

-- Vendedor mexe na própria venda; quem pode cancelar mexe em qualquer uma.
CREATE POLICY "Vendedor edita a propria venda"
  ON public.vendas FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'sales.cancel')
      OR (vendedor_id = auth.uid() AND public.has_permission(auth.uid(), 'sales.create'))
    )
  );

-- ── itens_venda / pagamentos_venda ──────────────────────────────────────────
DROP POLICY IF EXISTS "Sellers can manage sale items" ON public.itens_venda;
DROP POLICY IF EXISTS "Sellers can manage payments"   ON public.pagamentos_venda;

CREATE POLICY "Quem vende gerencia itens da venda"
  ON public.itens_venda FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendas v
      WHERE v.id = venda_id
        AND v.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'sales.create')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendas v
      WHERE v.id = venda_id
        AND v.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'sales.create')
  );

CREATE POLICY "Quem vende gerencia pagamentos"
  ON public.pagamentos_venda FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendas v
      WHERE v.id = venda_id
        AND v.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'sales.create')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendas v
      WHERE v.id = venda_id
        AND v.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND public.has_permission(auth.uid(), 'sales.create')
  );

-- ── service_orders ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can create service orders" ON public.service_orders;
DROP POLICY IF EXISTS "Staff can update service orders" ON public.service_orders;

CREATE POLICY "Quem abre OS insere"
  ON public.service_orders FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'orders.create')
  );

CREATE POLICY "Quem edita OS atualiza"
  ON public.service_orders FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'orders.edit')
  );

CREATE POLICY "Quem exclui OS remove"
  ON public.service_orders FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'orders.delete')
  );

-- ── service_order_items ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can manage order items" ON public.service_order_items;

CREATE POLICY "Quem edita OS gerencia itens"
  ON public.service_order_items FOR ALL TO authenticated
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

-- ── os_status_config ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert status" ON public.os_status_config;
DROP POLICY IF EXISTS "Admins can update status" ON public.os_status_config;
DROP POLICY IF EXISTS "Admins can delete status" ON public.os_status_config;

CREATE POLICY "Quem configura o sistema gerencia status"
  ON public.os_status_config FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'settings.edit')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'settings.edit')
  );
