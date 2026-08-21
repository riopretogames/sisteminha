import { describe, it, expect } from 'vitest';
import { estoqueCritico, estoqueZerado, faltaParaOMinimo } from './estoque';

describe('estoque crítico', () => {
  it('abaixo do mínimo é crítico', () => {
    expect(estoqueCritico({ estoque_atual: 1, estoque_minimo: 3 })).toBe(true);
  });

  it('exatamente no mínimo também é crítico — é o momento de repor', () => {
    expect(estoqueCritico({ estoque_atual: 3, estoque_minimo: 3 })).toBe(true);
  });

  it('acima do mínimo não é', () => {
    expect(estoqueCritico({ estoque_atual: 4, estoque_minimo: 3 })).toBe(false);
  });

  it('produto sem mínimo cadastrado só é crítico se zerou', () => {
    expect(estoqueCritico({ estoque_atual: 5, estoque_minimo: null })).toBe(false);
    expect(estoqueCritico({ estoque_atual: 0, estoque_minimo: null })).toBe(true);
  });

  it('nulo não vira NaN', () => {
    expect(estoqueCritico({ estoque_atual: null, estoque_minimo: null })).toBe(true);
  });
});

describe('estoque zerado', () => {
  it('zero é zerado, um não é', () => {
    expect(estoqueZerado({ estoque_atual: 0, estoque_minimo: 3 })).toBe(true);
    expect(estoqueZerado({ estoque_atual: 1, estoque_minimo: 3 })).toBe(false);
  });

  it('negativo conta como zerado', () => {
    expect(estoqueZerado({ estoque_atual: -2, estoque_minimo: 3 })).toBe(true);
  });
});

describe('falta para o mínimo', () => {
  it('conta quanto falta', () => {
    expect(faltaParaOMinimo({ estoque_atual: 1, estoque_minimo: 5 })).toBe(4);
  });

  it('já acima do mínimo não falta nada', () => {
    expect(faltaParaOMinimo({ estoque_atual: 9, estoque_minimo: 5 })).toBe(0);
  });
});
