import { describe, it, expect } from 'vitest';
import { emCentavos, emReais, arredondarReais, somarReais, lerValorDigitado } from './dinheiro';

/**
 * A conta que travava o PDV com "Falta R$ 0,00" (revisão de 24/09).
 *
 * 9,90 + 69,90 no computador dá 79.80000000000001. O vendedor digitava 79,80,
 * a conferência "pago < total" reprovava e o botão de confirmar ficava
 * desligado — com a tela dizendo que faltavam zero reais.
 */
describe('dinheiro em centavos', () => {
  it('o caso do PDV: 9,90 + 69,90 é exatamente 79,80', () => {
    // A prova de que o problema existe sem os centavos:
    expect(9.9 + 69.9).not.toBe(79.8);
    // E de que some com eles:
    expect(somarReais([9.9, 69.9])).toBe(79.8);
    expect(emCentavos(9.9) + emCentavos(69.9)).toBe(emCentavos('79.80'));
  });

  it('meio centavo arredonda para cima, mesmo quando o binário esconde', () => {
    // 1,005 × 100 dá 100.49999999999999 no computador.
    expect(emCentavos(1.005)).toBe(101);
    expect(arredondarReais(10.555)).toBe(10.56);
  });

  it('aceita o que o vendedor digita, com ponto ou vírgula', () => {
    expect(emCentavos('79.80')).toBe(7980);
    expect(emCentavos('79,8')).toBe(7980);
    expect(emCentavos(' 150 ')).toBe(15000);
  });

  it('texto que não é número não vira zero calado', () => {
    // Engolir como zero foi o que fez o caixa abrir com R$ 0,00 em 18/08.
    expect(emCentavos('abc')).toBeNaN();
  });

  it('negativo arredonda simétrico', () => {
    expect(emCentavos(-0.005)).toBe(-1);
    expect(emCentavos(-10.5)).toBe(-1050);
  });

  it('volta para reais com 2 casas', () => {
    expect(emReais(7980)).toBe(79.8);
    expect(emReais(1)).toBe(0.01);
  });

  describe('lerValorDigitado', () => {
    it('valor bom vira centavos', () => {
      expect(lerValorDigitado('79.80')).toBe(7980);
    });

    it('vazio, zero, negativo e letra não são pagamento', () => {
      expect(lerValorDigitado('')).toBeNull();
      expect(lerValorDigitado('0')).toBeNull();
      expect(lerValorDigitado('-5')).toBeNull();
      expect(lerValorDigitado('xyz')).toBeNull();
    });

    it('fração de centavo que arredonda para zero também não é pagamento', () => {
      // Era o "pagamento de R$ 0,00" que o atalho criava com o resíduo.
      expect(lerValorDigitado('0.001')).toBeNull();
    });
  });
});
