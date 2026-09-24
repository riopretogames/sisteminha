import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Lock,
  RefreshCw,
  Undo2,
  UserRound,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AvataresPessoas } from '@/components/tarefas/AvataresPessoas';
import { BadgePrioridade } from '@/components/tarefas/BadgePrioridade';
import { ChipDia } from '@/components/tarefas/ChipDia';
import { useConferencia } from '@/hooks/useConferencia';
import { corDaEtiqueta } from '@/lib/cores';
import { hojeISO } from '@/lib/format';
import { primeiroNome } from '@/lib/tarefas';
import { mensagemLeiga } from '@/lib/tarefasMutacoes';
import { cn } from '@/lib/utils';
import type { ItemDeConferencia, Pessoa } from '@/types/tarefas';
import { agruparPorDia, enderecoDoFeito, fraseDoCabecalho, horaDoFeito, textoDoDevolver } from './gruposDaConferencia';

/**
 * A Conferência — o que a equipe marcou como feito, esperando o gerente.
 *
 * Pedido do Felipe em 24/09: "toda vez que eu marcasse um item como concluído,
 * ele fosse para a aba de conferência, que meu gerente vai lá e vai conferir o
 * que foi feito". O gerente tem duas respostas para cada feito:
 *
 *   - **Conferido**: a tarefa volta ao quadro como feita, com o selo;
 *   - **Devolver**: o feito é desfeito e a tarefa volta pendente para a pessoa
 *     ("voltava para a função original dele... no dia específico do Pedro").
 *
 * Serve a dois lugares: a aba Conferência dentro de um quadro (`quadroId`,
 * só aquele quadro) e a página Conferência do menu (sem `quadroId`, todos os
 * quadros — aí cada item diz de que quadro é).
 *
 * Quem não confere (não tem `tasks.review`) vê a lista, mas sem os botões: é
 * útil saber o que está esperando, e o banco recusaria o clique de qualquer
 * jeito.
 */

export interface PropsConferenciaView {
  /** Presente = só este quadro (a aba). Ausente = todos (a página do menu). */
  quadroId?: string;
  /** Cadastro da loja: o nome e a foto de quem marcou vêm daqui. */
  pessoas: Pessoa[];
  /** Tem `tasks.review`. Sem ela, a lista aparece sem os botões. */
  podeConferir: boolean;
  /**
   * Clique no título. Ausente = abre a ficha no quadro da tarefa, já na aba
   * Conferência: ao fechar a ficha, o gerente continua conferindo de onde
   * parou em vez de cair no Kanban (onde a tarefa que espera nem aparece).
   */
  onAbrirTarefa?: (item: ItemDeConferencia) => void;
}

/* ── Um feito ──────────────────────────────────────────────────────────────── */

function ItemDaConferencia({
  item,
  pessoa,
  mostrarQuadro,
  podeConferir,
  hoje,
  onAbrir,
  onAprovar,
  onDevolver,
}: {
  item: ItemDeConferencia;
  pessoa: Pessoa | null;
  mostrarQuadro: boolean;
  podeConferir: boolean;
  hoje: string;
  onAbrir: () => void;
  onAprovar: () => void;
  onDevolver: () => void;
}) {
  const [confirmandoDevolver, setConfirmandoDevolver] = useState(false);
  const importante = item.prioridade === 'alta' || item.prioridade === 'urgente';
  const hora = horaDoFeito(item.feita_em);
  const quem = pessoa ? primeiroNome(pessoa.nome) : null;
  const devolver = textoDoDevolver(item, quem, hoje);

  return (
    <li className="group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {pessoa ? (
            <AvataresPessoas pessoas={[pessoa]} max={1} tamanho="md" />
          ) : (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              aria-hidden
            >
              <UserRound className="h-4 w-4" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onAbrir}
            title="Abrir a ficha da tarefa"
            className="text-left font-medium leading-snug underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.titulo}
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {pessoa && item.dia === null ? (
                // Avulsa: o banco não guarda quem clicou, só de quem a tarefa é.
                <>
                  Responsável: <span className="font-medium text-foreground">{pessoa.nome}</span> · concluída às{' '}
                  {hora}
                </>
              ) : pessoa ? (
                <>
                  <span className="font-medium text-foreground">{pessoa.nome}</span> marcou às {hora}
                </>
              ) : item.feita_por ? (
                `Marcada como feita às ${hora}`
              ) : (
                `Concluída às ${hora}`
              )}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className={cn('h-2 w-2 shrink-0 rounded-full', corDaEtiqueta(item.lista_cor, item.lista_nome))}
                aria-hidden
              />
              {mostrarQuadro && item.quadro_nome && (
                <>
                  <span className="truncate">{item.quadro_nome}</span>
                  <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
                </>
              )}
              <span className="truncate">{item.lista_nome}</span>
            </span>
            <ChipDia dias={item.dias_semana} compacto />
            {item.horario && (
              <span className="inline-flex items-center gap-1" title="Horário marcado na tarefa">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {item.horario}
              </span>
            )}
            {importante && <BadgePrioridade prioridade={item.prioridade} />}
          </div>
        </div>
      </div>

      {podeConferir && (
        <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
          <Button
            size="sm"
            onClick={onAprovar}
            title="Foi feito mesmo: a tarefa volta ao quadro como feita"
            className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          >
            <Check className="h-4 w-4" />
            Conferido
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmandoDevolver(true)}
            title="Não foi feito (ou não do jeito certo): a tarefa volta pendente"
            className="hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
          >
            <Undo2 className="h-4 w-4" />
            Devolver
          </Button>
        </div>
      )}

      <AlertDialog open={confirmandoDevolver} onOpenChange={setConfirmandoDevolver}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{devolver.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{devolver.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-600 text-white hover:bg-amber-700" onClick={onDevolver}>
              <Undo2 className="h-4 w-4" />
              Devolver tarefa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/* ── A lista ───────────────────────────────────────────────────────────────── */

export function ConferenciaView({ quadroId, pessoas, podeConferir, onAbrirTarefa }: PropsConferenciaView) {
  const navigate = useNavigate();
  const { itens, carregando, erro, recarregar, aprovar, devolver } = useConferencia(quadroId);

  // "Hoje" calculado a cada desenho, nunca guardado: a aba esquecida aberta
  // de um dia para o outro passa a chamar o feito de ontem de "Ontem".
  const hoje = hojeISO();
  const grupos = useMemo(() => agruparPorDia(itens, hoje), [itens, hoje]);
  const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

  // O dia vai junto no endereço: o feito de ontem abre a ficha no feito de
  // ONTEM (com o Conferir/Devolver dele), não no de hoje.
  const abrir = (item: ItemDeConferencia) => {
    if (onAbrirTarefa) onAbrirTarefa(item);
    else navigate(`/tarefas/${item.quadro_id}?${enderecoDoFeito(item)}`);
  };

  if (carregando) {
    return (
      <div className="space-y-3" aria-label="Carregando a conferência">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-5 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-8 w-40" />
          </div>
        ))}
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-destructive" />
        <p className="mt-3 font-semibold">Não foi possível carregar a conferência.</p>
        <p className="mt-1 text-sm text-muted-foreground">{mensagemLeiga(erro)}</p>
        <Button variant="outline" className="mt-4" onClick={() => void recarregar()}>
          <RefreshCw className="h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-14 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
          <CheckCheck className="h-7 w-7" />
        </span>
        <p className="mt-4 text-lg font-semibold">Nada para conferir.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Tudo que a equipe marcou como feito já foi conferido.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-card to-card p-4 shadow-sm dark:border-amber-500/30 dark:from-amber-500/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{fraseDoCabecalho(itens.length)}</h2>
          {podeConferir ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Veja se foi feito mesmo. <span className="font-medium text-foreground">Conferido</span> devolve a tarefa
              ao quadro como feita; <span className="font-medium text-foreground">Devolver</span> faz ela voltar
              pendente para a pessoa.
            </p>
          ) : (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Só quem confere tarefas pode aprovar ou devolver.
            </p>
          )}
        </div>
      </div>

      {grupos.map((grupo) => (
        <section key={grupo.dia} aria-label={grupo.rotulo} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-semibold">{grupo.rotulo}</h3>
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground"
              title={`${grupo.itens.length} ${grupo.itens.length === 1 ? 'feita' : 'feitas'} neste dia`}
            >
              {grupo.itens.length}
            </span>
            {grupo.atrasado && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                Ficou sem conferir
              </span>
            )}
          </div>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
            {grupo.itens.map((item) => (
              <ItemDaConferencia
                key={`${item.tarefa_id}:${item.dia ?? 'avulsa'}`}
                item={item}
                pessoa={item.feita_por ? pessoaPorId.get(item.feita_por) ?? null : null}
                mostrarQuadro={!quadroId}
                podeConferir={podeConferir}
                hoje={hoje}
                onAbrir={() => abrir(item)}
                onAprovar={() => void aprovar(item)}
                onDevolver={() => void devolver(item)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
