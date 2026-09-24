import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  AlignLeft,
  Archive,
  CalendarClock,
  Check,
  CheckCheck,
  CircleDot,
  Clock,
  Columns3,
  Eye,
  Flag,
  Hourglass,
  ListChecks,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Repeat,
  Tag,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Anexos } from '@/components/tarefas/Anexos';
import { AvataresPessoas } from '@/components/tarefas/AvataresPessoas';
import { BolinhaFeito } from '@/components/tarefas/BolinhaFeito';
import { ChipDia } from '@/components/tarefas/ChipDia';
import { SeletorDias } from '@/components/tarefas/SeletorDias';
import { SeletorEtiquetas } from '@/components/tarefas/SeletorEtiquetas';
import { SeletorPessoas } from '@/components/tarefas/SeletorPessoas';
import { horaDoFeito, rotuloDoDia, textoDoDevolver } from '@/components/tarefas/conferencia/gruposDaConferencia';
import { STATUS_ATRASADA, TAREFA_PRIORIDADES, TAREFA_STATUS } from '@/config/tarefas';
import { useAuth } from '@/hooks/useAuth';
import { mesmoItem, useConferencia } from '@/hooks/useConferencia';
import { chaveDoQuadro, useTarefaDetalhe, type DadosDoQuadro } from '@/hooks/useQuadro';
import { corDaEtiqueta } from '@/lib/cores';
import { data as formatarData, dataHora, hojeISO } from '@/lib/format';
import {
  quandoFoi,
  descreverDias,
  ehRecorrente,
  estaFeita,
  normalizarHorario,
  ordemEntre,
  ordenarPorOrdem,
  primeiroNome,
  statusNoDia,
} from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type {
  Comentario,
  HorarioOpcao,
  ItemChecklist,
  ItemDeConferencia,
  Pessoa,
  PeriodoOpcao,
  PropsTarefaDialog,
  Tarefa,
  TarefaPrioridade,
  TarefaStatus,
} from '@/types/tarefas';

/**
 * A ficha da tarefa — o "verso do cartão" do Trello, com as colunas do Monday
 * do lado direito.
 *
 * Não tem botão "Salvar": cada mudança grava na hora (o título e a descrição
 * ao sair do campo). É assim que o Trello e o Monday funcionam, e é o que a
 * equipe já espera — uma ficha com "Salvar" no pé seria fechada sem salvar na
 * primeira semana. As gravações vêm de `acoes` (useQuadro), que mostram a
 * mudança antes de o banco responder e desfazem com aviso se ele recusar.
 *
 * Quem pode o quê (a mesma regra do banco, migration 20260923220000):
 * - `tasks.edit` (podeEditar): muda tudo.
 * - Responsável pela tarefa, sem `tasks.edit`: marca o andamento (status,
 *   "feita hoje", caixinhas do checklist) e nada mais — o gatilho
 *   `travas_das_tarefas` recusa o resto, então a tela nem oferece.
 * - Qualquer um que vê: comenta. Apaga o próprio comentário; `tasks.manage`
 *   (podeGerenciar) apaga o de qualquer um.
 * - Anexar é andamento (v2): quem marca o feito também anexa a foto do que
 *   fez. Remove o anexo quem enviou, ou quem edita o quadro.
 * - `tasks.review` (podeConferir, v2): confere ou devolve o feito pela própria
 *   ficha. Feito já conferido fica travado para os outros — o gatilho
 *   `trava_conclusao_conferida` recusaria desmarcar, então a tela nem oferece.
 */
export function TarefaDialog(props: PropsTarefaDialog) {
  const { tarefa, onClose } = props;
  return (
    <Dialog
      open={Boolean(tarefa)}
      onOpenChange={(aberto) => {
        if (!aberto) onClose();
      }}
    >
      {/* `key`: trocar de tarefa com a ficha aberta começa do zero — sem
          rascunho de título ou comentário de uma vazando para a outra. */}
      {tarefa && <FichaDaTarefa key={tarefa.id} {...props} tarefa={tarefa} />}
    </Dialog>
  );
}

/** Valor do seletor de período que quer dizer "nenhum" (Radix não aceita vazio). */
const SEM_PERIODO = '__sem_periodo';
/** Idem, para o horário. */
const SEM_HORARIO = '__sem_horario';
/** O item "Outro horário..." do seletor: abre o campo de digitar a hora. */
const OUTRO_HORARIO = '__outro_horario';

const STATUS_NA_ORDEM = Object.keys(TAREFA_STATUS) as TarefaStatus[];

/** Da mais urgente para a mais tranquila, como a pessoa procura. */
const PRIORIDADES_NA_ORDEM = (Object.keys(TAREFA_PRIORIDADES) as TarefaPrioridade[]).sort(
  (a, b) => TAREFA_PRIORIDADES[b].ordem - TAREFA_PRIORIDADES[a].ordem,
);

/** "Concluída em 12/09 às 10:00", mas "Concluída hoje às 14:30" e "Concluída há 5 min". */
function comPreposicao(quando: string): string {
  return /^\d/.test(quando) ? `em ${quando}` : quando;
}

function FichaDaTarefa({
  tarefa,
  listas,
  podeEditar,
  podeGerenciar,
  acoes,
  pessoas,
  periodos,
  etiquetas,
  horarios,
  podeConferir,
  diaDaConferencia,
  onClose,
}: PropsTarefaDialog & { tarefa: Tarefa }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const detalhe = useTarefaDetalhe(tarefa.id);

  const hoje = hojeISO();
  const meuId = user?.id ?? null;
  const eu: Pessoa | null = user?.profile
    ? { id: user.profile.id, nome: user.profile.nome, avatar_url: user.profile.avatar_url }
    : null;

  const lista = listas.find((l) => l.id === tarefa.lista_id) ?? null;
  const corDaLista = corDaEtiqueta(lista?.cor, lista?.nome ?? 'Lista');
  const recorrente = ehRecorrente(tarefa);
  const feita = estaFeita(tarefa);
  const situacao = statusNoDia(tarefa, hoje);
  const hojeNaoEDia = recorrente && !tarefa.dias_semana.includes(new Date().getDay());

  // A coluna do Pedro é do Pedro: quem é dono da lista também é responsável
  // (mesma regra de `eh_responsavel_da_tarefa` no banco).
  const ehResponsavel =
    Boolean(meuId) &&
    (tarefa.responsaveis.some((p) => p.id === meuId) || lista?.responsavel_id === meuId);
  const podeMarcar = podeEditar || ehResponsavel;

  // Conferência do gerente (v2). Aguardando = feita, fora do quadro, na aba
  // Conferência. Conferida = o gerente aprovou; desfazer é só com ele.
  const aguardando = tarefa.conferencia === 'aguardando';
  const conferida = tarefa.conferencia === 'conferida';
  // O feito de OUTRO dia que o gerente clicou na aba (`?dia=`). O de hoje é
  // o bloco de cima; este ganha uma faixa própria logo abaixo.
  const diaDeOutroFeito =
    recorrente && diaDaConferencia && diaDaConferencia !== hoje ? diaDaConferencia : null;

  const [confirmandoArquivar, setConfirmandoArquivar] = useState(false);
  const [comentarioParaApagar, setComentarioParaApagar] = useState<Comentario | null>(null);

  // Quem já está na tarefa mas saiu do cadastro ativo continua aparecendo no
  // seletor — senão mexer em outra pessoa tiraria essa em silêncio.
  const pessoasDoSeletor = useMemo(() => {
    const todas = [...pessoas];
    for (const p of tarefa.responsaveis) if (!todas.some((x) => x.id === p.id)) todas.push(p);
    return todas;
  }, [pessoas, tarefa.responsaveis]);

  // Regra das listas editáveis: o período escolhido aparece mesmo desativado,
  // senão abrir a ficha e mexer em outra coisa apagaria a escolha antiga.
  const opcoesDePeriodo = useMemo((): PeriodoOpcao[] => {
    const opcoes = periodos.filter((p) => p.ativo || p.id === tarefa.periodo_id);
    if (tarefa.periodo && !opcoes.some((p) => p.id === tarefa.periodo!.id)) {
      opcoes.push({ ...tarefa.periodo, ativo: false });
    }
    return opcoes;
  }, [periodos, tarefa.periodo_id, tarefa.periodo]);

  const valorDoStatus: TarefaStatus = feita ? 'feito' : tarefa.status;
  const pinturaDoStatus =
    situacao === 'atrasada' ? STATUS_ATRASADA : TAREFA_STATUS[situacao] ?? TAREFA_STATUS.nao_iniciado;
  const rotuloDoStatus = (s: TarefaStatus) =>
    s === 'feito' && recorrente ? 'Feito hoje' : TAREFA_STATUS[s].label;

  /**
   * Mover pela ficha põe a tarefa no FIM da lista de destino, como o "Mover"
   * do Trello. A ficha não recebe as tarefas do quadro, então lê o que o
   * quadro já tem carregado; se não houver nada, o próprio useQuadro
   * renumera a coluna quando duas posições empatam.
   */
  const moverParaLista = (listaId: string) => {
    if (listaId === tarefa.lista_id) return;
    const dados = qc.getQueryData<DadosDoQuadro>(chaveDoQuadro(tarefa.quadro_id));
    const destino = ordenarPorOrdem(
      (dados?.tarefas ?? []).filter((t) => t.lista_id === listaId && t.id !== tarefa.id),
    );
    const ultima = destino[destino.length - 1];
    void acoes.moverTarefa({ id: tarefa.id, lista_id: listaId, ordem: ordemEntre(ultima?.ordem, undefined) });
  };

  const arquivar = () => {
    void acoes.arquivarTarefa(tarefa.id);
    onClose();
  };

  const comentariosRecentesPrimeiro = [...detalhe.comentarios].reverse();

  return (
    <DialogContent
      className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl"
      // Arquivo solto FORA da área de anexos: sem isto o navegador abriria o
      // arquivo no lugar do sistema, e a pessoa perderia a tela. A área de
      // anexos cuida do dela antes de chegar aqui.
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'none';
      }}
      onDrop={(e) => e.preventDefault()}
    >
      {/* Faixa na cor da coluna: bate o olho e sabe de onde a tarefa é. */}
      <div aria-hidden className={cn('h-2 w-full shrink-0 sm:rounded-t-lg', corDaLista)} />

      <div className="space-y-4 px-5 pb-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 pr-8 text-xs">
          <span
            className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold', corDaLista)}
          >
            <Columns3 className="h-3.5 w-3.5" />
            {lista?.nome ?? 'Coluna'}
          </span>
          {(tarefa.horario || tarefa.periodo) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {tarefa.horario && <span className="font-bold tabular-nums text-foreground">{tarefa.horario}</span>}
              {tarefa.horario && tarefa.periodo && <span aria-hidden>·</span>}
              {tarefa.periodo && <span>{tarefa.periodo.descricao}</span>}
            </span>
          )}
          <ChipDia dias={tarefa.dias_semana} />
          {aguardando && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
              <Hourglass className="h-3.5 w-3.5" />
              Aguardando conferência
            </span>
          )}
          {conferida && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <CheckCheck className="h-3.5 w-3.5" />
              Conferida pelo gerente
            </span>
          )}
        </div>

        {podeEditar ? (
          <>
            <DialogTitle className="sr-only">{tarefa.titulo}</DialogTitle>
            <CampoTitulo
              valor={tarefa.titulo}
              onSalvar={(titulo) => acoes.atualizarTarefa({ id: tarefa.id, titulo })}
            />
          </>
        ) : (
          <DialogTitle className="text-xl font-bold leading-snug sm:text-2xl">{tarefa.titulo}</DialogTitle>
        )}
        <DialogDescription className="sr-only">
          Ficha da tarefa na coluna {lista?.nome ?? ''}. Cada mudança é salva na hora.
        </DialogDescription>

        <div
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
            aguardando
              ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
              : feita
                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                : 'bg-muted/30',
          )}
        >
          <BolinhaFeito
            feita={feita}
            tamanho="lg"
            // Conferida: desmarcar desfaria a conferência do gerente. O banco
            // recusa para quem não confere, e quem confere usa "Devolver".
            disabled={!podeMarcar || conferida}
            onClick={() => void acoes.alternarFeito(tarefa.id)}
            titulo={
              conferida
                ? podeConferir
                  ? 'Conferida. Para desfazer, use "Devolver".'
                  : 'Conferida pelo gerente. Só ele pode devolver.'
                : recorrente
                  ? feita
                    ? 'Desmarcar "feita hoje"'
                    : 'Marcar como feita hoje'
                  : feita
                    ? 'Desmarcar "concluída"'
                    : 'Marcar como concluída'
            }
          />
          <div className="min-w-0 flex-1">
            {/* O texto diz a situação de AGORA, não o nome do botão: um "Feita
                hoje" fixo ao lado de uma bolinha vazia se lia como "já foi feita". */}
            <p
              className={cn(
                'text-sm font-semibold',
                aguardando
                  ? 'text-amber-800 dark:text-amber-300'
                  : feita && 'text-emerald-700 dark:text-emerald-300',
              )}
            >
              {feita
                ? recorrente
                  ? 'Feita hoje'
                  : 'Concluída'
                : recorrente
                  ? 'Marcar como feita hoje'
                  : 'Marcar como concluída'}
            </p>
            <p className="text-xs text-muted-foreground">
              {aguardando
                ? recorrente
                  ? 'Enviada para a conferência do gerente. Até ele conferir, ela sai do quadro e fica na aba Conferência.'
                  : `Concluída ${comPreposicao(quandoFoi(tarefa.concluida_em ?? tarefa.updated_at))} e enviada para a conferência do gerente.`
                : conferida
                  ? recorrente
                    ? 'Conferida pelo gerente. Amanhã ela volta a ficar pendente sozinha.'
                    : 'Concluída e conferida pelo gerente.'
                  : recorrente
                    ? hojeNaoEDia
                      ? `Hoje não é dia desta tarefa (${descreverDias(tarefa.dias_semana)}).`
                      : feita
                        ? 'Amanhã ela volta a ficar pendente sozinha — ninguém precisa zerar.'
                        : 'Clique na bolinha quando terminar. Amanhã ela volta a ficar pendente sozinha.'
                    : feita && tarefa.concluida_em
                      ? `Concluída ${comPreposicao(quandoFoi(tarefa.concluida_em))}.`
                      : 'Clique na bolinha quando terminar de vez.'}
            </p>
          </div>
          {podeConferir && (aguardando || conferida) && (
            <ConferenciaNaFicha tarefa={tarefa} recorrente={recorrente} pessoas={pessoas} />
          )}
        </div>

        {diaDeOutroFeito && (
          <FeitoDeOutroDia tarefa={tarefa} dia={diaDeOutroFeito} pessoas={pessoas} podeConferir={podeConferir} />
        )}

        {!podeEditar && (
          <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {ehResponsavel
              ? 'Esta tarefa é sua: você marca o andamento e o checklist. Para mudar o resto, fale com quem cuida do quadro.'
              : 'Você está só vendo esta tarefa. Para mudar alguma coisa, fale com quem cuida do quadro.'}
          </p>
        )}
      </div>

      <div className="grid gap-6 border-t px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_260px]">
        {/* ── Esquerda: o conteúdo ─────────────────────────────────────── */}
        <div className="min-w-0 space-y-7">
          <Secao
            icone={Repeat}
            cor="bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"
            titulo="Frequência"
            extra={descreverDias(tarefa.dias_semana)}
          >
            {podeEditar ? (
              <SeletorDias
                valor={tarefa.dias_semana}
                onChange={(dias) => void acoes.atualizarTarefa({ id: tarefa.id, dias_semana: dias })}
              />
            ) : (
              <ChipDia dias={tarefa.dias_semana} />
            )}
          </Secao>

          <Secao
            icone={AlignLeft}
            cor="bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
            titulo="Descrição"
          >
            <CampoDescricao
              valor={tarefa.descricao}
              podeEditar={podeEditar}
              onSalvar={(descricao) => acoes.atualizarTarefa({ id: tarefa.id, descricao })}
            />
          </Secao>

          <Secao
            icone={ListChecks}
            cor="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
            titulo="Checklist"
            extra={
              detalhe.checklist.length > 0
                ? `${detalhe.checklist.filter((i) => i.feito).length}/${detalhe.checklist.length}`
                : undefined
            }
          >
            <Checklist
              itens={detalhe.checklist}
              carregando={detalhe.carregando}
              podeEditar={podeEditar}
              podeMarcar={podeMarcar}
              acoes={detalhe.acoes}
            />
          </Secao>

          <Secao
            icone={Paperclip}
            cor="bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
            titulo="Anexos"
            extra={tarefa.anexos_total > 0 ? String(tarefa.anexos_total) : undefined}
          >
            <Anexos
              tarefaId={tarefa.id}
              podeAnexar={podeMarcar}
              podeRemoverQualquer={podeEditar}
              euId={meuId ?? ''}
            />
          </Secao>

          <Secao
            icone={MessageSquare}
            cor="bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
            titulo="Comentários"
            extra={detalhe.comentarios.length > 0 ? String(detalhe.comentarios.length) : undefined}
          >
            <NovoComentario eu={eu} onComentar={detalhe.acoes.comentar} />
            {detalhe.carregando ? (
              <Carregando />
            ) : comentariosRecentesPrimeiro.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém comentou ainda.</p>
            ) : (
              <ul className="space-y-4">
                {comentariosRecentesPrimeiro.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <AvataresPessoas
                      pessoas={[c.autor ?? { id: c.autor_id, nome: 'Alguém da equipe', avatar_url: null }]}
                      max={1}
                      tamanho="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold">{c.autor?.nome ?? 'Alguém da equipe'}</span>
                        <span className="text-xs text-muted-foreground" title={dataHora(c.created_at)}>
                          {quandoFoi(c.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-muted/60 px-3 py-2 text-sm">
                        {c.texto}
                      </p>
                      {(c.autor_id === meuId || podeGerenciar) && (
                        <button
                          type="button"
                          onClick={() => setComentarioParaApagar(c)}
                          className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                        >
                          Apagar comentário
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>

        {/* ── Direita: o painel de colunas do Monday ───────────────────── */}
        <aside className="space-y-4 self-start rounded-xl border bg-muted/30 p-4">
          <CampoDoPainel rotulo="Status" icone={CircleDot}>
            <Select
              value={valorDoStatus}
              onValueChange={(v) => void acoes.definirStatus({ id: tarefa.id, status: v as TarefaStatus })}
              // Conferida trava para TODOS, gerente inclusive: trocar o status
              // apagaria o feito e a conferência sem pergunta nenhuma. Para
              // desfazer, o gerente usa "Devolver", que confirma antes (e é o
              // que a célula de status da Tabela já faz).
              disabled={!podeMarcar || conferida}
            >
              <SelectTrigger
                aria-label="Status"
                title={
                  conferida
                    ? podeConferir
                      ? 'Conferida. Para desfazer, use "Devolver".'
                      : 'Conferida pelo gerente. Só ele pode devolver.'
                    : undefined
                }
                className={cn('h-9 border-0 font-semibold shadow-sm', pinturaDoStatus.cor)}
              >
                <SelectValue>{situacao === 'atrasada' ? STATUS_ATRASADA.label : rotuloDoStatus(valorDoStatus)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_NA_ORDEM.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold',
                        TAREFA_STATUS[s].cor,
                      )}
                    >
                      {rotuloDoStatus(s)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {situacao === 'atrasada' && tarefa.prazo && (
              <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                O prazo era {formatarData(tarefa.prazo)}.
              </p>
            )}
          </CampoDoPainel>

          <CampoDoPainel rotulo="Prioridade" icone={Flag}>
            <Select
              value={tarefa.prioridade}
              onValueChange={(v) =>
                void acoes.atualizarTarefa({ id: tarefa.id, prioridade: v as TarefaPrioridade })
              }
              disabled={!podeEditar}
            >
              <SelectTrigger
                aria-label="Prioridade"
                className={cn('h-9 border-0 font-semibold shadow-sm', TAREFA_PRIORIDADES[tarefa.prioridade].cor)}
              >
                <SelectValue>{TAREFA_PRIORIDADES[tarefa.prioridade].label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORIDADES_NA_ORDEM.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold',
                        TAREFA_PRIORIDADES[p].cor,
                      )}
                    >
                      {TAREFA_PRIORIDADES[p].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoDoPainel>

          <CampoDoPainel rotulo="Horário" icone={AlarmClock}>
            <CampoHorario
              valor={tarefa.horario}
              horarios={horarios}
              podeEditar={podeEditar}
              onSalvar={(horario) => void acoes.atualizarTarefa({ id: tarefa.id, horario })}
            />
          </CampoDoPainel>

          {/* "Sem período", e não "sem horário": desde a v2 a tarefa tem hora
              marcada, e as duas coisas podem andar separadas (10:00, sem turno). */}
          <CampoDoPainel rotulo="Período" icone={Clock}>
            <Select
              value={tarefa.periodo_id ?? SEM_PERIODO}
              onValueChange={(v) =>
                void acoes.atualizarTarefa({ id: tarefa.id, periodo_id: v === SEM_PERIODO ? null : v })
              }
              disabled={!podeEditar}
            >
              <SelectTrigger aria-label="Período" className="h-9 bg-background">
                <SelectValue placeholder="Sem período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PERIODO}>Sem período</SelectItem>
                {opcoesDePeriodo.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.descricao}
                    {!p.ativo && ' (desativado)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoDoPainel>

          {/* Prazo só existe em tarefa avulsa: a que se repete vence todo dia. */}
          {!recorrente && (
            <CampoDoPainel rotulo="Prazo" icone={CalendarClock}>
              <CampoPrazo
                valor={tarefa.prazo}
                atrasada={situacao === 'atrasada'}
                podeEditar={podeEditar}
                onSalvar={(prazo) => acoes.atualizarTarefa({ id: tarefa.id, prazo })}
              />
            </CampoDoPainel>
          )}

          <CampoDoPainel rotulo="Pessoas" icone={Users}>
            <SeletorPessoas
              pessoas={pessoasDoSeletor}
              valor={tarefa.responsaveis.map((p) => p.id)}
              onChange={(ids) => void acoes.definirResponsaveis({ id: tarefa.id, user_ids: ids })}
              disabled={!podeEditar}
              placeholder="Ninguém ainda"
            />
          </CampoDoPainel>

          <CampoDoPainel rotulo="Etiquetas" icone={Tag}>
            <SeletorEtiquetas
              etiquetas={etiquetas}
              valor={tarefa.etiquetas.map((e) => e.id)}
              selecionadas={tarefa.etiquetas}
              onChange={(ids) => void acoes.definirEtiquetas({ id: tarefa.id, catalogo_ids: ids })}
              disabled={!podeEditar}
            />
          </CampoDoPainel>

          <CampoDoPainel rotulo="Coluna" icone={Columns3}>
            <Select value={tarefa.lista_id} onValueChange={moverParaLista} disabled={!podeEditar}>
              <SelectTrigger aria-label="Coluna" className="h-9 bg-background">
                <SelectValue placeholder="Escolha a coluna" />
              </SelectTrigger>
              <SelectContent>
                {listas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="flex items-center gap-2">
                      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', corDaEtiqueta(l.cor, l.nome))} />
                      {l.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoDoPainel>

          <div className="space-y-3 border-t pt-4">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Cada mudança é salva na hora — não tem botão de salvar.
              <br />
              Criada em {formatarData(tarefa.created_at)}.
            </p>
            {podeEditar && (
              <Button
                type="button"
                variant="cancelar"
                size="sm"
                className="w-full"
                onClick={() => setConfirmandoArquivar(true)}
              >
                <Archive />
                Arquivar tarefa
              </Button>
            )}
          </div>
        </aside>
      </div>

      <AlertDialog open={confirmandoArquivar} onOpenChange={setConfirmandoArquivar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar esta tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              "{tarefa.titulo}" sai do quadro e de Minhas Tarefas. Logo depois aparece um aviso com o botão
              "Desfazer", por alguns segundos. Passado isso, ainda não há tela para trazer de volta: fale com o
              Felipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={arquivar}>
              Arquivar tarefa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(comentarioParaApagar)}
        onOpenChange={(aberto) => {
          if (!aberto) setComentarioParaApagar(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este comentário?</AlertDialogTitle>
            <AlertDialogDescription>Depois de apagado, não tem como trazer de volta.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                if (comentarioParaApagar) void detalhe.acoes.removerComentario(comentarioParaApagar.id);
                setComentarioParaApagar(null);
              }}
            >
              Apagar comentário
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Pedaços da ficha                                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

function Secao({
  icone: Icone,
  cor,
  titulo,
  extra,
  children,
}: {
  icone: ComponentType<{ className?: string }>;
  cor: string;
  titulo: string;
  extra?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cor)}>
          <Icone className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {extra && <span className="ml-auto text-xs font-medium text-muted-foreground">{extra}</span>}
      </div>
      {children}
    </section>
  );
}

function CampoDoPainel({
  rotulo,
  icone: Icone,
  children,
}: {
  rotulo: string;
  icone: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icone className="h-3.5 w-3.5" />
        {rotulo}
      </p>
      {children}
    </div>
  );
}

function Carregando() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Carregando...
    </p>
  );
}

/**
 * A decisão do gerente dentro da ficha: a mesma porta da aba Conferência
 * (`useConferencia`, que chama a função `conferir_tarefa` do banco).
 *
 * Só monta quando há o que conferir: a leitura da aba Conferência é a mesma
 * que a página do quadro já faz (mesma chave), então abrir a ficha não
 * dispara consulta nova.
 */
function useDecisaoNaFicha(quadroId: string) {
  const qc = useQueryClient();
  const { itens, aprovar, devolver } = useConferencia(quadroId);
  const [decidindo, setDecidindo] = useState<'aprovar' | 'devolver' | null>(null);

  const decidir = async (item: ItemDeConferencia, aprovada: boolean) => {
    setDecidindo(aprovada ? 'aprovar' : 'devolver');
    await (aprovada ? aprovar(item) : devolver(item));
    // Os botões só voltam depois de o quadro reler a tarefa: sem esperar,
    // eles reapareceriam por um instante com a situação velha e o gerente
    // clicaria de novo.
    await qc.invalidateQueries({ queryKey: chaveDoQuadro(quadroId) });
    setDecidindo(null);
  };

  return { itens, decidindo, decidir };
}

/** "Conferir" (some quando já conferida) e "Devolver", que pergunta antes. */
function BotoesDeConferir({
  conferida,
  decidindo,
  onAprovar,
  onDevolver,
  pergunta,
}: {
  conferida: boolean;
  decidindo: 'aprovar' | 'devolver' | null;
  onAprovar: () => void;
  onDevolver: () => void;
  pergunta: { titulo: string; descricao: string };
}) {
  const [confirmandoDevolver, setConfirmandoDevolver] = useState(false);

  return (
    <>
      {!conferida && (
        <Button type="button" size="sm" variant="sucesso" disabled={decidindo !== null} onClick={onAprovar}>
          {decidindo === 'aprovar' ? <Loader2 className="animate-spin" /> : <Check />}
          Conferir
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="bg-background"
        disabled={decidindo !== null}
        onClick={() => setConfirmandoDevolver(true)}
        title={conferida ? 'Desfazer a conferência e devolver a tarefa pendente' : undefined}
      >
        {decidindo === 'devolver' ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Devolver
      </Button>

      <AlertDialog open={confirmandoDevolver} onOpenChange={setConfirmandoDevolver}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pergunta.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{pergunta.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={onDevolver}>Devolver tarefa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * "Conferir" e "Devolver" no bloco de cima da ficha, para quem tem
 * `tasks.review` — o gerente abre a tarefa pela aba Conferência, olha o
 * checklist e as fotos, e decide ali mesmo, sem voltar para a lista.
 *
 * O feito deste bloco é o de HOJE na tarefa que se repete — é o que o bloco
 * mostra —, e o da própria tarefa na avulsa. O feito de outro dia, clicado na
 * aba, tem a faixa dele (FeitoDeOutroDia).
 */
function ConferenciaNaFicha({
  tarefa,
  recorrente,
  pessoas,
}: {
  tarefa: Tarefa;
  recorrente: boolean;
  pessoas: Pessoa[];
}) {
  const { itens, decidindo, decidir } = useDecisaoNaFicha(tarefa.quadro_id);

  const conferida = tarefa.conferencia === 'conferida';
  const dia = recorrente ? hojeISO() : null;
  const daAba = itens.find((i) => mesmoItem(i, { tarefa_id: tarefa.id, dia }));
  const quemFez = daAba?.feita_por ? pessoas.find((p) => p.id === daAba.feita_por)?.nome ?? null : null;

  // O item da aba quando ela já carregou (traz quem fez e quando); senão,
  // montado da tarefa — o banco só precisa da tarefa e do dia.
  const item: ItemDeConferencia = daAba ?? {
    tarefa_id: tarefa.id,
    dia,
    titulo: tarefa.titulo,
    prioridade: tarefa.prioridade,
    dias_semana: tarefa.dias_semana,
    horario: tarefa.horario,
    quadro_id: tarefa.quadro_id,
    quadro_nome: '',
    lista_id: tarefa.lista_id,
    lista_nome: '',
    lista_cor: null,
    feita_por: null,
    feita_em: tarefa.concluida_em ?? tarefa.updated_at,
  };

  const desfeito = recorrente
    ? `O feito de hoje é desfeito${conferida ? ', junto com a conferência,' : ''} e a tarefa volta a aparecer pendente para ${quemFez ?? 'quem faz'} hoje, no quadro e em Minhas Tarefas.`
    : `A conclusão é desfeita${conferida ? ', junto com a conferência,' : ''} e a tarefa volta pendente, no quadro e em Minhas Tarefas.`;

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
      {quemFez && !conferida && (
        <span className="w-full text-[11px] text-amber-800 sm:text-right dark:text-amber-300">
          {/* Avulsa: o banco não guarda quem clicou, só de quem ela é. */}
          {recorrente ? (
            <>
              Marcada por <strong>{quemFez}</strong> {quandoFoi(item.feita_em)}
            </>
          ) : (
            <>
              Responsável: <strong>{quemFez}</strong>
            </>
          )}
        </span>
      )}
      <BotoesDeConferir
        conferida={conferida}
        decidindo={decidindo}
        onAprovar={() => void decidir(item, true)}
        onDevolver={() => void decidir(item, false)}
        pergunta={{
          titulo: quemFez ? `Devolver para ${quemFez}?` : 'Devolver esta tarefa?',
          descricao: `${desfeito} Vale deixar um comentário dizendo o que faltou.`,
        }}
      />
    </div>
  );
}

/**
 * O feito de um dia que NÃO é hoje, aberto pela aba Conferência (`?dia=`).
 *
 * Sem esta faixa, clicar num feito de "Ontem" abria uma ficha que dizia
 * "Marcar como feita hoje", sem Conferir nem Devolver — e, se hoje também
 * houvesse feito esperando, o "Conferir" do bloco de cima aprovava o de hoje,
 * não o que o gerente clicou. Aqui os botões usam o feito daquele dia, vindo
 * da própria aba.
 *
 * Aparece só enquanto o feito espera conferência: conferido ou devolvido, ele
 * sai da aba e a faixa some junto. Quem não confere vê a faixa sem botões.
 */
function FeitoDeOutroDia({
  tarefa,
  dia,
  pessoas,
  podeConferir,
}: {
  tarefa: Tarefa;
  dia: string;
  pessoas: Pessoa[];
  podeConferir: boolean;
}) {
  const { itens, decidindo, decidir } = useDecisaoNaFicha(tarefa.quadro_id);
  const item = itens.find((i) => mesmoItem(i, { tarefa_id: tarefa.id, dia }));
  if (!item) return null;

  const hoje = hojeISO();
  const rotulo = rotuloDoDia(dia, hoje);
  const doDia = rotulo === 'Ontem' ? 'ontem' : rotulo;
  const quem = item.feita_por ? pessoas.find((p) => p.id === item.feita_por) ?? null : null;

  return (
    <div
      role="region"
      aria-label={`Feito de ${doDia}`}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
        <Hourglass className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Feito de {doDia} aguardando conferência
        </p>
        <p className="text-xs text-muted-foreground">
          {quem ? (
            <>
              Marcada por <strong className="text-foreground">{quem.nome}</strong> às {horaDoFeito(item.feita_em)}.
            </>
          ) : (
            <>Marcada às {horaDoFeito(item.feita_em)}.</>
          )}{' '}
          O bloco de cima é o de hoje; {podeConferir ? 'os botões daqui mexem' : 'esta faixa fala'} só do feito de{' '}
          {doDia}.
        </p>
      </div>
      {podeConferir && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <BotoesDeConferir
            conferida={false}
            decidindo={decidindo}
            onAprovar={() => void decidir(item, true)}
            onDevolver={() => void decidir(item, false)}
            pergunta={textoDoDevolver(item, quem ? primeiroNome(quem.nome) : null, hoje)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Hora marcada da tarefa (v2, pedido do Felipe em 24/09: "coloque a
 * possibilidade de ter alguns horários pré-definidos. Deixe que eu escolha os
 * horários").
 *
 * As sugestões vêm de Listas do Sistema (catálogo `tarefa_horario`): o Felipe
 * cadastra, aparece aqui sozinho. Item que não parece hora ("Depois do
 * almoço") continua na lista, desativado e dizendo por quê — sumir sem
 * explicação faria o Felipe achar que o cadastro quebrou. "Outro horário..."
 * abre um campo de hora para quando nenhuma sugestão serve.
 *
 * A hora já escolhida aparece mesmo que não esteja (ou não esteja mais) nas
 * sugestões: senão o campo viria vazio e pareceria que a tarefa não tem hora.
 */
function CampoHorario({
  valor,
  horarios,
  podeEditar,
  onSalvar,
}: {
  valor: string | null;
  horarios: HorarioOpcao[];
  podeEditar: boolean;
  onSalvar: (horario: string | null) => void;
}) {
  const [digitando, setDigitando] = useState(false);
  const [rascunho, setRascunho] = useState(valor ?? '');
  const campo = useRef<HTMLInputElement>(null);
  const focarAoFechar = useRef(false);

  // Duas grafias da mesma hora no catálogo ("07:30" e "7h30") viram uma só.
  const { validas, invalidas } = useMemo(() => {
    const ok: string[] = [];
    const ruins: HorarioOpcao[] = [];
    for (const h of horarios) {
      if (!h.valor) ruins.push(h);
      else if (!ok.includes(h.valor)) ok.push(h.valor);
    }
    return { validas: ok, invalidas: ruins };
  }, [horarios]);
  const foraDasSugestoes = valor !== null && !validas.includes(valor);

  // Hora pela metade ("10:--") não fecha o campo nem apaga a que já existe:
  // quem digitou metade ainda está digitando.
  const salvarDigitado = () => {
    const hora = normalizarHorario(rascunho);
    if (!hora) return;
    setDigitando(false);
    if (hora !== valor) onSalvar(hora);
  };

  return (
    <div className="space-y-1.5">
      <Select
        value={valor ?? SEM_HORARIO}
        disabled={!podeEditar}
        onValueChange={(v) => {
          if (v === OUTRO_HORARIO) {
            setRascunho(valor ?? '');
            setDigitando(true);
            focarAoFechar.current = true;
            return;
          }
          setDigitando(false);
          const novo = v === SEM_HORARIO ? null : v;
          if (novo !== valor) onSalvar(novo);
        }}
      >
        <SelectTrigger aria-label="Horário" className="h-9 bg-background">
          <SelectValue>
            {valor ? (
              <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                <AlarmClock className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                {valor}
              </span>
            ) : (
              <span className="text-muted-foreground">Sem horário</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          // Ao escolher "Outro horário...", o foco vai para o campo de hora
          // (o seletor, ao fechar, devolveria o foco para ele mesmo).
          onCloseAutoFocus={(e) => {
            if (!focarAoFechar.current) return;
            focarAoFechar.current = false;
            e.preventDefault();
            campo.current?.focus();
          }}
        >
          <SelectItem value={SEM_HORARIO}>
            <span className="text-muted-foreground">Sem horário</span>
          </SelectItem>
          {validas.map((h) => (
            <SelectItem key={h} value={h}>
              <span className="tabular-nums">{h}</span>
            </SelectItem>
          ))}
          {foraDasSugestoes && valor && (
            <SelectItem value={valor}>
              <span className="tabular-nums">{valor}</span>
              <span className="ml-1 text-muted-foreground">(digitado)</span>
            </SelectItem>
          )}
          {invalidas.map((h) => (
            <SelectItem key={h.id} value={`__invalido_${h.id}`} disabled title="Não parece um horário">
              {h.descricao}
              <span className="ml-1 text-[11px]">— não parece um horário</span>
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={OUTRO_HORARIO}>Outro horário...</SelectItem>
        </SelectContent>
      </Select>

      {digitando && (
        <div className="space-y-1 rounded-lg border bg-background p-2 shadow-sm">
          <div className="flex items-center gap-2">
            <Input
              ref={campo}
              type="time"
              aria-label="Outro horário"
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              onBlur={salvarDigitado}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  salvarDigitado();
                }
              }}
              className="h-8 tabular-nums"
            />
            <button
              type="button"
              // Sem isto, o clique tiraria o foco do campo antes, e a hora
              // digitada seria salva justamente por quem quis cancelar.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDigitando(false)}
              className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Cancelar
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Digite a hora e aperte Enter (ou saia do campo).</p>
        </div>
      )}
    </div>
  );
}

/**
 * Rascunho local que acompanha o valor de fora enquanto a pessoa não está
 * digitando. Sem isso, a recarga automática do quadro (a cada 30 s) apagaria
 * o que ela está escrevendo no meio da frase.
 */
function useRascunho(valor: string) {
  const [rascunho, setRascunho] = useState(valor);
  const editando = useRef(false);
  useEffect(() => {
    if (!editando.current) setRascunho(valor);
  }, [valor]);
  return {
    rascunho,
    setRascunho,
    comecar: () => {
      editando.current = true;
    },
    terminar: () => {
      editando.current = false;
    },
  };
}

/** Título grande, sem cara de formulário. Salva ao sair do campo ou no Enter. */
function CampoTitulo({ valor, onSalvar }: { valor: string; onSalvar: (titulo: string) => void }) {
  const { rascunho, setRascunho, comecar, terminar } = useRascunho(valor);

  const salvar = () => {
    terminar();
    const limpo = rascunho.trim();
    // Tarefa sem título não tem como ser achada depois: apagar tudo desfaz.
    if (!limpo) {
      setRascunho(valor);
      return;
    }
    if (limpo !== valor) onSalvar(limpo);
  };

  return (
    <Input
      aria-label="Título da tarefa"
      // O banco recusa título com mais de 200 letras; melhor a caixa parar
      // de aceitar do que a pessoa descobrir pelo aviso de erro.
      maxLength={200}
      value={rascunho}
      onFocus={comecar}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className="-mx-2 h-auto w-[calc(100%+1rem)] rounded-lg border-transparent bg-transparent px-2 py-1 text-xl font-bold leading-snug shadow-none transition-colors hover:bg-muted/60 focus-visible:bg-background focus-visible:ring-offset-0 sm:text-2xl md:text-2xl"
    />
  );
}

function CampoDescricao({
  valor,
  podeEditar,
  onSalvar,
}: {
  valor: string | null;
  podeEditar: boolean;
  onSalvar: (descricao: string | null) => void;
}) {
  const { rascunho, setRascunho, comecar, terminar } = useRascunho(valor ?? '');

  if (!podeEditar) {
    return valor ? (
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{valor}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Sem descrição.</p>
    );
  }

  const salvar = () => {
    terminar();
    const limpo = rascunho.trim();
    if (limpo !== (valor ?? '').trim()) onSalvar(limpo || null);
  };

  return (
    <Textarea
      aria-label="Descrição da tarefa"
      value={rascunho}
      onFocus={comecar}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      placeholder="Detalhes, passo a passo, onde fica o material... (salva sozinho ao sair do campo)"
      className="min-h-[90px] resize-y bg-muted/30 transition-colors hover:bg-muted/50 focus-visible:bg-background"
    />
  );
}

/**
 * Prazo da tarefa avulsa. Salva ao sair do campo, não a cada tecla: o campo
 * de data do navegador passa por datas intermediárias enquanto se digita o
 * ano ("0002", "0020", "0202"...), e cada uma viraria uma gravação.
 */
function CampoPrazo({
  valor,
  atrasada,
  podeEditar,
  onSalvar,
}: {
  valor: string | null;
  atrasada: boolean;
  podeEditar: boolean;
  onSalvar: (prazo: string | null) => void;
}) {
  const { rascunho, setRascunho, comecar, terminar } = useRascunho(valor ?? '');

  const salvar = (novo: string) => {
    terminar();
    const limpo = /^\d{4}-\d{2}-\d{2}$/.test(novo) ? novo : '';
    if (limpo !== (valor ?? '')) onSalvar(limpo || null);
  };

  return (
    <div className="space-y-1">
      <Input
        type="date"
        aria-label="Prazo"
        value={rascunho}
        disabled={!podeEditar}
        onFocus={comecar}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={(e) => salvar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className={cn(
          'h-9 bg-background',
          atrasada && 'border-red-400 font-semibold text-red-600 dark:border-red-700 dark:text-red-400',
        )}
      />
      {podeEditar && valor && (
        <button
          type="button"
          onClick={() => {
            setRascunho('');
            onSalvar(null);
          }}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Tirar o prazo
        </button>
      )}
    </div>
  );
}

function Checklist({
  itens,
  carregando,
  podeEditar,
  podeMarcar,
  acoes,
}: {
  itens: ItemChecklist[];
  carregando: boolean;
  podeEditar: boolean;
  podeMarcar: boolean;
  acoes: ReturnType<typeof useTarefaDetalhe>['acoes'];
}) {
  const ordenados = ordenarPorOrdem(itens);
  const feitos = ordenados.filter((i) => i.feito).length;
  const porcento = ordenados.length > 0 ? Math.round((feitos / ordenados.length) * 100) : 0;

  if (carregando) return <Carregando />;

  return (
    <div className="space-y-2">
      {ordenados.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-9 text-right text-xs font-semibold tabular-nums text-muted-foreground">
            {porcento}%
          </span>
          <Progress
            value={porcento}
            aria-label={`${feitos} de ${ordenados.length} itens feitos`}
            className={cn('h-2', porcento === 100 ? '[&>div]:bg-emerald-500' : '[&>div]:bg-blue-500')}
          />
        </div>
      )}

      {ordenados.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {podeEditar ? 'Nenhum item ainda. Quebre a tarefa em passos pequenos.' : 'Sem checklist.'}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {ordenados.map((item) => (
            <ItemDoChecklist
              key={item.id}
              item={item}
              podeEditar={podeEditar}
              podeMarcar={podeMarcar}
              onAlternar={() => void acoes.alternarItem(item.id)}
              onRenomear={(titulo) => void acoes.renomearItem(item.id, titulo)}
              onRemover={() => void acoes.removerItem(item.id)}
            />
          ))}
        </ul>
      )}

      {podeEditar && <NovoItem onAdicionar={acoes.adicionarItem} />}
    </div>
  );
}

function ItemDoChecklist({
  item,
  podeEditar,
  podeMarcar,
  onAlternar,
  onRenomear,
  onRemover,
}: {
  item: ItemChecklist;
  podeEditar: boolean;
  podeMarcar: boolean;
  onAlternar: () => void;
  onRenomear: (titulo: string) => void;
  onRemover: () => void;
}) {
  const { rascunho, setRascunho, comecar, terminar } = useRascunho(item.titulo);

  const salvar = () => {
    terminar();
    const limpo = rascunho.trim();
    if (!limpo) {
      setRascunho(item.titulo);
      return;
    }
    if (limpo !== item.titulo) onRenomear(limpo);
  };

  return (
    <li className="group flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-muted/60">
      <Checkbox
        checked={item.feito}
        disabled={!podeMarcar}
        onCheckedChange={onAlternar}
        aria-label={item.feito ? `Desmarcar "${item.titulo}"` : `Marcar "${item.titulo}" como feito`}
        className="h-5 w-5 rounded-md data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white"
      />
      {podeEditar ? (
        <input
          aria-label="Texto do item"
          maxLength={200}
          value={rascunho}
          onFocus={comecar}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className={cn(
            'min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring',
            item.feito && 'text-muted-foreground line-through',
          )}
        />
      ) : (
        <span className={cn('min-w-0 flex-1 text-sm', item.feito && 'text-muted-foreground line-through')}>
          {item.titulo}
        </span>
      )}
      {podeEditar && (
        <button
          type="button"
          aria-label={`Remover o item "${item.titulo}"`}
          title="Remover item"
          onClick={onRemover}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/** Enter adiciona e o campo continua aberto para o próximo — lista se faz em sequência. */
function NovoItem({ onAdicionar }: { onAdicionar: (titulo: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Limpa só depois de gravar: se o banco recusar, o texto continua na caixa
  // para tentar de novo, em vez de sumir junto com o que a pessoa digitou.
  const adicionar = async () => {
    const limpo = texto.trim();
    if (!limpo || salvando) return;
    setSalvando(true);
    const gravou = await onAdicionar(limpo);
    setSalvando(false);
    if (gravou) setTexto('');
  };

  return (
    <div className="flex items-center gap-2 pt-1">
      <Input
        aria-label="Novo item do checklist"
        maxLength={200}
        readOnly={salvando}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void adicionar();
          }
        }}
        placeholder="Adicionar um item"
        className="h-9"
      />
      <Button type="button" size="sm" variant="outline" onClick={() => void adicionar()} disabled={!texto.trim() || salvando}>
        <Plus />
        Adicionar
      </Button>
    </div>
  );
}

function NovoComentario({
  eu,
  onComentar,
}: {
  eu: Pessoa | null;
  /** `false` = não gravou: o texto continua na caixa para tentar de novo. */
  onComentar: (texto: string) => Promise<boolean | void>;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    setEnviando(true);
    const gravou = await onComentar(limpo);
    if (gravou !== false) setTexto('');
    setEnviando(false);
  };

  return (
    <div className="flex gap-3">
      {eu ? (
        <AvataresPessoas pessoas={[eu]} max={1} tamanho="md" />
      ) : (
        <span aria-hidden className="h-8 w-8 shrink-0 rounded-full bg-muted" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <Textarea
          aria-label="Escreva um comentário"
          maxLength={2000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder="Escreva um comentário"
          className="min-h-[64px] resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Ctrl + Enter também envia</span>
          <Button
            type="button"
            size="sm"
            variant="sucesso"
            disabled={!texto.trim() || enviando}
            onClick={() => void enviar()}
          >
            {enviando && <Loader2 className="animate-spin" />}
            Comentar
          </Button>
        </div>
      </div>
    </div>
  );
}
