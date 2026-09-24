import { STATUS_ATRASADA, TAREFA_STATUS } from '@/config/tarefas';
import { ehRecorrente, statusNoDia } from '@/lib/tarefas';
import type { AcoesDoQuadro, Tarefa, TarefaStatus } from '@/types/tarefas';
import { CelulaPintada, type OpcaoPintada } from './CelulaPintada';

const OPCOES: OpcaoPintada<TarefaStatus>[] = (
  Object.entries(TAREFA_STATUS) as [TarefaStatus, (typeof TAREFA_STATUS)[TarefaStatus]][]
).map(([valor, def]) => ({ valor, rotulo: def.label, cor: def.cor }));

/**
 * Status pintado, mostrando a situação DO DIA (lib/tarefas, statusNoDia) e não
 * o valor cru do banco: a recorrente aparece "Feito" hoje e pendente amanhã
 * sem ninguém zerar nada — o trabalho que o Felipe fazia à mão no Monday — e
 * a avulsa vencida aparece "Atrasada" sozinha.
 *
 * Quem é responsável pela tarefa muda o status mesmo sem permissão de editar:
 * é o "marcar o andamento da própria tarefa" que o banco deixa passar.
 */
export function CelulaStatus({
  tarefa,
  hojeISO,
  podeMarcarAndamento,
  acoes,
}: {
  tarefa: Tarefa;
  hojeISO: string;
  podeMarcarAndamento: boolean;
  acoes: Pick<AcoesDoQuadro, 'definirStatus'>;
}) {
  const noDia = statusNoDia(tarefa, hojeISO);
  const def = noDia === 'atrasada' ? STATUS_ATRASADA : TAREFA_STATUS[noDia] ?? TAREFA_STATUS.nao_iniciado;

  let explicacao: string | undefined;
  if (noDia === 'atrasada') {
    explicacao = 'O prazo já passou. Marque “Feito” quando terminar, ou mude o prazo.';
  } else if (ehRecorrente(tarefa)) {
    explicacao = 'Tarefa que se repete: o “Feito” vale só para hoje. Amanhã ela volta a ficar pendente sozinha.';
  }

  return (
    <CelulaPintada
      coluna="Status"
      rotulo={def.label}
      cor={def.cor}
      opcoes={OPCOES}
      atual={noDia === 'atrasada' ? null : noDia}
      podeMudar={podeMarcarAndamento}
      onEscolher={(status) => acoes.definirStatus({ id: tarefa.id, status })}
      explicacao={explicacao}
      motivoSemPermissao="Só quem faz esta tarefa, ou quem pode editar o quadro, muda o status."
    />
  );
}
