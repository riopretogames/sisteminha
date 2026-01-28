import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { OSKanbanColumn } from './OSKanbanColumn';
import { useCardConfig } from '@/hooks/useCardConfig';
import type { ServiceOrder, StatusConfig } from '@/types/os';

interface OSKanbanViewProps {
  orders: ServiceOrder[];
  statuses: StatusConfig[];
  onStatusChange: (orderId: string, newStatus: string) => void;
}

export function OSKanbanView({ orders, statuses, onStatusChange }: OSKanbanViewProps) {
  const navigate = useNavigate();
  const { config } = useCardConfig();

  // Group orders by status
  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, ServiceOrder[]> = {};
    statuses.forEach((s) => {
      grouped[s.key] = [];
    });
    orders.forEach((order) => {
      if (grouped[order.status]) {
        grouped[order.status].push(order);
      } else {
        // If status doesn't exist in config, add to first column
        const firstStatus = statuses[0]?.key;
        if (firstStatus && grouped[firstStatus]) {
          grouped[firstStatus].push(order);
        }
      }
    });
    return grouped;
  }, [orders, statuses]);

  const activeStatuses = statuses.filter((s) => s.ativo);

  if (activeStatuses.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Nenhum status configurado. Configure os status para usar o modo Kanban.
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full min-h-0">
      {activeStatuses.map((status) => (
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
