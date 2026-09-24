import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlignLeft,
  Archive,
  CalendarClock,
  CircleDot,
  Clock,
  Columns3,
  Eye,
  Flag,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  Repeat,
  Tag,
  Trash2,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AvataresPessoas } from '@/components/tarefas/AvataresPessoas';
import { BolinhaFeito } from '@/components/tarefas/BolinhaFeito';
import { ChipDia } from '@/components/tarefas/ChipDia';
import { SeletorDias } from '@/components/tarefas/SeletorDias';
import { SeletorEtiquetas } from '@/components/tarefas/SeletorEtiquetas';
import { SeletorPessoas } from '@/components/tarefas/SeletorPessoas';
import { STATUS_ATRASADA, TAREFA_PRIORIDADES, TAREFA_STATUS } from '@/config/tarefas';
import { useAuth } from '@/hooks/useAuth';
import { chaveDoQuadro, useTarefaDetalhe, type DadosDoQuadro } from '@/hooks/useQuadro';
import { corDaEtiqueta } from '@/lib/cores';
import { data as formatarData, dataHora, hojeISO } from '@/lib/format';
import {
  quandoFoi,
  descreverDias,
  ehRecorrente,
  estaFeita,
  ordemEntre,
  ordenarPorOrdem,
  statusNoDia,
} from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type {
  Comentario,
  ItemChecklist,
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
    <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
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
          {tarefa.periodo && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {tarefa.periodo.descricao}
            </span>
          )}
          <ChipDia dias={tarefa.dias_semana} />
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
            'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
            feita
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
              : 'bg-muted/30',
          )}
        >
          <BolinhaFeito
            feita={feita}
            tamanho="lg"
            disabled={!podeMarcar}
            onClick={() => void acoes.alternarFeito(tarefa.id)}
            titulo={
              recorrente
                ? feita
                  ? 'Desmarcar "feita hoje"'
                  : 'Marcar como feita hoje'
                : feita
                  ? 'Desmarcar "concluída"'
                  : 'Marcar como concluída'
            }
          />
          <div className="min-w-0">
            {/* O texto diz a situação de AGORA, não o nome do botão: um "Feita
                hoje" fixo ao lado de uma bolinha vazia se lia como "já foi feita". */}
            <p className={cn('text-sm font-semibold', feita && 'text-emerald-700 dark:text-emerald-300')}>
              {feita
                ? recorrente
                  ? 'Feita hoje'
                  : 'Concluída'
                : recorrente
                  ? 'Marcar como feita hoje'
                  : 'Marcar como concluída'}
            </p>
            <p className="text-xs text-muted-foreground">
              {recorrente
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
        </div>

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
              disabled={!podeMarcar}
            >
              <SelectTrigger
                aria-label="Status"
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

          <CampoDoPainel rotulo="Período" icone={Clock}>
            <Select
              value={tarefa.periodo_id ?? SEM_PERIODO}
              onValueChange={(v) =>
                void acoes.atualizarTarefa({ id: tarefa.id, periodo_id: v === SEM_PERIODO ? null : v })
              }
              disabled={!podeEditar}
            >
              <SelectTrigger aria-label="Período" className="h-9 bg-background">
                <SelectValue placeholder="Sem horário definido" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PERIODO}>Sem horário definido</SelectItem>
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
