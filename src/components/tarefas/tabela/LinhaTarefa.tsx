import { AlignLeft, CheckCheck, Maximize2, MessageSquare, Paperclip } from 'lucide-react';
import { BolinhaFeito } from '@/components/tarefas/BolinhaFeito';
import { ehRecorrente, estaFeita, statusNoDia } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type { AcoesDoQuadro, Etiqueta, PeriodoOpcao, Pessoa, Tarefa } from '@/types/tarefas';
import { CELULA, CELULA_FIXA } from './colunas';
import type { EstiloDaLista } from './estiloDaLista';
import { CelulaChecklist } from './celulas/CelulaChecklist';
import { CelulaDias } from './celulas/CelulaDias';
import { CelulaEtiquetas } from './celulas/CelulaEtiquetas';
import { CelulaPeriodo } from './celulas/CelulaPeriodo';
import { CelulaPessoas } from './celulas/CelulaPessoas';
import { CelulaPrazo } from './celulas/CelulaPrazo';
import { CelulaPrioridade } from './celulas/CelulaPrioridade';
import { CelulaStatus } from './celulas/CelulaStatus';

function tituloDaBolinha(tarefa: Tarefa, feita: boolean, pode: boolean): string {
  if (tarefa.conferencia === 'conferida') return 'Conferida pelo gerente. Só ele pode devolver.';
  if (!pode) return 'Só quem faz esta tarefa, ou quem pode editar o quadro, marca o feito.';
  if (ehRecorrente(tarefa)) return feita ? 'Desmarcar o feito de hoje' : 'Marcar como feita hoje';
  return feita ? 'Desmarcar concluída' : 'Marcar como concluída';
}

/**
 * Uma tarefa = uma linha, como no Monday. A faixa colorida na esquerda é a
 * cor da lista (o grupo), a bolinha marca o feito sem abrir nada, e o título
 * abre a ficha. As demais colunas se editam ali mesmo, na célula.
 *
 * Duas permissões diferentes, de propósito: `podeEditar` (tasks.edit) muda
 * tudo; `podeMarcarAndamento` (editar OU ser o responsável) só a bolinha e o
 * status. É a mesma porta estreita que o banco dá ao responsável.
 */
export function LinhaTarefa({
  tarefa,
  estilo,
  hojeISO,
  podeEditar,
  podeMarcarAndamento,
  acoes,
  onAbrir,
  pessoas,
  periodos,
  etiquetas,
}: {
  tarefa: Tarefa;
  estilo: EstiloDaLista;
  hojeISO: string;
  podeEditar: boolean;
  podeMarcarAndamento: boolean;
  acoes: AcoesDoQuadro;
  onAbrir: (tarefaId: string) => void;
  pessoas: Pessoa[];
  periodos: PeriodoOpcao[];
  etiquetas: Etiqueta[];
}) {
  const feita = estaFeita(tarefa);
  const pausada = statusNoDia(tarefa, hojeISO) === 'pausada';
  const abrir = () => onAbrir(tarefa.id);

  return (
    <tr className="group/linha">
      <td className={cn(CELULA_FIXA, estilo.borda)}>
        <div className="flex h-10 items-center gap-2.5 pl-3 pr-2 transition-colors group-hover/linha:bg-muted/50">
          <BolinhaFeito
            feita={feita}
            // Feito conferido pelo gerente (v2): desmarcar é só com ele, pela
            // conferência — o banco recusaria o clique de qualquer outro.
            disabled={!podeMarcarAndamento || tarefa.conferencia === 'conferida'}
            titulo={tituloDaBolinha(tarefa, feita, podeMarcarAndamento)}
            onClick={() => acoes.alternarFeito(tarefa.id)}
          />
          <button
            type="button"
            onClick={abrir}
            title={tarefa.titulo}
            className={cn(
              'min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors',
              'hover:text-primary focus-visible:underline focus-visible:outline-none',
              feita && 'text-muted-foreground line-through decoration-muted-foreground/60',
              pausada && !feita && 'text-muted-foreground',
            )}
          >
            {tarefa.titulo}
          </button>
          {/* Os mesmos sinais do cartão do Kanban (v2): o selo de conferida e o
              clipe com a contagem de anexos, para a Tabela não esconder o que
              o Kanban mostra. */}
          {tarefa.conferencia === 'conferida' && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
              title="Conferida pelo gerente"
            >
              <CheckCheck className="h-3 w-3" />
              Conferida
            </span>
          )}
          {(tarefa.descricao || tarefa.comentarios_total > 0 || tarefa.anexos_total > 0) && (
            <span className="flex shrink-0 items-center gap-2 text-muted-foreground/70">
              {tarefa.anexos_total > 0 && (
                <span
                  className="flex items-center gap-0.5 text-[11px] font-medium tabular-nums"
                  title={tarefa.anexos_total === 1 ? '1 anexo' : `${tarefa.anexos_total} anexos`}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {tarefa.anexos_total}
                </span>
              )}
              {tarefa.descricao && (
                <span title="Tem descrição">
                  <AlignLeft className="h-3.5 w-3.5" />
                </span>
              )}
              {tarefa.comentarios_total > 0 && (
                <span
                  className="flex items-center gap-0.5 text-[11px] font-medium tabular-nums"
                  title={`${tarefa.comentarios_total} comentário(s)`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {tarefa.comentarios_total}
                </span>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={abrir}
            tabIndex={-1}
            aria-hidden
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm',
              'opacity-0 transition-opacity hover:text-foreground group-hover/linha:opacity-100',
            )}
          >
            <Maximize2 className="h-3 w-3" />
            Abrir
          </button>
        </div>
      </td>
      <td className={CELULA}>
        <CelulaPessoas tarefa={tarefa} pessoas={pessoas} podeEditar={podeEditar} acoes={acoes} />
      </td>
      <td className={CELULA}>
        <CelulaPrioridade tarefa={tarefa} podeEditar={podeEditar} acoes={acoes} />
      </td>
      <td className={CELULA}>
        <CelulaStatus tarefa={tarefa} hojeISO={hojeISO} podeMarcarAndamento={podeMarcarAndamento} acoes={acoes} />
      </td>
      <td className={CELULA}>
        <CelulaDias tarefa={tarefa} podeEditar={podeEditar} acoes={acoes} />
      </td>
      <td className={CELULA}>
        <CelulaPeriodo tarefa={tarefa} periodos={periodos} podeEditar={podeEditar} acoes={acoes} />
      </td>
      <td className={CELULA}>
        <CelulaEtiquetas tarefa={tarefa} etiquetas={etiquetas} podeEditar={podeEditar} acoes={acoes} />
      </td>
      <td className={CELULA}>
        <CelulaPrazo tarefa={tarefa} hojeISO={hojeISO} podeEditar={podeEditar} acoes={acoes} />
      </td>
      <td className={CELULA}>
        <CelulaChecklist tarefa={tarefa} onAbrir={abrir} />
      </td>
    </tr>
  );
}
