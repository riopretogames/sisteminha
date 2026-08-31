/**
 * A conta de uma OS: o que é peça, o que é mão de obra, o que é repasse.
 *
 * Pedido do Felipe em 31/08, olhando o sistema antigo: *"tem peças que às
 * vezes a gente pega no fornecedor no dia, então não precisa necessariamente
 * ser só peças do estoque"* — e os "valores complementares", que o antigo tem
 * e o sisteminha não tinha.
 *
 * O QUE ESTAVA ERRADO ANTES
 *
 * O sistema decidia o tipo da linha olhando se ela tinha produto do estoque:
 * com produto, peça; sem produto, mão de obra. Funcionava porque só existiam
 * esses dois casos.
 *
 * A peça comprada no fornecedor no dia quebra essa conta — ela É peça e não
 * tem produto no estoque. Contada como mão de obra, ela inflava o faturamento
 * de serviço da loja e sumia do custo de peça em todo relatório. O mesmo vale
 * para frete e terceirização, que não são nem uma coisa nem outra.
 */

export type TipoDeItem = 'peca' | 'servico' | 'complementar';

export interface ItemDaOS {
  produto_id?: string | null;
  tipo_item?: string | null;
  preco_cobrado: number;
  quantidade?: number | null;
}

/**
 * O que esta linha é.
 *
 * Linha antiga, gravada antes de 31/08, não tem tipo — e aí vale a regra
 * velha, que era correta para o que existia até ali. Reescrever o passado
 * seria inventar peça avulsa em OS que nunca teve uma.
 */
export function tipoDoItem(item: ItemDaOS): TipoDeItem {
  const gravado = item.tipo_item;
  if (gravado === 'peca' || gravado === 'servico' || gravado === 'complementar') {
    return gravado;
  }
  return item.produto_id != null ? 'peca' : 'servico';
}

/** Quanto esta linha soma na conta: preço × quantidade. */
export function valorDoItem(item: ItemDaOS): number {
  return Number(item.preco_cobrado) * (item.quantidade ?? 1);
}

export interface ContaDaOS {
  pecas: number;
  servicos: number;
  complementares: number;
  total: number;
}

/** A conta da OS, separada por tipo. É o resumo que aparece acima dos itens. */
export function contaDaOS(itens: ItemDaOS[]): ContaDaOS {
  const conta: ContaDaOS = { pecas: 0, servicos: 0, complementares: 0, total: 0 };

  for (const item of itens) {
    const valor = valorDoItem(item);
    conta.total += valor;

    const tipo = tipoDoItem(item);
    if (tipo === 'peca') conta.pecas += valor;
    else if (tipo === 'servico') conta.servicos += valor;
    else conta.complementares += valor;
  }

  return conta;
}

/**
 * O orçamento combinado bate com o que está lançado?
 *
 * Um real de folga: centavo de arredondamento não é divergência, é ruído — e
 * um aviso que aparece por um centavo é um aviso que a equipe aprende a
 * ignorar.
 */
export function orcamentoDivergeDosItens(orcamento: number, somaDosItens: number): boolean {
  return Math.abs(somaDosItens - orcamento) >= 1;
}
