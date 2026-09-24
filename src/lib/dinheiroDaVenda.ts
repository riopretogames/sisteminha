/**
 * Quanto de dinheiro uma venda representa de verdade — as duas contas que
 * vários painéis precisam fazer igual, e que cada um fazia (ou esquecia) do
 * seu jeito até a revisão de 24/09/2026.
 *
 * 1. DESCONTO DA VENDA. No PDV o desconto é dado na venda inteira
 *    (`vendas.total` = soma dos itens − desconto), mas cada item guarda o
 *    preço CHEIO. Quem soma item por item (lucro por produto, venda por grupo)
 *    precisa ratear o desconto entre os itens — senão a receita sai maior que
 *    o dinheiro que entrou. O IE Comercial mostrava R$ 500 a mais em agosto
 *    exatamente por isso.
 *
 * 2. TROCO. O PDV grava o que o cliente ENTREGOU (R$ 100 numa venda de R$ 80).
 *    O caixa já descontava o troco; o painel de formas de pagamento não, e
 *    mostrava R$ 100 em dinheiro com R$ 80 na gaveta.
 */

/**
 * Quanto de cada real dos itens a loja cobrou de verdade na venda.
 *
 * Usa `total`, e NÃO `valor_faturamento_real`, de propósito (revisão de
 * 23/09): na troca, o dinheiro novo já é descontado pela DEVOLUÇÃO da peça que
 * voltou, item a item. Usar o faturamento real aqui tirava o valor da troca
 * duas vezes.
 *
 * Venda sem itens (ou com itens zerados) devolve 0: não há o que ratear.
 */
export function fatorDaVenda(v: {
  total: number | null;
  itens_venda: { total: number | null }[] | null;
}): number {
  const somaDosItens = (v.itens_venda ?? []).reduce((s, i) => s + Number(i.total ?? 0), 0);
  if (somaDosItens <= 0) return 0;
  return Math.max(0, Number(v.total ?? 0) / somaDosItens);
}

/**
 * Os pagamentos de uma venda (ou OS) com o troco já tirado do dinheiro.
 *
 * Mesma conta do gatilho que lança a venda no caixa (`v_cash_liquido`):
 *   troco            = o que foi pago além do devido
 *   dinheiro líquido = dinheiro entregue − troco (nunca negativo)
 * O troco sai só das formas que são dinheiro físico — ninguém devolve troco em
 * PIX. Se houver mais de uma linha em dinheiro, cada uma perde a sua parte.
 *
 * @param devido      quanto a venda custou (`vendas.total`)
 * @param pagamentos  todos os pagamentos dela, inclusive o vale-troca (que
 *                    conta para saber quanto foi pago, mas não é dinheiro)
 * @param ehDinheiro  diz se aquele pagamento é dinheiro físico
 */
export function pagamentosSemTroco<T extends { valor: number | null }>(
  devido: number,
  pagamentos: readonly T[],
  ehDinheiro: (p: T) => boolean,
): Array<{ pagamento: T; valor: number }> {
  const pagoTotal = pagamentos.reduce((s, p) => s + Number(p.valor ?? 0), 0);
  const pagoDinheiro = pagamentos
    .filter(ehDinheiro)
    .reduce((s, p) => s + Number(p.valor ?? 0), 0);

  const troco = Math.max(0, pagoTotal - Number(devido ?? 0));
  const dinheiroLiquido = Math.max(0, pagoDinheiro - troco);
  const proporcao = pagoDinheiro > 0 ? dinheiroLiquido / pagoDinheiro : 1;

  return pagamentos.map((p) => ({
    pagamento: p,
    valor: ehDinheiro(p) ? Number(p.valor ?? 0) * proporcao : Number(p.valor ?? 0),
  }));
}
