import { UserPlus } from 'lucide-react';
import { AvataresPessoas } from '@/components/tarefas/AvataresPessoas';
import { SeletorPessoas } from '@/components/tarefas/SeletorPessoas';
import type { AcoesDoQuadro, Pessoa, Tarefa } from '@/types/tarefas';

/**
 * Quem faz a tarefa: as bolinhas com as iniciais, como no Trello e no Monday.
 * A lista para escolher vem do cadastro (`pessoas`), nunca das tarefas
 * carregadas — senão quem ainda não tem tarefa nenhuma não poderia receber a
 * primeira (a lição da Luana, que sumia do filtro por não ter vendido).
 */
export function CelulaPessoas({
  tarefa,
  pessoas,
  podeEditar,
  acoes,
}: {
  tarefa: Tarefa;
  pessoas: Pessoa[];
  podeEditar: boolean;
  acoes: Pick<AcoesDoQuadro, 'definirResponsaveis'>;
}) {
  const temGente = tarefa.responsaveis.length > 0;

  if (!podeEditar) {
    return (
      <div className="flex h-10 items-center justify-center px-2">
        {temGente ? (
          <AvataresPessoas pessoas={tarefa.responsaveis} max={3} />
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </div>
    );
  }

  return (
    <SeletorPessoas
      pessoas={pessoas}
      valor={tarefa.responsaveis.map((p) => p.id)}
      onChange={(ids) => acoes.definirResponsaveis({ id: tarefa.id, user_ids: ids })}
    >
      <button
        type="button"
        title={temGente ? 'Mudar quem faz' : 'Escolher quem faz'}
        aria-label={temGente ? `Mudar quem faz: ${tarefa.responsaveis.map((p) => p.nome).join(', ')}` : 'Escolher quem faz'}
        className="group/pessoas flex h-10 w-full items-center justify-center px-2 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {temGente ? (
          <AvataresPessoas pessoas={tarefa.responsaveis} max={3} />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/50 transition-colors group-hover/pessoas:border-primary group-hover/pessoas:text-primary">
            <UserPlus className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
    </SeletorPessoas>
  );
}
