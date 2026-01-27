import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  MoreHorizontal,
  ClipboardList,
  Eye,
  Clock,
  User,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { OS_STATUS, OS_PRIORITY } from '@/lib/constants';

type OsStatus = keyof typeof OS_STATUS;

interface ServiceOrder {
  id: string;
  numero_os: string;
  cliente_nome: string;
  marca: string | null;
  modelo: string | null;
  defeito_cliente: string;
  status: OsStatus;
  prioridade: string;
  total_orcamento: number;
  created_at: string;
}

export default function OrdensServico() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          id,
          numero_os,
          marca,
          modelo,
          defeito_cliente,
          status,
          prioridade,
          total_orcamento,
          created_at,
          clientes!inner(nome)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOrders(
        data?.map(order => ({
          id: order.id,
          numero_os: order.numero_os,
          cliente_nome: (order.clientes as any)?.nome || 'Cliente',
          marca: order.marca,
          modelo: order.modelo,
          defeito_cliente: order.defeito_cliente,
          status: order.status as OsStatus,
          prioridade: order.prioridade,
          total_orcamento: order.total_orcamento || 0,
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

  const handleStatusChange = async (orderId: string, newStatus: OsStatus) => {
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Status atualizado',
        description: `OS alterada para ${OS_STATUS[newStatus].label}`,
      });

      fetchOrders();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const filteredOrders = orders.filter(order => {
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

  const statusCounts = orders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          <p className="text-muted-foreground">
            Gerencie os reparos da sua loja
          </p>
        </div>
        <Button onClick={() => navigate('/os/nova')}>
          <Plus className="mr-2 h-4 w-4" />
          Nova OS
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4">
        {['recebido', 'em_reparo', 'pronto', 'entregue'].map(status => {
          const config = OS_STATUS[status as OsStatus];
          const count = statusCounts[status] || 0;
          return (
            <Card
              key={status}
              className={`cursor-pointer transition-all hover:shadow-md ${
                statusFilter === status ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
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
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente, modelo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(OS_STATUS).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="rounded-full bg-muted p-4">
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="mt-4 text-lg font-medium">Nenhuma OS encontrada</p>
              <p className="text-muted-foreground">
                {search ? 'Tente outra busca' : 'Cadastre sua primeira ordem de serviço'}
              </p>
              {!search && (
                <Button className="mt-4" onClick={() => navigate('/os/nova')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar OS
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Aparelho</TableHead>
                  <TableHead>Defeito</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map(order => {
                  const statusConfig = OS_STATUS[order.status];
                  const prioridadeConfig = OS_PRIORITY[order.prioridade as keyof typeof OS_PRIORITY];
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{order.numero_os}</span>
                          {prioridadeConfig && order.prioridade !== 'normal' && (
                            <Badge variant="outline" className={prioridadeConfig.color}>
                              {prioridadeConfig.label}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {order.cliente_nome}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                          {[order.marca, order.modelo].filter(Boolean).join(' ') || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {order.defeito_cliente}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={order.status}
                          onValueChange={(value) => handleStatusChange(order.id, value as OsStatus)}
                        >
                          <SelectTrigger className="w-40 h-8">
                            <Badge className={statusConfig.color}>
                              {statusConfig.label}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(OS_STATUS).map(([key, config]) => (
                              <SelectItem key={key} value={key}>
                                <Badge className={config.color}>{config.label}</Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(order.total_orcamento)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDate(order.created_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/os/${order.id}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Ver detalhes
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
