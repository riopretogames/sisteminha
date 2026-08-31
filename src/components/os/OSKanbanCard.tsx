import { User, Smartphone, Calendar, DollarSign, Wrench, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { OS_PRIORITY } from '@/lib/constants';
import type { CardConfig } from '@/hooks/useCardConfig';
import type { ServiceOrder, StatusConfig } from '@/types/os';

interface OSKanbanCardProps {
  order: ServiceOrder;
  config: CardConfig;
  statusConfig?: StatusConfig;
  onClick: () => void;
}

export function OSKanbanCard({ order, config, statusConfig, onClick }: OSKanbanCardProps) {
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
    }).format(new Date(date));
  };

  const prioridadeConfig = OS_PRIORITY[order.prioridade];

  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:shadow-md transition-all hover:border-primary/50 bg-card"
    >
      <CardContent className="p-3 space-y-2">
        {/* Header: Número OS + Prioridade */}
        <div className="flex items-center justify-between">
          {config.numero_os && (
            <span className="font-mono text-sm font-semibold text-primary">
              {order.numero_os}
            </span>
          )}
          {/* Mostra SEMPRE que a opção estiver ligada. Antes escondia quando a
              prioridade era "normal" — e como toda OS nasce normal, quem ligava
              a opção não via nada e concluía que estava quebrada. Quem não quer
              ver prioridade nenhuma desliga a opção; a tela não decide isso
              pela pessoa. */}
          {config.prioridade && prioridadeConfig && (
            <Badge variant="outline" className={prioridadeConfig.color}>
              {prioridadeConfig.label}
            </Badge>
          )}
        </div>

        {/* A recusa aparece SEMPRE, sem opção para desligar — diferente dos
            outros campos do cartão.

            O motivo: desde 01/09 a OS recusada anda pelas mesmas colunas da
            aprovada (o aparelho volta para a bancada para ser remontado). Sem
            esta marca, o cartão de um aparelho que NÃO vai ser consertado fica
            idêntico ao de um que vai, lado a lado na coluna "Aprovado /
            Executar" — e o técnico só descobre abrindo a ficha, ou não
            descobre. É o tipo de aviso que não pode depender de alguém ter
            ligado a opção certa na configuração do cartão. */}
        {order.laudo_aprovado === false && (
          <Badge variant="destructive" className="w-full justify-center">
            Cliente não aprovou — remontar
          </Badge>
        )}

        {/* Cliente */}
        {config.cliente_nome && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="truncate font-medium">{order.cliente_nome}</span>
          </div>
        )}

        {/* Modelo */}
        {config.modelo && (order.marca || order.modelo) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">
              {[order.marca, order.modelo].filter(Boolean).join(' ')}
            </span>
          </div>
        )}

        {/* IMEI */}
        {config.numero_serie && order.numero_serie && (
          <div className="text-xs text-muted-foreground font-mono">
            Nº série: {order.numero_serie}
          </div>
        )}

        {/* Defeito */}
        {config.defeito && (
          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2 text-muted-foreground">
              {order.defeito_cliente}
            </span>
          </div>
        )}

        {/* Técnico */}
        {config.tecnico && order.tecnico_nome && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wrench className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{order.tecnico_nome}</span>
          </div>
        )}

        {/* Footer: Valor + Data */}
        <div className="flex items-center justify-between pt-1 border-t">
          {config.valor_orcamento && (
            <div className="flex items-center gap-1 text-sm font-medium text-primary">
              <DollarSign className="h-3.5 w-3.5" />
              {formatCurrency(order.total_orcamento)}
            </div>
          )}
          {config.data_entrada && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(order.created_at)}
            </div>
          )}
        </div>

        {/* Status badge (if not grouped by status) */}
        {config.status && statusConfig && (
          <Badge className={statusConfig.color}>
            {statusConfig.label}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
