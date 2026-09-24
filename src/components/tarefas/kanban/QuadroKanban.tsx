import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  pointerWithin,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Columns3 } from 'lucide-react';
import { CartaoTarefa } from '@/components/tarefas/kanban/CartaoTarefa';
import { ListaKanban } from '@/components/tarefas/kanban/ListaKanban';
import {
  colunaDaTarefa,
  corDaLista,
  ehIdDeLista,
  ehIdDeTarefa,
  idDeLista,
  idReal,
  mesmaSequencia,
  moverEntreColunas,
  ordemNaPosicao,
  type Colunas,
} from '@/components/tarefas/kanban/regrasDoKanban';
import { useAuth } from '@/hooks/useAuth';
import { hojeISO as calcularHojeISO } from '@/lib/format';
import { agruparPorLista, ordemEntre, ordenarPorOrdem } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type { Lista, PropsVisaoQuadro, Tarefa } from '@/types/tarefas';

/**
 * A visão Kanban do quadro — o Trello do Felipe dentro do sisteminha.
 *
 * Colunas lado a lado (uma por pessoa ou de apoio), cartões que se arrastam
 * entre elas e colunas que se arrastam entre si. Tudo o que a tela grava sai
 * pelas `acoes` do `useQuadro`; este componente não fala com o banco.
 *
 * Como o arrasto funciona, em linguagem de loja:
 * - Enquanto o cartão está no ar, a tela mexe só numa cópia local das colunas
 *   (é o que faz o cartão "abrir espaço" na coluna de destino). Nada é gravado.
 * - Ao soltar, o cartão ganha a posição média entre os vizinhos (ver
 *   `ordemNaPosicao`) e UMA gravação vai para o banco.
 * - Até o banco responder, a tela segura o cartão onde ele foi solto; se o
 *   banco recusar, o `useQuadro` volta tudo e avisa. Sem esse "segurar", o
 *   cartão piscaria na posição antiga por um instante antes de pular de novo —
 *   o tipo de coisa que faz a pessoa achar que não funcionou e arrastar outra vez.
 *
 * Clicar sem arrastar abre a ficha: o arrasto só começa depois de o mouse andar
 * 6 pixels com o botão apertado.
 */

type Arrasto = { tipo: 'tarefa' | 'lista'; id: string } | null;

/** Solto em cima: um pulinho curto e a cópia some no lugar certo. */
const ANIMACAO_AO_SOLTAR: DropAnimation = {
  duration: 180,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
};

/** Instruções para quem usa leitor de tela, em português. */
const INSTRUCOES_DE_TECLADO = {
  draggable:
    'Para mover, aperte espaço. Use as setas para escolher o lugar, espaço de novo para soltar, ou Esc para desistir. Enter abre a tarefa.',
};

export function QuadroKanban({
  listas,
  tarefas,
  podeEditar,
  acoes,
  onAbrirTarefa,
  pessoas,
  periodos,
  filtroAtivo = false,
  onLimparFiltros,
  diaDoFiltro = 'todas',
}: PropsVisaoQuadro) {
  const { user } = useAuth();
  const periodoPadraoId = periodos.find((p) => p.padrao)?.id ?? null;
  const usuarioId = user?.id ?? null;
  const hoje = calcularHojeISO();

  const [arrasto, setArrasto] = useState<Arrasto>(null);
  /** As colunas como estão NO AR, durante o arrasto de um cartão. */
  const [colunasNoAr, setColunasNoAr] = useState<Colunas | null>(null);
  /** Posições já soltas e ainda não confirmadas pelo banco. */
  const [cartoesPendentes, setCartoesPendentes] = useState<Record<string, { lista_id: string; ordem: number }>>({});
  const [colunasPendentes, setColunasPendentes] = useState<Record<string, { ordem: number }>>({});

  /* ── O quadro como a tela desenha (dados + o que ainda está a caminho do banco) ── */

  const tarefasVivas = useMemo(
    () => tarefas.map((t) => (cartoesPendentes[t.id] ? { ...t, ...cartoesPendentes[t.id] } : t)),
    [tarefas, cartoesPendentes],
  );
  const tarefaPorId = useMemo(() => new Map(tarefasVivas.map((t) => [t.id, t])), [tarefasVivas]);

  const listasVivas = useMemo(
    () =>
      ordenarPorOrdem(
        listas.map((l) => (colunasPendentes[l.id] ? { ...l, ...colunasPendentes[l.id] } : l)),
      ),
    [listas, colunasPendentes],
  );
  const listaPorId = useMemo(() => new Map(listasVivas.map((l) => [l.id, l])), [listasVivas]);

  const colunasBase = useMemo(() => {
    const grupos = agruparPorLista(tarefasVivas);
    const resultado: Colunas = {};
    for (const l of listasVivas) resultado[l.id] = (grupos.get(l.id) ?? []).map((t) => t.id);
    return resultado;
  }, [tarefasVivas, listasVivas]);

  const colunas = colunasNoAr ?? colunasBase;
  const idsDasColunas = useMemo(() => listasVivas.map((l) => idDeLista(l.id)), [listasVivas]);

  /* ── Onde o cartão vai cair ─────────────────────────────────────────────── */

  const ultimoAlvo = useRef<UniqueIdentifier | null>(null);
  /**
   * Logo depois de o cartão trocar de coluna, as colunas mudam de altura e,
   * por um instante, ele pode não estar "em cima" de nada. Sem esta trava a
   * tela o devolveria para a coluna anterior e ele ficaria pulando entre as
   * duas (é o problema conhecido da biblioteca, resolvido do jeito que ela
   * recomenda).
   */
  const acabouDeTrocarDeColuna = useRef(false);
  const colunasRef = useRef(colunas);
  colunasRef.current = colunas;

  useEffect(() => {
    const quadro = requestAnimationFrame(() => {
      acabouDeTrocarDeColuna.current = false;
    });
    return () => cancelAnimationFrame(quadro);
  }, [colunas]);

  const detectarAlvo: CollisionDetection = useCallback((args) => {
    // Coluna arrastada só "enxerga" outras colunas.
    if (ehIdDeLista(args.active.id)) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => ehIdDeLista(c.id)),
      });
    }

    // Cartão: primeiro o que está debaixo do ponteiro (no teclado não há
    // ponteiro, então vale o que encosta). Entre cartão e coluna, o cartão.
    const sobPonteiro = pointerWithin(args);
    const colisoes = sobPonteiro.length > 0 ? sobPonteiro : rectIntersection(args);
    const deCartao = colisoes.filter((c) => ehIdDeTarefa(c.id));
    let alvo = getFirstCollision(deCartao.length > 0 ? deCartao : colisoes, 'id');

    if (alvo != null) {
      // Em cima da coluna (e não de um cartão): mira o cartão mais próximo
      // dela, para o espaço abrir no ponto certo e não sempre no fim.
      if (ehIdDeLista(alvo)) {
        const idsNaColuna = colunasRef.current[idReal(alvo)] ?? [];
        if (idsNaColuna.length > 0) {
          const maisPerto = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              (c) => ehIdDeTarefa(c.id) && idsNaColuna.includes(idReal(c.id)),
            ),
          })[0]?.id;
          if (maisPerto != null) alvo = maisPerto;
        }
      }
      ultimoAlvo.current = alvo;
      return [{ id: alvo }];
    }

    if (acabouDeTrocarDeColuna.current) ultimoAlvo.current = args.active.id;
    return ultimoAlvo.current != null ? [{ id: ultimoAlvo.current }] : [];
  }, []);

  const sensores = useSensors(
    // 6 pixels antes de começar: clique simples continua abrindo a ficha.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Espaço pega e solta; Enter fica livre para abrir a ficha.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  /* ── Os três momentos do arrasto ─────────────────────────────────────────── */

  const aoComecar = ({ active }: DragStartEvent) => {
    ultimoAlvo.current = null;
    if (ehIdDeLista(active.id)) {
      setArrasto({ tipo: 'lista', id: idReal(active.id) });
    } else {
      setArrasto({ tipo: 'tarefa', id: idReal(active.id) });
      setColunasNoAr(colunasBase);
    }
  };

  /** Só a troca de COLUNA precisa de estado; dentro da mesma coluna a biblioteca anima sozinha. */
  const aoPassarPorCima = ({ active, over }: DragOverEvent) => {
    if (!over || ehIdDeLista(active.id)) return;
    const idAtivo = idReal(active.id);
    const atuais = colunasNoAr ?? colunasBase;
    const origem = colunaDaTarefa(atuais, idAtivo);
    const destino = ehIdDeLista(over.id) ? idReal(over.id) : colunaDaTarefa(atuais, idReal(over.id));
    if (!origem || !destino || origem === destino) return;

    let indice: number;
    if (ehIdDeLista(over.id)) {
      indice = atuais[destino].length;
    } else {
      // Passou da metade do cartão de baixo? Entra depois dele.
      const indiceDoAlvo = atuais[destino].indexOf(idReal(over.id));
      const retangulo = active.rect.current.translated;
      const abaixo = Boolean(retangulo && retangulo.top > over.rect.top + over.rect.height / 2);
      indice = indiceDoAlvo >= 0 ? indiceDoAlvo + (abaixo ? 1 : 0) : atuais[destino].length;
    }

    acabouDeTrocarDeColuna.current = true;
    setColunasNoAr(moverEntreColunas(atuais, idAtivo, destino, indice));
  };

  const cancelar = () => {
    setArrasto(null);
    setColunasNoAr(null);
  };

  const aoSoltar = ({ active, over }: DragEndEvent) => {
    const atuais = colunasNoAr ?? colunasBase;
    cancelar();
    if (!over) return; // solto fora do quadro: nada muda

    if (ehIdDeLista(active.id)) {
      soltarColuna(idReal(active.id), over.id);
      return;
    }

    const idAtivo = idReal(active.id);
    const listaFinal = colunaDaTarefa(atuais, idAtivo);
    if (!listaFinal) return;

    let ids = atuais[listaFinal];
    if (ehIdDeTarefa(over.id)) {
      const de = ids.indexOf(idAtivo);
      const para = ids.indexOf(idReal(over.id));
      if (para >= 0 && de !== para) ids = arrayMove(ids, de, para);
    }

    const original = tarefaPorId.get(idAtivo);
    if (!original) return;
    // Solto onde já estava: nada a gravar.
    if (original.lista_id === listaFinal && mesmaSequencia(ids, colunasBase[listaFinal])) return;

    const ordem = ordemNaPosicao(ids, idAtivo, (id) => tarefaPorId.get(id)?.ordem);
    void segurarAteGravar(
      setCartoesPendentes,
      idAtivo,
      { lista_id: listaFinal, ordem },
      () => acoes.moverTarefa({ id: idAtivo, lista_id: listaFinal, ordem }),
    );
  };

  const soltarColuna = (id: string, sobre: UniqueIdentifier) => {
    const ids = listasVivas.map((l) => l.id);
    const alvo = ehIdDeLista(sobre) ? idReal(sobre) : colunaDaTarefa(colunas, idReal(sobre));
    const de = ids.indexOf(id);
    const para = alvo ? ids.indexOf(alvo) : -1;
    if (de < 0 || para < 0 || de === para) return;

    const nova = arrayMove(ids, de, para);
    const i = nova.indexOf(id);
    const ordem = ordemEntre(listaPorId.get(nova[i - 1])?.ordem, listaPorId.get(nova[i + 1])?.ordem);
    void segurarAteGravar(setColunasPendentes, id, { ordem }, () => acoes.moverLista({ id, ordem }));
  };

  /* ── Leitor de tela ──────────────────────────────────────────────────────── */

  const nomeDaPeca = (id: UniqueIdentifier | undefined) => {
    if (id == null) return 'o item';
    if (ehIdDeLista(id)) return `a coluna ${listaPorId.get(idReal(id))?.nome ?? ''}`.trim();
    return `a tarefa ${tarefaPorId.get(idReal(id))?.titulo ?? ''}`.trim();
  };
  /** "na coluna Pedro" / "no lugar da tarefa Repor os copos". */
  const destinoDaPeca = (id: UniqueIdentifier) =>
    ehIdDeLista(id)
      ? `na coluna ${listaPorId.get(idReal(id))?.nome ?? ''}`.trim()
      : `no lugar da tarefa ${tarefaPorId.get(idReal(id))?.titulo ?? ''}`.trim();
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Pegou ${nomeDaPeca(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nomeDaPeca(active.id)} está sobre ${nomeDaPeca(over.id)}.` : `${nomeDaPeca(active.id)} está fora do quadro.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltou ${nomeDaPeca(active.id)} ${destinoDaPeca(over.id)}.`
        : `Soltou ${nomeDaPeca(active.id)} fora do quadro. Nada mudou.`,
    onDragCancel: ({ active }) => `Desistiu de mover ${nomeDaPeca(active.id)}. Voltou para onde estava.`,
  };

  /* ── Desenho ─────────────────────────────────────────────────────────────── */

  const tarefaNoAr = arrasto?.tipo === 'tarefa' ? tarefaPorId.get(arrasto.id) : undefined;
  const listaNoAr = arrasto?.tipo === 'lista' ? listaPorId.get(arrasto.id) : undefined;

  const tarefasDa = (listaId: string): Tarefa[] =>
    (colunas[listaId] ?? []).map((id) => tarefaPorId.get(id)).filter((t): t is Tarefa => Boolean(t));

  if (listasVivas.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl bg-muted/40 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card shadow-sm">
          <Columns3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Este quadro ainda não tem listas</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {podeEditar
              ? 'Use "Adicionar lista" para criar a primeira coluna: uma por pessoa (Pedro, Gabriel...) ou de apoio (Compras, Anúncios).'
              : 'Peça para quem cuida do quadro criar as colunas.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={detectarAlvo}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={aoComecar}
      onDragOver={aoPassarPorCima}
      onDragEnd={aoSoltar}
      onDragCancel={cancelar}
      accessibility={{ announcements: anuncios, screenReaderInstructions: INSTRUCOES_DE_TECLADO }}
    >
      <div
        className={cn(
          'flex min-h-[60vh] items-start gap-3 overflow-x-auto rounded-xl bg-muted/40 p-3 pb-4',
          arrasto && 'cursor-grabbing',
        )}
      >
        <SortableContext items={idsDasColunas} strategy={horizontalListSortingStrategy}>
          {listasVivas.map((lista) => (
            <ListaKanban
              key={lista.id}
              lista={lista}
              tarefas={tarefasDa(lista.id)}
              hojeISO={hoje}
              podeEditar={podeEditar}
              usuarioId={usuarioId}
              pessoas={pessoas}
              acoes={acoes}
              onAbrirTarefa={onAbrirTarefa}
              periodoPadraoId={periodoPadraoId}
              filtroAtivo={filtroAtivo}
              onLimparFiltros={onLimparFiltros}
              diaDoFiltro={diaDoFiltro}
            />
          ))}
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={ANIMACAO_AO_SOLTAR}>
        {tarefaNoAr ? (
          <CartaoTarefa
            // Cópia visual: o leitor de tela já anuncia o cartão de verdade.
            aria-hidden
            tabIndex={-1}
            tarefa={tarefaNoAr}
            hojeISO={hoje}
            podeEditar={podeEditar}
            periodoPadraoId={periodoPadraoId}
            flutuando
            onAbrir={() => {}}
            onAlternarFeito={() => {}}
          />
        ) : listaNoAr ? (
          <ColunaNoAr lista={listaNoAr} tarefas={tarefasDa(listaNoAr.id)} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default QuadroKanban;

/**
 * Segura a posição na tela até o banco responder, e só então solta.
 *
 * A promessa das `acoes` nunca rejeita (contrato do `useQuadro`): quando ela
 * termina, o cache já tem a posição confirmada — ou já voltou para a antiga,
 * se o banco recusou. Só a marca que esta chamada pôs é removida: se a pessoa
 * arrastou o mesmo cartão de novo nesse meio-tempo, a marca nova fica.
 */
async function segurarAteGravar<V extends object>(
  definir: (atualizar: (atual: Record<string, V>) => Record<string, V>) => void,
  id: string,
  marca: V,
  gravar: () => Promise<void>,
) {
  definir((atual) => ({ ...atual, [id]: marca }));
  await gravar();
  definir((atual) => {
    // Comparação por identidade: é a marca DESTA chamada, não uma igual.
    if (atual[id] !== marca) return atual;
    const resto = { ...atual };
    delete resto[id];
    return resto;
  });
}

/** A coluna que segue o mouse: cabeçalho e o começo dos cartões, sem nada clicável. */
function ColunaNoAr({ lista, tarefas }: { lista: Lista; tarefas: Tarefa[] }) {
  const cor = corDaLista(lista);
  const amostra = tarefas.slice(0, 4);
  return (
    <div className="flex w-72 rotate-1 cursor-grabbing flex-col overflow-hidden rounded-xl border bg-card shadow-2xl ring-2 ring-primary/20">
      <div className={cn('h-1.5', cor)} />
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn('h-2.5 w-2.5 rounded-full', cor)} />
        <span className="flex-1 truncate text-sm font-semibold">{lista.nome}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
          {tarefas.length}
        </span>
      </div>
      <div className="mx-1.5 mb-1.5 space-y-1.5 rounded-lg bg-muted/40 p-1.5">
        {amostra.map((t) => (
          <div key={t.id} className="truncate rounded-md border bg-card px-2.5 py-2 text-xs font-medium shadow-sm">
            {t.titulo}
          </div>
        ))}
        {tarefas.length > amostra.length && (
          <p className="px-1 text-[11px] text-muted-foreground">e mais {tarefas.length - amostra.length}</p>
        )}
        {tarefas.length === 0 && <p className="px-1 py-2 text-[11px] text-muted-foreground">Nenhuma tarefa</p>}
      </div>
    </div>
  );
}
