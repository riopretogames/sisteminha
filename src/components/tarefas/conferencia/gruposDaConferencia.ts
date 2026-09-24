import { DIAS_SEMANA } from '@/config/tarefas';
import { dataLocalISO } from '@/lib/tarefas';
import type { ItemDeConferencia } from '@/types/tarefas';

/**
 * As regras da aba Conferência que não são tela — puras, testadas em
 * `gruposDaConferencia.test.ts`.
 *
 * A aba é agrupada pelo DIA do feito, não pela hora em que o gerente abriu a
 * tela: o feito de segunda que ninguém conferiu continua sendo "de segunda",
 * e o gerente precisa ver isso separado do que a equipe marcou hoje.
 */

/**
 * O dia a que o feito pertence. Recorrente: o dia da conclusão (é ele que o
 * banco confere). Avulsa: o dia, no fuso da loja, em que foi concluída.
 */
export function diaDoFeito(item: Pick<ItemDeConferencia, 'dia' | 'feita_em'>): string {
  return item.dia ?? dataLocalISO(new Date(item.feita_em));
}

/** 'YYYY-MM-DD' do dia anterior, sem passar por UTC (data pura em UTC volta um dia no Brasil). */
function diaAnterior(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return dataLocalISO(new Date(a, m - 1, d - 1));
}

/**
 * "Hoje", "Ontem", "Seg, 22/09" — do jeito que se fala no balcão. De outro
 * ano leva o ano junto ("Qua, 31/12/2025"), para ninguém confundir dezembro
 * passado com o que vem.
 */
export function rotuloDoDia(diaISO: string, hojeISO: string): string {
  if (diaISO === hojeISO) return 'Hoje';
  if (diaISO === diaAnterior(hojeISO)) return 'Ontem';

  const [ano, mes, dia] = diaISO.split('-').map(Number);
  const semana = DIAS_SEMANA.find((d) => d.n === new Date(ano, mes - 1, dia).getDay())?.curto ?? '';
  const diaEMes = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
  const mesmoAno = ano === Number(hojeISO.slice(0, 4));
  return `${semana}, ${mesmoAno ? diaEMes : `${diaEMes}/${ano}`}`;
}

export interface GrupoDoDia {
  /** 'YYYY-MM-DD'. */
  dia: string;
  rotulo: string;
  /** Antes de hoje: ficou sem conferir no dia dele. */
  atrasado: boolean;
  itens: ItemDeConferencia[];
}

/**
 * Agrupa por dia do feito: o dia mais recente primeiro e, dentro dele, o que
 * foi marcado por último primeiro — a mesma ordem que o hook já entrega, só
 * que com o dia de cabeçalho.
 */
export function agruparPorDia(itens: ItemDeConferencia[], hojeISO: string): GrupoDoDia[] {
  const porDia = new Map<string, ItemDeConferencia[]>();
  for (const item of itens) {
    const dia = diaDoFeito(item);
    const grupo = porDia.get(dia);
    if (grupo) grupo.push(item);
    else porDia.set(dia, [item]);
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dia, doDia]) => ({
      dia,
      rotulo: rotuloDoDia(dia, hojeISO),
      atrasado: dia < hojeISO,
      itens: [...doDia].sort((x, y) => (x.feita_em < y.feita_em ? 1 : x.feita_em > y.feita_em ? -1 : 0)),
    }));
}

/**
 * O pedaço do endereço que abre a ficha de um feito, já na aba Conferência:
 * `aba=conferencia&tarefa=<id>` e, no feito de um dia (recorrente),
 * `&dia=<YYYY-MM-DD>`. A avulsa não leva dia.
 */
export function enderecoDoFeito(item: Pick<ItemDeConferencia, 'tarefa_id' | 'dia'>): string {
  return `aba=conferencia&tarefa=${item.tarefa_id}${item.dia ? `&dia=${item.dia}` : ''}`;
}

/** "10:32", no relógio da loja. */
export function horaDoFeito(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** O título da aba: "1 feita aguardando conferência", "3 feitas aguardando conferência". */
export function fraseDoCabecalho(total: number): string {
  if (total === 0) return 'Nada aguardando conferência';
  return `${total} ${total === 1 ? 'feita' : 'feitas'} aguardando conferência`;
}

/**
 * O que o gerente lê antes de devolver. Muda com o dia, porque devolver não
 * faz a mesma coisa em todos os casos:
 *
 * - feito de HOJE (ou avulsa): a tarefa volta pendente agora, no quadro e em
 *   Minhas Tarefas — a pessoa ainda pode fazer hoje;
 * - feito de um dia que já passou: não há "fazer ontem de novo"; o que muda é
 *   o registro, que passa a dizer que naquele dia não foi feita. A tarefa de
 *   hoje é outra e segue o curso dela.
 */
export function textoDoDevolver(
  item: Pick<ItemDeConferencia, 'titulo' | 'dia' | 'feita_em'>,
  quem: string | null,
  hojeISO: string,
): { titulo: string; descricao: string } {
  const titulo = quem ? `Devolver para ${quem}?` : 'Devolver esta tarefa?';
  const dia = diaDoFeito(item);
  if (item.dia === null || dia >= hojeISO) {
    return {
      titulo,
      descricao: `"${item.titulo}" sai da conferência e volta a aparecer pendente${
        quem ? ` para ${quem}` : ''
      } hoje, no quadro e em Minhas Tarefas.`,
    };
  }
  const rotulo = rotuloDoDia(dia, hojeISO);
  return {
    titulo,
    descricao: `O feito de ${rotulo === 'Ontem' ? 'ontem' : rotulo} é desfeito: fica registrado que "${
      item.titulo
    }" não foi feita nesse dia. A tarefa de hoje não muda.`,
  };
}
