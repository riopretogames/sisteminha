import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, Ellipsis, GripVertical, Palette, Pencil, Plus, UserPlus, UserRound } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { AvataresPessoas } from '@/components/tarefas/AvataresPessoas';
import { SeletorPessoas } from '@/components/tarefas/SeletorPessoas';
import { CartaoTarefa } from '@/components/tarefas/kanban/CartaoTarefa';
import { NovaTarefaInline } from '@/components/tarefas/kanban/NovaTarefaInline';
import { corDaLista, idDeLista, idDeTarefa, podeMarcarTarefa } from '@/components/tarefas/kanban/regrasDoKanban';
import { CORES_ETIQUETA, corDaEtiqueta } from '@/lib/cores';
import { estaFeita } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type { AcoesDoQuadro, DiaFiltro, Lista, Pessoa, Tarefa } from '@/types/tarefas';

export interface PropsListaKanban {
  lista: Lista;
  /** As tarefas da coluna, já na ordem em que aparecem (inclusive no meio de um arrasto). */
  tarefas: Tarefa[];
  hojeISO: string;
  podeEditar: boolean;
  /** Quem está logado: libera a bolinha de feito do responsável sem permissão de editar. */
  usuarioId: string | null;
  /** Cadastro de pessoas (para o responsável da coluna). */
  pessoas: Pessoa[];
  acoes: AcoesDoQuadro;
  onAbrirTarefa: (tarefaId: string) => void;
  /** O turno padrão da loja: o cartão não o repete (ver CartaoTarefa). */
  periodoPadraoId?: string | null;
  /** Há filtro ligado: coluna sem cartão pode ser só o filtro escondendo. */
  filtroAtivo?: boolean;
  onLimparFiltros?: () => void;
  /** O chip de dia ligado no quadro (trava a bolinha no chip de outro dia; ver CartaoTarefa). */
  diaDoFiltro?: DiaFiltro;
}

/** Valores de mentira para as opções "sem nada" dos menus (o menu não aceita vazio com segurança). */
const SEM_RESPONSAVEL = '__ninguem__';
const COR_AUTOMATICA = '__automatica__';

/** O cartão com o arrasto ligado. O desenho é todo do CartaoTarefa. */
function CartaoArrastavel({
  tarefa,
  lista,
  hojeISO,
  podeEditar,
  usuarioId,
  acoes,
  onAbrirTarefa,
  periodoPadraoId,
  diaDoFiltro,
}: {
  tarefa: Tarefa;
  lista: Lista;
  hojeISO: string;
  podeEditar: boolean;
  usuarioId: string | null;
  acoes: AcoesDoQuadro;
  onAbrirTarefa: (tarefaId: string) => void;
  periodoPadraoId: string | null;
  diaDoFiltro: DiaFiltro;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: idDeTarefa(tarefa.id),
    data: { tipo: 'tarefa' },
    // Sem permissão de editar, o cartão não se move — mover é trocar a coluna
    // da tarefa, e o banco recusaria de qualquer jeito.
    disabled: !podeEditar,
    attributes: { roleDescription: 'cartão que pode ser movido' },
  });

  // O cartão inteiro é a "alça": pegar em qualquer ponto dele arrasta.
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      setActivatorNodeRef(el);
    },
    [setNodeRef, setActivatorNodeRef],
  );

  return (
    <CartaoTarefa
      ref={ref}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      tarefa={tarefa}
      hojeISO={hojeISO}
      podeEditar={podeEditar}
      podeMarcar={podeMarcarTarefa(tarefa, lista, podeEditar, usuarioId)}
      fantasma={isDragging}
      periodoPadraoId={periodoPadraoId}
      diaDoFiltro={diaDoFiltro}
      onAbrir={() => onAbrirTarefa(tarefa.id)}
      onAlternarFeito={() => void acoes.alternarFeito(tarefa.id)}
    />
  );
}

/**
 * Uma coluna do Kanban — no Trello do Felipe, "a coluna do Pedro", "a do
 * Gabriel", "Anúncios OLX".
 *
 * O cabeçalho diz tudo de longe: a cor da coluna, o nome, quantas tarefas tem,
 * uma barrinha de quanto já foi feito hoje e a bolinha de quem é a coluna.
 * Tarefa nova criada numa coluna com dono já nasce com ele (regra do
 * `useQuadro`), por isso trocar o dono fica à mão, no clique da bolinha.
 *
 * Pegar pelo cabeçalho arrasta a coluna inteira; os cartões se arrastam sozinhos.
 */
export function ListaKanban({
  lista,
  tarefas,
  hojeISO,
  podeEditar,
  usuarioId,
  pessoas,
  acoes,
  onAbrirTarefa,
  periodoPadraoId = null,
  filtroAtivo = false,
  onLimparFiltros,
  diaDoFiltro = 'todas',
}: PropsListaKanban) {
  const [editandoNome, setEditandoNome] = useState(false);
  const [nome, setNome] = useState(lista.nome);
  const [adicionando, setAdicionando] = useState(false);
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  /**
   * O que fazer quando o menu ⋯ fechar. O menu devolve o foco para o botão
   * dele ao fechar; se a pessoa escolheu "Renomear", isso tiraria o foco da
   * caixa do nome no mesmo instante e a edição acabaria antes de começar.
   */
  const depoisDoMenu = useRef<'nome' | 'arquivar' | null>(null);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: idDeLista(lista.id),
    data: { tipo: 'lista' },
    disabled: !podeEditar,
    attributes: { roleDescription: 'coluna que pode ser movida' },
  });

  useEffect(() => {
    if (!editandoNome) setNome(lista.nome);
  }, [lista.nome, editandoNome]);

  const cor = corDaLista(lista);
  const feitas = useMemo(() => tarefas.filter((t) => estaFeita(t)).length, [tarefas]);
  const total = tarefas.length;
  const percentual = total > 0 ? Math.round((feitas / total) * 100) : 0;
  const idsDosCartoes = useMemo(() => tarefas.map((t) => idDeTarefa(t.id)), [tarefas]);

  // O dono atual continua na lista mesmo se saiu do cadastro ativo — senão o
  // seletor o mostraria como "ninguém" e o próximo clique o apagaria.
  const pessoasDoSeletor = useMemo(() => {
    if (!lista.responsavel || pessoas.some((p) => p.id === lista.responsavel?.id)) return pessoas;
    return [...pessoas, lista.responsavel];
  }, [pessoas, lista.responsavel]);

  const salvarNome = () => {
    const limpo = nome.trim();
    setEditandoNome(false);
    if (limpo && limpo !== lista.nome) void acoes.atualizarLista({ id: lista.id, nome: limpo });
    else setNome(lista.nome);
  };

  const trocarResponsavel = (id: string | null) => {
    if ((lista.responsavel_id ?? null) === id) return;
    void acoes.atualizarLista({ id: lista.id, responsavel_id: id });
  };

  const textoDaContagem =
    total === 0
      ? 'Nenhuma tarefa'
      : `${total} ${total === 1 ? 'tarefa' : 'tarefas'}, ${feitas} ${feitas === 1 ? 'feita' : 'feitas'}`;

  const avatarDoDono = lista.responsavel ? (
    <AvataresPessoas pessoas={[lista.responsavel]} max={1} />
  ) : (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
      <UserPlus className="h-3 w-3" />
    </span>
  );

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`Coluna ${lista.nome}`}
      className={cn(
        'group/coluna flex w-72 shrink-0 flex-col rounded-xl border bg-card/80 shadow-sm',
        isDragging && 'border-dashed border-primary/40 opacity-40',
      )}
    >
      {/* A faixa colorida no topo é o que identifica a coluna de longe. */}
      <div className={cn('h-1.5 rounded-t-xl', cor)} aria-hidden />

      <header
        // Só o PONTEIRO aqui: o teclado pega a coluna pela alça (abaixo). Se o
        // cabeçalho inteiro escutasse o teclado, apertar espaço enquanto
        // renomeia a coluna começaria a arrastá-la.
        onPointerDown={
          podeEditar && !editandoNome
            ? (e) => {
                // Menu ⋯ e seletor de pessoa abrem "por fora" da página, mas o
                // React ainda entrega o clique deles aqui. Sem este filtro,
                // escolher uma pessoa e mexer o mouse sem querer arrastaria a
                // coluna inteira.
                if (!e.currentTarget.contains(e.target as Node)) return;
                listeners?.onPointerDown?.(e);
              }
            : undefined
        }
        className={cn('flex items-center gap-1.5 px-2 pb-1.5 pt-2', podeEditar && !editandoNome && 'cursor-grab')}
      >
        {podeEditar ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            onKeyDown={(e) => listeners?.onKeyDown?.(e)}
            aria-label={`Mover a coluna ${lista.nome}`}
            title="Arraste para mudar a coluna de lugar"
            className="-ml-0.5 flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/coluna:opacity-100"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-1" />
        )}

        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', cor)} aria-hidden />

        {editandoNome ? (
          <Input
            autoFocus
            value={nome}
            maxLength={60}
            onChange={(e) => setNome(e.target.value)}
            onBlur={salvarNome}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                salvarNome();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setNome(lista.nome);
                setEditandoNome(false);
              }
            }}
            aria-label="Nome da coluna"
            className="h-7 flex-1 px-2 text-sm font-semibold"
          />
        ) : (
          <h3
            className="min-w-0 flex-1 truncate text-sm font-semibold"
            title={podeEditar ? `${lista.nome} — dois cliques para renomear` : lista.nome}
            onDoubleClick={podeEditar ? () => setEditandoNome(true) : undefined}
          >
            {lista.nome}
          </h3>
        )}

        <span
          title={textoDaContagem}
          className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground"
        >
          {total}
        </span>

        {podeEditar ? (
          <SeletorPessoas
            pessoas={pessoasDoSeletor}
            valor={lista.responsavel_id ? [lista.responsavel_id] : []}
            onChange={(ids) => trocarResponsavel(ids[0] ?? null)}
            unico
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={
                lista.responsavel
                  ? `Coluna de ${lista.responsavel.nome}. Trocar o responsável`
                  : 'Escolher o responsável da coluna'
              }
              title={lista.responsavel ? `Coluna de ${lista.responsavel.nome}` : 'Escolher o responsável da coluna'}
              className={cn(
                'shrink-0 rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !lista.responsavel && 'opacity-0 focus-visible:opacity-100 group-hover/coluna:opacity-100',
              )}
            >
              {avatarDoDono}
            </button>
          </SeletorPessoas>
        ) : (
          lista.responsavel && (
            <span className="shrink-0" title={`Coluna de ${lista.responsavel.nome}`}>
              <AvataresPessoas pessoas={[lista.responsavel]} max={1} />
            </span>
          )
        )}

        {podeEditar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={`Opções da coluna ${lista.nome}`}
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Ellipsis className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onCloseAutoFocus={(e) => {
                const proximo = depoisDoMenu.current;
                depoisDoMenu.current = null;
                if (proximo) e.preventDefault();
                if (proximo === 'nome') setEditandoNome(true);
                if (proximo === 'arquivar') setConfirmarArquivo(true);
              }}
            >
              <DropdownMenuItem onSelect={() => (depoisDoMenu.current = 'nome')}>
                <Pencil className="mr-2 h-4 w-4" />
                Renomear coluna
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <UserRound className="mr-2 h-4 w-4" />
                  Responsável da coluna
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 w-60 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={lista.responsavel_id ?? SEM_RESPONSAVEL}
                    onValueChange={(v) => trocarResponsavel(v === SEM_RESPONSAVEL ? null : v)}
                  >
                    <DropdownMenuRadioItem value={SEM_RESPONSAVEL}>
                      <span className="text-muted-foreground">Ninguém (coluna de apoio)</span>
                    </DropdownMenuRadioItem>
                    {pessoasDoSeletor.map((p) => (
                      <DropdownMenuRadioItem key={p.id} value={p.id}>
                        <AvataresPessoas pessoas={[p]} max={1} />
                        <span className="ml-2 truncate">{p.nome}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="mr-2 h-4 w-4" />
                  Cor da coluna
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 w-48 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={lista.cor ?? COR_AUTOMATICA}
                    onValueChange={(v) => {
                      const nova = v === COR_AUTOMATICA ? null : v;
                      if (nova !== (lista.cor ?? null)) void acoes.atualizarLista({ id: lista.id, cor: nova });
                    }}
                  >
                    <DropdownMenuRadioItem value={COR_AUTOMATICA}>
                      <span className={cn('mr-2 h-3.5 w-3.5 rounded-full', corDaEtiqueta(null, lista.nome))} />
                      Automática
                    </DropdownMenuRadioItem>
                    {CORES_ETIQUETA.map((c) => (
                      <DropdownMenuRadioItem key={c.value} value={c.value}>
                        <span className={cn('mr-2 h-3.5 w-3.5 rounded-full', c.value)} />
                        {c.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => (depoisDoMenu.current = 'arquivar')}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Archive className="mr-2 h-4 w-4" />
                Arquivar coluna
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* A barrinha do Monday: quanto da coluna já foi feito hoje. */}
      {total > 0 && (
        <div className="mx-3 mb-2 flex items-center gap-2" title={`${feitas} de ${total} já feitas`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${percentual}%` }}
            />
          </div>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {feitas}/{total}
          </span>
        </div>
      )}

      <div className="mx-1.5 flex min-h-[4.5rem] flex-col gap-2 rounded-lg bg-muted/40 p-1.5">
        <SortableContext items={idsDosCartoes} strategy={verticalListSortingStrategy}>
          {tarefas.map((t) => (
            <CartaoArrastavel
              key={t.id}
              tarefa={t}
              lista={lista}
              hojeISO={hojeISO}
              podeEditar={podeEditar}
              usuarioId={usuarioId}
              acoes={acoes}
              onAbrirTarefa={onAbrirTarefa}
              periodoPadraoId={periodoPadraoId}
              diaDoFiltro={diaDoFiltro}
            />
          ))}
        </SortableContext>
        {tarefas.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-muted-foreground/20 px-3 py-4 text-center">
            {/* Com filtro ligado, "vazia" pode ser mentira: as tarefas existem,
                o filtro é que está escondendo. */}
            {filtroAtivo ? (
              <>
                <span className="text-xs font-medium text-muted-foreground">Nenhuma tarefa com esse filtro</span>
                {onLimparFiltros && (
                  <button
                    type="button"
                    onClick={onLimparFiltros}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Limpar filtros
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-xs font-medium text-muted-foreground">Nenhuma tarefa por aqui</span>
                {podeEditar && (
                  <span className="text-[11px] text-muted-foreground/80">Arraste um cartão para cá ou adicione abaixo.</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="p-1.5">
        {podeEditar &&
          (adicionando ? (
            <NovaTarefaInline
              onCriar={(titulo) => acoes.criarTarefa({ lista_id: lista.id, titulo })}
              onCancelar={() => setAdicionando(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" />
              Adicionar tarefa
            </button>
          ))}
      </div>

      <AlertDialog open={confirmarArquivo} onOpenChange={setConfirmarArquivo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar a coluna "{lista.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A coluna sai do quadro junto com todas as tarefas que estão nela. Logo depois aparece um aviso com
              o botão "Desfazer", por alguns segundos. Passado isso, ainda não há tela para trazer de volta: fale
              com o Felipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cn(buttonVariants({ variant: 'cancelar' }), 'hover:text-destructive')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => void acoes.arquivarLista(lista.id)}
            >
              Arquivar coluna
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
