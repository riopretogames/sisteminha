/**
 * A regra de "estoque baixo", num lugar só.
 *
 * Estava reimplementada em 7 lugares (Estoque, EstoqueCritico, Dashboard,
 * DashboardEstoque, RelatorioEstoque ×2, ficha do produto) sempre como
 * `estoque_atual <= estoque_minimo`. Sete cópias da mesma comparação é uma
 * armadilha silenciosa: no dia em que a loja decidir que crítico é
 * "abaixo do mínimo" em vez de "no mínimo ou abaixo", ou quiser uma margem
 * de folga, seis telas vão continuar dizendo o contrário da sétima — e nada
 * quebra, o número só passa a divergir de tela pra tela.
 *
 * O corte continua sendo calculado no cliente de propósito: o PostgREST não
 * compara duas colunas da mesma linha no filtro (`.lte('estoque_atual',
 * 'estoque_minimo')` compara com o TEXTO "estoque_minimo", não com a coluna,
 * e sempre deu número errado). Por isso as telas trazem as duas colunas e
 * filtram aqui.
 */

export interface ProdutoComEstoque {
  estoque_atual: number | null;
  estoque_minimo: number | null;
}

/** Está no mínimo ou abaixo — ou seja, precisa de reposição. */
export function estoqueCritico(p: ProdutoComEstoque): boolean {
  return Number(p.estoque_atual ?? 0) <= Number(p.estoque_minimo ?? 0);
}

/** Acabou de vez. Separado do crítico porque a urgência é outra: sem isto
 *  não há o que vender, não é só "está acabando". */
export function estoqueZerado(p: ProdutoComEstoque): boolean {
  return Number(p.estoque_atual ?? 0) <= 0;
}

/** Quantas unidades faltam pra voltar ao mínimo. Zero se já está acima. */
export function faltaParaOMinimo(p: ProdutoComEstoque): number {
  return Math.max(0, Number(p.estoque_minimo ?? 0) - Number(p.estoque_atual ?? 0));
}
