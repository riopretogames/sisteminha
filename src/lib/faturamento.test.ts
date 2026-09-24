import { describe, it, expect } from 'vitest';
import { faturamentoDaVenda, somarFaturamento, somarDevolucoes, gastoDoCliente } from './faturamento';

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

/**
 * O "Já gastou" da ficha do cliente (achado de 24/09): somava `total` puro,
 * sem descontar devolução nem usar o faturamento real da venda de troca.
 */
describe('quanto o cliente gastou de verdade', () => {
  it('comprou R$ 4.000 e devolveu tudo: gastou zero', () => {
    expect(
      gastoDoCliente([
        { status: 'pago', total: 4000, valor_faturamento_real: null, devolucoes: [{ valor_devolvido_cliente: 4000 }] },
      ]),
    ).toBe(0);
  });

  it('trocou um PS5 por outro aparelho do mesmo valor: conta uma vez só', () => {
    expect(
      gastoDoCliente([
        // Venda original: a devolução virou crédito na troca, nada voltou em dinheiro.
        { status: 'pago', total: 4000, valor_faturamento_real: null, devolucoes: [{ valor_devolvido_cliente: 0 }] },
        // Venda nova da troca: preço cheio em `total`, dinheiro novo zero.
        { status: 'pago', total: 4000, valor_faturamento_real: 0, devolucoes: [] },
      ]),
    ).toBe(4000);
  });

  it('troca em que o cliente pagou a diferença: soma só o que entrou de novo', () => {
    expect(
      gastoDoCliente([
        { status: 'pago', total: 349, valor_faturamento_real: null, devolucoes: [{ valor_devolvido_cliente: 0 }] },
        { status: 'pago', total: 429.9, valor_faturamento_real: 80.9, devolucoes: [] },
      ]),
    ).toBe(429.9);
  });

  it('venda cancelada não conta', () => {
    expect(gastoDoCliente([{ status: 'cancelado', total: 500, devolucoes: [] }])).toBe(0);
  });
});
