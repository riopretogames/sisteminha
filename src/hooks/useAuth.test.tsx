import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bancoFalso, silenciarConsole } from '@/test/apoio';
import { CHAVE_ENTROU_COMO } from '@/lib/entrarComo';

/**
 * Quem entra no sistema, e quem é posto para fora.
 *
 * Achado 82 (revisão de 24/09): conta DESATIVADA entrava. O banco já não
 * entregava nada a ela, mas a pessoa caía numa tela dizendo "sua conta ainda
 * não tem um perfil de acesso" — e o Felipe abria a ficha, via o perfil
 * preenchido e não entendia. O caso comum é o "Trazer de volta" de Usuários,
 * que devolve a pessoa INATIVA de propósito.
 */

const estado = vi.hoisted(() => ({
  banco: null as unknown as Record<string, unknown>,
  sessao: null as null | { user: { id: string } },
  signOut: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return estado.banco;
  },
}));

function montarBanco(perfil: Record<string, unknown> | null) {
  const banco = bancoFalso({
    profiles: perfil ? [perfil] : [],
    user_roles: [{ role: 'vendedor' }],
    'rpc:minhas_permissoes': ['home.view', 'sales.view'],
  }) as unknown as Record<string, unknown>;
  estado.signOut = vi.fn(() => Promise.resolve({ error: null }));
  banco.auth = {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    getSession: () => Promise.resolve({ data: { session: estado.sessao } }),
    signOut: estado.signOut,
    signInWithPassword: vi.fn(() => Promise.resolve({ error: null })),
  };
  estado.banco = banco;
}

async function renderizar(queryClient = new QueryClient()) {
  const { AuthProvider, useAuth } = await import('./useAuth');
  function QuemEsta() {
    const { user, loading, avisoDeEntrada } = useAuth();
    if (loading) return <p>carregando</p>;
    return (
      <div>
        <p>{user ? `logado: ${user.id}` : 'ninguém logado'}</p>
        {avisoDeEntrada && <p role="alert">{avisoDeEntrada}</p>}
      </div>
    );
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <QuemEsta />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Entrada no sistema (useAuth)', () => {
  beforeEach(() => {
    vi.resetModules();
    silenciarConsole();
    localStorage.clear();
    estado.sessao = { user: { id: 'u-richard' } };
  });

  it('conta ativa entra normalmente', async () => {
    montarBanco({ id: 'u-richard', nome: 'Richard', ativo: true, arquivado_em: null });
    await renderizar();

    await waitFor(() => {
      expect(screen.getByText('logado: u-richard')).toBeInTheDocument();
    });
    expect(estado.signOut).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('conta desativada é posta para fora, com o motivo certo (não "sem perfil")', async () => {
    montarBanco({ id: 'u-richard', nome: 'Richard', ativo: false, arquivado_em: null });
    await renderizar();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/sua conta está desativada/i);
    });
    expect(screen.getByText('ninguém logado')).toBeInTheDocument();
    expect(estado.signOut).toHaveBeenCalled();
  });

  it('cadastro que não pôde ser lido NÃO põe ninguém para fora', async () => {
    // Sem internet, a leitura falha e o cadastro vem vazio: isso não é "conta
    // desativada". Pôr para fora aqui trancaria a loja por uma queda de rede.
    montarBanco(null);
    await renderizar();

    await waitFor(() => {
      expect(screen.getByText('logado: u-richard')).toBeInTheDocument();
    });
    expect(estado.signOut).not.toHaveBeenCalled();
  });

  it('a marca de "Entrar como" de OUTRA pessoa é apagada quando entra esta conta', async () => {
    // O Felipe entrou como o Leo ontem e saiu fechando o navegador; hoje o
    // Richard entra com a senha dele. A faixa não pode acender dizendo que ele
    // é o Leo.
    localStorage.setItem(
      CHAVE_ENTROU_COMO,
      JSON.stringify({ alvoId: 'u-leo', nome: 'Leo', por: 'Felipe', quando: '' }),
    );
    montarBanco({ id: 'u-richard', nome: 'Richard', ativo: true, arquivado_em: null });
    await renderizar();

    await waitFor(() => {
      expect(screen.getByText('logado: u-richard')).toBeInTheDocument();
    });
    expect(localStorage.getItem(CHAVE_ENTROU_COMO)).toBeNull();
  });

  it('a marca de "Entrar como" DESTA conta continua (é a faixa que tem que aparecer)', async () => {
    localStorage.setItem(
      CHAVE_ENTROU_COMO,
      JSON.stringify({ alvoId: 'u-richard', nome: 'Richard', por: 'Felipe', quando: '' }),
    );
    montarBanco({ id: 'u-richard', nome: 'Richard', ativo: true, arquivado_em: null });
    await renderizar();

    await waitFor(() => {
      expect(screen.getByText('logado: u-richard')).toBeInTheDocument();
    });
    expect(localStorage.getItem(CHAVE_ENTROU_COMO)).not.toBeNull();
  });

  it('sem ninguém logado, a marca de "Entrar como" some', async () => {
    estado.sessao = null;
    localStorage.setItem(
      CHAVE_ENTROU_COMO,
      JSON.stringify({ alvoId: 'u-richard', nome: 'Richard', por: 'Felipe', quando: '' }),
    );
    montarBanco(null);
    await renderizar();

    await waitFor(() => {
      expect(screen.getByText('ninguém logado')).toBeInTheDocument();
    });
    expect(localStorage.getItem(CHAVE_ENTROU_COMO)).toBeNull();
  });

  it('quem sai leva junto o que a tela guardou dele (balcão: Pedro sai, Gabriel entra)', async () => {
    // Achado 21: a lista de Minhas Tarefas do Pedro ficava na memória da aba
    // e piscava para o Gabriel enquanto a dele carregava.
    const queryClient = new QueryClient();
    queryClient.setQueryData(['minhas-tarefas', 'u-pedro', '2026-09-24'], [{ id: 't1' }]);
    estado.sessao = null;
    montarBanco(null);
    await renderizar(queryClient);

    await waitFor(() => {
      expect(screen.getByText('ninguém logado')).toBeInTheDocument();
    });
    expect(queryClient.getQueryData(['minhas-tarefas', 'u-pedro', '2026-09-24'])).toBeUndefined();
  });
});
