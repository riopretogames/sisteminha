import { describe, it, expect } from 'vitest';
import { nomeDaEtapa, numeroDaEtapa } from './etapaDaOS';

/**
 * A numeração das etapas, ditada pelo Felipe em 30/08.
 *
 * O que estes testes protegem é o quadro não ficar com uma coluna escrita
 * "undefined · Alguma coisa" no dia em que a loja criar uma etapa sem número —
 * e o "2a/2b" continuar possível, que é o motivo de o número ser texto.
 */

describe('O nome da etapa no quadro', () => {
  it('mostra o número antes do nome', () => {
    expect(nomeDaEtapa({ numero: '1', label: 'Entrada / Análise' }))
      .toBe('1 · Entrada / Análise');
  });

  it('aceita número com letra — é o caso do 2a e 2b', () => {
    // Duas colunas na MESMA fase: o aparelho parado esperando alguém de fora.
    expect(nomeDaEtapa({ numero: '2a', label: 'Aguardando aprovação' }))
      .toBe('2a · Aguardando aprovação');
    expect(nomeDaEtapa({ numero: '2b', label: 'Aguardando Peça' }))
      .toBe('2b · Aguardando Peça');
  });

  describe('etapa sem número', () => {
    it('aparece só com o nome, sem separador solto', () => {
      expect(nomeDaEtapa({ label: 'Cancelado' })).toBe('Cancelado');
      expect(nomeDaEtapa({ numero: null, label: 'Cancelado' })).toBe('Cancelado');
    });

    it('número em branco também não vira separador', () => {
      expect(nomeDaEtapa({ numero: '   ', label: 'Cancelado' })).toBe('Cancelado');
    });
  });

  it('espaço em volta do número não aparece na tela', () => {
    expect(nomeDaEtapa({ numero: ' 3 ', label: 'Aprovado' })).toBe('3 · Aprovado');
  });

  it('numeroDaEtapa devolve vazio quando não há número', () => {
    expect(numeroDaEtapa({ label: 'Cancelado' })).toBe('');
    expect(numeroDaEtapa({ numero: '2b', label: 'Aguardando Peça' })).toBe('2b');
  });
});
