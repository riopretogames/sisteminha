import { corDaEtiqueta } from '@/lib/cores';
import { cn } from '@/lib/utils';
import type { Etiqueta } from '@/types/tarefas';

/**
 * Pílula colorida de uma etiqueta do catálogo `tarefa_etiqueta`.
 *
 * Etiqueta criada pela loja sem cor ganha uma da paleta, escolhida pelo
 * próprio texto (`corDaEtiqueta`) — sempre a mesma para a mesma palavra, em
 * vez de sair cinza no meio das coloridas.
 */
export function EtiquetaChip({ etiqueta, pequena = false }: { etiqueta: Etiqueta; pequena?: boolean }) {
  return (
    <span
      title={etiqueta.descricao}
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-full font-semibold',
        pequena ? 'px-2 py-0 text-[10px] leading-4' : 'px-2.5 py-0.5 text-xs',
        corDaEtiqueta(etiqueta.cor, etiqueta.descricao),
      )}
    >
      {etiqueta.descricao}
    </span>
  );
}
