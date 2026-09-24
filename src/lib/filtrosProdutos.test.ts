import { describe, it, expect } from 'vitest';
import { aplicarFiltrosProdutos, FILTROS_PRODUTOS_VAZIO } from './filtrosProdutos';

/**
 * O filtro "Entrada de / até" da lista de Estoque usa o DIA DE RIO PRETO.
 *
 * O banco guarda a hora em UTC. Até 24/09 o filtro cortava o texto do banco
 * (`created_at.slice(0, 10)`), que é o dia de Londres: das 21h à meia-noite o
 * produto cadastrado "hoje" aparecia como cadastrado amanhã.
 *
 * Os horários do teste são montados no fuso da máquina (`new Date(ano, mês,
 * dia, hora)`), então a prova vale em qualquer fuso — e é no fuso do Brasil,
 * onde a loja roda, que ela pega o defeito antigo.
 */

function produto(created_at: string) {
  return { id: 'p1', nome: 'Película 3D', ativo: true, created_at };
}

describe('filtro de data da lista de produtos', () => {
  it('produto cadastrado às 22h30 de 24/09 (hora local) entra em "até 24/09"', () => {
    const noiteDo24 = new Date(2026, 8, 24, 22, 30).toISOString();
    const filtrado = aplicarFiltrosProdutos([produto(noiteDo24)], {
      ...FILTROS_PRODUTOS_VAZIO,
      de: '2026-09-24',
      ate: '2026-09-24',
    });
    expect(filtrado).toHaveLength(1);
  });

  it('e NÃO entra em "de 25/09"', () => {
    const noiteDo24 = new Date(2026, 8, 24, 22, 30).toISOString();
    const filtrado = aplicarFiltrosProdutos([produto(noiteDo24)], {
      ...FILTROS_PRODUTOS_VAZIO,
      de: '2026-09-25',
    });
    expect(filtrado).toHaveLength(0);
  });

  it('produto cadastrado à 00h10 de 25/09 (hora local) não entra em "até 24/09"', () => {
    const madrugadaDo25 = new Date(2026, 8, 25, 0, 10).toISOString();
    const filtrado = aplicarFiltrosProdutos([produto(madrugadaDo25)], {
      ...FILTROS_PRODUTOS_VAZIO,
      ate: '2026-09-24',
    });
    expect(filtrado).toHaveLength(0);
  });
});
