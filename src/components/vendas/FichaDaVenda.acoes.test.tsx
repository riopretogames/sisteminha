import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * A ficha da venda é a segunda porta da devolução (achado 26, de 24/09).
 *
 * A Troca e Devolução começava só por uma lista das vendas recentes. Quem acha
 * a venda pelo Histórico — que filtra por período, produto e IMEI — agora vai
 * direto para a devolução dela, e também reimprime o comprovante dali.
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

const VENDA = {
  id: 'v1',
  numero_venda: 'OV0001',
  created_at: '2026-07-01T14:00:00Z',
  status: 'pago',
  total: 3500,
  subtotal: 3500,
  descontos: 0,
  vendedor_id: 'vend-1',
  clientes: { nome: 'Joana', telefones: [], cpf_cnpj: null },
  vendedor: { nome: 'Bruno' },
};

/** Mostra para onde a ficha mandou, com o endereço completo. */
function Destino() {
  const { pathname, search } = useLocation();
  return <p>destino: {pathname + search}</p>;
}

async function abrir(perfil: 'administrador' | 'vendedor', status = 'pago') {
  mockCan.mockImplementation(montarCan({ perfil }));
  mockSupabase.atual = bancoFalso({ vendas: [{ ...VENDA, status }], profiles: [] });
  const { FichaDaVenda } = await import('./FichaDaVenda');
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/vendas/historico']}>
        <Routes>
          <Route path="/vendas/historico" element={<FichaDaVenda vendaId="v1" aoFechar={() => {}} />} />
          <Route path="*" element={<Destino />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Ficha da venda: as ações do balcão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('"Trocar ou devolver" leva à devolução já com esta venda escolhida', async () => {
    await abrir('administrador');

    fireEvent.click(await screen.findByRole('button', { name: /trocar ou devolver/i }));

    expect(await screen.findByText('destino: /vendas/troca-devolucao?venda=v1')).toBeInTheDocument();
  });

  it('quem não pode devolver (sem "Cancelar venda") não vê o botão', async () => {
    await abrir('vendedor');

    expect(await screen.findByRole('button', { name: /imprimir comprovante/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /trocar ou devolver/i })).not.toBeInTheDocument();
  });

  it('venda cancelada não oferece devolução', async () => {
    await abrir('administrador', 'cancelado');

    expect(await screen.findByRole('button', { name: /imprimir comprovante/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /trocar ou devolver/i })).not.toBeInTheDocument();
  });

  it('o comprovante reimprime direto da ficha', async () => {
    await abrir('vendedor');

    fireEvent.click(await screen.findByRole('button', { name: /imprimir comprovante/i }));

    expect(await screen.findByText('destino: /vendas/v1/comprovante')).toBeInTheDocument();
  });
});
