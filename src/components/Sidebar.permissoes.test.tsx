import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderizarTela, montarCan, silenciarConsole } from '@/test/apoio';

/**
 * O menu lateral visto por cada perfil.
 *
 * Este arquivo rende mais que qualquer outro teste do projeto, porque o menu
 * é a porta de tudo: se um item aparece para quem não pode entrar, a pessoa
 * clica e toma erro — ou pior, abre uma tela vazia e acha que a loja não tem
 * dado nenhum. Esse engano exato já aconteceu quatro vezes aqui.
 *
 * Cobre de uma vez vários passos que o roteiro manual mandava fazer entrando
 * no sistema com um segundo usuário, em janela anônima.
 */

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'teste@loja.com' },
    session: {},
    loading: false,
    can: (p: string) => mockCan(p),
    canAny: () => true,
    hasRole: () => false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  },
}));

async function abrirMenu(perfil: 'administrador' | 'vendedor' | 'tecnico') {
  mockCan.mockImplementation(montarCan({ perfil }));
  const { AppSidebar } = await import('./Sidebar');
  return renderizarTela(<AppSidebar />);
}

/** O menu é em sanfona: as seções aparecem sempre, os itens só ao abrir. */
function secaoVisivel(nome: RegExp) {
  return screen.queryAllByText(nome).length > 0;
}

describe('Menu lateral por perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('o Vendedor NÃO vê Financeiro', async () => {
    // Teste 6 do roteiro: a regra é "ou abre com dados, ou some do menu". O
    // que não pode é abrir vazia, parecendo que não há lançamento nenhum.
    await abrirMenu('vendedor');
    expect(secaoVisivel(/^Financeiro$/)).toBe(false);
  });

  it('o Vendedor NÃO vê Cadastros de sistema (Usuários mora lá)', async () => {
    await abrirMenu('vendedor');
    expect(secaoVisivel(/^Configurações$/)).toBe(false);
  });

  it('o Vendedor VÊ Venda e Estoque — o que ele precisa para atender', async () => {
    await abrirMenu('vendedor');
    expect(secaoVisivel(/^Venda$/)).toBe(true);
    expect(secaoVisivel(/^Estoque$/)).toBe(true);
  });

  it('o Técnico NÃO vê Financeiro, mas VÊ Estoque', async () => {
    // Ele precisa saber se tem peça; não precisa ver o caixa da loja.
    await abrirMenu('tecnico');
    expect(secaoVisivel(/^Financeiro$/)).toBe(false);
    expect(secaoVisivel(/^Estoque$/)).toBe(true);
  });

  it('o Administrador vê tudo', async () => {
    await abrirMenu('administrador');
    for (const secao of [/^Venda$/, /^Estoque$/, /^Financeiro$/, /^Configurações$/]) {
      expect(secaoVisivel(secao)).toBe(true);
    }
  });

  it('nenhum perfil vê o menu vazio — sempre há por onde começar', async () => {
    // Menu em branco é o pior resultado: a pessoa entra e não tem o que
    // clicar, sem nenhuma explicação.
    for (const perfil of ['administrador', 'vendedor', 'tecnico'] as const) {
      vi.resetModules();
      const { unmount } = await abrirMenu(perfil);
      expect(screen.queryAllByRole('link').length + screen.queryAllByRole('button').length)
        .toBeGreaterThan(0);
      unmount();
    }
  });
});
