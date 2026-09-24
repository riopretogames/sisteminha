import { corDaEtiqueta } from '@/lib/cores';
import type { Lista } from '@/types/tarefas';

/**
 * As cores de um grupo da Tabela, tiradas da cor da lista.
 *
 * A lista guarda a cor como etiqueta ("bg-blue-500 text-white"), mas o grupo
 * da Tabela precisa da mesma cor em quatro formas: a faixa na esquerda das
 * linhas (borda), o nome do grupo (texto), a bolinha (fundo) e o tom claro
 * do cabeçalho. Como no Monday, é a cor que diz "estas linhas são da coluna
 * do Pedro" sem ninguém precisar ler o nome.
 *
 * Tudo escrito por extenso, família por família, de propósito: o Tailwind só
 * gera o CSS das classes que encontra no código. `border-l-${familia}-500`
 * montado em pedaços chegaria ao navegador sem cor nenhuma — a armadilha que
 * `lib/cores.ts` já documenta.
 */
export interface EstiloDaLista {
  /** Bolinha e barras: "bg-blue-500". */
  fundo: string;
  /** Faixa na esquerda das linhas: "border-l-blue-500". */
  borda: string;
  /** Nome do grupo: "text-blue-600". */
  texto: string;
  /** Tom claro do cabeçalho e do botão de recolher. */
  suave: string;
}

const POR_FAMILIA: Record<string, EstiloDaLista> = {
  blue: { fundo: 'bg-blue-500', borda: 'border-l-blue-500', texto: 'text-blue-600 dark:text-blue-400', suave: 'bg-blue-500/10' },
  sky: { fundo: 'bg-sky-500', borda: 'border-l-sky-500', texto: 'text-sky-600 dark:text-sky-400', suave: 'bg-sky-500/10' },
  cyan: { fundo: 'bg-cyan-500', borda: 'border-l-cyan-500', texto: 'text-cyan-600 dark:text-cyan-400', suave: 'bg-cyan-500/10' },
  teal: { fundo: 'bg-teal-500', borda: 'border-l-teal-500', texto: 'text-teal-600 dark:text-teal-400', suave: 'bg-teal-500/10' },
  emerald: { fundo: 'bg-emerald-500', borda: 'border-l-emerald-500', texto: 'text-emerald-600 dark:text-emerald-400', suave: 'bg-emerald-500/10' },
  green: { fundo: 'bg-green-600', borda: 'border-l-green-600', texto: 'text-green-700 dark:text-green-400', suave: 'bg-green-600/10' },
  lime: { fundo: 'bg-lime-500', borda: 'border-l-lime-500', texto: 'text-lime-700 dark:text-lime-400', suave: 'bg-lime-500/10' },
  yellow: { fundo: 'bg-yellow-400', borda: 'border-l-yellow-400', texto: 'text-yellow-700 dark:text-yellow-400', suave: 'bg-yellow-400/15' },
  amber: { fundo: 'bg-amber-500', borda: 'border-l-amber-500', texto: 'text-amber-600 dark:text-amber-400', suave: 'bg-amber-500/10' },
  orange: { fundo: 'bg-orange-500', borda: 'border-l-orange-500', texto: 'text-orange-600 dark:text-orange-400', suave: 'bg-orange-500/10' },
  red: { fundo: 'bg-red-500', borda: 'border-l-red-500', texto: 'text-red-600 dark:text-red-400', suave: 'bg-red-500/10' },
  rose: { fundo: 'bg-rose-500', borda: 'border-l-rose-500', texto: 'text-rose-600 dark:text-rose-400', suave: 'bg-rose-500/10' },
  pink: { fundo: 'bg-pink-500', borda: 'border-l-pink-500', texto: 'text-pink-600 dark:text-pink-400', suave: 'bg-pink-500/10' },
  fuchsia: { fundo: 'bg-fuchsia-500', borda: 'border-l-fuchsia-500', texto: 'text-fuchsia-600 dark:text-fuchsia-400', suave: 'bg-fuchsia-500/10' },
  purple: { fundo: 'bg-purple-500', borda: 'border-l-purple-500', texto: 'text-purple-600 dark:text-purple-400', suave: 'bg-purple-500/10' },
  violet: { fundo: 'bg-violet-500', borda: 'border-l-violet-500', texto: 'text-violet-600 dark:text-violet-400', suave: 'bg-violet-500/10' },
  indigo: { fundo: 'bg-indigo-500', borda: 'border-l-indigo-500', texto: 'text-indigo-600 dark:text-indigo-400', suave: 'bg-indigo-500/10' },
  slate: { fundo: 'bg-slate-500', borda: 'border-l-slate-500', texto: 'text-slate-600 dark:text-slate-300', suave: 'bg-slate-500/10' },
  gray: { fundo: 'bg-gray-500', borda: 'border-l-gray-500', texto: 'text-gray-600 dark:text-gray-300', suave: 'bg-gray-500/10' },
};

/**
 * Lista sem cor ganha uma pelo próprio nome (a mesma regra das etiquetas):
 * a "Coluna do Pedro" fica sempre da mesma cor, no Kanban e na Tabela.
 * Cor que este arquivo não conhece cai no cinza — melhor que grupo sem faixa.
 */
export function estiloDaLista(lista: Pick<Lista, 'cor' | 'nome'>): EstiloDaLista {
  const cor = corDaEtiqueta(lista.cor, lista.nome);
  const familia = /bg-([a-z]+)-\d/.exec(cor)?.[1] ?? 'slate';
  return POR_FAMILIA[familia] ?? POR_FAMILIA.slate;
}
