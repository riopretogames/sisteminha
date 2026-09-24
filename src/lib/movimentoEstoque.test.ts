import { describe, it, expect } from 'vitest';
import { sentidoDoMovimento, quantidadeComSinal, limitesDoPeriodo } from './movimentoEstoque';

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

describe('limites do período das Movimentações (relógio de Rio Preto)', () => {
  // Os instantes esperados são montados no fuso da máquina, então a prova vale
  // em qualquer fuso. No Brasil (UTC-3), o início de 01/09 é 03:00 em UTC — e
  // o texto sem fuso que a tela mandava antes ("2026-09-01") era meia-noite
  // de Londres, três horas antes.
  it('o início é a meia-noite LOCAL do primeiro dia', () => {
    const { inicio } = limitesDoPeriodo('2026-09-01', '2026-09-24');
    expect(inicio).toBe(new Date(2026, 8, 1).toISOString());
  });

  it('o fim é a meia-noite local do dia SEGUINTE, exclusiva — entra o movimento das 23h59 do último dia', () => {
    const { fimExclusivo } = limitesDoPeriodo('2026-09-01', '2026-09-24');
    expect(fimExclusivo).toBe(new Date(2026, 8, 25).toISOString());
    const vendaAs2330 = new Date(2026, 8, 24, 23, 30).toISOString();
    expect(vendaAs2330 < fimExclusivo!).toBe(true);
  });

  it('vira o mês e o ano sem erro', () => {
    expect(limitesDoPeriodo('2026-12-01', '2026-12-31').fimExclusivo).toBe(
      new Date(2027, 0, 1).toISOString(),
    );
  });

  it('data apagada no seletor vira "sem limite", não erro', () => {
    expect(limitesDoPeriodo('', '2026-09-24').inicio).toBeNull();
    expect(limitesDoPeriodo('2026-09-01', '').fimExclusivo).toBeNull();
  });
});
