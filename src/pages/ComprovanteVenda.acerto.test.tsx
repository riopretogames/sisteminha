import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * O comprovante explica o troco e o crédito da troca (achado de 24/09).
 *
 * O pagamento é gravado pelo valor ENTREGUE. Sem estas linhas, o papel mostrava
 * "Dinheiro R$ 100,00" numa venda de R$ 80 — e, na venda nova de uma troca,
 * "Total R$ 429,90" com pagamento de só R$ 80,90, como se o cliente tivesse
 * ficado devendo.
 */

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'p1', tenant_id: 'loja-1' } },
    session: {},
    loading: false,
    can: (p: string) => mockCan(p),
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

const venda = (total: number) => ({
  id: 'v1',
  numero_venda: 'OV0100',
  created_at: '2026-09-20T15:00:00Z',
  status: 'pago',
  subtotal: total,
  descontos: 0,
  total,
  observacoes: null,
  clientes: { nome: 'Adriana Prado', cpf_cnpj: null, telefones: [] },
  vendedor: { nome: 'Ana' },
});

const pagamento = (valor: number, descricao: string, forma: string) => ({
  id: `pg-${valor}`,
  forma,
  parcelas: 1,
  valor,
  created_at: '2026-09-20T15:00:00Z',
  formas_pagamento: { descricao, contem_taxa: false, taxa_percent: 0 },
});

async function abrir(tabelas: Record<string, unknown[]>) {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  mockSupabase.atual = bancoFalso({
    itens_venda: [],
    catalogos: [],
    tenants: [{ nome_loja: 'Rio Preto Games' }],
    ...tabelas,
  });
  const { default: ComprovanteVenda } = await import('./ComprovanteVenda');
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/vendas/v1/comprovante']}>
        <Routes>
          <Route path="/vendas/:id/comprovante" element={<ComprovanteVenda />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Comprovante de venda: troco e crédito da troca', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('venda de R$ 80 paga com R$ 100 em dinheiro mostra o troco de R$ 20', async () => {
    await abrir({
      vendas: [venda(80)],
      pagamentos_venda: [pagamento(100, 'Dinheiro', 'dinheiro')],
      devolucoes: [],
    });

    const troco = await screen.findByText('Troco');
    expect(troco.parentElement!.textContent).toMatch(/20,00/);
    expect(screen.queryByText(/Crédito da devolução/)).not.toBeInTheDocument();
  });

  it('venda nova de troca mostra de onde veio o resto do total', async () => {
    await abrir({
      vendas: [venda(429.9)],
      pagamentos_venda: [pagamento(80.9, 'PIX', 'pix')],
      devolucoes: [{ numero_devolucao: 'DV-0003' }],
    });

    const credito = await screen.findByText(/Crédito da devolução DV-0003/);
    expect(credito.parentElement!.textContent).toMatch(/349,00/);
    expect(screen.queryByText('Troco')).not.toBeInTheDocument();
  });

  it('venda comum paga certinho não ganha linha nenhuma', async () => {
    await abrir({
      vendas: [venda(80)],
      pagamentos_venda: [pagamento(80, 'PIX', 'pix')],
      devolucoes: [],
    });

    // Espera o pagamento chegar antes de afirmar que nada apareceu.
    await screen.findAllByText(/PIX/);
    expect(screen.queryByText('Troco')).not.toBeInTheDocument();
    expect(screen.queryByText(/Crédito da devolução/)).not.toBeInTheDocument();
  });
});
