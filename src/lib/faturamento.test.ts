import { describe, it, expect } from 'vitest';
import { faturamentoDaVenda, somarFaturamento, somarDevolucoes } from './faturamento';

/**
 * Os quatro caminhos que troca/devolução podem tomar. O que se testa aqui é
 * a conta que decide meta, premiação e "faturamento do dia" — errar aqui é
 * pagar comissão sobre dinheiro que voltou pro cliente.
 *
 * A fórmula é sempre: soma(faturamento das vendas) − soma(devolvido).
 */
describe('faturamento de uma venda', () => {
  it('venda comum: usa o total', () => {
    expect(faturamentoDaVenda({ total: 100, valor_faturamento_real: null })).toBe(100);
  });

  it('venda nova de troca: usa o faturamento real, não o preço cheio', () => {
    // Preço cheio fica em `total` pra contagem de unidades por produto.
    expect(faturamentoDaVenda({ total: 80, valor_faturamento_real: 0 })).toBe(0);
  });

  it('venda sem valor algum não quebra a conta', () => {
    expect(faturamentoDaVenda({ total: null, valor_faturamento_real: null })).toBe(0);
  });
});

describe('faturamento líquido nos quatro cenários de troca/devolução', () => {
  it('devolução pura: venda de 100 devolvida inteira zera o faturamento', () => {
    const vendas = [{ total: 100, valor_faturamento_real: null }];
    const devolucoes = [{ created_at: '', valor_devolvido_cliente: 100 }];
    expect(somarFaturamento(vendas) - somarDevolucoes(devolucoes)).toBe(0);
  });

  it('troca com dinheiro de volta: fica o valor do produto que o cliente levou', () => {
    // Comprou 100, trocou por um de 80, recebeu 20 de volta.
    const vendas = [
      { total: 100, valor_faturamento_real: null }, // venda original
      { total: 80, valor_faturamento_real: 0 },     // venda nova da troca
    ];
    const devolucoes = [{ created_at: '', valor_devolvido_cliente: 20 }];
    expect(somarFaturamento(vendas) - somarDevolucoes(devolucoes)).toBe(80);
  });

  it('troca em que o cliente paga a mais: conta os dois pagamentos, sem desconto', () => {
    // Comprou 100, trocou por um de 150, pagou 50 de diferença.
    const vendas = [
      { total: 100, valor_faturamento_real: null },
      { total: 150, valor_faturamento_real: 50 },
    ];
    const devolucoes = [{ created_at: '', valor_devolvido_cliente: 0 }];
    expect(somarFaturamento(vendas) - somarDevolucoes(devolucoes)).toBe(150);
  });

  it('troca de valor igual: nada entra, nada sai', () => {
    const vendas = [
      { total: 100, valor_faturamento_real: null },
      { total: 100, valor_faturamento_real: 0 },
    ];
    const devolucoes = [{ created_at: '', valor_devolvido_cliente: 0 }];
    expect(somarFaturamento(vendas) - somarDevolucoes(devolucoes)).toBe(100);
  });
});

describe('somarDevolucoes', () => {
  it('lista vazia soma zero', () => {
    expect(somarDevolucoes([])).toBe(0);
  });

  it('valor nulo não vira NaN', () => {
    expect(somarDevolucoes([{ created_at: '', valor_devolvido_cliente: null }])).toBe(0);
  });
});
