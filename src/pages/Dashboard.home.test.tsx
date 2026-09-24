import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';
import type { Permission } from '@/config/permissions';

/**
 * A Home e o cartão "OS Abertas" (achado 61, revisão de 24/09/2026).
 *
 * Em 15/09 os cartões de dinheiro passaram a aparecer só para quem vê venda
 * ou financeiro — e o cartão de OS foi junto, por engano. O técnico e o
 * gerente técnico (o Leo, gerente da assistência) abriam a Home sem saber
 * quantas OS estavam abertas.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'u1', tenant_id: 'loja-1', nome: 'Leo' } },
    session: {},
    loading: false,
    can: (p: string) => mockCan(p),
    canAny: (ps: string[]) => ps.some((p) => mockCan(p)),
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

async function abrirHome(perfil: 'tecnico' | 'gerente_tecnico' | 'administrador') {
  const can = montarCan({ perfil });
  mockCan.mockImplementation((p: string) => can(p as Permission));
  mockSupabase.atual = bancoFalso({
    service_orders: [{ id: 'o1', status: 'aprovado' }, { id: 'o2', status: 'aguardando_aprovacao' }],
    vendas: [],
    devolucoes: [],
    vw_produtos: [],
  });
  const { default: Dashboard } = await import('./Dashboard');
  renderizarTela(<Dashboard />);
}

describe('Home — cartão OS Abertas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('o técnico vê quantas OS estão abertas, mesmo sem ver venda', async () => {
    await abrirHome('tecnico');
    await waitFor(() => expect(screen.getByText('OS Abertas')).toBeInTheDocument());
    // E continua sem os cartões de dinheiro.
    expect(screen.queryByText('Caixa Hoje')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendas Hoje')).not.toBeInTheDocument();
  });

  it('o gerente técnico também vê', async () => {
    await abrirHome('gerente_tecnico');
    await waitFor(() => expect(screen.getByText('OS Abertas')).toBeInTheDocument());
  });

  it('o administrador vê o cartão de OS e os de dinheiro', async () => {
    await abrirHome('administrador');
    await waitFor(() => expect(screen.getByText('OS Abertas')).toBeInTheDocument());
    expect(screen.getByText('Caixa Hoje')).toBeInTheDocument();
  });
});
