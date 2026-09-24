import { describe, it, expect } from 'vitest';
import { pagoPorLinha, valorDaDevolucao, acertoDaVenda, trocoAlemDoDinheiro } from './valoresDaVenda';

/**
 * As contas que decidem quanto dinheiro sai da gaveta numa devolução.
 *
 * O caso que abriu o achado é real (revisão de 24/09): a VD-202608-0003 tem
 * itens de R$ 2.000, desconto de R$ 500 e total de R$ 1.500, paga com PIX de
 * R$ 1.500. A tela de Troca/Devolução mandava devolver R$ 2.000,00.
 */
describe('o desconto da venda rateado entre os itens', () => {
  it('VD-202608-0003: quem pagou R$ 1.500 tem R$ 1.500 de volta, não R$ 2.000', () => {
    const pago = pagoPorLinha(1500, [{ id: 'a', total: 2000 }]);
    expect(pago.get('a')).toBe(150000);
  });

  it('venda sem desconto: cada linha recebeu o próprio total', () => {
    const pago = pagoPorLinha(430, [
      { id: 'a', total: 350 },
      { id: 'b', total: 80 },
    ]);
    expect(pago.get('a')).toBe(35000);
    expect(pago.get('b')).toBe(8000);
  });

  it('o desconto se divide na proporção do preço de cada linha', () => {
    // R$ 100 de desconto numa venda de R$ 1.000: 10% de cada linha.
    const pago = pagoPorLinha(900, [
      { id: 'console', total: 800 },
      { id: 'jogo', total: 200 },
    ]);
    expect(pago.get('console')).toBe(72000);
    expect(pago.get('jogo')).toBe(18000);
  });

  it('a soma das linhas bate centavo por centavo com o total da venda', () => {
    // Três linhas iguais de R$ 10 com R$ 1 de desconto: 9,666… cada. Arredondar
    // cada uma para 9,67 daria R$ 29,01 — mais do que o cliente pagou.
    const pago = pagoPorLinha(29, [
      { id: 'a', total: 10 },
      { id: 'b', total: 10 },
      { id: 'c', total: 10 },
    ]);
    const soma = [...pago.values()].reduce((s, v) => s + v, 0);
    expect(soma).toBe(2900);
  });

  it('venda com total nulo é tratada como sem desconto', () => {
    const pago = pagoPorLinha(null, [{ id: 'a', total: 59.9 }]);
    expect(pago.get('a')).toBe(5990);
  });

  it('itens zerados não quebram a conta', () => {
    const pago = pagoPorLinha(0, [{ id: 'a', total: 0 }]);
    expect(pago.get('a')).toBe(0);
  });
});

describe('quanto devolver por unidades de uma linha', () => {
  it('devolver a linha inteira devolve o que ela recebeu', () => {
    expect(valorDaDevolucao({ pagoDaLinha: 150000, vendida: 1, jaDevolvida: 0, agora: 1 })).toBe(150000);
  });

  it('devolução em partes nunca soma mais do que a linha recebeu', () => {
    // Linha de 3 unidades que recebeu R$ 29,00.
    const primeira = valorDaDevolucao({ pagoDaLinha: 2900, vendida: 3, jaDevolvida: 0, agora: 1 });
    const segunda = valorDaDevolucao({ pagoDaLinha: 2900, vendida: 3, jaDevolvida: 1, agora: 1 });
    const terceira = valorDaDevolucao({ pagoDaLinha: 2900, vendida: 3, jaDevolvida: 2, agora: 1 });
    expect(primeira + segunda + terceira).toBe(2900);
  });

  it('não devolve mais unidades do que restam', () => {
    // Vendeu 2, já voltou 1: pedir 5 devolve o valor de 1.
    expect(valorDaDevolucao({ pagoDaLinha: 20000, vendida: 2, jaDevolvida: 1, agora: 5 })).toBe(10000);
    expect(valorDaDevolucao({ pagoDaLinha: 20000, vendida: 2, jaDevolvida: 2, agora: 1 })).toBe(0);
  });

  it('zero unidades é zero reais', () => {
    expect(valorDaDevolucao({ pagoDaLinha: 20000, vendida: 2, jaDevolvida: 0, agora: 0 })).toBe(0);
  });
});

describe('o acerto que o comprovante explica', () => {
  it('troco: R$ 100 em dinheiro numa venda de R$ 80', () => {
    const r = acertoDaVenda({ total: 80, pagamentos: [{ valor: 100 }], veioDeTroca: false });
    expect(r.trocoCentavos).toBe(2000);
    expect(r.creditoCentavos).toBe(0);
  });

  it('venda nova de troca: o que não foi pago veio do produto devolvido', () => {
    // Total R$ 429,90, cliente pagou só a diferença de R$ 80,90.
    const r = acertoDaVenda({ total: 429.9, pagamentos: [{ valor: 80.9 }], veioDeTroca: true });
    expect(r.creditoCentavos).toBe(34900);
    expect(r.trocoCentavos).toBe(0);
  });

  it('venda comum paga certinho: nem troco nem crédito', () => {
    const r = acertoDaVenda({ total: 79.8, pagamentos: [{ valor: 9.9 }, { valor: 69.9 }], veioDeTroca: false });
    expect(r).toEqual({ trocoCentavos: 0, creditoCentavos: 0 });
  });

  it('venda comum que falta pagar não inventa crédito', () => {
    const r = acertoDaVenda({ total: 100, pagamentos: [{ valor: 50 }], veioDeTroca: false });
    expect(r.creditoCentavos).toBe(0);
  });
});

describe('troco que sai da gaveta sem ter entrado por ela', () => {
  it('aparelho de R$ 2.000 para um controle de R$ 430: saem R$ 1.570', () => {
    expect(trocoAlemDoDinheiro({ trocoCentavos: 157000, dinheiroRecebidoCentavos: 0 })).toBe(157000);
  });

  it('troco comum, coberto pelo dinheiro recebido: nada a mais sai', () => {
    expect(trocoAlemDoDinheiro({ trocoCentavos: 2000, dinheiroRecebidoCentavos: 10000 })).toBe(0);
  });

  it('dinheiro parcial: só a parte que passa do dinheiro recebido', () => {
    // Venda de R$ 80: R$ 50 em espécie + troca de R$ 100 = troco de R$ 70.
    expect(trocoAlemDoDinheiro({ trocoCentavos: 7000, dinheiroRecebidoCentavos: 5000 })).toBe(2000);
  });
});
