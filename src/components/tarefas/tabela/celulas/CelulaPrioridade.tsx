import { TAREFA_PRIORIDADES } from '@/config/tarefas';
import type { AcoesDoQuadro, Tarefa, TarefaPrioridade } from '@/types/tarefas';
import { CelulaPintada, type OpcaoPintada } from './CelulaPintada';

/** Da mais séria para a mais leve: é nessa ordem que se procura. */
const OPCOES: OpcaoPintada<TarefaPrioridade>[] = (
  Object.entries(TAREFA_PRIORIDADES) as [TarefaPrioridade, (typeof TAREFA_PRIORIDADES)[TarefaPrioridade]][]
)
  .sort(([, a], [, b]) => b.ordem - a.ordem)
  .map(([valor, def]) => ({ valor, rotulo: def.label, cor: def.cor }));

/**
 * Prioridade pintada. Só quem tem permissão de editar muda: ser responsável
 * pela tarefa libera marcar o andamento, não decidir o quanto ela é urgente
 * (o banco recusa — gatilho `travas_das_tarefas`).
 */
export function CelulaPrioridade({
  tarefa,
  podeEditar,
  acoes,
}: {
  tarefa: Tarefa;
  podeEditar: boolean;
  acoes: Pick<AcoesDoQuadro, 'atualizarTarefa'>;
}) {
  const def = TAREFA_PRIORIDADES[tarefa.prioridade] ?? TAREFA_PRIORIDADES.normal;
  return (
    <CelulaPintada
      coluna="Prioridade"
      rotulo={def.label}
      cor={def.cor}
      opcoes={OPCOES}
      atual={tarefa.prioridade}
      podeMudar={podeEditar}
      onEscolher={(prioridade) => acoes.atualizarTarefa({ id: tarefa.id, prioridade })}
      motivoSemPermissao="Seu perfil de acesso não permite mudar a prioridade."
    />
  );
}
