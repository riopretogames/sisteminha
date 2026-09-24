import { describe, it, expect } from 'vitest';
import { fatorDaVenda, pagamentosSemTroco } from './dinheiroDaVenda';

describe('fatorDaVenda — o desconto da venda rateado entre os itens', () => {
  it('venda sem desconto vale 1 por real de item', () => {
    expect(fatorDaVenda({ total: 300, itens_venda: [{ total: 100 }, { total: 200 }] })).toBe(1);
  });

  it('desconto de R$ 500 numa venda de R$ 2.000 vira 0,75 em cada item', () => {
    // O caso real de agosto: itens somando mais do que a venda cobrou.
    expect(fatorDaVenda({ total: 1500, itens_venda: [{ total: 2000 }] })).toBe(0.75);
  });

  it('venda sem itens não tem o que ratear', () => {
    expect(fatorDaVenda({ total: 100, itens_venda: [] })).toBe(0);
    expect(fatorDaVenda({ total: 100, itens_venda: null })).toBe(0);
  });
});

describe('pagamentosSemTroco — o dinheiro que ficou na gaveta', () => {
  const dinheiro = (valor: number) => ({ valor, dinheiro: true });
  const pix = (valor: number) => ({ valor, dinheiro: false });
  const ehDinheiro = (p: { valor: number; dinheiro: boolean }) => p.dinheiro;

  it('venda de R$ 80 paga com nota de R$ 100: entram R$ 80, não R$ 100', () => {
    const r = pagamentosSemTroco(80, [dinheiro(100)], ehDinheiro);
    expect(r.map((x) => x.valor)).toEqual([80]);
  });

  it('pagamento dividido: o troco sai só do dinheiro, o PIX fica inteiro', () => {
    // Venda de 150: 100 no PIX + nota de 100 em dinheiro = troco de 50.
    const r = pagamentosSemTroco(150, [pix(100), dinheiro(100)], ehDinheiro);
    expect(r.map((x) => x.valor)).toEqual([100, 50]);
  });

  it('sem troco nada muda', () => {
    const r = pagamentosSemTroco(200, [pix(120), dinheiro(80)], ehDinheiro);
    expect(r.map((x) => x.valor)).toEqual([120, 80]);
  });

  it('o vale-troca conta no que foi pago, mas não é dinheiro', () => {
    // Venda de 500: produto de troca avaliado em 300 + 250 em dinheiro.
    // Pagou 550, troco 50, e o dinheiro que ficou foi 200.
    const vale = { valor: 300, dinheiro: false };
    const r = pagamentosSemTroco(500, [vale, dinheiro(250)], ehDinheiro);
    expect(r.map((x) => x.valor)).toEqual([300, 200]);
  });
});
