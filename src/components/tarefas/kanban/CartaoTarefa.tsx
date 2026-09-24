import { forwardRef, type HTMLAttributes } from 'react';
import {
  AlignLeft,
  CalendarDays,
  CheckCheck,
  Clock,
  Hourglass,
  MessageSquare,
  Paperclip,
  SquareCheckBig,
} from 'lucide-react';
import { AvataresPessoas } from '@/components/tarefas/AvataresPessoas';
import { BadgePrioridade } from '@/components/tarefas/BadgePrioridade';
import { BadgeStatus } from '@/components/tarefas/BadgeStatus';
import { BolinhaFeito } from '@/components/tarefas/BolinhaFeito';
import { ChipDia } from '@/components/tarefas/ChipDia';
import { EtiquetaChip } from '@/components/tarefas/EtiquetaChip';
import { ehRecorrente, estaFeita, statusNoDia, travaDoFeito } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type { DiaFiltro, Tarefa } from '@/types/tarefas';

export interface PropsCartaoTarefa {
  tarefa: Tarefa;
  /** 'YYYY-MM-DD' de hoje: decide "feita hoje", "vence hoje" e "atrasada". */
  hojeISO: string;
  podeEditar: boolean;
  /**
   * Pode marcar o feito? Quem edita o quadro, ou o responsável pela tarefa
   * (ou pela coluna) mesmo sem permissão de editar — é o que o banco deixa.
   * Ausente = igual a `podeEditar`.
   */
  podeMarcar?: boolean;
  onAbrir: () => void;
  onAlternarFeito: () => void;
  /** A cópia que segue o mouse durante o arrasto. */
  flutuando?: boolean;
  /** O lugar que o cartão deixa vazio enquanto está sendo arrastado. */
  fantasma?: boolean;
  /**
   * O turno padrão da loja ("Livre", de fábrica). Toda tarefa nova nasce com
   * ele, então mostrá-lo em todo cartão era só ruído: o cartão mostra o turno
   * só quando ele diz alguma coisa (Manhã, Meio do dia, Tarde).
   */
  periodoPadraoId?: string | null;
  /** O chip de dia ligado no quadro: com o de outro dia, a bolinha da recorrente trava (lib/tarefas, travaDoFeito). */
  diaDoFiltro?: DiaFiltro;
}

/** '2026-09-20' => '20/09'. A data do prazo nunca passa por `new Date` (fuso). */
function diaEMes(dataISO: string): string {
  const [, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}`;
}

/**
 * O cartão do Kanban — o cartão do Trello do Felipe, com o que ele colava em
 * etiqueta virando informação de verdade.
 *
 * De cima para baixo: etiquetas, bolinha de feito + título, dias da semana
 * (com as cores que a equipe já conhece), e o rodapé com turno, prazo,
 * checklist, comentários e quem faz.
 *
 * Os três estados que precisam saltar aos olhos de longe, na TV da loja:
 * - **feito hoje**: título riscado e cartão apagado — já foi, não precisa olhar;
 * - **não fazer por enquanto**: cinza, com a pílula dizendo por quê;
 * - **atrasada**: faixa vermelha na esquerda e o prazo em vermelho.
 *
 * E, desde a v2 (24/09), a conferência do gerente: o cartão feito e ainda não
 * conferido sai do quadro (a página o manda para a aba Conferência); quando o
 * gerente aprova, ele volta feito e com o selo verde "Conferida" — e a
 * bolinha trava, porque desfazer é só com o gerente.
 *
 * O cartão é só desenho: quem o torna arrastável é a coluna (ListaKanban), que
 * passa as propriedades do arrasto por aqui (`...resto`). Assim a mesma peça
 * serve para a cópia que segue o mouse, que não pode ser arrastável.
 */
export const CartaoTarefa = forwardRef<HTMLDivElement, PropsCartaoTarefa & HTMLAttributes<HTMLDivElement>>(
  function CartaoTarefa(
    {
      tarefa,
      hojeISO,
      podeEditar,
      podeMarcar,
      onAbrir,
      onAlternarFeito,
      flutuando = false,
      fantasma = false,
      periodoPadraoId = null,
      diaDoFiltro = 'todas',
      className,
      onKeyDown,
      ...resto
    },
    ref,
  ) {
    const situacao = statusNoDia(tarefa, hojeISO);
    const feita = estaFeita(tarefa);
    const recorrente = ehRecorrente(tarefa);
    const pausada = situacao === 'pausada';
    const atrasada = situacao === 'atrasada';
    const conferida = tarefa.conferencia === 'conferida';
    const aguardando = tarefa.conferencia === 'aguardando';
    // Hoje não é dia da tarefa, ou o chip ligado é de outro dia: a bolinha
    // marcaria o feito de hoje no lugar errado (ver travaDoFeito).
    const trava = travaDoFeito(tarefa, hojeISO, diaDoFiltro);
    const temPermissao = podeMarcar ?? podeEditar;
    const marcar = temPermissao && !flutuando && !conferida && !trava;

    const venceHoje = !feita && tarefa.prazo === hojeISO;
    const textoDoPrazo = tarefa.prazo
      ? atrasada
        ? `Venceu ${diaEMes(tarefa.prazo)}`
        : venceHoje
          ? 'Vence hoje'
          : `Até ${diaEMes(tarefa.prazo)}`
      : null;

    const checklistCompleto = tarefa.checklist_total > 0 && tarefa.checklist_feitos === tarefa.checklist_total;
    // "Fazendo" e "Não fazer por enquanto" eram etiquetas no Trello; aqui são
    // andamento, mas continuam aparecendo no cartão porque é o que a equipe
    // procura ao bater o olho. "Não iniciado" é o normal e não precisa dizer.
    const mostraAndamento = situacao === 'fazendo' || pausada;
    // "Livre" também não aparece: é quase o mesmo que normal, e ao lado do
    // turno "Livre" virava duas vezes a mesma palavra com sentidos diferentes.
    const mostraPrioridade = tarefa.prioridade !== 'normal' && tarefa.prioridade !== 'livre';
    const periodoVisivel = tarefa.periodo && tarefa.periodo.id !== periodoPadraoId ? tarefa.periodo : null;
    const temQuando = Boolean(tarefa.horario) || Boolean(periodoVisivel);
    const temLinhaDeChips = recorrente || mostraAndamento || mostraPrioridade || conferida || aguardando;
    const temRodape =
      temQuando ||
      Boolean(textoDoPrazo) ||
      Boolean(tarefa.descricao) ||
      tarefa.checklist_total > 0 ||
      tarefa.comentarios_total > 0 ||
      tarefa.anexos_total > 0 ||
      tarefa.responsaveis.length > 0;

    const tituloDaBolinha = conferida
      ? 'Conferida pelo gerente. Só ele pode devolver.'
      : !temPermissao
        ? 'Só quem edita o quadro ou é responsável por esta tarefa pode marcar'
        : trava && !flutuando
          ? trava
          : recorrente
            ? feita
              ? 'Desmarcar o feito de hoje'
              : 'Marcar como feita hoje'
            : feita
              ? 'Reabrir a tarefa'
              : 'Marcar como concluída';

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={`Abrir a tarefa ${tarefa.titulo}`}
        {...resto}
        onClick={onAbrir}
        onKeyDown={(e) => {
          // Enter abre a ficha (espaço é o que pega o cartão para mover). Só
          // quando o foco está no próprio cartão: Enter na bolinha é da bolinha.
          if (e.key === 'Enter' && e.target === e.currentTarget) {
            e.preventDefault();
            onAbrir();
            return;
          }
          onKeyDown?.(e);
        }}
        className={cn(
          'group/cartao relative select-none rounded-lg border bg-card p-3 text-left shadow-sm outline-none',
          'transition-[box-shadow,border-color,opacity,background-color] duration-150',
          'hover:border-primary/40 hover:shadow-md active:scale-[0.99]',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          podeEditar ? 'cursor-grab' : 'cursor-pointer',
          atrasada && 'border-l-4 border-l-red-500',
          pausada && 'bg-muted/80',
          feita && 'opacity-70 hover:opacity-100',
          fantasma && 'border-dashed border-primary/40 opacity-40 shadow-none',
          flutuando && 'rotate-2 cursor-grabbing border-primary/40 opacity-100 shadow-xl ring-2 ring-primary/20',
          className,
        )}
      >
        {tarefa.etiquetas.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {tarefa.etiquetas.map((e) => (
              <EtiquetaChip key={e.id} etiqueta={e} pequena />
            ))}
          </div>
        )}

        <div className="flex items-start gap-2">
          <div className="pt-px">
            <BolinhaFeito feita={feita} onClick={onAlternarFeito} disabled={!marcar} titulo={tituloDaBolinha} />
          </div>
          <p
            className={cn(
              'min-w-0 flex-1 whitespace-pre-line break-words text-sm font-medium leading-snug',
              feita && 'text-muted-foreground line-through decoration-2',
              pausada && !feita && 'text-muted-foreground',
            )}
          >
            {tarefa.titulo}
          </p>
        </div>

        {temLinhaDeChips && (
          <div className="mt-2 flex flex-wrap items-center gap-1 pl-7">
            <ChipDia dias={tarefa.dias_semana} compacto />
            {mostraAndamento && <BadgeStatus status={situacao} className="px-1.5 py-0 text-[10px]" />}
            {mostraPrioridade && <BadgePrioridade prioridade={tarefa.prioridade} className="px-1.5 py-0 text-[10px]" />}
            {conferida && (
              <span
                title="O gerente conferiu e aprovou"
                className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
              >
                <CheckCheck className="h-3 w-3" />
                Conferida
              </span>
            )}
            {/* A página tira do quadro o que aguarda conferência. Se um cartão
                assim chegar aqui mesmo assim, ele diz onde está, em vez de
                parecer um feito comum. */}
            {aguardando && (
              <span
                title="Feita, esperando a conferência do gerente"
                className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300"
              >
                <Hourglass className="h-3 w-3" />
                Na conferência
              </span>
            )}
          </div>
        )}

        {temRodape && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            {/* "10:00 · Manhã": a hora vem antes e em destaque, porque é ela
                que diz quando fazer; o turno só situa. */}
            {temQuando && (
              <span
                className="inline-flex max-w-[11rem] items-center gap-1"
                title={[tarefa.horario && `Às ${tarefa.horario}`, periodoVisivel?.descricao].filter(Boolean).join(' · ')}
              >
                <Clock className="h-3 w-3 shrink-0" />
                {tarefa.horario && (
                  <span className="font-semibold tabular-nums text-foreground/80">{tarefa.horario}</span>
                )}
                {tarefa.horario && periodoVisivel && <span aria-hidden>·</span>}
                {periodoVisivel && <span className="truncate">{periodoVisivel.descricao}</span>}
              </span>
            )}
            {textoDoPrazo && (
              <span
                title={atrasada ? 'Prazo vencido' : 'Prazo'}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1 py-0.5',
                  atrasada && 'bg-red-500/10 font-semibold text-red-600',
                  venceHoje && 'bg-amber-500/15 font-semibold text-amber-700',
                )}
              >
                <CalendarDays className="h-3 w-3 shrink-0" />
                {textoDoPrazo}
              </span>
            )}
            {tarefa.descricao && (
              <span title="Esta tarefa tem descrição" className="inline-flex items-center">
                <AlignLeft className="h-3 w-3" />
              </span>
            )}
            {tarefa.checklist_total > 0 && (
              <span
                title={`Checklist: ${tarefa.checklist_feitos} de ${tarefa.checklist_total} itens feitos`}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1 py-0.5 tabular-nums',
                  checklistCompleto && 'bg-emerald-500/15 font-semibold text-emerald-700',
                )}
              >
                <SquareCheckBig className="h-3 w-3 shrink-0" />
                {tarefa.checklist_feitos}/{tarefa.checklist_total}
              </span>
            )}
            {tarefa.comentarios_total > 0 && (
              <span
                title={tarefa.comentarios_total === 1 ? '1 comentário' : `${tarefa.comentarios_total} comentários`}
                className="inline-flex items-center gap-1 tabular-nums"
              >
                <MessageSquare className="h-3 w-3 shrink-0" />
                {tarefa.comentarios_total}
              </span>
            )}
            {tarefa.anexos_total > 0 && (
              <span
                title={tarefa.anexos_total === 1 ? '1 anexo' : `${tarefa.anexos_total} anexos`}
                className="inline-flex items-center gap-1 tabular-nums"
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                {tarefa.anexos_total}
              </span>
            )}
            {tarefa.responsaveis.length > 0 && (
              <span className="ml-auto">
                <AvataresPessoas pessoas={tarefa.responsaveis} max={3} />
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);
