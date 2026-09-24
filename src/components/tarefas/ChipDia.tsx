import { DIAS_SEMANA, TODOS_OS_DIAS } from '@/config/tarefas';
import { cn } from '@/lib/utils';

/**
 * Os dias em que a tarefa se repete, com as cores das etiquetas de dia do
 * Trello do Felipe — só que agora é campo da tarefa, não etiqueta improvisada.
 *
 * Os sete dias viram uma pílula só, "Todos os dias", em verde: sete pílulas
 * enfileiradas num cartão estreito seriam ruído.
 */
export function ChipDia({ dias, compacto = false }: { dias: number[]; compacto?: boolean }) {
  const unicos = new Set(dias ?? []);
  const base = 'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none';

  if (unicos.size === 0) {
    if (compacto) return null;
    return <span className={cn(base, 'bg-slate-200 text-slate-700')}>Avulsa</span>;
  }

  if (unicos.size >= 7) {
    return <span className={cn(base, TODOS_OS_DIAS.cor)}>{TODOS_OS_DIAS.label}</span>;
  }

  return (
    <span className="inline-flex flex-wrap gap-1">
      {DIAS_SEMANA.filter((d) => unicos.has(d.n)).map((d) => (
        <span key={d.n} title={d.nome} className={cn(base, d.cor)}>
          {d.curto}
        </span>
      ))}
    </span>
  );
}
