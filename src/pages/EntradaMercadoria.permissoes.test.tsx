import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Entrada de Mercadoria vista por quem não tem as duas permissões.
 *
 * Dar entrada exige `inventory.adjust` E `inventory.cost.view` juntas, porque
 * cada linha da tela é um preço de compra. O que este teste garante é que
 * faltar uma delas produz um AVISO DIZENDO QUAL FALTA — e não a tela abrindo
 * com uma lista vazia.
 *
 * A diferença importa: lista vazia parece "ainda não houve nenhuma entrada",
 * e quem está olhando não tem como saber que na verdade é falta de crachá.
 * Esse engano exato já aconteceu em quatro telas deste sistema.
 */

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
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

async function abrir(opcoes: Parameters<typeof montarCan>[0]) {
  mockCan.mockImplementation(montarCan(opcoes));
  mockSupabase.atual = bancoFalso({ entradas_mercadoria: [], fornecedores: [] });
  const { default: EntradaMercadoria } = await import('./EntradaMercadoria');
  return renderizarTela(<EntradaMercadoria />);
}

describe('Entrada de Mercadoria por perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('sem permissão de movimentar estoque: AVISA, não abre vazia', async () => {
    await abrir({ perfil: 'vendedor' });

    await waitFor(() => {
      expect(screen.getByText(/não está liberada para o seu perfil/i)).toBeInTheDocument();
    });
    // Diz QUAL falta, em vez de um "sem permissão" genérico.
    expect(screen.getByText(/lançar movimentação de estoque/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nova entrada/i })).not.toBeInTheDocument();
  });

  it('com movimentação mas SEM ver custo: também avisa, e diz que falta o custo', async () => {
    // Caso sutil: o técnico tem `inventory.adjust`, mas não vê custo. A tela
    // inteira é sobre preço de compra, então não adianta abrir escondendo
    // coluna — teria que esconder tudo.
    await abrir({ perfil: 'tecnico' });

    await waitFor(() => {
      expect(screen.getByText(/não está liberada para o seu perfil/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/ver custo e margem/i)).toBeInTheDocument();
  });

  it('com as duas permissões: a tela abre de verdade, com o botão de nova entrada', async () => {
    await abrir({ perfil: 'administrador' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /nova entrada/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/não está liberada/i)).not.toBeInTheDocument();
  });

  it('explica que as duas permissões andam juntas', async () => {
    await abrir({ perfil: 'tecnico' });

    await waitFor(() => {
      expect(screen.getByText(/as duas permissões juntas/i)).toBeInTheDocument();
    });
  });
});
