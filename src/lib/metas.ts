/**
 * As contas das metas — num lugar só, com teste.
 *
 * Tudo aqui segue a planilha "Metas RPG" (a fonte das metas desde
 * 23/09/2026), aba COMO USAR, item 3:
 *
 *   Meta do mês por vendedor = meta da loja ÷ número de vendedores
 *   Meta da quinzena         = meta do mês ÷ 2
 *
 * E o que a planilha diz sobre os meses antigos: de janeiro a julho/2026 a
 * apuração era em 4 períodos no mês (meta do período = mensal ÷ 4), não por
 * quinzena. Por isso a quinzena só é oferecida nos meses marcados "Quinzenal".
 *
 * Nada aqui calcula quanto pagar. A planilha também não calcula — ela só
 * guarda as metas; o prêmio é apurado no processo de premiação, fora do
 * sistema.
 */

export type Faixa = 'bronze' | 'prata' | 'ouro' | 'diamante';
export type Apuracao = 'quinzenal' | 'quatro_periodos';
export type Recorte = 'mes' | 'q1' | 'q2';

export const FAIXAS: Faixa[] = ['bronze', 'prata', 'ouro', 'diamante'];

export const ROTULO_FAIXA: Record<Faixa, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  diamante: 'Diamante',
};

export const EMOJI_FAIXA: Record<Faixa, string> = {
  bronze: '🥉',
  prata: '🥈',
  ouro: '🥇',
  diamante: '💎',
};

export const ROTULO_APURACAO: Record<Apuracao, string> = {
  quinzenal: 'Quinzenal',
  quatro_periodos: '4 períodos',
};

export const ROTULO_RECORTE: Record<Recorte, string> = {
  mes: 'Mês inteiro',
  q1: '1ª quinzena (dias 1 a 15)',
  q2: '2ª quinzena (dia 16 ao fim)',
};

export interface MetaDeFaixa {
  faixa: Faixa;
  /** O valor que precisa ser alcançado (já no recorte e já por pessoa, se for o caso). */
  alvo: number;
}

/**
 * Quais recortes o mês aceita.
 *
 * Mês de "4 períodos" não oferece quinzena: a quinzena não existia naquele
 * mês, e mostrar "meta da 1ª quinzena de março" seria inventar uma régua que
 * ninguém usou para pagar prêmio.
 */
export function recortesDoMes(apuracao: Apuracao | null | undefined): Recorte[] {
  return apuracao === 'quinzenal' ? ['mes', 'q1', 'q2'] : ['mes'];
}

/** Por quanto a meta do mês é dividida no recorte escolhido. */
export function divisorDoRecorte(recorte: Recorte): number {
  return recorte === 'mes' ? 1 : 2;
}

/**
 * A meta individual de uma faixa: meta da loja ÷ vendedores ÷ recorte.
 *
 * Devolve `null` quando não há vendedor para dividir (mês cadastrado com zero
 * vendedores) — a tela escreve "sem divisão" em vez de mostrar "R$ ∞".
 */
export function metaIndividual(
  metaDaLoja: number,
  vendedores: number,
  recorte: Recorte = 'mes',
): number | null {
  if (!Number.isFinite(metaDaLoja) || !vendedores || vendedores <= 0) return null;
  return arredondar(metaDaLoja / vendedores / divisorDoRecorte(recorte));
}

/** A meta da loja no recorte (a loja inteira, sem dividir por pessoa). */
export function metaDaLojaNoRecorte(metaDaLoja: number, recorte: Recorte = 'mes'): number {
  return arredondar(metaDaLoja / divisorDoRecorte(recorte));
}

/**
 * A maior faixa alcançada e a próxima que falta.
 *
 * As faixas são ordenadas pelo VALOR, não pela ordem do nome: é o valor que
 * decide quem é maior (a planilha e o banco garantem que sobem, mas a conta
 * não depende disso).
 */
export function situacaoNasFaixas(realizado: number, faixas: readonly MetaDeFaixa[]) {
  const ordenadas = [...faixas].sort((a, b) => a.alvo - b.alvo);
  const alcancada = [...ordenadas].reverse().find((f) => realizado >= f.alvo) ?? null;
  const proxima = ordenadas.find((f) => realizado < f.alvo) ?? null;
  return {
    alcancada,
    proxima,
    falta: proxima ? arredondar(proxima.alvo - realizado) : 0,
    /** Quanto da PRÓXIMA faixa já foi feito (100 quando todas foram batidas). */
    percentualDaProxima: proxima
      ? Math.max(0, Math.min(100, proxima.alvo > 0 ? (realizado / proxima.alvo) * 100 : 100))
      : 100,
  };
}

/** Percentual de uma faixa específica (para as barras de progresso). */
export function percentualDaFaixa(realizado: number, alvo: number): number {
  if (alvo <= 0) return 100;
  return Math.max(0, Math.min(100, (realizado / alvo) * 100));
}

/** Centavos: evita "R$ 36.666,666…" na tela e diferença de 1 centavo nas contas. */
function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
