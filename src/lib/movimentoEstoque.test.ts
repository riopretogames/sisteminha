import { describe, it, expect } from 'vitest';
import { sentidoDoMovimento, quantidadeComSinal } from './movimentoEstoque';

/**
 * O caso que motivou tudo: venda e peça de OS gravam quantidade POSITIVA
 * com tipo 'saida'. Antes de 18/08 as telas liam só o número e pintavam de
 * verde com "+", como se tivesse entrado mercadoria.
 */
describe('sentido do movimento', () => {
  it('venda: tipo saida com quantidade positiva ainda é saída', () => {
    expect(sentidoDoMovimento({ tipo: 'saida', quantidade: 3 })).toBe('saida');
  });

  it('peça usada em OS: mesma coisa', () => {
    expect(sentidoDoMovimento({ tipo: 'saida', quantidade: 1 })).toBe('saida');
  });

  it('entrada de mercadoria é entrada', () => {
    expect(sentidoDoMovimento({ tipo: 'entrada', quantidade: 10 })).toBe('entrada');
  });

  it('ajuste manual pra baixo é saída', () => {
    expect(sentidoDoMovimento({ tipo: 'ajuste', quantidade: -2 })).toBe('saida');
  });

  it('ajuste manual pra cima é entrada', () => {
    expect(sentidoDoMovimento({ tipo: 'ajuste', quantidade: 2 })).toBe('entrada');
  });

  it('inventário segue o sinal, como o ajuste', () => {
    expect(sentidoDoMovimento({ tipo: 'inventario', quantidade: -5 })).toBe('saida');
    expect(sentidoDoMovimento({ tipo: 'inventario', quantidade: 5 })).toBe('entrada');
  });

  it('quantidade zero não é entrada nem saída', () => {
    expect(sentidoDoMovimento({ tipo: 'ajuste', quantidade: 0 })).toBe('neutro');
  });
});

describe('quantidade com sinal', () => {
  it('saída de venda (positiva no banco) aparece com menos', () => {
    expect(quantidadeComSinal({ tipo: 'saida', quantidade: 3 })).toBe('-3');
  });

  it('saída de ajuste (já negativa no banco) não vira menos duplo', () => {
    expect(quantidadeComSinal({ tipo: 'ajuste', quantidade: -2 })).toBe('-2');
  });

  it('entrada aparece com mais', () => {
    expect(quantidadeComSinal({ tipo: 'entrada', quantidade: 10 })).toBe('+10');
  });
});
