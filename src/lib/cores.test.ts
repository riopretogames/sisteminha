import { describe, it, expect } from 'vitest';
import { corDeBotaoDaEtapa, corDaEtiqueta, CORES_ETIQUETA } from './cores';

/**
 * A cor do botão de avanço sai da cor da etapa de destino.
 *
 * Pedido do Felipe em 30/08: *"que as etapas de avanço sejam da mesma cor das
 * categorias do Kanban"*. O risco que estes testes seguram é o clássico deste
 * arquivo: classe de cor montada em pedaços não existe no CSS, e o botão
 * chegaria à tela sem cor nenhuma.
 */

describe('Cor do botão a partir da etapa', () => {
  it('etiqueta sólida vira botão da mesma família', () => {
    expect(corDeBotaoDaEtapa('bg-amber-500 text-white'))
      .toBe('bg-amber-600 text-white hover:bg-amber-700');
  });

  it('a versão clara, que também existe no banco, dá o mesmo resultado', () => {
    // As etapas semeadas em 09/08 usam "bg-x-500/10 text-x-600"; as editadas
    // pela tela usam a sólida. As duas convivem.
    expect(corDeBotaoDaEtapa('bg-amber-500/10 text-amber-600'))
      .toBe('bg-amber-600 text-white hover:bg-amber-700');
  });

  it('verde e esmeralda não se confundem — são dois "bom" diferentes', () => {
    expect(corDeBotaoDaEtapa('bg-green-600 text-white')).toContain('bg-green-600');
    expect(corDeBotaoDaEtapa('bg-emerald-500 text-white')).toContain('bg-emerald-600');
  });

  describe('quando a cor não é conhecida', () => {
    it('devolve nada, para o botão cair no padrão do sistema', () => {
      // Melhor um botão azul padrão do que um botão transparente.
      expect(corDeBotaoDaEtapa('bg-fuchsia-500 text-white')).toBeUndefined();
      expect(corDeBotaoDaEtapa('')).toBeUndefined();
      expect(corDeBotaoDaEtapa(null)).toBeUndefined();
      expect(corDeBotaoDaEtapa(undefined)).toBeUndefined();
    });

    it('texto sem classe de fundo também não inventa cor', () => {
      expect(corDeBotaoDaEtapa('text-white')).toBeUndefined();
    });
  });

  it('toda cor da paleta de etiquetas tem botão correspondente', () => {
    // Se alguém acrescentar uma cor em CORES_ETIQUETA e esquecer do botão, o
    // botão daquela etapa sairia sem cor — e ninguém ligaria uma coisa à outra.
    for (const cor of CORES_ETIQUETA) {
      expect(corDeBotaoDaEtapa(cor.value)).toBeTruthy();
    }
  });
});

describe('Cor de etiqueta vinda do catálogo', () => {
  it('respeita a cor escolhida quando existe', () => {
    expect(corDaEtiqueta('bg-red-500 text-white', 'qualquer')).toBe('bg-red-500 text-white');
  });

  it('sem cor, a mesma palavra sempre recebe a mesma cor', () => {
    expect(corDaEtiqueta(null, 'Atacado')).toBe(corDaEtiqueta(null, 'Atacado'));
  });
});
