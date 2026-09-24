import { Tag } from 'lucide-react';
import { EtiquetaChip } from '@/components/tarefas/EtiquetaChip';
import { SeletorEtiquetas } from '@/components/tarefas/SeletorEtiquetas';
import type { AcoesDoQuadro, Etiqueta, Tarefa } from '@/types/tarefas';

/** Cabem duas pílulas na coluna; a partir da terceira, vira "+1". */
const MAXIMO_VISIVEL = 2;

function Chips({ etiquetas }: { etiquetas: Etiqueta[] }) {
  const visiveis = etiquetas.slice(0, MAXIMO_VISIVEL);
  const resto = etiquetas.length - visiveis.length;
  return (
    <span className="flex min-w-0 items-center gap-1" title={etiquetas.map((e) => e.descricao).join(', ')}>
      {visiveis.map((e) => (
        <EtiquetaChip key={e.id} etiqueta={e} pequena />
      ))}
      {resto > 0 && (
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold leading-4 text-muted-foreground">
          +{resto}
        </span>
      )}
    </span>
  );
}

/**
 * Etiquetas coloridas (Atenção, Rotina, Conteúdo...), do catálogo
 * `tarefa_etiqueta`. As que a tarefa já tem aparecem mesmo que tenham sido
 * desativadas no catálogo — `selecionadas` leva elas para o seletor, para o
 * próximo clique não apagá-las sem ninguém pedir.
 */
export function CelulaEtiquetas({
  tarefa,
  etiquetas,
  podeEditar,
  acoes,
}: {
  tarefa: Tarefa;
  etiquetas: Etiqueta[];
  podeEditar: boolean;
  acoes: Pick<AcoesDoQuadro, 'definirEtiquetas'>;
}) {
  const tem = tarefa.etiquetas.length > 0;

  if (!podeEditar) {
    return (
      <div className="flex h-10 items-center justify-center px-2">
        {tem ? <Chips etiquetas={tarefa.etiquetas} /> : <span className="text-xs text-muted-foreground/60">—</span>}
      </div>
    );
  }

  return (
    <SeletorEtiquetas
      etiquetas={etiquetas}
      selecionadas={tarefa.etiquetas}
      valor={tarefa.etiquetas.map((e) => e.id)}
      onChange={(ids) => acoes.definirEtiquetas({ id: tarefa.id, catalogo_ids: ids })}
    >
      <button
        type="button"
        title={tem ? 'Mudar as etiquetas' : 'Pôr etiqueta'}
        aria-label={tem ? `Mudar as etiquetas: ${tarefa.etiquetas.map((e) => e.descricao).join(', ')}` : 'Pôr etiqueta'}
        className="group/etiquetas flex h-10 w-full items-center justify-center px-2 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {tem ? (
          <Chips etiquetas={tarefa.etiquetas} />
        ) : (
          <Tag className="h-3.5 w-3.5 text-muted-foreground/30 transition-colors group-hover/etiquetas:text-primary" />
        )}
      </button>
    </SeletorEtiquetas>
  );
}
