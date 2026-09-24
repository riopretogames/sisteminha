import { describe, it, expect } from 'vitest';
import { buscarEmPaginas } from './buscarEmPaginas';

/**
 * Um Supabase de mentira com o mesmo limite do de verdade: no máximo 1.000
 * linhas por pedido, cortando calado.
 */
function bancoComLimite(total: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const pedidos: [number, number][] = [];
  const montar = () => ({
    range: (de: number, ate: number) => {
      pedidos.push([de, ate]);
      const fim = Math.min(ate, de + 999, total - 1);
      return Promise.resolve({ data: de >= total ? [] : linhas.slice(de, fim + 1), error: null });
    },
  });
  return { montar, pedidos };
}

describe('buscarEmPaginas', () => {
  it('traz as 2.500 vendas de um ano cheio, e não só as primeiras 1.000', async () => {
    // O defeito de 23/09: "Este ano" pedia tudo de uma vez e o Supabase
    // devolvia só 1.000, sem erro — o faturamento saía de uma parte qualquer.
    const { montar, pedidos } = bancoComLimite(2500);
    const tudo = await buscarEmPaginas<{ id: number }>(montar);
    expect(tudo).toHaveLength(2500);
    expect(tudo[2499].id).toBe(2499);
    expect(pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('exatamente 1.000 linhas: pede a página seguinte para ter certeza de que acabou', async () => {
    const { montar, pedidos } = bancoComLimite(1000);
    expect(await buscarEmPaginas(montar)).toHaveLength(1000);
    expect(pedidos).toHaveLength(2);
  });

  it('consulta pequena resolve num pedido só', async () => {
    const { montar, pedidos } = bancoComLimite(37);
    expect(await buscarEmPaginas(montar)).toHaveLength(37);
    expect(pedidos).toHaveLength(1);
  });

  it('erro do banco sobe, não vira lista vazia', async () => {
    // Vazio é "não tem nada"; erro é "não sei". Tratar os dois igual já deu
    // defeito duas vezes neste sistema (PDV em 21/08, obrigatórios em 02/09).
    const montar = () => ({
      range: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
    });
    await expect(buscarEmPaginas(montar)).rejects.toEqual({ message: 'permission denied' });
  });
});
