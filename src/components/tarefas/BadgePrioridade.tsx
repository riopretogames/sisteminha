import { TAREFA_PRIORIDADES } from '@/config/tarefas';
import { cn } from '@/lib/utils';
import type { TarefaPrioridade } from '@/types/tarefas';

/** Pílula da prioridade, nas cores de `config/tarefas.ts` (as do Monday). */
export function BadgePrioridade({ prioridade, className }: { prioridade: TarefaPrioridade; className?: string }) {
  const def = TAREFA_PRIORIDADES[prioridade] ?? TAREFA_PRIORIDADES.normal;
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
