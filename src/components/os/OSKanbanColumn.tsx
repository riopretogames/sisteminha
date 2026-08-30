import { useState } from 'react';
import { nomeDaEtapa } from '@/lib/etapaDaOS';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OSKanbanCard } from './OSKanbanCard';
import type { CardConfig } from '@/hooks/useCardConfig';
import type { ServiceOrder, StatusConfig } from '@/types/os';
import { cn } from '@/lib/utils';

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
  onCardClick,
}: OSKanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only set false if we're leaving the column entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const orderId = e.dataTransfer.getData('orderId');
    const currentStatus = e.dataTransfer.getData('currentStatus');
    if (orderId && currentStatus !== status.key) {
      onStatusChange(orderId, status.key);
    }
  };

  return (
    <div
      className={cn(
        'flex-shrink-0 w-72 flex flex-col rounded-lg border transition-colors',
        isDragOver ? 'bg-primary/5 border-primary/50' : 'bg-muted/30'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        {/* O número vem antes do nome: é assim que a loja fala da etapa
            ("tá na 2b"). Etapa sem número aparece só com o nome. */}
        <Badge className={status.color}>{nomeDaEtapa(status)}</Badge>
        <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {orders.length}
        </span>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {orders.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma OS
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('orderId', order.id);
                  e.dataTransfer.setData('currentStatus', order.status);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className="cursor-grab active:cursor-grabbing"
              >
                <OSKanbanCard
                  order={order}
                  config={{ ...config, status: false }} // Hide status in card since it's grouped
                  onClick={() => onCardClick(order.id)}
                />
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
