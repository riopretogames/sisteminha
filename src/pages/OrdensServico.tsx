import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  LayoutGrid,
  Columns3,
  Settings2,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { useViewMode } from '@/hooks/useViewMode';
import { OS_PRIORITY } from '@/lib/constants';
import { OSTableView } from '@/components/os/OSTableView';
import { OSKanbanView } from '@/components/os/OSKanbanView';
import { CardConfigDialog } from '@/components/os/CardConfigDialog';
import { StatusManagerDialog } from '@/components/os/StatusManagerDialog';
import type { ServiceOrder, StatusConfig, OsPrioridade } from '@/types/os';

export default function OrdensServico() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = useAuth();
  const { viewMode, setViewMode } = useViewMode();

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [cardConfigOpen, setCardConfigOpen] = useState(false);
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);

  useEffect(() => {
    fetchStatuses();
    fetchOrders();
  }, []);

  const fetchStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from('os_status_config')
        .select('*')
        .order('ordem');

      if (error) throw error;
      setStatuses((data as StatusConfig[]) || []);
    } catch (error) {
      console.error('Error fetching statuses:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          id,
          numero_os,
          cliente_id,
          marca,
          modelo,
          numero_serie,
          defeito_cliente,
          status,
          prioridade,
          total_orcamento,
          tecnico_id,
          created_at,
          clientes!inner(nome)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOrders(
        data?.map((order) => ({
          id: order.id,
          numero_os: order.numero_os,
          cliente_id: order.cliente_id,
          cliente_nome: (order.clientes as any)?.nome || 'Cliente',
          marca: order.marca,
          modelo: order.modelo,
          numero_serie: order.numero_serie,
          defeito_cliente: order.defeito_cliente,
          status: order.status || 'recebido',
          prioridade: (order.prioridade || 'normal') as OsPrioridade,
          total_orcamento: order.total_orcamento || 0,
          tecnico_id: order.tecnico_id,
          created_at: order.created_at,
        })) || []
      );
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: 'Erro ao carregar OS',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );

      const statusLabel = statuses.find((s) => s.key === newStatus)?.label || newStatus;
      toast({
        title: 'Status atualizado',
        description: `OS alterada para ${statusLabel}`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
      // Revert on error
      fetchOrders();
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        order.numero_os.toLowerCase().includes(searchLower) ||
        order.cliente_nome.toLowerCase().includes(searchLower) ||
        order.modelo?.toLowerCase().includes(searchLower) ||
        order.defeito_cliente.toLowerCase().includes(searchLower);

      const matchesStatus =
        statusFilter === 'all' || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const statusCounts = useMemo(() => {
    return orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [orders]);

  // Get the 4 main statuses for the summary cards
  const mainStatuses = ['recebido', 'em_reparo', 'pronto', 'entregue'];
  const getStatusConfig = (key: string) =>
    statuses.find((s) => s.key === key) || { key, label: key, color: 'bg-gray-500/10 text-gray-600' };

  return (
    <div className="flex flex-col h-full animate-fade-in overflow-hidden">
      {/* Header - Fixed section */}
      <div className="flex-shrink-0 space-y-6 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          <p className="text-muted-foreground">
            Gerencie os reparos da sua loja
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              title="Modo Grade"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              title="Modo Kanban"
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>

          {/* Card Config - only in Kanban mode */}
          {viewMode === 'kanban' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCardConfigOpen(true)}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Configurar Cartão
            </Button>
          )}

          {/* Gerenciar status: quem configura o sistema */}
          {can(PERMISSIONS.SETTINGS_EDIT) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusManagerOpen(true)}
            >
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

        {/* Status Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {mainStatuses.map((statusKey) => {
          const config = getStatusConfig(statusKey);
          const count = statusCounts[statusKey] || 0;
          return (
            <Card
              key={statusKey}
              className={`cursor-pointer transition-all hover:shadow-md ${
                statusFilter === statusKey ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() =>
                setStatusFilter(statusFilter === statusKey ? 'all' : statusKey)
              }
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Badge className={config.color}>{config.label}</Badge>
                  <span className="text-2xl font-bold">{count}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente, modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statuses
              .filter((s) => s.ativo)
              .map((config) => (
                <SelectItem key={config.key} value={config.key}>
                  {config.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* View - Scrollable section */}
      <div className="flex-1 min-h-0">
        {viewMode === 'grid' ? (
          <OSTableView
            orders={filteredOrders}
            statuses={statuses}
            loading={loading}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <OSKanbanView
            orders={filteredOrders}
            statuses={statuses}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>

      {/* Dialogs */}
      <CardConfigDialog
        open={cardConfigOpen}
        onOpenChange={setCardConfigOpen}
      />
      <StatusManagerDialog
        open={statusManagerOpen}
        onOpenChange={setStatusManagerOpen}
        statuses={statuses}
        onStatusesChange={fetchStatuses}
      />
    </div>
  );
}
