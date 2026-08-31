import { describe, it, expect } from 'vitest';
import { contaDaOS, tipoDoItem, orcamentoDivergeDosItens, type ItemDaOS } from './itensDaOS';

/**
 * A conta da OS com os três tipos de linha.
 *
 * O caso que estes testes existem para proteger é o que motivou o trabalho: a
 * peça comprada no fornecedor no dia sendo contada como mão de obra, porque o
 * sistema decidia o tipo olhando se a linha tinha produto do estoque.
 */

const peca = (preco: number, qtd = 1): ItemDaOS => ({
  produto_id: 'produto-1', tipo_item: 'peca', preco_cobrado: preco, quantidade: qtd,
});
const servico = (preco: number): ItemDaOS => ({
  produto_id: null, tipo_item: 'servico', preco_cobrado: preco, quantidade: 1,
});

describe('O que cada linha da OS é', () => {
  it('peça do estoque', () => {
    expect(tipoDoItem({ produto_id: 'p1', tipo_item: 'peca', preco_cobrado: 10 })).toBe('peca');
  });

  it('peça comprada no dia: é PEÇA, mesmo sem produto no estoque', () => {
    // Este é o caso que estava errado antes: sem produto_id, o sistema
    // chamava de serviço e inflava o faturamento de mão de obra.
    expect(tipoDoItem({ produto_id: null, tipo_item: 'peca', preco_cobrado: 380 })).toBe('peca');
  });

  it('custo repassado (frete, terceirização) tem tipo próprio', () => {
    expect(tipoDoItem({ produto_id: null, tipo_item: 'complementar', preco_cobrado: 40 }))
      .toBe('complementar');
  });

  describe('linha antiga, gravada antes de os tipos existirem', () => {
    it('com produto do estoque vale como peça', () => {
      expect(tipoDoItem({ produto_id: 'p1', preco_cobrado: 100 })).toBe('peca');
      expect(tipoDoItem({ produto_id: 'p1', tipo_item: null, preco_cobrado: 100 })).toBe('peca');
    });

    it('sem produto vale como serviço — que era a única outra coisa possível', () => {
      expect(tipoDoItem({ produto_id: null, preco_cobrado: 100 })).toBe('servico');
    });

    it('tipo desconhecido não derruba a conta', () => {
      // Se alguém gravar lixo na coluna, a tela não pode quebrar.
      expect(tipoDoItem({ produto_id: null, tipo_item: 'xpto', preco_cobrado: 100 }))
        .toBe('servico');
    });
  });
});

describe('A conta da OS', () => {
  it('separa os três grupos e soma o total', () => {
    const conta = contaDaOS([
      peca(380),
      { produto_id: null, tipo_item: 'peca', preco_cobrado: 120, quantidade: 1 },
      servico(150),
      { produto_id: null, tipo_item: 'complementar', preco_cobrado: 40, quantidade: 1 },
    ]);

    expect(conta.pecas).toBe(500);        // a do estoque e a comprada no dia
    expect(conta.servicos).toBe(150);
    expect(conta.complementares).toBe(40);
    expect(conta.total).toBe(690);
  });

  it('quantidade multiplica', () => {
    expect(contaDaOS([peca(50, 3)]).pecas).toBe(150);
  });

  it('sem quantidade, conta como uma unidade', () => {
    expect(contaDaOS([{ produto_id: 'p', tipo_item: 'peca', preco_cobrado: 90 }]).total).toBe(90);
  });

  it('OS sem itens dá tudo zero, não quebra', () => {
    expect(contaDaOS([])).toEqual({ pecas: 0, servicos: 0, complementares: 0, total: 0 });
  });

  it('o total é a soma dos três grupos, sempre', () => {
    const conta = contaDaOS([peca(11.5), servico(22.25), {
      produto_id: null, tipo_item: 'complementar', preco_cobrado: 3.3, quantidade: 2,
    }]);
    expect(conta.total).toBeCloseTo(conta.pecas + conta.servicos + conta.complementares, 2);
  });
});

describe('Orçamento combinado x itens lançados', () => {
  it('avisa quando o lançado passa do combinado', () => {
    expect(orcamentoDivergeDosItens(500, 690)).toBe(true);
  });

  it('avisa também quando falta lançar', () => {
    expect(orcamentoDivergeDosItens(690, 500)).toBe(true);
  });

  it('centavo de arredondamento NÃO é divergência', () => {
    // Aviso que aparece por um centavo é aviso que a equipe aprende a ignorar.
    expect(orcamentoDivergeDosItens(150, 150.4)).toBe(false);
    expect(orcamentoDivergeDosItens(150.99, 150)).toBe(false);
  });

  it('a partir de um real, avisa', () => {
    expect(orcamentoDivergeDosItens(150, 151)).toBe(true);
  });

  it('valores iguais não avisam', () => {
    expect(orcamentoDivergeDosItens(430, 430)).toBe(false);
  });
});
