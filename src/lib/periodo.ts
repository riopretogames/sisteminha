/**
 * Períodos dos dashboards — "de quando até quando estou olhando".
 *
 * Um lugar só para responder "o que é esta semana?", "o que foi o trimestre
 * passado?" e "com o que eu comparo isso?". Antes disso cada dashboard montava
 * as suas próprias contas de data no meio da tela, e por isso nenhum deles
 * tinha filtro: mudar o período significava reescrever a tela.
 *
 * Duas decisões que valem para o arquivo inteiro:
 *
 * 1. **O fim é sempre exclusivo.** Um período vai de `inicio` (inclusive) até
 *    `fim` (exclusive), e `fim` é sempre a meia-noite do dia seguinte ao
 *    último dia. Assim a comparação na tela é `data >= inicio && data < fim`,
 *    sem o clássico bug de perder as vendas feitas depois das 23:00 do último
 *    dia (que é o que acontece quando se compara com "o último dia às 00:00").
 *
 * 2. **Tudo em horário local.** Uma data pura do banco ('2026-09-22') vira
 *    dia anterior se passar por `new Date()` direto, pelo fuso — a mesma
 *    armadilha já documentada em `lib/format.ts`. Aqui as datas são montadas
 *    componente a componente.
 */

/** Atalhos de período oferecidos na tela. */
export type Atalho =
  | 'hoje'
  | 'ontem'
  | 'esta-semana'
  | 'semana-passada'
  | 'ultimos-7-dias'
  | 'ultimos-30-dias'
  | 'este-mes'
  | 'mes-passado'
  | 'este-trimestre'
  | 'trimestre-passado'
  | 'este-ano'
  | 'ano-passado'
  | 'personalizado';

export interface Periodo {
  /** Primeiro instante do período (inclusive). */
  inicio: Date;
  /** Primeiro instante DEPOIS do período (exclusive) — ver nota no topo. */
  fim: Date;
  /** Como o período se chama na tela ("Este mês", "12/09 a 22/09"). */
  rotulo: string;
}

/** O que a tela guarda: o atalho escolhido e, se for personalizado, as datas. */
export interface SelecaoPeriodo {
  atalho: Atalho;
  /** 'YYYY-MM-DD' — só usados quando `atalho` é 'personalizado'. */
  de?: string;
  ate?: string;
}

export const ROTULO_ATALHO: Record<Atalho, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  'esta-semana': 'Esta semana',
  'semana-passada': 'Semana passada',
  'ultimos-7-dias': 'Últimos 7 dias',
  'ultimos-30-dias': 'Últimos 30 dias',
  'este-mes': 'Este mês',
  'mes-passado': 'Mês passado',
  'este-trimestre': 'Este trimestre',
  'trimestre-passado': 'Trimestre passado',
  'este-ano': 'Este ano',
  'ano-passado': 'Ano passado',
  personalizado: 'Escolher as datas',
};

/** Ordem em que os atalhos aparecem na lista da tela. */
export const ATALHOS: Atalho[] = [
  'hoje',
  'ontem',
  'esta-semana',
  'semana-passada',
  'ultimos-7-dias',
  'ultimos-30-dias',
  'este-mes',
  'mes-passado',
  'este-trimestre',
  'trimestre-passado',
  'este-ano',
  'ano-passado',
  'personalizado',
];

/** Meia-noite do dia de `d`, em horário local. */
function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function somarDias(d: Date, dias: number): Date {
  const novo = new Date(d);
  novo.setDate(novo.getDate() + dias);
  return novo;
}

/**
 * Segunda-feira da semana de `d`.
 *
 * A loja pensa a semana como "de segunda a domingo" — é assim que o Dashboard
 * de Vendas já contava antes deste arquivo existir, e é assim que a escala da
 * equipe é montada.
 */
function inicioDaSemana(d: Date): Date {
  const dia = inicioDoDia(d);
  const diaSemana = dia.getDay(); // 0 = domingo … 6 = sábado
  return somarDias(dia, diaSemana === 0 ? -6 : -(diaSemana - 1));
}

/** Data 'YYYY-MM-DD' (local) → Date à meia-noite daquele dia. */
export function deISO(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/** Date → 'YYYY-MM-DD' (local). Usado para agrupar por dia sem desvio de fuso. */
export function paraISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const DIA_MES_ANO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Rótulo de um intervalo escolhido à mão: "12/09 a 22/09", ou com ano quando
 * o intervalo atravessa a virada ("28/12/2026 a 04/01/2027").
 */
function rotuloIntervalo(inicio: Date, ultimoDia: Date): string {
  const mesmoAno = inicio.getFullYear() === ultimoDia.getFullYear();
  const fmt = mesmoAno ? DIA_MES : DIA_MES_ANO;
  if (paraISO(inicio) === paraISO(ultimoDia)) return DIA_MES_ANO.format(inicio);
  return `${fmt.format(inicio)} a ${fmt.format(ultimoDia)}`;
}

/**
 * Transforma a escolha da tela em datas de verdade.
 *
 * `agora` é injetável de propósito: sem isso não dá para testar "ontem" sem
 * esperar o relógio virar, e o teste passaria ou falharia dependendo da hora
 * em que rodasse.
 */
export function resolverPeriodo(selecao: SelecaoPeriodo, agora: Date = new Date()): Periodo {
  const hoje = inicioDoDia(agora);
  const amanha = somarDias(hoje, 1);

  switch (selecao.atalho) {
    case 'hoje':
      return { inicio: hoje, fim: amanha, rotulo: 'Hoje' };

    case 'ontem':
      return { inicio: somarDias(hoje, -1), fim: hoje, rotulo: 'Ontem' };

    case 'esta-semana':
      // Até amanhã, não até domingo: "esta semana" é o que já aconteceu, não
      // a semana inteira com dias que ainda nem chegaram.
      return { inicio: inicioDaSemana(hoje), fim: amanha, rotulo: 'Esta semana' };

    case 'semana-passada': {
      const inicio = somarDias(inicioDaSemana(hoje), -7);
      return { inicio, fim: somarDias(inicio, 7), rotulo: 'Semana passada' };
    }

    case 'ultimos-7-dias':
      // Inclui hoje: 6 dias atrás + hoje = 7 dias.
      return { inicio: somarDias(hoje, -6), fim: amanha, rotulo: 'Últimos 7 dias' };

    case 'ultimos-30-dias':
      return { inicio: somarDias(hoje, -29), fim: amanha, rotulo: 'Últimos 30 dias' };

    case 'este-mes':
      return {
        inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
        fim: amanha,
        rotulo: 'Este mês',
      };

    case 'mes-passado':
      return {
        inicio: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1),
        fim: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
        rotulo: 'Mês passado',
      };

    case 'este-trimestre': {
      const mesInicial = Math.floor(hoje.getMonth() / 3) * 3;
      return {
        inicio: new Date(hoje.getFullYear(), mesInicial, 1),
        fim: amanha,
        rotulo: 'Este trimestre',
      };
    }

    case 'trimestre-passado': {
      const mesInicial = Math.floor(hoje.getMonth() / 3) * 3 - 3;
      const inicio = new Date(hoje.getFullYear(), mesInicial, 1);
      return {
        inicio,
        fim: new Date(inicio.getFullYear(), inicio.getMonth() + 3, 1),
        rotulo: 'Trimestre passado',
      };
    }

    case 'este-ano':
      return { inicio: new Date(hoje.getFullYear(), 0, 1), fim: amanha, rotulo: 'Este ano' };

    case 'ano-passado':
      return {
        inicio: new Date(hoje.getFullYear() - 1, 0, 1),
        fim: new Date(hoje.getFullYear(), 0, 1),
        rotulo: 'Ano passado',
      };

    case 'personalizado': {
      // Sem as datas preenchidas, cai em "este mês" em vez de quebrar a tela.
      if (!selecao.de || !selecao.ate) return resolverPeriodo({ atalho: 'este-mes' }, agora);
      let inicio = deISO(selecao.de);
      let ultimoDia = deISO(selecao.ate);
      // Datas invertidas ("de" depois do "até") acontecem o tempo todo quando
      // se digita a segunda data primeiro. Trocar é mais útil que reclamar.
      if (ultimoDia < inicio) [inicio, ultimoDia] = [ultimoDia, inicio];
      return {
        inicio,
        fim: somarDias(ultimoDia, 1),
        rotulo: rotuloIntervalo(inicio, ultimoDia),
      };
    }
  }
}

/**
 * O período imediatamente anterior, do mesmo tamanho — é com ele que a tela
 * compara ("+12% vs período anterior").
 *
 * Mês e ano andam pelo calendário, não por quantidade de dias: o anterior de
 * "este mês" é o mês passado inteiro, não "os últimos 30 dias antes do dia 1".
 * Comparar fevereiro com "31 dias antes" daria uma variação que é só o
 * tamanho do mês, e não movimento nenhum da loja.
 */
export function periodoAnterior(selecao: SelecaoPeriodo, agora: Date = new Date()): Periodo {
  const atual = resolverPeriodo(selecao, agora);

  /**
   * Período em andamento ("este mês", "este trimestre", "este ano"): compara
   * com o MESMO PEDAÇO da unidade anterior — até o dia 22 deste mês contra até
   * o dia 22 do mês passado, e não contra o mês passado inteiro, que estaria
   * sempre ganhando.
   *
   * O fim nunca passa do início do período atual. Achado da revisão de 23/09:
   * em 31/03, "até o dia 31" do mês anterior (fevereiro, 28 dias) caía em
   * 03/03 — três dias de março contavam dos dois lados da comparação.
   */
  const pedacoDaUnidadeAnterior = (inicio: Date, rotulo: string): Periodo => {
    const fim = somarDias(inicio, diasCorridos(atual));
    return { inicio, fim: fim < atual.inicio ? fim : atual.inicio, rotulo };
  };

  switch (selecao.atalho) {
    // "Esta semana" é período em andamento, como "este mês": segunda a quarta
    // se compara com segunda a quarta da semana passada. Antes andava para
    // trás o número de dias corridos, e numa quarta o anterior virava sexta,
    // sábado e domingo — dias úteis contra fim de semana, e o "vs período
    // anterior" enganava (achado 64, revisão de 24/09/2026).
    case 'esta-semana':
      return pedacoDaUnidadeAnterior(somarDias(atual.inicio, -7), 'semana anterior');

    // Semana fechada compara com a semana anterior INTEIRA, de segunda a
    // domingo.
    case 'semana-passada':
      return { inicio: somarDias(atual.inicio, -7), fim: atual.inicio, rotulo: 'semana anterior' };

    case 'este-mes':
      return pedacoDaUnidadeAnterior(
        new Date(atual.inicio.getFullYear(), atual.inicio.getMonth() - 1, 1),
        'mês anterior',
      );

    // Período FECHADO ("mês passado" etc.) compara com a unidade anterior
    // INTEIRA. Antes contava pelo número de dias, e setembro inteiro era
    // comparado com 01/08 a 30/08 — o dia 31 de agosto ficava de fora.
    case 'mes-passado':
      return {
        inicio: new Date(atual.inicio.getFullYear(), atual.inicio.getMonth() - 1, 1),
        fim: atual.inicio,
        rotulo: 'mês anterior',
      };

    case 'este-trimestre':
      return pedacoDaUnidadeAnterior(
        new Date(atual.inicio.getFullYear(), atual.inicio.getMonth() - 3, 1),
        'trimestre anterior',
      );

    case 'trimestre-passado':
      return {
        inicio: new Date(atual.inicio.getFullYear(), atual.inicio.getMonth() - 3, 1),
        fim: atual.inicio,
        rotulo: 'trimestre anterior',
      };

    case 'este-ano':
      return pedacoDaUnidadeAnterior(new Date(atual.inicio.getFullYear() - 1, 0, 1), 'ano anterior');

    case 'ano-passado':
      return {
        inicio: new Date(atual.inicio.getFullYear() - 1, 0, 1),
        fim: atual.inicio,
        rotulo: 'ano anterior',
      };

    default: {
      // Todo o resto anda para trás o próprio tamanho: ontem compara com
      // anteontem, 7 dias com os 7 antes, 30 dias com os 30 antes.
      const dias = diasCorridos(atual);
      const inicio = somarDias(atual.inicio, -dias);
      return { inicio, fim: atual.inicio, rotulo: 'período anterior' };
    }
  }
}

/** Quantos dias corridos o período cobre (mínimo 1). */
export function diasCorridos(periodo: Periodo): number {
  const ms = periodo.fim.getTime() - periodo.inicio.getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** A data está dentro do período? (início inclusive, fim exclusive) */
export function dentroDoPeriodo(data: Date | string, periodo: Periodo): boolean {
  const d = typeof data === 'string' ? new Date(data) : data;
  return d >= periodo.inicio && d < periodo.fim;
}

/**
 * Variação percentual entre o período atual e o anterior.
 *
 * Devolve `null` quando não dá para calcular — anterior zerado. Nesse caso a
 * tela escreve "sem base de comparação" em vez de mostrar "+100%" ou "∞%",
 * que é o tipo de número que faz alguém comemorar à toa.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/**
 * De quanto em quanto tempo agrupar o gráfico do período.
 *
 * Um ano inteiro agrupado por dia vira 365 barras ilegíveis; uma semana
 * agrupada por mês vira uma barra só.
 */
export function granularidade(periodo: Periodo): 'dia' | 'semana' | 'mes' {
  const dias = diasCorridos(periodo);
  if (dias <= 31) return 'dia';
  if (dias <= 120) return 'semana';
  return 'mes';
}

/**
 * Quinzena de uma data: 1 (dias 1 a 15) ou 2 (dia 16 até o fim do mês).
 *
 * A premiação da loja é apurada por quinzena desde agosto/2026 — o Dashboard
 * de Metas precisa falar a mesma língua do processo que paga o prêmio.
 */
export function quinzenaDe(d: Date): 1 | 2 {
  return d.getDate() <= 15 ? 1 : 2;
}

/** Início (inclusive) e fim (exclusive) de uma quinzena de um mês. */
export function periodoDaQuinzena(ano: number, mes: number, quinzena: 1 | 2): Periodo {
  const mesIndex = mes - 1; // `mes` chega 1–12, como em metas_faturamento
  if (quinzena === 1) {
    return {
      inicio: new Date(ano, mesIndex, 1),
      fim: new Date(ano, mesIndex, 16),
      rotulo: '1ª quinzena',
    };
  }
  return {
    inicio: new Date(ano, mesIndex, 16),
    fim: new Date(ano, mesIndex + 1, 1),
    rotulo: '2ª quinzena',
  };
}

/** Início (inclusive) e fim (exclusive) de um mês inteiro. */
export function periodoDoMes(ano: number, mes: number): Periodo {
  return {
    inicio: new Date(ano, mes - 1, 1),
    fim: new Date(ano, mes, 1),
    rotulo: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
      new Date(ano, mes - 1, 1),
    ),
  };
}
