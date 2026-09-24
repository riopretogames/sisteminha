import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderizarTela, silenciarConsole } from '@/test/apoio';

/**
 * OS Finalizadas — achado da revisão de 24/09: a lista parava em 500, ordenada
 * pela data de finalização, que a OS cancelada não tem. Com mais de 500
 * entregas, nenhuma cancelada aparecia, e a receita somava só as 500 carregadas.
 *
 * Aqui: a lista é buscada em páginas (sem `.limit`) e a cancelada entra na
 * ordem pela data em que parou, junto das entregues.
 */

vi.mock('@/hooks/useCatalogos', () => ({
  useCatalogo: () => ({ data: [], isLoading: false }),
}));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

const LINHAS = [
  {
    id: 'a', numero_os: 'OS-ANTIGA', status: 'entregue', modelo: null, marca: 'Sony',
    numero_serie: null, equipamento_id: null, marca_id: null, modelo_id: null, tecnico_id: null,
    valor_final_pago: 100, data_finalizacao: '2026-08-01T10:00:00+00:00',
    created_at: '2026-07-30T10:00:00+00:00', updated_at: '2026-08-01T10:00:00+00:00',
    clientes: { nome: 'Cliente A', telefones: [] },
  },
  {
    id: 'c', numero_os: 'OS-CANCELADA-ONTEM', status: 'cancelado', modelo: null, marca: 'LG',
    numero_serie: null, equipamento_id: null, marca_id: null, modelo_id: null, tecnico_id: null,
    valor_final_pago: null, data_finalizacao: null,
    created_at: '2026-09-01T10:00:00+00:00', updated_at: '2026-09-23T10:00:00+00:00',
    clientes: { nome: 'Cliente C', telefones: [] },
  },
  {
    id: 'b', numero_os: 'OS-SETEMBRO', status: 'entregue', modelo: null, marca: 'Sony',
    numero_serie: null, equipamento_id: null, marca_id: null, modelo_id: null, tecnico_id: null,
    valor_final_pago: 200, data_finalizacao: '2026-09-10T10:00:00+00:00',
    created_at: '2026-09-05T10:00:00+00:00', updated_at: '2026-09-10T10:00:00+00:00',
    clientes: { nome: 'Cliente B', telefones: [] },
  },
];

/** Banco que registra se alguém pediu `.limit()` — o corte calado de antes. */
function montarBanco() {
  const pedidos: string[] = [];
  const consulta = (dados: unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'not', 'gte']) c[m] = () => c;
    c.limit = () => {
      pedidos.push('limit');
      return c;
    };
    c.range = () => {
      pedidos.push('range');
      return c;
    };
    c.then = (aceitar: (r: unknown) => unknown) =>
      Promise.resolve({ data: dados, error: null }).then(aceitar);
    return c;
  };
  return {
    pedidos,
    banco: {
      from: (tabela: string) => consulta(tabela === 'service_orders' ? LINHAS : []),
    },
  };
}

describe('OS Finalizadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('busca em páginas, sem cortar em 500, e põe a cancelada na data em que parou', async () => {
    const { banco, pedidos } = montarBanco();
    mockSupabase.atual = banco;
    const { default: OSFinalizadas } = await import('./OSFinalizadas');
    renderizarTela(<OSFinalizadas />);

    await screen.findByText('OS-CANCELADA-ONTEM');
    expect(pedidos).toContain('range');
    expect(pedidos).not.toContain('limit');

    const linhas = screen.getAllByRole('row').slice(1); // sem o cabeçalho
    const ordem = linhas.map((l) => within(l).getAllByRole('cell')[0].textContent);
    expect(ordem).toEqual(['OS-CANCELADA-ONTEM', 'OS-SETEMBRO', 'OS-ANTIGA']);
  });
});
