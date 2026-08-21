import { supabase } from '@/integrations/supabase/client';

/**
 * Faturamento: como somar dinheiro de venda sem contar duas vezes.
 *
 * Duas armadilhas moram aqui, as duas descobertas testando troca/devolução:
 *
 * 1. A venda NOVA de uma troca grava o preço cheio do produto em
 *    `vendas.total` (a contagem de "quantas unidades desse produto saíram"
 *    depende disso), mas o dinheiro NOVO que entrou é só a diferença que o
 *    cliente pagou — está em `valor_faturamento_real`. Somar `total` conta o
 *    produto trocado duas vezes.
 *
 * 2. O dinheiro DEVOLVIDO ao cliente não aparece em venda nenhuma. A venda
 *    original continua gravada com o valor cheio, para sempre. Sem descontar
 *    as devoluções do período, uma venda devolvida no mesmo dia segue
 *    contando inteira no painel, com o dinheiro já fora da gaveta.
 *
 * A régua de data é a mesma que o Caixa já usa desde 17/08: a devolução pesa
 * no dia em que ela aconteceu, não no dia da venda original (o gatilho
 * `registrar_devolucao_no_caixa` lança a saída no caixa aberto do momento).
 * Assim painel e conferência de caixa contam a mesma história.
 */

/** O que uma venda realmente trouxe de dinheiro novo. */
export function faturamentoDaVenda(v: {
  total: number | null;
  valor_faturamento_real?: number | null;
}): number {
  return Number(v.valor_faturamento_real ?? v.total ?? 0);
}

/** Soma o dinheiro novo de uma lista de vendas. */
export function somarFaturamento(
  vendas: Array<{ total: number | null; valor_faturamento_real?: number | null }>
): number {
  return vendas.reduce((acc, v) => acc + faturamentoDaVenda(v), 0);
}

/**
 * Dinheiro que saiu da gaveta devolvendo cliente, num intervalo.
 *
 * Vale para os dois casos, e não conta em dobro em nenhum:
 * - Devolução pura: a venda original segue somada cheia, e isto a anula.
 * - Troca com dinheiro de volta: a venda nova já entra com faturamento 0
 *   (`valor_faturamento_real`), e isto desconta a diferença que voltou pro
 *   bolso do cliente.
 * Na troca em que o cliente PAGA a mais, `valor_devolvido_cliente` é 0 e
 * nada é descontado — que é o certo.
 *
 * @param deISO   início do intervalo (ISO, inclusive)
 * @param ateISO  fim do intervalo (ISO, TAMBÉM inclusive). Omitido = sem
 *                limite. Inclusive de propósito: as telas de período do
 *                projeto filtram venda com `.lte('created_at', ate+T23:59:59)`
 *                — se aqui fosse exclusivo, uma devolução feita exatamente
 *                às 23:59:59 ficaria de fora do desconto e a venda dela não.
 */
export async function totalDevolvidoNoPeriodo(
  deISO: string,
  ateISO?: string
): Promise<number> {
  let q = supabase
    .from('devolucoes')
    .select('valor_devolvido_cliente')
    .gte('created_at', deISO);

  if (ateISO) q = q.lte('created_at', ateISO);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).reduce(
    (acc, d) => acc + Number(d.valor_devolvido_cliente ?? 0),
    0
  );
}

/** Uma devolução, do ponto de vista de quem só quer saber quanto saiu e quando. */
export interface DevolucaoRow {
  created_at: string;
  valor_devolvido_cliente: number | null;
}

/** Soma o dinheiro devolvido numa lista já filtrada por período. */
export function somarDevolucoes(devolucoes: DevolucaoRow[]): number {
  return devolucoes.reduce(
    (acc, d) => acc + Number(d.valor_devolvido_cliente ?? 0),
    0
  );
}

/** Busca as devoluções de um intervalo, para filtrar por dia no cliente. */
export async function buscarDevolucoesDesde(deISO: string): Promise<DevolucaoRow[]> {
  const { data, error } = await supabase
    .from('devolucoes')
    .select('created_at, valor_devolvido_cliente')
    .gte('created_at', deISO);
  if (error) throw error;
  return (data ?? []) as DevolucaoRow[];
}

/** Quanto de um produto voltou pela porta, e por qual valor. */
export interface DevolvidoDoProduto {
  quantidade: number;
  valor: number;
}

/**
 * Itens devolvidos num período, somados por produto.
 *
 * Existe porque os painéis de Inteligência (`IeComercial`, `IeEstoque`)
 * agregam **por produto**, somando `itens_venda` — o desconto por período que
 * conserta os outros painéis não alcança eles. Sem isto, um produto devolvido
 * segue aparecendo como vendido no ranking de mais vendidos e infla a margem
 * de quem tem muita devolução.
 *
 * O `preco_unitario` vem de `devolucao_itens`, que guarda o preço da venda
 * ORIGINAL e não o preço atual do produto — é quanto o cliente pagou de
 * verdade, que é o valor certo pra tirar da receita.
 *
 * Mesma régua de data do resto: a devolução pesa no dia em que aconteceu.
 *
 * @param deISO   início (ISO, inclusive)
 * @param ateISO  fim (ISO, inclusive). Omitido = sem limite.
 */
export async function devolvidosPorProdutoNoPeriodo(
  deISO: string,
  ateISO?: string
): Promise<Map<string, DevolvidoDoProduto>> {
  let q = supabase
    .from('devolucao_itens')
    .select('produto_id, quantidade, preco_unitario, devolucoes!inner(created_at)')
    .gte('devolucoes.created_at', deISO);

  if (ateISO) q = q.lte('devolucoes.created_at', ateISO);

  const { data, error } = await q;
  if (error) throw error;

  const porProduto = new Map<string, DevolvidoDoProduto>();
  for (const item of (data ?? []) as unknown as Array<{
    produto_id: string;
    quantidade: number;
    preco_unitario: number | null;
  }>) {
    const atual = porProduto.get(item.produto_id) ?? { quantidade: 0, valor: 0 };
    atual.quantidade += Number(item.quantidade ?? 0);
    atual.valor += Number(item.quantidade ?? 0) * Number(item.preco_unitario ?? 0);
    porProduto.set(item.produto_id, atual);
  }
  return porProduto;
}
