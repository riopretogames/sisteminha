import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  Columns3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  SquareKanban,
  Table2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ConferenciaView } from '@/components/tarefas/conferencia/ConferenciaView';
import { QuadroKanban } from '@/components/tarefas/kanban/QuadroKanban';
import { QuadroTabela } from '@/components/tarefas/tabela/QuadroTabela';
import { TarefaDialog } from '@/components/tarefas/TarefaDialog';
import { FiltrosTarefas } from '@/components/tarefas/FiltrosTarefas';
import { PERMISSIONS } from '@/config/permissions';
import { STATUS_ATRASADA, TAREFA_STATUS } from '@/config/tarefas';
import { useAuth } from '@/hooks/useAuth';
import { useCatalogo } from '@/hooks/useCatalogos';
import { useConferencia } from '@/hooks/useConferencia';
import { usePessoasDaLoja } from '@/hooks/usePessoasDaLoja';
import { chaveDoQuadro, useQuadro } from '@/hooks/useQuadro';
import { useQuadros } from '@/hooks/useQuadros';
import { useViewMode, type ViewMode } from '@/hooks/useViewMode';
import { CORES_ETIQUETA, corDaEtiqueta } from '@/lib/cores';
import { hojeISO } from '@/lib/format';
import {
  estaFeita,
  filtrarTarefas,
  horariosDoCatalogo,
  novaTarefaApareceNoFiltro,
  resumoDeStatus,
  semAguardandoConferencia,
  statusNoDia,
  temFiltroAtivo,
} from '@/lib/tarefas';
import { ehEnderecoInvalido, mensagemLeiga } from '@/lib/tarefasMutacoes';
import { cn } from '@/lib/utils';
import {
  FILTROS_TAREFAS_VAZIO,
  type AcoesDoQuadro,
  type Etiqueta,
  type FiltrosTarefasValores,
  type PeriodoOpcao,
  type PropsVisaoQuadro,
  type StatusNoDia,
  type Tarefa,
} from '@/types/tarefas';

/**
 * Um quadro de tarefas — o Trello e o Monday na mesma tela.
 *
 * Frase do Felipe que fixou o desenho: "tudo é um kanban... é tudo cards,
 * colunas e fileiras". Os dados são um só (listas → tarefas); Kanban e Tabela
 * são duas formas de olhar, com o mesmo botão de troca que a tela de OS tem.
 * Por isso a página faz tudo que é comum às duas — carregar, filtrar, abrir a
 * ficha — e a visão só desenha.
 *
 * A ficha da tarefa abre pelo endereço (`?tarefa=<id>`): dá para mandar o
 * link de uma tarefa no WhatsApp da equipe, e Minhas Tarefas abre a ficha
 * direto no quadro certo.
 *
 * v2 (24/09): a terceira aba, **Conferência** (`?aba=conferencia`). Frase do
 * Felipe: marcou concluído, "ela fosse para uma aba de conferência, que meu
 * gerente vai lá e vai conferir o que foi feito". Então o feito que espera o
 * gerente SAI do Kanban e da Tabela e aparece só nessa aba; aprovado, volta
 * ao quadro como feito; devolvido, volta pendente.
 */

/** A aba Conferência vive no endereço, não no navegador: o link dela abre direto nela. */
const ABA_CONFERENCIA = 'conferencia';

/** A ordem das pílulas do resumo: a mesma do filtro de status (o que falta, o que atrasou, o que acabou). */
const ORDEM_DO_RESUMO: StatusNoDia[] = ['nao_iniciado', 'fazendo', 'atrasada', 'feito', 'pausada'];

function definicaoDoStatus(s: StatusNoDia) {
  return s === 'atrasada' ? STATUS_ATRASADA : TAREFA_STATUS[s];
}

/* ── Cabeçalho ─────────────────────────────────────────────────────────────── */

/**
 * Nome do quadro que vira campo ao clicar (só para quem gerencia). Enter ou
 * sair do campo salva; Esc desiste — igual a renomear lista no Trello.
 */
function NomeDoQuadro({
  nome,
  podeEditar,
  onSalvar,
}: {
  nome: string;
  podeEditar: boolean;
  onSalvar: (nome: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nome);
  const desistiu = useRef(false);

  useEffect(() => {
    if (!editando) setValor(nome);
  }, [nome, editando]);

  const terminar = () => {
    setEditando(false);
    if (desistiu.current) {
      desistiu.current = false;
      return;
    }
    const novo = valor.trim();
    if (novo && novo !== nome) onSalvar(novo);
  };

  if (!podeEditar) {
    return <h1 className="truncate text-2xl font-bold tracking-tight">{nome}</h1>;
  }

  if (editando) {
    return (
      <Input
        autoFocus
        value={valor}
        aria-label="Nome do quadro"
        onChange={(e) => setValor(e.target.value)}
        onBlur={terminar}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            desistiu.current = true;
            e.currentTarget.blur();
          }
        }}
        className="h-10 max-w-md text-2xl font-bold tracking-tight"
      />
    );
  }

  return (
    <h1 className="min-w-0 text-2xl font-bold tracking-tight">
      <button
        type="button"
        onClick={() => setEditando(true)}
        title="Clique para renomear o quadro"
        className="group/nome -mx-1.5 inline-flex max-w-full items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-muted"
      >
        <span className="truncate">{nome}</span>
        <Pencil className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover/nome:opacity-60" />
      </button>
    </h1>
  );
}

/**
 * Nome e cor de uma coluna nova. Serve ao botão "Adicionar coluna" do
 * cabeçalho e ao quadro ainda vazio. Sem cor escolhida, a coluna ganha uma cor
 * fixa pelo próprio nome (a mesma regra das etiquetas), então nunca fica cinza.
 *
 * (No código e no banco ela se chama "lista"; na tela é "coluna" em todo
 * lugar, que é a palavra de quem vem do Trello.)
 */
function FormNovaLista({
  onCriar,
  onPronto,
}: {
  /** `false` = o banco recusou: o nome fica na caixa e a janelinha não fecha. */
  onCriar: (d: { nome: string; cor: string | null }) => Promise<boolean>;
  onPronto?: () => void;
}) {
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const limpo = nome.trim();
    if (!limpo || salvando) return;
    setSalvando(true);
    const gravou = await onCriar({ nome: limpo, cor });
    setSalvando(false);
    if (!gravou) return;
    setNome('');
    setCor(null);
    onPronto?.();
  };

  const corDaPrevia = cor ?? (nome.trim() ? corDaEtiqueta(null, nome.trim()) : 'bg-muted text-muted-foreground');

  return (
    <form onSubmit={enviar} className="space-y-3 text-left">
      <div className="space-y-1.5">
        <label htmlFor="nova-lista-nome" className="text-sm font-medium">
          Nome da coluna
        </label>
        <Input
          id="nova-lista-nome"
          autoFocus
          // O banco aceita até 80 letras no nome.
          maxLength={80}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Pedro, Conferência, Produtos a comprar"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Cor</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCor(null)}
            aria-pressed={cor === null}
            title="Automática (escolhida pelo nome)"
            className={cn(
              'h-7 w-7 rounded-full border-2 border-dashed border-muted-foreground/40 ring-offset-2 ring-offset-background transition',
              cor === null && 'ring-2 ring-foreground',
            )}
          />
          {CORES_ETIQUETA.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCor(c.value)}
              aria-pressed={cor === c.value}
              title={c.label}
              className={cn(
                'h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition hover:scale-110',
                c.value,
                cor === c.value && 'ring-2 ring-foreground',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span
          className={cn(
            'inline-flex max-w-[55%] items-center truncate rounded-full px-2.5 py-0.5 text-xs font-semibold',
            corDaPrevia,
          )}
        >
          {nome.trim() || 'Prévia'}
        </span>
        <Button type="submit" size="sm" disabled={!nome.trim() || salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar coluna
        </Button>
      </div>
    </form>
  );
}

/**
 * O resumo do quadro em pílulas coloridas — a barrinha de status do Monday.
 * Clicar numa pílula filtra por ela; clicar de novo desfaz.
 */
function ResumoDoQuadro({
  resumo,
  ativo,
  onEscolher,
}: {
  resumo: Record<StatusNoDia, number>;
  ativo: string;
  onEscolher: (s: string) => void;
}) {
  const total = ORDEM_DO_RESUMO.reduce((soma, s) => soma + resumo[s], 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {ORDEM_DO_RESUMO.filter((s) => resumo[s] > 0).map((s) => (
          <span
            key={s}
            className={cn('h-full transition-all', definicaoDoStatus(s).cor)}
            style={{ width: `${(resumo[s] / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ORDEM_DO_RESUMO.filter((s) => resumo[s] > 0).map((s) => {
          const def = definicaoDoStatus(s);
          const marcado = ativo === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={marcado}
              aria-label={`${def.label}: ${resumo[s]} ${resumo[s] === 1 ? 'tarefa' : 'tarefas'}`}
              onClick={() => onEscolher(marcado ? '' : s)}
              title={marcado ? 'Mostrar todas de novo' : `Mostrar só: ${def.label}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                marcado ? cn(def.cor, 'shadow-sm') : 'bg-muted/70 text-foreground hover:bg-muted',
              )}
            >
              {!marcado && <span className={cn('h-2 w-2 rounded-full', def.cor)} />}
              {def.label}
              <span className="tabular-nums opacity-80">{resumo[s]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Página ────────────────────────────────────────────────────────────────── */

export default function Quadro() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { can } = useAuth();
  const podeEditar = can(PERMISSIONS.TASKS_EDIT);
  const podeGerenciar = can(PERMISSIONS.TASKS_MANAGE);
  const podeConferir = can(PERMISSIONS.TASKS_REVIEW);

  const { quadro, listas, tarefas, carregando, erro, acoes } = useQuadro(id);
  const { renomearQuadro } = useQuadros();
  // Só para o contador da aba. A lista em si é da ConferenciaView, que usa a
  // mesma consulta (mesma chave): o banco é lido uma vez para as duas.
  const { itens: itensAConferir } = useConferencia(id);
  // Pessoas e as duas listas da loja carregadas AQUI, na mesma tela das
  // visões: as ações do quadro leem esses dados já em memória para mostrar
  // nome, cor e turno na hora, antes de o banco responder.
  const pessoasDaLoja = usePessoasDaLoja().data;
  // Lista estável enquanto o cadastro não muda: um `?? []` solto criaria uma
  // lista nova a cada desenho e refaria as ações das visões à toa.
  const pessoas = useMemo(() => pessoasDaLoja ?? [], [pessoasDaLoja]);
  const catalogoPeriodos = useCatalogo('tarefa_periodo').data;
  const catalogoEtiquetas = useCatalogo('tarefa_etiqueta').data;
  const catalogoHorarios = useCatalogo('tarefa_horario').data;

  const { viewMode, setViewMode } = useViewMode('kanban', 'tarefas_view_mode');
  const [filtros, setFiltros] = useState<FiltrosTarefasValores>(FILTROS_TAREFAS_VAZIO);
  const [novaListaAberta, setNovaListaAberta] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tarefaId = searchParams.get('tarefa');
  const naConferencia = searchParams.get('aba') === ABA_CONFERENCIA;
  // O dia do feito clicado na aba Conferência (`&dia=`): a ficha mostra o
  // feito DAQUELE dia, não só o de hoje. Só aceita data bem formada — link
  // cortado no WhatsApp vira "sem dia", que é o comportamento de sempre.
  const diaDoLink = (() => {
    const d = searchParams.get('dia');
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  })();

  /**
   * Troca entre Kanban, Tabela e Conferência. Kanban e Tabela continuam
   * lembrados no navegador (useViewMode, o mesmo alternador da OS — por isso
   * a Conferência não entra no tipo dele); a Conferência fica no endereço, e
   * é assim que a página Conferência do menu abre um quadro direto nela.
   * `replace`, como a ficha: trocar de aba não enche o "voltar" do navegador.
   */
  const trocarAba = useCallback(
    (aba: string) => {
      if (!aba) return;
      setSearchParams(
        (atual) => {
          const novo = new URLSearchParams(atual);
          if (aba === ABA_CONFERENCIA) novo.set('aba', ABA_CONFERENCIA);
          else novo.delete('aba');
          return novo;
        },
        { replace: true },
      );
      if (aba !== ABA_CONFERENCIA) setViewMode(aba as ViewMode);
    },
    [setSearchParams, setViewMode],
  );

  // Filtro é do quadro que está aberto: ao trocar de quadro, começa limpo.
  useEffect(() => {
    setFiltros(FILTROS_TAREFAS_VAZIO);
  }, [id]);

  /**
   * Turnos para os seletores: os ativos, mais o desativado que alguma tarefa
   * já usa. Regra das listas editáveis: sem ele, abrir a tarefa mostraria o
   * campo vazio e o próximo salvamento apagaria o turno sem ninguém pedir.
   */
  const periodos = useMemo<PeriodoOpcao[]>(() => {
    const usados = new Set(tarefas.map((t) => t.periodo_id).filter(Boolean));
    const lista: PeriodoOpcao[] = (catalogoPeriodos ?? [])
      .filter((p) => p.ativo || usados.has(p.id))
      .map((p) => ({ id: p.id, descricao: p.descricao, ativo: p.ativo, padrao: p.padrao }));
    for (const t of tarefas) {
      if (t.periodo && !lista.some((p) => p.id === t.periodo!.id)) {
        lista.push({ id: t.periodo.id, descricao: t.periodo.descricao, ativo: false });
      }
    }
    return lista;
  }, [catalogoPeriodos, tarefas]);

  // Sugestões de horário da ficha (v2). Só as ativas: a tarefa guarda a hora,
  // não o item do catálogo, então desativar um horário não apaga nada.
  const horarios = useMemo(
    () => horariosDoCatalogo((catalogoHorarios ?? []).filter((h) => h.ativo)),
    [catalogoHorarios],
  );

  const etiquetas = useMemo<Etiqueta[]>(
    () =>
      (catalogoEtiquetas ?? [])
        .filter((e) => e.ativo)
        .map((e) => ({ id: e.id, descricao: e.descricao, cor: e.cor })),
    [catalogoEtiquetas],
  );

  // "Hoje" é calculado a cada desenho, nunca guardado: a tela esquecida
  // aberta de um dia para o outro passa a filtrar pelo dia novo no próximo
  // desenho, em vez de ficar presa na data em que foi aberta.
  const hoje = hojeISO();
  const diaDaSemana = new Date().getDay();

  // O que o quadro mostra: tudo, menos o feito que espera o gerente — esse
  // "foi para a aba de conferência". O que já foi conferido fica, como feito.
  // É daqui que saem as visões, o resumo e a contagem do filtro, para as três
  // contarem as mesmas tarefas. A ficha NÃO usa este corte (ver tarefaAberta).
  const tarefasDoQuadro = useMemo(() => semAguardandoConferencia(tarefas), [tarefas]);

  // O resumo colorido conta com todos os filtros MENOS o de status: senão,
  // clicar em "Fazendo" zeraria as outras pílulas e ninguém conseguiria
  // trocar de uma para outra.
  const semFiltroDeStatus = useMemo(
    () => filtrarTarefas(tarefasDoQuadro, { ...filtros, status: '' }, { iso: hoje, diaSemana: diaDaSemana }),
    [tarefasDoQuadro, filtros, hoje, diaDaSemana],
  );
  const filtradas = useMemo(
    () =>
      filtros.status
        ? semFiltroDeStatus.filter((t) => statusNoDia(t, hoje) === filtros.status)
        : semFiltroDeStatus,
    [semFiltroDeStatus, filtros.status, hoje],
  );
  const resumo = useMemo(() => resumoDeStatus(semFiltroDeStatus, hoje), [semFiltroDeStatus, hoje]);
  const filtroAtivo = temFiltroAtivo(filtros);
  const limparFiltros = useCallback(() => setFiltros(FILTROS_TAREFAS_VAZIO), []);

  /**
   * Marcar feito pelo cartão (a bolinha, ou "Feito" na célula de status da
   * Tabela) tira o cartão do quadro: ele vai esperar o gerente. Sem aviso, o
   * cartão some do nada e a pessoa acha que perdeu a tarefa. O aviso sai no
   * clique, junto com o cartão sumindo (a tela é otimista); se o banco
   * recusar, o aviso de erro toma o lugar deste e o cartão volta.
   *
   * A ação do aviso é "Desfazer": quem clicou sem querer (e não é gerente)
   * não teria outro jeito de trazer o cartão de volta sem ir até a aba e
   * abrir a ficha. O banco deixa, porque o feito ainda não foi conferido.
   * Volta ao status de ANTES do clique (quem estava "Fazendo" continua
   * "Fazendo"), pela ação crua do quadro — a embrulhada daria outro aviso.
   */
  const avisarQueFoiParaConferencia = useCallback(
    (t: Tarefa) =>
      toast({
        title: 'Enviada para a conferência',
        description: `"${t.titulo}" está na aba Conferência e volta ao quadro quando o gerente conferir.`,
        action: (
          <ToastAction
            altText="Desfazer: a tarefa volta ao quadro como não feita"
            onClick={() =>
              void (t.status === 'feito'
                ? acoes.alternarFeito(t.id)
                : acoes.definirStatus({ id: t.id, status: t.status }))
            }
          >
            Desfazer
          </ToastAction>
        ),
      }),
    [toast, acoes],
  );

  /**
   * As ações que as visões recebem: as do quadro, com dois cuidados a mais.
   *
   * 1. "+ Adicionar tarefa": com filtro ligado, a tarefa recém-criada pode não
   *    passar no filtro e sumir na hora — a caixa limpa como se nada tivesse
   *    acontecido e a pessoa digita de novo, criando repetida. Então, quando o
   *    filtro esconde a nova, um aviso diz isso e oferece limpar os filtros.
   * 2. Marcar feito avisa que a tarefa foi para a conferência (ver acima).
   */
  const acoesDasVisoes = useMemo<AcoesDoQuadro>(
    () => ({
      ...acoes,
      alternarFeito: async (tid) => {
        const t = tarefas.find((x) => x.id === tid);
        if (t && !estaFeita(t)) avisarQueFoiParaConferencia(t);
        await acoes.alternarFeito(tid);
      },
      definirStatus: async (d) => {
        const t = tarefas.find((x) => x.id === d.id);
        if (t && d.status === 'feito' && !estaFeita(t)) avisarQueFoiParaConferencia(t);
        await acoes.definirStatus(d);
      },
      criarTarefa: async (d) => {
        const gravou = await acoes.criarTarefa(d);
        if (!gravou || !temFiltroAtivo(filtros)) return gravou;
        const donoDaColuna = listas.find((l) => l.id === d.lista_id)?.responsavel ?? null;
        const responsaveis =
          d.responsaveis && d.responsaveis.length > 0
            ? pessoas.filter((p) => d.responsaveis!.includes(p.id))
            : donoDaColuna
              ? [donoDaColuna]
              : [];
        const aparece = novaTarefaApareceNoFiltro(
          { titulo: d.titulo, lista_id: d.lista_id, responsaveis },
          filtros,
          { iso: hoje, diaSemana: diaDaSemana },
        );
        if (!aparece) {
          toast({
            title: 'Tarefa criada, mas o filtro está escondendo ela',
            description: `"${d.titulo.trim()}" entrou na coluna. Limpe os filtros para ver.`,
            action: (
              <ToastAction altText="Limpar filtros" onClick={limparFiltros}>
                Limpar filtros
              </ToastAction>
            ),
          });
        }
        return gravou;
      },
    }),
    [acoes, tarefas, filtros, listas, pessoas, hoje, diaDaSemana, toast, limparFiltros, avisarQueFoiParaConferencia],
  );

  /* ── Ficha da tarefa pelo endereço ──────────────────────────────────────── */

  // `replace`: abrir e fechar a ficha não enche o histórico — o "voltar" do
  // navegador leva para a lista de quadros, não para a ficha fechada há pouco.
  // `dia` só vem da aba Conferência (o feito daquele dia); abrir pelo cartão
  // limpa o dia que tenha sobrado de antes.
  const abrirTarefa = useCallback(
    (tid: string, dia?: string | null) =>
      setSearchParams(
        (atual) => {
          const novo = new URLSearchParams(atual);
          novo.set('tarefa', tid);
          if (dia) novo.set('dia', dia);
          else novo.delete('dia');
          return novo;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const fecharTarefa = useCallback(
    () =>
      setSearchParams(
        (atual) => {
          const novo = new URLSearchParams(atual);
          novo.delete('tarefa');
          novo.delete('dia');
          return novo;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // Procura na lista INTEIRA, não na do quadro: a tarefa que espera o gerente
  // não está no Kanban, mas a ficha dela abre pela aba Conferência.
  const tarefaAberta = tarefaId ? tarefas.find((t) => t.id === tarefaId) ?? null : null;

  // A tarefa do link foi arquivada (por aqui ou por outra pessoa), ou é de
  // outro quadro: limpa o endereço para a ficha não "reabrir" sozinha quando
  // o quadro recarregar.
  useEffect(() => {
    if (tarefaId && quadro && !carregando && !tarefas.some((t) => t.id === tarefaId)) fecharTarefa();
  }, [tarefaId, quadro, carregando, tarefas, fecharTarefa]);

  /* ── Estados de carregamento ────────────────────────────────────────────── */

  if (carregando) {
    return (
      <div className="space-y-5" aria-label="Carregando o quadro">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <Skeleton className="h-10 w-full max-w-3xl" />
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-72 shrink-0 space-y-3 rounded-xl border bg-card/80 p-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
              {i % 2 === 0 && <Skeleton className="h-24 w-full" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Link errado ou cortado (/tarefas/abc, um id colado pela metade no
  // WhatsApp): o banco recusa o endereço antes de procurar. Para quem clicou,
  // é "quadro não encontrado" — o "Tentar de novo" falharia sempre.
  if (erro && !ehEnderecoInvalido(erro)) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 text-lg font-semibold">Não foi possível abrir o quadro.</p>
        <p className="mt-1 text-sm text-muted-foreground">{mensagemLeiga(erro)}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/tarefas">
              <ArrowLeft className="h-4 w-4" />
              Voltar para os quadros
            </Link>
          </Button>
          <Button onClick={() => qc.invalidateQueries({ queryKey: chaveDoQuadro(id) })}>
            <RefreshCw className="h-4 w-4" />
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  if (!quadro) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed p-10 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <SquareKanban className="h-7 w-7" />
        </span>
        <p className="mt-4 text-lg font-semibold">Quadro não encontrado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          O endereço pode estar errado, ou o quadro é de outra loja.
        </p>
        <Button variant="outline" className="mt-5" asChild>
          <Link to="/tarefas">
            <ArrowLeft className="h-4 w-4" />
            Voltar para os quadros
          </Link>
        </Button>
      </div>
    );
  }

  /* ── O quadro ───────────────────────────────────────────────────────────── */

  const corDoQuadro = quadro.cor ?? corDaEtiqueta(null, quadro.nome);
  const propsVisao: PropsVisaoQuadro = {
    listas,
    tarefas: filtradas,
    podeEditar,
    acoes: acoesDasVisoes,
    filtroAtivo,
    onLimparFiltros: limparFiltros,
    onAbrirTarefa: (tid) => abrirTarefa(tid),
    pessoas,
    periodos,
    etiquetas,
  };
  const criarLista = (d: { nome: string; cor: string | null }) => acoes.criarLista(d);

  return (
    <div className="min-w-0 animate-fade-in">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" asChild>
            <Link to="/tarefas" aria-label="Voltar para os quadros" title="Voltar para os quadros">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <span
            className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm', corDoQuadro)}
            aria-hidden
          >
            <SquareKanban className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <NomeDoQuadro
              nome={quadro.nome}
              podeEditar={podeGerenciar}
              onSalvar={(nome) => renomearQuadro({ id: quadro.id, nome })}
            />
            {quadro.descricao && (
              <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{quadro.descricao}</p>
            )}
            {/* O "como usar" aparece sempre (os modelos Loja e Assistência
                gravam descrição, e antes a dica sumia justo nos quadros reais)
                e muda com a permissão: quem não pode mover cartão não deve
                ler "arraste". */}
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground/80">
              {naConferencia
                ? 'O que a equipe marcou como feito neste quadro, esperando alguém conferir.'
                : podeEditar
                  ? 'Arraste os cartões entre as colunas, marque a bolinha quando terminar (a tarefa vai para a Conferência) e clique num cartão para abrir.'
                  : 'Marque a bolinha das suas tarefas quando terminar (ela vai para a Conferência) e clique num cartão para ver os detalhes.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={naConferencia ? ABA_CONFERENCIA : viewMode}
            onValueChange={trocarAba}
            aria-label="Forma de ver o quadro"
            className="rounded-lg bg-muted p-1"
          >
            <ToggleGroupItem
              value="kanban"
              size="sm"
              title="Ver em colunas, como no Trello"
              className="gap-1.5 px-3 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              <Columns3 className="h-4 w-4" />
              Kanban
            </ToggleGroupItem>
            <ToggleGroupItem
              value="grid"
              size="sm"
              title="Ver em tabela, como no Monday"
              className="gap-1.5 px-3 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              <Table2 className="h-4 w-4" />
              Tabela
            </ToggleGroupItem>
            <ToggleGroupItem
              value={ABA_CONFERENCIA}
              size="sm"
              title="Ver o que a equipe marcou como feito e espera alguém conferir"
              aria-label={
                itensAConferir.length > 0 ? `Conferência: ${itensAConferir.length} aguardando` : 'Conferência'
              }
              className="gap-1.5 px-3 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              <ClipboardCheck className="h-4 w-4" />
              Conferência
              {itensAConferir.length > 0 && (
                <span className="min-w-5 rounded-full bg-amber-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white tabular-nums shadow-sm">
                  {itensAConferir.length > 99 ? '99+' : itensAConferir.length}
                </span>
              )}
            </ToggleGroupItem>
          </ToggleGroup>

          {podeEditar && listas.length > 0 && !naConferencia && (
            <Popover open={novaListaAberta} onOpenChange={setNovaListaAberta}>
              <PopoverTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  Adicionar coluna
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <FormNovaLista onCriar={criarLista} onPronto={() => setNovaListaAberta(false)} />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </header>

      {quadro.arquivado_em && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Este quadro está arquivado: ele não aparece na lista de quadros e as tarefas dele não vão para Minhas
          Tarefas.
        </div>
      )}

      {naConferencia ? (
        // Sem filtros nem resumo: a conferência é uma lista curta, do que
        // espera o gerente, e os filtros do quadro (dia, status) não fazem
        // sentido para ela.
        <div className="max-w-4xl">
          <ConferenciaView
            quadroId={quadro.id}
            pessoas={pessoas}
            podeConferir={podeConferir}
            onAbrirTarefa={(item) => abrirTarefa(item.tarefa_id, item.dia)}
          />
        </div>
      ) : listas.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Columns3 className="h-7 w-7" />
          </span>
          <p className="mt-4 text-lg font-semibold">Este quadro ainda não tem colunas</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Crie uma coluna para cada pessoa (Pedro, Gabriel, Richard...) ou para cada assunto (Conferência,
            Produtos a comprar). As tarefas entram dentro delas.
          </p>
          {podeEditar ? (
            <div className="mx-auto mt-6 max-w-sm rounded-xl border bg-card p-4 shadow-sm">
              <FormNovaLista onCriar={criarLista} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Peça para quem organiza o quadro criar as colunas.</p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 space-y-3 rounded-xl border bg-card/60 p-3 shadow-sm">
            <FiltrosTarefas
              valores={filtros}
              onChange={setFiltros}
              pessoas={pessoas}
              etiquetas={etiquetas}
              resultados={filtradas.length}
            />
            <ResumoDoQuadro
              resumo={resumo}
              ativo={filtros.status}
              onEscolher={(status) => setFiltros((f) => ({ ...f, status }))}
            />
          </div>

          <div className="min-w-0">
            {viewMode === 'kanban' ? <QuadroKanban {...propsVisao} /> : <QuadroTabela {...propsVisao} />}
          </div>
        </>
      )}

      <TarefaDialog
        tarefa={tarefaAberta}
        listas={listas}
        podeEditar={podeEditar}
        podeGerenciar={podeGerenciar}
        acoes={acoes}
        pessoas={pessoas}
        periodos={periodos}
        etiquetas={etiquetas}
        horarios={horarios}
        podeConferir={podeConferir}
        diaDaConferencia={diaDoLink}
        onClose={fecharTarefa}
      />
    </div>
  );
}
