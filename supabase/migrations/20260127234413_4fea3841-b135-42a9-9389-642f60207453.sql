-- =============================================
-- SISTEMINHA - MVP Database Schema
-- =============================================

-- 1. ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'atendente', 'tecnico', 'vendedor');
CREATE TYPE public.cliente_tag AS ENUM ('vip', 'fiel', 'problema');
CREATE TYPE public.cliente_origem AS ENUM ('instagram', 'indicacao', 'google', 'facebook', 'whatsapp', 'loja', 'outro');
CREATE TYPE public.produto_categoria AS ENUM ('celular', 'acessorio', 'peca', 'servico');
CREATE TYPE public.produto_localizacao AS ENUM ('vitrine', 'deposito', 'bancada', 'sucata');
CREATE TYPE public.movimento_tipo AS ENUM ('entrada', 'saida', 'ajuste', 'inventario');
CREATE TYPE public.venda_status AS ENUM ('rascunho', 'pago', 'faturado', 'cancelado');
CREATE TYPE public.forma_pagamento AS ENUM ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'crediario', 'vale_troca');
CREATE TYPE public.os_status AS ENUM ('recebido', 'diagnostico', 'aguardando_peca', 'aguardando_aprovacao', 'em_reparo', 'pronto', 'entregue', 'cancelado');
CREATE TYPE public.os_prioridade AS ENUM ('baixa', 'normal', 'alta', 'urgente');
CREATE TYPE public.os_tipo AS ENUM ('paga', 'garantia', 'cortesia');

-- 2. TENANTS (Lojas)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_loja TEXT NOT NULL,
  cnpj TEXT,
  inscricao_estadual TEXT,
  endereco TEXT,
  telefone TEXT,
  email TEXT,
  logo_url TEXT,
  cor_primaria TEXT DEFAULT '#3B82F6',
  cor_secundaria TEXT DEFAULT '#8B5CF6',
  config_whatsapp JSONB DEFAULT '{}',
  config_fiscal JSONB DEFAULT '{}',
  webhook_url TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PROFILES (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  avatar_url TEXT,
  ativo BOOLEAN DEFAULT true,
  ultimo_acesso TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. USER_ROLES (security definer pattern)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- 5. CLIENTES (CRM)
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  email TEXT,
  telefones TEXT[] DEFAULT '{}',
  data_nascimento DATE,
  tags cliente_tag[] DEFAULT '{}',
  origem cliente_origem DEFAULT 'loja',
  endereco TEXT,
  observacoes TEXT,
  foto_url TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. PRODUTOS (Estoque)
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  codigo_barra TEXT,
  imei_serial TEXT,
  marca TEXT,
  modelo TEXT,
  categoria produto_categoria DEFAULT 'acessorio',
  custo DECIMAL(10,2) DEFAULT 0,
  preco DECIMAL(10,2) DEFAULT 0,
  margem_percent DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN custo > 0 THEN ((preco - custo) / custo * 100) ELSE 0 END
  ) STORED,
  estoque_atual INTEGER DEFAULT 0,
  estoque_minimo INTEGER DEFAULT 1,
  estoque_maximo INTEGER DEFAULT 100,
  localizacao produto_localizacao DEFAULT 'deposito',
  garantia_meses INTEGER DEFAULT 0,
  foto_url TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. MOVIMENTOS_ESTOQUE (Audit Trail)
CREATE TABLE public.movimentos_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
  tipo movimento_tipo NOT NULL,
  quantidade INTEGER NOT NULL,
  custo_unitario DECIMAL(10,2) DEFAULT 0,
  valor_total DECIMAL(10,2) DEFAULT 0,
  motivo TEXT,
  origem TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  saldo_anterior INTEGER DEFAULT 0,
  saldo_depois INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. VENDAS (PDV)
CREATE TABLE public.vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id),
  vendedor_id UUID REFERENCES auth.users(id),
  numero_venda TEXT,
  status venda_status DEFAULT 'rascunho',
  subtotal DECIMAL(10,2) DEFAULT 0,
  descontos DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  comissao_calculada DECIMAL(10,2) DEFAULT 0,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. ITENS_VENDA
CREATE TABLE public.itens_venda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID REFERENCES public.vendas(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario DECIMAL(10,2) NOT NULL,
  desconto DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. PAGAMENTOS_VENDA
CREATE TABLE public.pagamentos_venda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID REFERENCES public.vendas(id) ON DELETE CASCADE NOT NULL,
  forma forma_pagamento NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  parcelas INTEGER DEFAULT 1,
  gateway_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. SERVICE_ORDERS (Ordens de Serviço)
CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  numero_os TEXT NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) NOT NULL,
  tecnico_id UUID REFERENCES auth.users(id),
  imei TEXT,
  marca TEXT,
  modelo TEXT,
  cor TEXT,
  memoria TEXT,
  condicao_entrada TEXT,
  acessorios_deixados JSONB DEFAULT '[]',
  senha_aparelho TEXT,
  defeito_cliente TEXT NOT NULL,
  diagnostico_tecnico TEXT,
  tipo os_tipo DEFAULT 'paga',
  prioridade os_prioridade DEFAULT 'normal',
  status os_status DEFAULT 'recebido',
  prazo_previsto DATE,
  total_pecas DECIMAL(10,2) DEFAULT 0,
  total_mao_obra DECIMAL(10,2) DEFAULT 0,
  total_orcamento DECIMAL(10,2) DEFAULT 0,
  valor_final_pago DECIMAL(10,2),
  data_finalizacao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 12. SERVICE_ORDER_HISTORY (Timeline)
CREATE TABLE public.service_order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  status_anterior os_status,
  status_novo os_status NOT NULL,
  comentario TEXT,
  sla_tempo INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. SERVICE_ORDER_ITEMS (Peças/Serviços)
CREATE TABLE public.service_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id),
  descricao TEXT,
  quantidade INTEGER DEFAULT 1,
  custo_unitario DECIMAL(10,2) DEFAULT 0,
  preco_cobrado DECIMAL(10,2) NOT NULL,
  horas_mao_obra DECIMAL(4,2) DEFAULT 0,
  garantia_item_meses INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.profiles
  WHERE id = _user_id
$$;

-- Function to check if user belongs to tenant
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND tenant_id = _tenant_id
  )
$$;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentos_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;

-- TENANTS policies
CREATE POLICY "Users can view their tenant"
ON public.tenants FOR SELECT
TO authenticated
USING (public.user_belongs_to_tenant(auth.uid(), id));

CREATE POLICY "Admins can update their tenant"
ON public.tenants FOR UPDATE
TO authenticated
USING (public.user_belongs_to_tenant(auth.uid(), id) AND public.has_role(auth.uid(), 'admin'));

-- PROFILES policies
CREATE POLICY "Users can view profiles in their tenant"
ON public.profiles FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- USER_ROLES policies
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles in their tenant"
ON public.user_roles FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_id
      AND p.tenant_id = public.get_user_tenant_id(auth.uid())
  )
  AND public.has_role(auth.uid(), 'admin')
);

-- CLIENTES policies
CREATE POLICY "Users can view clients in their tenant"
ON public.clientes FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert clients in their tenant"
ON public.clientes FOR INSERT
TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update clients in their tenant"
ON public.clientes FOR UPDATE
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can delete clients"
ON public.clientes FOR DELETE
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- PRODUTOS policies
CREATE POLICY "Users can view products in their tenant"
ON public.produtos FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage products"
ON public.produtos FOR ALL
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- MOVIMENTOS_ESTOQUE policies
CREATE POLICY "Users can view movements in their tenant"
ON public.movimentos_estoque FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert movements in their tenant"
ON public.movimentos_estoque FOR INSERT
TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- VENDAS policies
CREATE POLICY "Users can view sales in their tenant"
ON public.vendas FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Sellers can create sales"
ON public.vendas FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendedor'))
);

CREATE POLICY "Sellers can update their sales"
ON public.vendas FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR vendedor_id = auth.uid())
);

-- ITENS_VENDA policies
CREATE POLICY "Users can view sale items via sales"
ON public.itens_venda FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "Sellers can manage sale items"
ON public.itens_venda FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.tenant_id = public.get_user_tenant_id(auth.uid())
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendedor'))
  )
);

-- PAGAMENTOS_VENDA policies
CREATE POLICY "Users can view payments via sales"
ON public.pagamentos_venda FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "Sellers can manage payments"
ON public.pagamentos_venda FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_id
      AND v.tenant_id = public.get_user_tenant_id(auth.uid())
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendedor'))
  )
);

-- SERVICE_ORDERS policies
CREATE POLICY "Users can view service orders in their tenant"
ON public.service_orders FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Staff can create service orders"
ON public.service_orders FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'tecnico')
  )
);

CREATE POLICY "Staff can update service orders"
ON public.service_orders FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'tecnico')
  )
);

-- SERVICE_ORDER_HISTORY policies
CREATE POLICY "Users can view order history"
ON public.service_order_history FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_orders so
    WHERE so.id = os_id
      AND so.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "Staff can add order history"
ON public.service_order_history FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.service_orders so
    WHERE so.id = os_id
      AND so.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

-- SERVICE_ORDER_ITEMS policies
CREATE POLICY "Users can view order items"
ON public.service_order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_orders so
    WHERE so.id = os_id
      AND so.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "Staff can manage order items"
ON public.service_order_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_orders so
    WHERE so.id = os_id
      AND so.tenant_id = public.get_user_tenant_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'atendente')
        OR public.has_role(auth.uid(), 'tecnico')
      )
  )
);

-- =============================================
-- TRIGGERS
-- =============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_produtos_updated_at
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendas_updated_at
  BEFORE UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_service_orders_updated_at
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-generate OS number
CREATE OR REPLACE FUNCTION public.generate_os_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
  year_month TEXT;
  seq INTEGER;
BEGIN
  year_month := to_char(now(), 'YYYYMM');
  
  SELECT COUNT(*) + 1 INTO seq
  FROM public.service_orders
  WHERE tenant_id = NEW.tenant_id
    AND numero_os LIKE '%' || year_month || '%';
  
  NEW.numero_os := 'OS-' || year_month || '-' || lpad(seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER generate_service_order_number
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW
  WHEN (NEW.numero_os IS NULL OR NEW.numero_os = '')
  EXECUTE FUNCTION public.generate_os_number();

-- Auto-generate venda number
CREATE OR REPLACE FUNCTION public.generate_venda_number()
RETURNS TRIGGER AS $$
DECLARE
  year_month TEXT;
  seq INTEGER;
BEGIN
  year_month := to_char(now(), 'YYYYMM');
  
  SELECT COUNT(*) + 1 INTO seq
  FROM public.vendas
  WHERE tenant_id = NEW.tenant_id
    AND numero_venda LIKE '%' || year_month || '%';
  
  NEW.numero_venda := 'VD-' || year_month || '-' || lpad(seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER generate_venda_number
  BEFORE INSERT ON public.vendas
  FOR EACH ROW
  WHEN (NEW.numero_venda IS NULL OR NEW.numero_venda = '')
  EXECUTE FUNCTION public.generate_venda_number();

-- Track stock movements
CREATE OR REPLACE FUNCTION public.track_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  -- Record the movement
  INSERT INTO public.movimentos_estoque (
    tenant_id,
    produto_id,
    tipo,
    quantidade,
    saldo_anterior,
    saldo_depois,
    usuario_id
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    'ajuste',
    NEW.estoque_atual - COALESCE(OLD.estoque_atual, 0),
    COALESCE(OLD.estoque_atual, 0),
    NEW.estoque_atual,
    auth.uid()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create OS history on status change
CREATE OR REPLACE FUNCTION public.track_os_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.service_order_history (
      os_id,
      usuario_id,
      status_anterior,
      status_novo
    ) VALUES (
      NEW.id,
      auth.uid(),
      OLD.status,
      NEW.status
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER track_service_order_status
  AFTER UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.track_os_status_change();

-- =============================================
-- INDEXES for performance
-- =============================================

CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX idx_clientes_tenant ON public.clientes(tenant_id);
CREATE INDEX idx_clientes_cpf ON public.clientes(cpf_cnpj);
CREATE INDEX idx_clientes_telefone ON public.clientes USING gin(telefones);
CREATE INDEX idx_produtos_tenant ON public.produtos(tenant_id);
CREATE INDEX idx_produtos_codigo ON public.produtos(codigo_barra);
CREATE INDEX idx_produtos_imei ON public.produtos(imei_serial);
CREATE INDEX idx_vendas_tenant ON public.vendas(tenant_id);
CREATE INDEX idx_vendas_status ON public.vendas(status);
CREATE INDEX idx_service_orders_tenant ON public.service_orders(tenant_id);
CREATE INDEX idx_service_orders_status ON public.service_orders(status);
CREATE INDEX idx_service_orders_numero ON public.service_orders(numero_os);
CREATE INDEX idx_movimentos_produto ON public.movimentos_estoque(produto_id);