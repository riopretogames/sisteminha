
# Plano: Modo Kanban para Ordens de Serviço

## Resumo Executivo

Adicionar um segundo modo de visualizacao (Kanban/Cartao) para a pagina de Ordens de Servico, mantendo o modo Grade (Tabela) existente. Os usuarios poderao alternar entre os dois modos, configurar quais campos aparecem nos cards, e arrastar cards para mudar o status. Administradores poderao gerenciar os status dinamicamente.

---

## Arquitetura da Solucao

### Estrutura de Arquivos

```text
src/
├── pages/
│   └── OrdensServico.tsx          # Pagina principal (modificar)
├── components/
│   └── os/
│       ├── OSTableView.tsx        # Modo Grade extraido (novo)
│       ├── OSKanbanView.tsx       # Modo Kanban (novo)
│       ├── OSKanbanColumn.tsx     # Coluna do Kanban (novo)
│       ├── OSKanbanCard.tsx       # Card individual (novo)
│       ├── CardConfigDialog.tsx   # Configuracao dos campos (novo)
│       └── StatusManagerDialog.tsx # Gestao de status - admin (novo)
├── hooks/
│   └── useCardConfig.ts           # Hook para localStorage (novo)
└── lib/
    └── constants.ts               # Atualizar com campos disponiveis
```

---

## Fase 1: Preparacao do Backend

### 1.1 Criar Tabela de Status Dinamicos

```sql
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

-- Policies
CREATE POLICY "Users can view status in their tenant"
ON public.os_status_config FOR SELECT
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage status"
ON public.os_status_config FOR ALL
TO authenticated
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_role(auth.uid(), 'admin')
);

-- Inserir status padrao para tenants existentes
INSERT INTO public.os_status_config (tenant_id, key, label, color, ordem)
SELECT id, 'recebido', 'Recebido', 'bg-blue-500/10 text-blue-600', 0 FROM tenants
UNION ALL
SELECT id, 'diagnostico', 'Diagnostico', 'bg-purple-500/10 text-purple-600', 1 FROM tenants
UNION ALL
SELECT id, 'aguardando_peca', 'Aguardando Peca', 'bg-orange-500/10 text-orange-600', 2 FROM tenants
UNION ALL
SELECT id, 'aguardando_aprovacao', 'Aguardando Aprovacao', 'bg-orange-500/10 text-orange-600', 3 FROM tenants
UNION ALL
SELECT id, 'em_reparo', 'Em Reparo', 'bg-violet-500/10 text-violet-600', 4 FROM tenants
UNION ALL
SELECT id, 'pronto', 'Pronto', 'bg-green-500/10 text-green-600', 5 FROM tenants
UNION ALL
SELECT id, 'entregue', 'Entregue', 'bg-green-500/10 text-green-600', 6 FROM tenants
UNION ALL
SELECT id, 'cancelado', 'Cancelado', 'bg-red-500/10 text-red-600', 7 FROM tenants;
```

### 1.2 Alterar Coluna status para TEXT

Atualmente o status e um ENUM. Para suportar status dinamicos, precisamos alterar para TEXT:

```sql
-- Alterar tipo da coluna status
ALTER TABLE public.service_orders 
ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- Adicionar constraint para validar contra tabela de config
-- (Opcional: validacao via trigger para performance)
```

---

## Fase 2: Componentes Frontend

### 2.1 Hook useCardConfig

Gerencia a configuracao dos campos visiveis no card, salvando em localStorage:

```typescript
// src/hooks/useCardConfig.ts
interface CardConfig {
  numero_os: boolean;
  cliente_nome: boolean;
  modelo: boolean;
  imei: boolean;
  defeito: boolean;
  status: boolean;
  valor_orcamento: boolean;
  data_entrada: boolean;
  tecnico: boolean;
  prioridade: boolean;
}

const DEFAULT_CONFIG: CardConfig = {
  numero_os: true,
  cliente_nome: true,
  modelo: true,
  imei: false,
  defeito: true,
  status: true,
  valor_orcamento: true,
  data_entrada: false,
  tecnico: false,
  prioridade: true,
};

export function useCardConfig() {
  const [config, setConfig] = useState<CardConfig>(() => {
    const saved = localStorage.getItem('os_card_config');
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });

  const updateConfig = (newConfig: CardConfig) => {
    setConfig(newConfig);
    localStorage.setItem('os_card_config', JSON.stringify(newConfig));
  };

  return { config, updateConfig };
}
```

### 2.2 Constantes de Campos Disponiveis

```typescript
// Adicionar em src/lib/constants.ts
export const CARD_FIELDS = {
  numero_os: { label: 'Numero da OS', icon: 'hash' },
  cliente_nome: { label: 'Nome do Cliente', icon: 'user' },
  modelo: { label: 'Modelo do Aparelho', icon: 'smartphone' },
  imei: { label: 'IMEI', icon: 'fingerprint' },
  defeito: { label: 'Defeito', icon: 'alert-circle' },
  status: { label: 'Status', icon: 'circle' },
  valor_orcamento: { label: 'Valor do Orcamento', icon: 'dollar-sign' },
  data_entrada: { label: 'Data de Entrada', icon: 'calendar' },
  tecnico: { label: 'Tecnico Responsavel', icon: 'wrench' },
  prioridade: { label: 'Prioridade', icon: 'flag' },
} as const;
```

### 2.3 Componente OSKanbanCard

Card individual com campos configuraveis:

```typescript
// src/components/os/OSKanbanCard.tsx
interface OSKanbanCardProps {
  order: ServiceOrder;
  config: CardConfig;
  onStatusChange: (id: string, newStatus: string) => void;
  onClick: () => void;
}

export function OSKanbanCard({ order, config, onClick }: OSKanbanCardProps) {
  return (
    <div 
      onClick={onClick}
      className="bg-card border rounded-lg p-3 cursor-pointer 
                 hover:shadow-md transition-shadow"
    >
      {config.numero_os && (
        <div className="font-mono text-sm font-medium">
          {order.numero_os}
        </div>
      )}
      {config.cliente_nome && (
        <div className="flex items-center gap-2 mt-1">
          <User className="h-3 w-3" />
          <span className="truncate">{order.cliente_nome}</span>
        </div>
      )}
      {/* ... outros campos conforme config ... */}
      {config.prioridade && order.prioridade !== 'normal' && (
        <Badge className={OS_PRIORITY[order.prioridade].color}>
          {OS_PRIORITY[order.prioridade].label}
        </Badge>
      )}
    </div>
  );
}
```

### 2.4 Componente OSKanbanColumn

Coluna com scroll independente:

```typescript
// src/components/os/OSKanbanColumn.tsx
interface OSKanbanColumnProps {
  status: StatusConfig;
  orders: ServiceOrder[];
  config: CardConfig;
  onStatusChange: (orderId: string, newStatus: string) => void;
  onCardClick: (orderId: string) => void;
}

export function OSKanbanColumn({ 
  status, 
  orders, 
  config, 
  onStatusChange,
  onCardClick 
}: OSKanbanColumnProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-muted/50');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-muted/50');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-muted/50');
    const orderId = e.dataTransfer.getData('orderId');
    if (orderId) {
      onStatusChange(orderId, status.key);
    }
  };

  return (
    <div 
      className="flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header da coluna */}
      <div className="p-3 border-b flex items-center justify-between">
        <Badge className={status.color}>{status.label}</Badge>
        <span className="text-sm text-muted-foreground">
          {orders.length}
        </span>
      </div>
      
      {/* Cards com scroll */}
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {orders.map(order => (
            <div
              key={order.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('orderId', order.id);
              }}
            >
              <OSKanbanCard
                order={order}
                config={config}
                onClick={() => onCardClick(order.id)}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
```

### 2.5 Componente OSKanbanView

View completa do Kanban:

```typescript
// src/components/os/OSKanbanView.tsx
interface OSKanbanViewProps {
  orders: ServiceOrder[];
  statuses: StatusConfig[];
  onStatusChange: (orderId: string, newStatus: string) => void;
}

export function OSKanbanView({ orders, statuses, onStatusChange }: OSKanbanViewProps) {
  const navigate = useNavigate();
  const { config } = useCardConfig();
  
  // Agrupar orders por status
  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, ServiceOrder[]> = {};
    statuses.forEach(s => {
      grouped[s.key] = orders.filter(o => o.status === s.key);
    });
    return grouped;
  }, [orders, statuses]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-320px)]">
      {statuses.filter(s => s.ativo).map(status => (
        <OSKanbanColumn
          key={status.key}
          status={status}
          orders={ordersByStatus[status.key] || []}
          config={config}
          onStatusChange={onStatusChange}
          onCardClick={(id) => navigate(`/os/${id}`)}
        />
      ))}
    </div>
  );
}
```

### 2.6 Dialog de Configuracao de Card

```typescript
// src/components/os/CardConfigDialog.tsx
export function CardConfigDialog({ open, onOpenChange }: Props) {
  const { config, updateConfig } = useCardConfig();
  const [localConfig, setLocalConfig] = useState(config);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar Cartao</DialogTitle>
          <DialogDescription>
            Escolha quais campos aparecem nos cards do Kanban
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4 py-4">
          {Object.entries(CARD_FIELDS).map(([key, field]) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
                id={key}
                checked={localConfig[key]}
                onCheckedChange={(checked) => 
                  setLocalConfig({ ...localConfig, [key]: checked })
                }
              />
              <Label htmlFor={key}>{field.label}</Label>
            </div>
          ))}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => {
            updateConfig(localConfig);
            onOpenChange(false);
          }}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 2.7 Dialog de Gestao de Status (Admin)

```typescript
// src/components/os/StatusManagerDialog.tsx
export function StatusManagerDialog({ open, onOpenChange }: Props) {
  const { hasRole } = useAuth();
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  
  // CRUD de status com validacao
  // - Nao permitir excluir status com OS vinculadas
  // - Permitir reordenar via drag-and-drop
  // - Salvar no banco via Supabase
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerenciar Status</DialogTitle>
          <DialogDescription>
            Crie, edite ou remova status de OS
          </DialogDescription>
        </DialogHeader>
        
        {/* Lista de status editaveis */}
        {/* Form para novo status */}
        {/* Botoes de reordenacao */}
        
      </DialogContent>
    </Dialog>
  );
}
```

---

## Fase 3: Integracao na Pagina Principal

### 3.1 Modificar OrdensServico.tsx

```typescript
// src/pages/OrdensServico.tsx
export default function OrdensServico() {
  const [viewMode, setViewMode] = useState<'grid' | 'kanban'>('grid');
  const [cardConfigOpen, setCardConfigOpen] = useState(false);
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const { hasRole } = useAuth();
  
  // Carregar status do banco
  useEffect(() => {
    fetchStatuses();
  }, []);
  
  const fetchStatuses = async () => {
    const { data } = await supabase
      .from('os_status_config')
      .select('*')
      .order('ordem');
    setStatuses(data || []);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header com alternador de modo */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Servico</h1>
          <p className="text-muted-foreground">...</p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Alternador de visualizacao */}
          <div className="flex bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Botao Configurar Card - apenas no modo Kanban */}
          {viewMode === 'kanban' && (
            <Button variant="outline" size="sm" onClick={() => setCardConfigOpen(true)}>
              <Settings2 className="mr-2 h-4 w-4" />
              Configurar Cartao
            </Button>
          )}
          
          {/* Botao Gerenciar Status - apenas admin */}
          {hasRole('admin') && (
            <Button variant="outline" size="sm" onClick={() => setStatusManagerOpen(true)}>
              <Palette className="mr-2 h-4 w-4" />
              Gerenciar Status
            </Button>
          )}
          
          <Button onClick={() => navigate('/os/nova')}>
            <Plus className="mr-2 h-4 w-4" />
            Nova OS
          </Button>
        </div>
      </div>

      {/* Status Cards (ambos modos) */}
      {/* ... */}

      {/* Search and Filters (ambos modos) */}
      {/* ... */}

      {/* View condicional */}
      {viewMode === 'grid' ? (
        <OSTableView 
          orders={filteredOrders} 
          onStatusChange={handleStatusChange}
        />
      ) : (
        <OSKanbanView 
          orders={filteredOrders}
          statuses={statuses}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Dialogs */}
      <CardConfigDialog 
        open={cardConfigOpen} 
        onOpenChange={setCardConfigOpen} 
      />
      <StatusManagerDialog 
        open={statusManagerOpen} 
        onOpenChange={setStatusManagerOpen}
        onStatusesChange={fetchStatuses}
      />
    </div>
  );
}
```

---

## Fase 4: Drag and Drop Nativo

Utilizaremos a API nativa de Drag and Drop do HTML5 para evitar adicionar dependencias:

- `draggable="true"` nos cards
- `onDragStart` para armazenar o ID da OS
- `onDragOver` e `onDrop` nas colunas
- Feedback visual durante o arraste

Se a experiencia nao for satisfatoria, podemos considerar adicionar `@dnd-kit/core` como dependencia futura.

---

## Sequencia de Implementacao

1. **Migracao do banco** - Criar tabela `os_status_config` e popular com defaults
2. **Hook useCardConfig** - Gerenciamento da configuracao local
3. **Constantes CARD_FIELDS** - Definir campos disponiveis
4. **OSTableView** - Extrair tabela atual para componente separado
5. **OSKanbanCard** - Card individual configuravel
6. **OSKanbanColumn** - Coluna com drag-and-drop
7. **OSKanbanView** - View completa do Kanban
8. **CardConfigDialog** - Dialog de configuracao
9. **StatusManagerDialog** - Gestao de status (admin)
10. **Integracao na pagina** - Alternador e conexao dos componentes

---

## Consideracoes Tecnicas

### Performance
- Memoizacao dos cards com `useMemo`
- Virtualizacao se houver muitas OS (futuro)
- Debounce no drag-and-drop para evitar updates excessivos

### Acessibilidade
- Suporte a teclado no alternador
- ARIA labels nos botoes
- Focus management nos dialogs

### Responsividade
- Kanban com scroll horizontal em telas menores
- Cards adaptaveis ao tamanho da coluna

### Persistencia
- Preferencia de modo (grid/kanban) salva em localStorage
- Configuracao de campos salva em localStorage
- Status dinamicos salvos no banco por tenant
