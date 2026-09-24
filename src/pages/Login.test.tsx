import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { silenciarConsole } from '@/test/apoio';
import { CHAVE_ENTROU_COMO } from '@/lib/entrarComo';

/**
 * Tela de entrada.
 *
 * Achado 75 (revisão de 24/09): o link de "Copiar link" do "Entrar como" era
 * aplicado MESMO com alguém já logado naquele navegador. Colado numa janela
 * normal (em vez da anônima), trocava a conta do administrador pela do
 * funcionário em todas as abas, sem faixa nenhuma — e a venda feita ali saía no
 * nome errado.
 *
 * Achado 82: conta desativada é posta para fora; aqui a tela precisa DIZER o
 * motivo.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const estado = vi.hoisted(() => ({
  aviso: null as string | null,
  sessao: null as unknown,
  verifyOtp: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    loading: false,
    signIn: vi.fn(() => Promise.resolve({ error: null })),
    signOut: vi.fn(),
    can: () => false,
    canAny: () => false,
    hasRole: () => false,
    avisoDeEntrada: estado.aviso,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: estado.sessao } }),
      verifyOtp: (...a: unknown[]) => estado.verifyOtp(...a),
    },
  },
}));

async function abrir(endereco: string) {
  const { default: Login } = await import('./Login');
  return render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<p>Tela inicial</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Tela de entrada', () => {
  beforeEach(() => {
    vi.resetModules();
    silenciarConsole();
    localStorage.clear();
    estado.aviso = null;
    estado.sessao = null;
    estado.verifyOtp = vi.fn(() =>
      Promise.resolve({
        data: { user: { id: 'u-richard', email: 'richard@loja.com', user_metadata: { nome: 'Richard Sanches' } } },
        error: null,
      }),
    );
  });

  it('com alguém já logado, o link de acesso NÃO é usado e a tela explica', async () => {
    estado.sessao = { user: { id: 'u-felipe' } };
    await abrir('/login?acesso=abc123');

    await waitFor(() => {
      expect(screen.getByText(/já tem uma conta aberta neste navegador/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/janela anônima/i)).toBeInTheDocument();
    expect(estado.verifyOtp).not.toHaveBeenCalled();
    expect(localStorage.getItem(CHAVE_ENTROU_COMO)).toBeNull();
  });

  it('sem ninguém logado (janela anônima), o link entra e acende a faixa', async () => {
    await abrir('/login?acesso=abc123');

    await waitFor(() => {
      expect(screen.getByText('Tela inicial')).toBeInTheDocument();
    });
    expect(estado.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'magiclink' });
    // A marca da faixa amarela, amarrada à conta em que se entrou.
    const marca = JSON.parse(localStorage.getItem(CHAVE_ENTROU_COMO) ?? '{}');
    expect(marca.alvoId).toBe('u-richard');
    expect(marca.nome).toBe('Richard Sanches');
  });

  it('link vencido não acende faixa nenhuma', async () => {
    estado.verifyOtp = vi.fn(() =>
      Promise.resolve({ data: { user: null }, error: { message: 'Email link is invalid or has expired' } }),
    );
    await abrir('/login?acesso=velho');

    await waitFor(() => {
      expect(estado.verifyOtp).toHaveBeenCalled();
    });
    expect(localStorage.getItem(CHAVE_ENTROU_COMO)).toBeNull();
    expect(screen.queryByText('Tela inicial')).not.toBeInTheDocument();
  });

  it('mostra por que a pessoa foi posta para fora (conta desativada)', async () => {
    estado.aviso = 'Sua conta está desativada. Fale com o administrador da loja para liberar o seu acesso.';
    await abrir('/login');

    expect(screen.getByRole('alert')).toHaveTextContent(/sua conta está desativada/i);
  });
});
