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
 *
 * Feito conferido pelo gerente (v2) trava a célula, como a bolinha: tirar o
 * "Feito" desfaria a conferência, e o banco só deixa quem confere fazer isso
 * (pela aba Conferência ou pelo "Devolver" da ficha).
 *
 * Com a trava de dia (lib/tarefas, travaDoFeito), o "Feito" some das opções
 * e o pé do seletor diz por quê. "Fazendo" e os outros continuam: mexer no
 * andamento não grava feito de dia nenhum.
 */
export function CelulaStatus({
  tarefa,
  hojeISO,
  podeMarcarAndamento,
  travaDoFeito = null,
  acoes,
}: {
  tarefa: Tarefa;
  hojeISO: string;
  podeMarcarAndamento: boolean;
  /** Por que o "Feito" não pode ser marcado agora (null = pode). */
  travaDoFeito?: string | null;
  acoes: Pick<AcoesDoQuadro, 'definirStatus'>;
}) {
  const noDia = statusNoDia(tarefa, hojeISO);
  const conferida = tarefa.conferencia === 'conferida';
  const def = noDia === 'atrasada' ? STATUS_ATRASADA : TAREFA_STATUS[noDia] ?? TAREFA_STATUS.nao_iniciado;

  let explicacao: string | undefined;
  if (travaDoFeito) {
    explicacao = travaDoFeito;
  } else if (noDia === 'atrasada') {
    explicacao = 'O prazo já passou. Marque “Feito” quando terminar, ou mude o prazo.';
  } else if (ehRecorrente(tarefa)) {
    explicacao = 'Tarefa que se repete: o “Feito” vale só para hoje. Amanhã ela volta a ficar pendente sozinha.';
  }

  return (
    <CelulaPintada
      coluna="Status"
      rotulo={def.label}
      cor={def.cor}
      opcoes={travaDoFeito ? OPCOES.filter((o) => o.valor !== 'feito') : OPCOES}
      atual={noDia === 'atrasada' ? null : noDia}
      podeMudar={podeMarcarAndamento && !conferida}
      onEscolher={(status) => acoes.definirStatus({ id: tarefa.id, status })}
      explicacao={explicacao}
      motivoSemPermissao={
        conferida
          ? 'Conferida pelo gerente. Só quem confere pode devolver, pela ficha da tarefa.'
          : 'Só quem faz esta tarefa, ou quem pode editar o quadro, muda o status.'
      }
    />
  );
}
