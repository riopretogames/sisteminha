-- Criar tabela de configuração de status dinâmicos
CREATE TABLE public.os_status_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'bg-gray-500/10 text-gray-600',
  icon TEXT DEFAULT 'circle',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, key)
);

-- Habilitar RLS
ALTER TABLE public.os_status_config ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários podem ver status do seu tenant
CREATE POLICY "Users can view status in their tenant"
ON public.os_status_config FOR SELECT
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Policy: Admins podem gerenciar status (INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can insert status"
ON public.os_status_config FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update status"
ON public.os_status_config FOR UPDATE
TO authenticated
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete status"
ON public.os_status_config FOR DELETE
TO authenticated
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_role(auth.uid(), 'admin')
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_os_status_config_updated_at
BEFORE UPDATE ON public.os_status_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir status padrão para tenants existentes
INSERT INTO public.os_status_config (tenant_id, key, label, color, ordem)
SELECT id, 'recebido', 'Recebido', 'bg-blue-500/10 text-blue-600', 0 FROM tenants
UNION ALL
SELECT id, 'diagnostico', 'Diagnóstico', 'bg-purple-500/10 text-purple-600', 1 FROM tenants
UNION ALL
SELECT id, 'aguardando_peca', 'Aguardando Peça', 'bg-amber-500/10 text-amber-600', 2 FROM tenants
UNION ALL
SELECT id, 'aguardando_aprovacao', 'Aguardando Aprovação', 'bg-orange-500/10 text-orange-600', 3 FROM tenants
UNION ALL
SELECT id, 'em_reparo', 'Em Reparo', 'bg-violet-500/10 text-violet-600', 4 FROM tenants
UNION ALL
SELECT id, 'pronto', 'Pronto', 'bg-emerald-500/10 text-emerald-600', 5 FROM tenants
UNION ALL
SELECT id, 'entregue', 'Entregue', 'bg-green-500/10 text-green-600', 6 FROM tenants
UNION ALL
SELECT id, 'cancelado', 'Cancelado', 'bg-red-500/10 text-red-600', 7 FROM tenants;

-- Alterar coluna status de ENUM para TEXT para suportar status dinâmicos
ALTER TABLE public.service_orders 
ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- Definir valor padrão
ALTER TABLE public.service_orders 
ALTER COLUMN status SET DEFAULT 'recebido';