import { STATUS_ATRASADA, TAREFA_STATUS } from '@/config/tarefas';
import { cn } from '@/lib/utils';
import type { StatusNoDia } from '@/types/tarefas';

/**
 * Pílula do andamento. Recebe o status NO DIA (lib/tarefas, statusNoDia), não
 * o gravado: é assim que a recorrente aparece "Feito" hoje e pendente amanhã,
 * e a avulsa vencida aparece "Atrasada" sem ninguém ter gravado isso.
 */
export function BadgeStatus({ status, className }: { status: StatusNoDia; className?: string }) {
  const def = status === 'atrasada' ? STATUS_ATRASADA : TAREFA_STATUS[status] ?? TAREFA_STATUS.nao_iniciado;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4',
        def.cor,
        className,
      )}
    >
      {def.label}
    </span>
  );
}
