import { ListChecks } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { Tarefa } from '@/types/tarefas';

/**
 * "2/5" com a barrinha, só leitura: os itens se marcam dentro da ficha, onde
 * dá para ver o nome de cada um. Clicar aqui abre a ficha direto.
 */
export function CelulaChecklist({ tarefa, onAbrir }: { tarefa: Tarefa; onAbrir: () => void }) {
  const { checklist_total: total, checklist_feitos: feitos } = tarefa;

  if (total === 0) {
    return <div className="flex h-10 items-center justify-center text-xs text-muted-foreground/50">—</div>;
  }

  const completo = feitos >= total;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`${feitos} de ${total} itens feitos — abrir a ficha para marcar`}
      className="flex h-10 w-full flex-col items-stretch justify-center gap-1 px-3 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span
        className={cn(
          'flex items-center justify-center gap-1 text-xs font-semibold tabular-nums',
          completo ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
        )}
      >
        <ListChecks className="h-3.5 w-3.5" />
        {feitos}/{total}
      </span>
      <Progress
        value={(feitos / total) * 100}
        aria-label={`${feitos} de ${total} itens feitos`}
        className={cn('h-1.5 bg-muted', completo ? '[&>div]:bg-emerald-500' : '[&>div]:bg-sky-500')}
      />
    </button>
  );
}
