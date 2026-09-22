import { granularidade, paraISO, type Periodo } from './periodo';

/**
 * Monta a linha do tempo dos painéis: "quanto entrou em cada dia/semana/mês
 * do período escolhido".
 *
 * Duas coisas que o gráfico precisa e que uma soma simples não dá:
 *
 * 1. **Dia sem venda também é ponto do gráfico.** Se o dia 14 não aparecer na
 *    lista, a linha pula do 13 para o 15 e desenha uma ladeira que não existe.
 *    Aqui o período inteiro é gerado primeiro, com zero, e os valores caem
 *    dentro.
 * 2. **O agrupamento acompanha o tamanho do período** (ver `granularidade`):
 *    uma semana vira 7 barras por dia, um ano vira 12 barras por mês.
 */

export interface PontoSerie {
  /** Chave interna do agrupamento ('2026-09-22', '2026-W38', '2026-09'). */
  chave: string;
  /** Como o ponto aparece no eixo do gráfico ('22/09', 'set'). */
  rotulo: string;
  valor: number;
  quantidade: number;
}

const DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

/** Segunda-feira da semana de `d` — mesma régua do resto do sistema. */
function segundaDa(d: Date): Date {
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diaSemana = dia.getDay();
  dia.setDate(dia.getDate() + (diaSemana === 0 ? -6 : -(diaSemana - 1)));
  return dia;
}

function chaveEROtulo(d: Date, grao: 'dia' | 'semana' | 'mes'): { chave: string; rotulo: string } {
  if (grao === 'dia') return { chave: paraISO(d), rotulo: DIA_MES.format(d) };
  if (grao === 'semana') {
    const segunda = segundaDa(d);
    return { chave: `s-${paraISO(segunda)}`, rotulo: DIA_MES.format(segunda) };
  }
  const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // "set." com ponto fica feio no eixo; e em janeiro o ano ajuda a situar.
  const mes = MES_CURTO.format(d).replace('.', '');
  return { chave, rotulo: d.getMonth() === 0 ? `${mes}/${String(d.getFullYear()).slice(2)}` : mes };
}

/**
 * Todos os pontos do período, em ordem e já zerados.
 *
 * Avança de dia em dia mesmo quando o grão é semana ou mês: é o jeito simples
 * de não errar em mês de 28, 30 ou 31 dias nem no horário de verão.
 */
function esqueleto(periodo: Periodo, grao: 'dia' | 'semana' | 'mes'): PontoSerie[] {
  const pontos: PontoSerie[] = [];
  const vistos = new Set<string>();
  const cursor = new Date(periodo.inicio);
  while (cursor < periodo.fim) {
    const { chave, rotulo } = chaveEROtulo(cursor, grao);
    if (!vistos.has(chave)) {
      vistos.add(chave);
      pontos.push({ chave, rotulo, valor: 0, quantidade: 0 });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return pontos;
}

export interface ExtratorSerie<T> {
  /** Quando o registro aconteceu. */
  data: (item: T) => string | Date;
  /** Quanto ele vale em dinheiro. */
  valor: (item: T) => number;
}

/**
 * Distribui os itens pelos pontos do período.
 *
 * `descontos` sai do total do ponto em que aconteceu — é a devolução, que
 * pesa no dia em que o dinheiro voltou para o cliente, não no dia da venda
 * original (mesma régua do Caixa, adotada em 17/08).
 */
export function montarSerie<T, D = T>(
  periodo: Periodo,
  itens: readonly T[],
  extrair: ExtratorSerie<T>,
  descontos?: { itens: readonly D[]; extrair: ExtratorSerie<D> },
): PontoSerie[] {
  const grao = granularidade(periodo);
  const pontos = esqueleto(periodo, grao);
  const porChave = new Map(pontos.map((p) => [p.chave, p]));

  for (const item of itens) {
    const d = new Date(extrair.data(item));
    if (d < periodo.inicio || d >= periodo.fim) continue;
    const ponto = porChave.get(chaveEROtulo(d, grao).chave);
    if (!ponto) continue;
    ponto.valor += extrair.valor(item);
    ponto.quantidade += 1;
  }

  if (descontos) {
    for (const item of descontos.itens) {
      const d = new Date(descontos.extrair.data(item));
      if (d < periodo.inicio || d >= periodo.fim) continue;
      const ponto = porChave.get(chaveEROtulo(d, grao).chave);
      if (!ponto) continue;
      ponto.valor -= descontos.extrair.valor(item);
    }
  }

  return pontos;
}

/** O ponto de maior valor da série — o "melhor dia/semana/mês do período". */
export function melhorPonto(serie: readonly PontoSerie[]): PontoSerie | null {
  if (serie.length === 0) return null;
  const melhor = serie.reduce((a, b) => (b.valor > a.valor ? b : a));
  return melhor.valor > 0 ? melhor : null;
}

/** Como o grão se chama na tela, para escrever "Melhor dia" ou "Melhor mês". */
export function nomeDoGrao(periodo: Periodo): 'dia' | 'semana' | 'mês' {
  const grao = granularidade(periodo);
  return grao === 'mes' ? 'mês' : grao;
}
