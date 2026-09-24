import { corDaEtiqueta } from '@/lib/cores';
import { ordemEntre } from '@/lib/tarefas';
import type { Lista, Tarefa } from '@/types/tarefas';

/**
 * As regras do Kanban — puras, sem tela, testadas em `regrasDoKanban.test.ts`.
 *
 * O grosso são as contas do arrastar e soltar. Ficam fora dos componentes
 * porque é aqui que mora o risco: um índice errado e o cartão "pula" para a
 * posição vizinha, ou volta para a coluna de onde saiu. Separado, dá para
 * provar cada caso sem precisar simular o mouse.
 */

/* ── Quem pode o quê, e de que cor ─────────────────────────────────────────── */

/** A cor da coluna: a escolhida, ou uma fixa tirada do nome (a mesma regra das etiquetas). */
export function corDaLista(lista: Pick<Lista, 'cor' | 'nome'>): string {
  return corDaEtiqueta(lista.cor, lista.nome);
}

/**
 * Quem pode marcar o feito de um cartão: quem edita o quadro, ou quem é
 * responsável pela tarefa ou pela coluna dela — mesmo sem permissão de editar.
 * É a mesma porta que o banco abre (`eh_responsavel_da_tarefa`): a tela só
 * libera a bolinha para quem o banco vai aceitar.
 */
export function podeMarcarTarefa(
  tarefa: Pick<Tarefa, 'responsaveis'>,
  lista: Pick<Lista, 'responsavel_id'>,
  podeEditar: boolean,
  usuarioId: string | null,
): boolean {
  if (podeEditar) return true;
  if (!usuarioId) return false;
  return lista.responsavel_id === usuarioId || tarefa.responsaveis.some((p) => p.id === usuarioId);
}

/* ── Identificadores do tabuleiro ──────────────────────────────────────────── */

/**
 * Colunas e cartões moram no mesmo "tabuleiro" da biblioteca de arrasto, e ela
 * só conhece um identificador por peça. O prefixo diz se a peça é uma coluna
 * ou um cartão — sem ele, soltar um cartão em cima de uma coluna vazia não
 * teria como ser reconhecido.
 */
const PREFIXO_TAREFA = 'tarefa:';
const PREFIXO_LISTA = 'lista:';

export const idDeTarefa = (id: string) => `${PREFIXO_TAREFA}${id}`;
export const idDeLista = (id: string) => `${PREFIXO_LISTA}${id}`;
export const ehIdDeLista = (id: string | number) => String(id).startsWith(PREFIXO_LISTA);
export const ehIdDeTarefa = (id: string | number) => String(id).startsWith(PREFIXO_TAREFA);

/** O id do banco, sem o prefixo do tabuleiro. */
export function idReal(id: string | number): string {
  const texto = String(id);
  if (texto.startsWith(PREFIXO_LISTA)) return texto.slice(PREFIXO_LISTA.length);
  if (texto.startsWith(PREFIXO_TAREFA)) return texto.slice(PREFIXO_TAREFA.length);
  return texto;
}

/* ── Arrastar e soltar ─────────────────────────────────────────────────────── */

/** Id da lista → ids das tarefas, na ordem em que aparecem na coluna. */
export type Colunas = Record<string, string[]>;

/** Em que coluna o cartão está agora (durante o arrasto, muda a cada passagem). */
export function colunaDaTarefa(colunas: Colunas, tarefaId: string): string | undefined {
  for (const [listaId, ids] of Object.entries(colunas)) {
    if (ids.includes(tarefaId)) return listaId;
  }
  return undefined;
}

/**
 * Tira o cartão de onde está e põe na coluna `destino`, na posição `indice`.
 * Devolve colunas novas (nunca mexe nas recebidas — a tela compara por
 * referência para saber se precisa redesenhar).
 */
export function moverEntreColunas(colunas: Colunas, tarefaId: string, destino: string, indice: number): Colunas {
  const origem = colunaDaTarefa(colunas, tarefaId);
  if (!origem || !(destino in colunas)) return colunas;

  const semOCartao = colunas[destino].filter((id) => id !== tarefaId);
  const posicao = Math.max(0, Math.min(indice, semOCartao.length));
  const novoDestino = [...semOCartao.slice(0, posicao), tarefaId, ...semOCartao.slice(posicao)];

  if (origem === destino) return { ...colunas, [destino]: novoDestino };
  return {
    ...colunas,
    [origem]: colunas[origem].filter((id) => id !== tarefaId),
    [destino]: novoDestino,
  };
}

/**
 * A `ordem` que o item ganha na posição em que foi solto: a média entre o
 * vizinho de cima e o de baixo (ver `ordemEntre`). Um update só, em vez de
 * reescrever a coluna inteira.
 *
 * `ordemDe` devolve a ordem gravada de cada vizinho. A conta usa os vizinhos
 * VISÍVEIS: com filtro ligado, o cartão pode cair entre dois que estavam
 * separados por escondidos — o que é certo, porque é entre eles que a pessoa
 * soltou. Empate com um escondido é resolvido pelo `useQuadro`, que renumera a
 * coluna quando dois ficam colados.
 */
export function ordemNaPosicao(
  ids: string[],
  idMovido: string,
  ordemDe: (id: string) => number | undefined,
): number {
  const i = ids.indexOf(idMovido);
  const antes = i > 0 ? ordemDe(ids[i - 1]) : undefined;
  const depois = i >= 0 && i < ids.length - 1 ? ordemDe(ids[i + 1]) : undefined;
  return ordemEntre(antes, depois);
}

/** Mesma sequência de ids? (Soltar o cartão onde ele já estava não grava nada.) */
export function mesmaSequencia(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}
