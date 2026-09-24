import { emCentavos } from '@/lib/dinheiro';

/**
 * Quanto o cliente pagou DE VERDADE por cada coisa de uma venda.
 *
 * Tudo aqui é em centavos inteiros (ver `lib/dinheiro.ts`) e sem JSX, para as
 * contas terem teste próprio — são elas que decidem quanto dinheiro sai da
 * gaveta numa devolução.
 */

/**
 * O desconto da venda rateado entre os itens: quanto cada LINHA recebeu.
 *
 * O PDV dá o desconto na venda inteira (`vendas.descontos`) e grava o preço
 * cheio em cada item — `itens_venda.desconto` nunca é preenchido. Sem este
 * rateio, a Troca/Devolução devolvia o preço cheio: a VD-202608-0003 (itens de
 * R$ 2.000, desconto de R$ 500, cliente pagou R$ 1.500) mandava devolver
 * R$ 2.000,00 a quem pagou R$ 1.500 (revisão de 24/09). É a mesma regra que o
 * painel de Metas já usava para não creditar a campanha pelo preço cheio
 * (`fatorDaVenda` em DashboardMetas).
 *
 * Usa `total` da venda, e não `valor_faturamento_real`: na venda nova de uma
 * troca, o `total` é o valor cheio dos produtos que o cliente levou (parte paga
 * com o crédito do que ele devolveu) — e é isso que ele tem direito de volta.
 *
 * A soma das linhas bate EXATAMENTE com o total da venda: os centavos que o
 * arredondamento deixa sobrando vão para as linhas com a maior fração, um por
 * vez. Sem isso, três itens de R$ 10 com R$ 1 de desconto dariam R$ 9,67 cada
 * e R$ 29,01 no total — um centavo a mais do que o cliente pagou.
 *
 * @param totalDaVenda `vendas.total` (reais). Nulo = sem desconto nenhum.
 * @param linhas cada item com o seu `itens_venda.total` (reais)
 * @returns centavos pagos por linha, pela chave `id`
 */
export function pagoPorLinha(
  totalDaVenda: number | null | undefined,
  linhas: ReadonlyArray<{ id: string; total: number | null | undefined }>,
): Map<string, number> {
  const brutos = linhas.map((l) => ({ id: l.id, bruto: Math.max(0, emCentavos(l.total ?? 0)) }));
  const somaDosItens = brutos.reduce((s, l) => s + l.bruto, 0);
  const resultado = new Map<string, number>();

  if (somaDosItens <= 0) {
    for (const l of brutos) resultado.set(l.id, 0);
    return resultado;
  }

  const pagoNaVenda =
    totalDaVenda === null || totalDaVenda === undefined
      ? somaDosItens
      : Math.max(0, emCentavos(totalDaVenda));

  // Parte inteira de cada linha + o resto, para distribuir os centavos que
  // faltarem pelas maiores frações (método do maior resto).
  const partes = brutos.map((l) => {
    const exato = (l.bruto * pagoNaVenda) / somaDosItens;
    const inteiro = Math.floor(exato);
    return { id: l.id, inteiro, fracao: exato - inteiro };
  });
  let sobra = pagoNaVenda - partes.reduce((s, p) => s + p.inteiro, 0);

  const porFracao = [...partes].sort((a, b) => b.fracao - a.fracao);
  for (const p of porFracao) {
    if (sobra <= 0) break;
    p.inteiro += 1;
    sobra -= 1;
  }

  for (const p of partes) resultado.set(p.id, p.inteiro);
  return resultado;
}

/**
 * Quanto devolver por `agora` unidades de uma linha, sabendo quanto já voltou.
 *
 * Conta pelo ACUMULADO, não por unidade: o valor desta devolução é "o que as
 * unidades devolvidas até agora valem" menos "o que já foi devolvido antes".
 * Assim, devolver uma linha de 3 unidades em três vezes nunca soma mais do que
 * a linha recebeu — com preço por unidade arredondado, 3 × R$ 9,67 daria
 * R$ 29,01 numa linha que recebeu R$ 29,00.
 *
 * @param pagoDaLinha centavos que a linha recebeu (ver `pagoPorLinha`)
 * @param vendida quantas unidades a linha teve na venda
 * @param jaDevolvida quantas já voltaram em devoluções anteriores
 * @param agora quantas voltam nesta devolução (é limitado ao que resta)
 * @returns centavos a devolver
 */
export function valorDaDevolucao(params: {
  pagoDaLinha: number;
  vendida: number;
  jaDevolvida: number;
  agora: number;
}): number {
  const { pagoDaLinha, vendida } = params;
  if (vendida <= 0 || pagoDaLinha <= 0) return 0;
  const ja = Math.min(vendida, Math.max(0, params.jaDevolvida));
  const agora = Math.min(vendida - ja, Math.max(0, params.agora));
  if (agora <= 0) return 0;
  const valeAte = (unidades: number) => Math.round((pagoDaLinha * unidades) / vendida);
  return valeAte(ja + agora) - valeAte(ja);
}

/**
 * O acerto de uma venda que o comprovante precisa explicar.
 *
 * - **Troco**: o cliente entregou mais do que o total (R$ 100 numa venda de
 *   R$ 80). O pagamento é gravado pelo valor ENTREGUE, então sem esta linha o
 *   papel mostra "Dinheiro R$ 100,00" num total de R$ 80 e ninguém entende.
 * - **Crédito da devolução**: na venda nova de uma troca, parte do total foi
 *   paga com o produto que voltou — e não existe pagamento gravado para essa
 *   parte. Sem esta linha, o papel mostra total de R$ 429,90 e pagamento de
 *   R$ 80,90, e parece que o cliente ficou devendo.
 *
 * @param veioDeTroca a venda é a venda nova de uma troca (tem devolução
 *   apontando para ela em `devolucoes.venda_nova_id`)
 */
export function acertoDaVenda(params: {
  total: number | null | undefined;
  pagamentos: ReadonlyArray<{ valor: number | null | undefined }>;
  veioDeTroca: boolean;
}): { trocoCentavos: number; creditoCentavos: number } {
  const total = Math.max(0, emCentavos(params.total ?? 0));
  const pago = params.pagamentos.reduce((s, p) => s + emCentavos(p.valor ?? 0), 0);
  return {
    trocoCentavos: Math.max(0, pago - total),
    creditoCentavos: params.veioDeTroca ? Math.max(0, total - pago) : 0,
  };
}

/**
 * Troco que passa do dinheiro recebido — a parte que sai da gaveta sem ter
 * entrado por ela.
 *
 * Acontece quando o aparelho recebido na troca vale mais que a compra (um PS5
 * de R$ 2.000 para levar um controle de R$ 430: a loja devolve R$ 1.570), ou
 * quando o cartão/PIX foi lançado acima do total e o vendedor voltou a
 * diferença em dinheiro. Em nenhum dos dois casos o dinheiro entrou pela
 * gaveta, mas sai dela — e é isso que o caixa precisa lançar como saída.
 *
 * @returns centavos que saem da gaveta além do dinheiro que entrou (0 = nada)
 */
export function trocoAlemDoDinheiro(params: {
  trocoCentavos: number;
  dinheiroRecebidoCentavos: number;
}): number {
  return Math.max(0, params.trocoCentavos - Math.max(0, params.dinheiroRecebidoCentavos));
}
