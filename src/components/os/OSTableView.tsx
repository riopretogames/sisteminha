import { useNavigate } from 'react-router-dom';
import {
  MoreHorizontal,
  ClipboardList,
  Eye,
  Clock,
  User,
  Smartphone,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { OS_PRIORITY } from '@/lib/constants';
import type { ServiceOrder, StatusConfig } from '@/types/os';
import { osAtrasada, diasDeAtraso } from '@/lib/ordenarOS';

interface OSTableViewProps {
  orders: ServiceOrder[];
  statuses: StatusConfig[];
  loading: boolean;
  onStatusChange: (orderId: string, newStatus: string) => void;
}

export function OSTableView({ orders, statuses, loading, onStatusChange }: OSTableViewProps) {
  const navigate = useNavigate();

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

  const getStatusConfig = (statusKey: string) => {
    return statuses.find(s => s.key === statusKey) || {
      key: statusKey,
      label: statusKey,
      color: 'bg-gray-500/10 text-gray-600',
    };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4">
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mt-4 text-lg font-medium">Nenhuma OS encontrada</p>
            <p className="text-muted-foreground">
              Cadastre sua primeira ordem de serviço
            </p>
            <Button className="mt-4" onClick={() => navigate('/os/nova')}>
              <Plus className="mr-2 h-4 w-4" />
              Criar OS
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Prioridade</TableHead>
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
            {orders.map((order) => {
              const statusConfig = getStatusConfig(order.status);
              const prioridadeConfig = OS_PRIORITY[order.prioridade];
              const atrasada = osAtrasada(order);
              const diasAtraso = diasDeAtraso(order);
              return (
                <TableRow key={order.id} className={atrasada ? 'bg-red-500/5' : undefined}>
                  <TableCell>
                    <span className="font-mono font-medium">{order.numero_os}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Mostra SEMPRE, inclusive "Normal": coluna que só
                          aparece às vezes vira coluna que ninguém confere. */}
                      {prioridadeConfig && (
                        <Badge variant="outline" className={prioridadeConfig.color}>
                          {prioridadeConfig.label}
                        </Badge>
                      )}
                      {/* Atraso manda na ordem da lista, então precisa estar
                          visível — senão a OS sobe sem explicação. */}
                      {atrasada && (
                        <Badge variant="destructive" className="gap-1">
                          <Clock className="h-3 w-3" />
                          {diasAtraso}d atrasada
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
                      onValueChange={(value) => onStatusChange(order.id, value)}
                    >
                      <SelectTrigger className="w-44 h-8">
                        <Badge className={statusConfig.color}>
                          {statusConfig.label}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.filter(s => s.ativo).map((config) => (
                          <SelectItem key={config.key} value={config.key}>
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
      </CardContent>
    </Card>
  );
}
