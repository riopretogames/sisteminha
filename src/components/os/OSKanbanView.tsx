import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { OSKanbanColumn } from './OSKanbanColumn';
import { useCardConfig } from '@/hooks/useCardConfig';
import { OS_CANCELADO } from '@/config/osStatus';
import type { ServiceOrder, StatusConfig } from '@/types/os';

interface OSKanbanViewProps {
  orders: ServiceOrder[];
  statuses: StatusConfig[];
  onStatusChange: (orderId: string, newStatus: string) => void;
}

/** Coluna inventada para as OS que ficaram sem etapa visível. */
const COLUNA_ORFAS: StatusConfig = {
  id: '__orfas__',
  tenant_id: '',
  key: '__orfas__',
  label: 'Sem etapa válida',
  color: 'bg-red-500/10 text-red-600',
  icon: 'circle',
  ordem: -1,
  ativo: true,
  created_at: '',
  updated_at: '',
};

export function OSKanbanView({ orders, statuses, onStatusChange }: OSKanbanViewProps) {
  const navigate = useNavigate();
  const { config } = useCardConfig();

  /**
   * Quais colunas o quadro desenha.
   *
   * Cancelado fica FORA (decisão do Felipe em 09/08). Cancelar não é passo do
   * processo, é saída de emergência — coluna permanente com o que ninguém quer
   * olhar rouba espaço das etapas que importam.
   *
   * A etapa continua existindo no sistema: a OS cancelada aparece em OS
   * Finalizadas, entra nos filtros e nos relatórios. Some do quadro, não da
   * memória da loja.
   */
  const colunas = useMemo(
    () => statuses.filter((s) => s.ativo && s.key !== OS_CANCELADO),
    [statuses]
  );

  /**
   * Agrupa as OS por etapa.
   *
   * O ponto delicado: uma OS pode estar numa etapa que não tem coluna — porque
   * foi desativada, porque a coluna está escondida (canceladas) ou porque a
   * etapa sumiu do cadastro. Antes, essas OS caíam num balde que a tela nunca
   * desenhava: **sumiam do quadro sem erro e sem aviso**, com o aparelho ainda
   * na prateleira da loja.
   *
   * Agora elas vão para uma coluna própria, em vermelho, no começo do quadro.
   * Aparecer errado é ruim; desaparecer é pior.
   */
  const { porEtapa, orfas } = useMemo(() => {
    const grupos: Record<string, ServiceOrder[]> = {};
    colunas.forEach((s) => {
      grupos[s.key] = [];
    });

    const semColuna: ServiceOrder[] = [];

    orders.forEach((order) => {
      // Cancelada não entra no quadro nem como órfã: ela tem lugar próprio
      // (OS Finalizadas). Sem esta linha, tirar a coluna de Cancelado jogaria
      // toda OS cancelada no alerta vermelho de "sem etapa válida".
      if (order.status === OS_CANCELADO) return;

      if (grupos[order.status]) {
        grupos[order.status].push(order);
      } else {
        semColuna.push(order);
      }
    });

    return { porEtapa: grupos, orfas: semColuna };
  }, [orders, colunas]);

  if (colunas.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Nenhuma etapa configurada. Use "Gerenciar Status" para configurar o quadro.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-4 overflow-x-auto pb-4">
      {orfas.length > 0 && (
        <div className="flex flex-col">
          <div className="mb-2 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {orfas.length === 1 ? 'Esta OS está' : `Estas ${orfas.length} OS estão`} numa
              etapa que não existe mais. Arraste para uma etapa válida.
            </span>
          </div>
          <OSKanbanColumn
            status={COLUNA_ORFAS}
            orders={orfas}
            config={config}
            onStatusChange={onStatusChange}
            onCardClick={(id) => navigate(`/os/${id}`)}
          />
        </div>
      )}

      {colunas.map((status) => (
        <OSKanbanColumn
          key={status.key}
          status={status}
          orders={porEtapa[status.key] || []}
          config={config}
          onStatusChange={onStatusChange}
          onCardClick={(id) => navigate(`/os/${id}`)}
        />
      ))}
    </div>
  );
}
