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
 *
 * Desde a v2 (24/09) a célula também mostra a hora marcada, na frente do
 * turno ("10:00 · Manhã"). Só mostra: clicar continua escolhendo o turno, e a
 * hora se muda pela ficha — uma célula com dois seletores dentro ficaria
 * pequena demais para acertar o clique.
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
  const horario = tarefa.horario;
  const temAlgo = Boolean(texto || horario);
  // Por extenso no title: a célula é estreita e o turno pode ser cortado.
  const descricao = [horario && `Às ${horario}`, texto].filter(Boolean).join(' · ') || 'Sem período definido';

  const conteudo = (
    <span className="flex min-w-0 items-center gap-1.5">
      <Clock className={cn('h-3.5 w-3.5 shrink-0', temAlgo ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground/50')} />
      {horario && <span className="shrink-0 font-semibold tabular-nums">{horario}</span>}
      {horario && texto && (
        <span aria-hidden className="shrink-0 text-muted-foreground">
          ·
        </span>
      )}
      {(texto || !horario) && (
        <span className={cn('truncate', !texto && 'text-muted-foreground')}>{texto ?? 'Sem período'}</span>
      )}
    </span>
  );

  if (!podeEditar) {
    return (
      <div className="flex h-10 items-center px-3 text-xs" title={descricao}>
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
        title={
          temAlgo
            ? `${descricao} — clique para mudar o turno${horario ? ' (a hora se muda na ficha)' : ''}`
            : 'Escolher o turno do dia'
        }
        className="h-10 rounded-none border-0 bg-transparent px-3 text-xs shadow-none transition-colors hover:bg-muted/70 focus:ring-2 focus:ring-inset focus:ring-offset-0 [&>svg]:opacity-0 hover:[&>svg]:opacity-50"
      >
        <SelectValue>{conteudo}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_PERIODO}>
          <span className="text-muted-foreground">Sem período definido</span>
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
