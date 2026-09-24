import { Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AcoesDoQuadro, PeriodoOpcao, Tarefa } from '@/types/tarefas';

/** O Select do sistema não aceita valor vazio; este marca "sem período". */
const SEM_PERIODO = '__sem_periodo__';

/**
 * Turno do dia (Manhã, Meio do dia, Tarde, Livre...), do catálogo
 * `tarefa_periodo` — a loja cadastra os dela em Listas do Sistema e eles
 * aparecem aqui sozinhos.
 *
 * O período já escolhido aparece mesmo desativado no catálogo (regra das
 * listas editáveis): sem isso a célula viria vazia, e a próxima escolha
 * apagaria em silêncio o turno antigo da tarefa.
 */
export function CelulaPeriodo({
  tarefa,
  periodos,
  podeEditar,
  acoes,
}: {
  tarefa: Tarefa;
  periodos: PeriodoOpcao[];
  podeEditar: boolean;
  acoes: Pick<AcoesDoQuadro, 'atualizarTarefa'>;
}) {
  const opcoes = periodos.filter((p) => p.ativo || p.id === tarefa.periodo_id);
  if (tarefa.periodo && !opcoes.some((p) => p.id === tarefa.periodo_id)) {
    opcoes.push({ id: tarefa.periodo.id, descricao: tarefa.periodo.descricao, ativo: false });
  }
  const escolhido = opcoes.find((p) => p.id === tarefa.periodo_id) ?? null;
  const texto = escolhido?.descricao ?? tarefa.periodo?.descricao ?? null;

  const conteudo = (
    <span className="flex min-w-0 items-center gap-1.5">
      <Clock className={cn('h-3.5 w-3.5 shrink-0', texto ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground/50')} />
      <span className={cn('truncate', !texto && 'text-muted-foreground')}>{texto ?? 'Sem horário'}</span>
    </span>
  );

  if (!podeEditar) {
    return (
      <div className="flex h-10 items-center px-3 text-xs" title={texto ?? 'Sem horário definido'}>
        {conteudo}
      </div>
    );
  }

  return (
    <Select
      value={tarefa.periodo_id ?? SEM_PERIODO}
      onValueChange={(v) => {
        const periodo_id = v === SEM_PERIODO ? null : v;
        if (periodo_id !== tarefa.periodo_id) acoes.atualizarTarefa({ id: tarefa.id, periodo_id });
      }}
    >
      <SelectTrigger
        title={texto ? `${texto} — clique para mudar o turno` : 'Escolher o turno do dia'}
        className="h-10 rounded-none border-0 bg-transparent px-3 text-xs shadow-none transition-colors hover:bg-muted/70 focus:ring-2 focus:ring-inset focus:ring-offset-0 [&>svg]:opacity-0 hover:[&>svg]:opacity-50"
      >
        <SelectValue>{conteudo}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_PERIODO}>
          <span className="text-muted-foreground">Sem horário definido</span>
        </SelectItem>
        {opcoes.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.descricao}
            {!p.ativo && <span className="ml-1 text-muted-foreground">(desativado)</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
