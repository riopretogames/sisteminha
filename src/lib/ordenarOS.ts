import { hojeISO } from '@/lib/format';
import { osEmAndamento } from '@/config/osStatus';
import type { ServiceOrder } from '@/types/os';

/**
 * A ordem em que as OS aparecem na lista e no quadro.
 *
 * Pedido do Felipe em 09/08: "as OS com prioridade alta devem aparecer
 * primeiro. A ordem de serviço atrasada também deve aparecer para cima — é por
 * ordem de tempo e de prioridade".
 *
 * A regra, em três degraus:
 *
 *   1. **Atrasada primeiro.** Passou do prazo prometido e ainda não terminou é
 *      o único caso em que o cliente já tem motivo para ligar reclamando. Vem
 *      antes de qualquer prioridade — urgente que ainda está no prazo incomoda
 *      menos que uma normal que já estourou.
 *   2. **Prioridade.** Urgente, alta, normal, baixa.
 *   3. **Mais antiga primeiro.** Dentro do mesmo grupo, quem chegou antes é
 *      atendido antes. Ordenar do mais novo para o mais velho — como estava —
 *      empurra o aparelho esquecido para o fim da lista, que é o oposto do que
 *      a loja precisa.
 */

const PESO_PRIORIDADE: Record<string, number> = {
  urgente: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
};

/** Passou do prazo prometido e a OS ainda está em andamento. */
export function osAtrasada(os: Pick<ServiceOrder, 'prazo_previsto' | 'status'>): boolean {
  if (!os.prazo_previsto) return false;
  if (!osEmAndamento(os.status)) return false;
  return os.prazo_previsto < hojeISO();
}

/** Dias de atraso. Zero quando está no prazo. */
export function diasDeAtraso(os: Pick<ServiceOrder, 'prazo_previsto' | 'status'>): number {
  if (!osAtrasada(os)) return 0;
  const [a, m, d] = os.prazo_previsto!.split('-').map(Number);
  const prazo = new Date(a, m - 1, d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((hoje.getTime() - prazo.getTime()) / 86_400_000);
}

export function ordenarOS(lista: ServiceOrder[]): ServiceOrder[] {
  return [...lista].sort((a, b) => {
    const atrasoA = osAtrasada(a) ? 0 : 1;
    const atrasoB = osAtrasada(b) ? 0 : 1;
    if (atrasoA !== atrasoB) return atrasoA - atrasoB;

    const prioA = PESO_PRIORIDADE[a.prioridade] ?? 2;
    const prioB = PESO_PRIORIDADE[b.prioridade] ?? 2;
    if (prioA !== prioB) return prioA - prioB;

    return a.created_at.localeCompare(b.created_at);
  });
}
