import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * IE Comercial: o desconto da venda sai da receita (achado 62, revisão de
 * 24/09/2026).
 *
 * A receita somava o preço CHEIO de cada item. O desconto dado na venda
 * inteira nunca saía: agosto de 2026 mostrava R$ 37.371,20 de receita com
 * R$ 36.871,20 vendidos — R$ 500 a mais de receita e de lucro.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'u1', tenant_id: 'loja-1' } },
    session: {},
    loading: false,
    can: () => true,
    canAny: () => true,
    hasRole: () => false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

const PS5 = { id: 'ps5', nome: 'PS5', categoria: 'console', custo: 1000 };

function cartao(rotulo: string) {
  // O rótulo do cartão é um <p>; o cabeçalho da tabela tem o mesmo texto.
  return screen.getByText(rotulo, { selector: 'p' }).parentElement as HTMLElement;
}

async function abrir(tabelas: Record<string, unknown[]>) {
  mockSupabase.atual = bancoFalso(tabelas);
  const { default: IeComercial } = await import('./IeComercial');
  renderizarTela(<IeComercial />);
}

describe('IE Comercial — receita e lucro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('venda de R$ 2.000 com R$ 500 de desconto vira R$ 1.500 de receita, não R$ 2.000', async () => {
    await abrir({
      vendas: [
        {
          id: 'v1', created_at: '2026-08-10T10:00:00', status: 'pago', total: 1500,
          itens_venda: [{ quantidade: 1, preco_unitario: 2000, total: 2000, produtos: PS5 }],
        },
      ],
      devolucao_itens: [],
    });

    await waitFor(() => expect(cartao('Receita')).toHaveTextContent(/1\.500,00/));
    // Custo 1.000: o lucro é 500, e não os 1.000 que o preço cheio dava.
    expect(cartao('Lucro do período')).toHaveTextContent(/R\$\s*500,00/);
  });

  it('a devolução sai com o mesmo desconto que a venda teve', async () => {
    // Dois PS5 de 2.000 com R$ 1.000 de desconto na venda (cobrou 3.000, ou
    // 1.500 cada). Um voltou: sai 1.500 da receita, não 2.000.
    await abrir({
      vendas: [
        {
          id: 'v1', created_at: '2026-08-10T10:00:00', status: 'pago', total: 3000,
          itens_venda: [{ quantidade: 2, preco_unitario: 2000, total: 4000, produtos: PS5 }],
        },
      ],
      devolucao_itens: [
        {
          id: 'di1', produto_id: 'ps5', quantidade: 1, preco_unitario: 2000,
          devolucoes: {
            created_at: '2026-08-12T10:00:00',
            venda_original: { total: 3000, itens_venda: [{ total: 4000 }] },
          },
        },
      ],
    });

    await waitFor(() => expect(cartao('Receita')).toHaveTextContent(/1\.500,00/));
  });
});
