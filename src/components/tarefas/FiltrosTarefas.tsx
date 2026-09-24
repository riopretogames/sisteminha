import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AvataresPessoas } from '@/components/tarefas/AvataresPessoas';
import { EtiquetaChip } from '@/components/tarefas/EtiquetaChip';
import { DIAS_SEMANA, STATUS_ATRASADA, TAREFA_PRIORIDADES, TAREFA_STATUS } from '@/config/tarefas';
import { temFiltroAtivo } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import {
  FILTROS_TAREFAS_VAZIO,
  type DiaFiltro,
  type FiltrosTarefasValores,
  type PropsFiltrosTarefas,
} from '@/types/tarefas';

/**
 * Barra de filtros do quadro — vale igual para o Kanban e para a Tabela.
 *
 * Os chips de dia (Todas · Hoje · Seg … Sáb) fazem o papel das abas
 * Segunda...Sábado que o Felipe usava no Monday: clicar em "Qua" mostra o
 * que cai na quarta, com as mesmas cores das etiquetas de dia do Trello, para
 * a equipe reconhecer de primeira.
 *
 * Domingo não tem chip, por pedido do Felipe em 24/09: "pode tirar o Domingo,
 * porque ninguém faz nada de Domingo". A tarefa marcada para domingo continua
 * existindo e aparece em "Todas" — só não ganha uma aba própria.
 *
 * Clicar num dia também troca a visão para a Tabela por pessoa (quem decide é
 * a página do quadro): "Todas" é o Kanban do Felipe, o dia é o Monday da equipe.
 *
 * Visual compacto de propósito (não o painel grande dos filtros de OS): aqui
 * o filtro é trocado o tempo todo, e o quadro é o que importa na tela.
 *
 * A lista de pessoas vem do CADASTRO (a página passa `usePessoasDaLoja`),
 * nunca das tarefas carregadas — lição da Luana, que sumia do filtro de
 * vendas por não ter vendido nada ainda.
 */

/** Radix não aceita item com valor vazio: "todas" é o jeito de dizer "sem filtro". */
const TODAS = '__todas';

/** Ordem em que a pessoa pensa o andamento: o que falta, o que atrasou, o que acabou. */
const OPCOES_DE_STATUS: { valor: string; label: string; cor: string }[] = [
  { valor: 'nao_iniciado', ...TAREFA_STATUS.nao_iniciado },
  { valor: 'fazendo', ...TAREFA_STATUS.fazendo },
  { valor: 'atrasada', ...STATUS_ATRASADA },
  { valor: 'feito', ...TAREFA_STATUS.feito },
  { valor: 'pausada', ...TAREFA_STATUS.pausada },
];

/** Da mais urgente para a mais tranquila — a ordem em que se procura. */
const OPCOES_DE_PRIORIDADE = Object.entries(TAREFA_PRIORIDADES)
  .map(([valor, def]) => ({ valor, label: def.label, cor: def.cor, ordem: def.ordem }))
  .sort((a, b) => b.ordem - a.ordem);

export function FiltrosTarefas({ valores, onChange, pessoas, etiquetas, resultados }: PropsFiltrosTarefas) {
  const diaDeHoje = new Date().getDay();

  const alterar = <C extends keyof FiltrosTarefasValores>(campo: C, valor: FiltrosTarefasValores[C]) =>
    onChange({ ...valores, [campo]: valor });

  const escolherDia = (dia: DiaFiltro) => alterar('dia', dia);

  const temFiltro = temFiltroAtivo(valores);

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Mostrar as tarefas do dia" className="flex flex-wrap items-center gap-1.5">
        <ChipDeDia
          ativo={valores.dia === 'todas'}
          corAtiva="bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
          onClick={() => escolherDia('todas')}
          titulo="Todas as tarefas do quadro, de qualquer dia"
        >
          Todas
        </ChipDeDia>
        <ChipDeDia
          ativo={valores.dia === 'hoje'}
          corAtiva="bg-green-600 text-white"
          onClick={() => escolherDia('hoje')}
          titulo="Só o que cai hoje"
        >
          Hoje
        </ChipDeDia>

        <span aria-hidden className="mx-1 h-5 w-px bg-border" />

        {DIAS_SEMANA.filter((d) => d.n !== 0).map((d) => {
          const ehHoje = d.n === diaDeHoje;
          return (
            <ChipDeDia
              key={d.n}
              ativo={valores.dia === d.n}
              corAtiva={d.cor}
              onClick={() => escolherDia(d.n)}
              titulo={ehHoje ? `${d.nome} (hoje)` : d.nome}
              marcaHoje={ehHoje}
            >
              {d.curto}
            </ChipDeDia>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar tarefa"
            value={valores.busca}
            onChange={(e) => alterar('busca', e.target.value)}
            placeholder="Buscar tarefa..."
            className={cn('h-9 pl-9 pr-8', valores.busca && 'border-primary/60 bg-primary/5')}
          />
          {valores.busca && (
            <button
              type="button"
              aria-label="Apagar a busca"
              onClick={() => alterar('busca', '')}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <FiltroSelect
          rotulo="Filtrar por pessoa"
          valor={valores.pessoa}
          onChange={(v) => alterar('pessoa', v)}
          textoTodas="Todas as pessoas"
        >
          {pessoas.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <AvataresPessoas pessoas={[p]} max={1} />
                <span className="truncate">{p.nome}</span>
              </span>
            </SelectItem>
          ))}
        </FiltroSelect>

        <FiltroSelect
          rotulo="Filtrar por prioridade"
          valor={valores.prioridade}
          onChange={(v) => alterar('prioridade', v)}
          textoTodas="Toda prioridade"
        >
          {OPCOES_DE_PRIORIDADE.map((p) => (
            <SelectItem key={p.valor} value={p.valor}>
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', p.cor)} />
                {p.label}
              </span>
            </SelectItem>
          ))}
        </FiltroSelect>

        <FiltroSelect
          rotulo="Filtrar por status"
          valor={valores.status}
          onChange={(v) => alterar('status', v)}
          textoTodas="Todo status"
        >
          {OPCOES_DE_STATUS.map((s) => (
            <SelectItem key={s.valor} value={s.valor}>
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', s.cor)} />
                {s.label}
              </span>
            </SelectItem>
          ))}
        </FiltroSelect>

        <FiltroSelect
          rotulo="Filtrar por etiqueta"
          valor={valores.etiqueta}
          onChange={(v) => alterar('etiqueta', v)}
          textoTodas="Toda etiqueta"
        >
          {etiquetas.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              <EtiquetaChip etiqueta={e} pequena />
            </SelectItem>
          ))}
        </FiltroSelect>

        {temFiltro && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(FILTROS_TAREFAS_VAZIO)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X />
            Limpar filtros
          </Button>
        )}

        {resultados !== undefined && (
          <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
            <strong className="font-semibold text-foreground">{resultados}</strong>{' '}
            {resultados === 1 ? 'tarefa' : 'tarefas'}
          </span>
        )}
      </div>
    </div>
  );
}

/** Um chip de dia. Ativo = pintado na cor do dia (as etiquetas do Trello). */
function ChipDeDia({
  ativo,
  corAtiva,
  onClick,
  titulo,
  marcaHoje = false,
  children,
}: {
  ativo: boolean;
  corAtiva: string;
  onClick: () => void;
  titulo: string;
  /** Pontinho embaixo do dia de hoje, para achar "Qua = hoje" sem pensar. */
  marcaHoje?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      title={titulo}
      onClick={onClick}
      className={cn(
        'relative inline-flex h-8 items-center rounded-full px-3 text-xs font-bold uppercase tracking-wide',
        'transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-95',
        ativo
          ? cn(corAtiva, 'shadow-sm')
          : 'border bg-background text-muted-foreground hover:border-foreground/30 hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
      {marcaHoje && (
        <span
          aria-hidden
          className={cn(
            'absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full',
            ativo ? 'bg-current' : 'bg-green-600',
          )}
        />
      )}
    </button>
  );
}

/**
 * Um seletor da barra. Quando está filtrando, a borda acende — senão a
 * pessoa esquece que filtrou e acha que as tarefas sumiram.
 */
function FiltroSelect({
  rotulo,
  valor,
  onChange,
  textoTodas,
  children,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  textoTodas: string;
  children: ReactNode;
}) {
  return (
    <Select value={valor || TODAS} onValueChange={(v) => onChange(v === TODAS ? '' : v)}>
      <SelectTrigger
        aria-label={rotulo}
        className={cn(
          'h-9 w-auto min-w-[150px] gap-2 transition-colors',
          valor ? 'border-primary/60 bg-primary/5 font-medium' : 'text-muted-foreground',
        )}
      >
        <SelectValue placeholder={textoTodas} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODAS}>{textoTodas}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}
