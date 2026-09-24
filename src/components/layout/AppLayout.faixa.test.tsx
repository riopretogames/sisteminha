import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CHAVE_ENTROU_COMO, gravarEntrouComo } from '@/lib/entrarComo';

/**
 * A faixa amarela de "Entrar como" (revisão de 24/09, achados 16 e 20).
 *
 * O que estes testes seguram:
 * - a faixa aparece para QUEM ESTÁ LOGADO ser a pessoa da marca — em
 *   qualquer aba, e depois de fechar e abrir o navegador (a marca mora no
 *   mesmo lugar da sessão de login);
 * - quem saiu pelo menu e entrou com a própria senha não vê faixa nenhuma;
 * - a aba que trocou de conta ANTES de a outra aba gravar a marca acende a
 *   faixa assim que a marca chega;
 * - "Sair e voltar" sai só desta sessão (não derruba o Richard de verdade
 *   nos aparelhos dele) e recarrega a página inteira.
 */

const mockUsuario = vi.hoisted(() => ({ id: 'u-richard' as string | null }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUsuario.id ? { id: mockUsuario.id, roles: [], permissions: [] } : null,
    session: {},
    loading: false,
    can: () => true,
    canAny: () => true,
    hasRole: () => false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    avisoDeEntrada: null,
  }),
}));

const mockSignOut = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signOut: mockSignOut } },
}));

// O menu e o cabeçalho têm testes próprios; aqui só atrapalhariam.
vi.mock('@/components/Sidebar', () => ({ AppSidebar: () => <nav>menu</nav> }));
vi.mock('./AppHeader', () => ({ AppHeader: () => <header>cabeçalho</header> }));
vi.mock('./AbasDaSecao', () => ({ AbasDaSecao: () => null }));

const MARCA = { alvoId: 'u-richard', nome: 'Richard Sanches', por: 'Felipe Bottaro', quando: '2026-09-24T15:00:00Z' };

async function abrirTela() {
  const { AppLayout } = await import('./AppLayout');
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/home" element={<p>Início</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const faixa = () => screen.queryByText(/Você está vendo o sistema como/);

describe('Faixa do "Entrar como"', () => {
  const assignOriginal = window.location.assign;
  const assign = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockUsuario.id = 'u-richard';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignOriginal },
    });
  });

  it('aparece quando quem está logado é a pessoa da marca (qualquer aba: a marca é do navegador)', async () => {
    gravarEntrouComo(MARCA);
    await abrirTela();
    expect(faixa()).toHaveTextContent('Richard Sanches');
    expect(faixa()).toHaveTextContent('Felipe Bottaro');
  });

  it('não aparece para outra pessoa — o Felipe que saiu pelo menu e entrou com a senha dele (achado 20)', async () => {
    gravarEntrouComo(MARCA);
    mockUsuario.id = 'u-felipe';
    await abrirTela();
    expect(faixa()).not.toBeInTheDocument();
  });

  it('a marca da versão antiga (só na aba, sem o id) não acende faixa', async () => {
    sessionStorage.setItem(CHAVE_ENTROU_COMO, JSON.stringify({ nome: 'Richard', por: 'Felipe' }));
    await abrirTela();
    expect(faixa()).not.toBeInTheDocument();
  });

  it('acende quando a outra aba grava a marca depois (a troca de conta chegou antes)', async () => {
    await abrirTela();
    expect(faixa()).not.toBeInTheDocument();

    act(() => {
      gravarEntrouComo(MARCA);
      // O navegador avisa as OUTRAS abas quando o armazenamento muda.
      window.dispatchEvent(new StorageEvent('storage', { key: CHAVE_ENTROU_COMO }));
    });
    expect(faixa()).toHaveTextContent('Richard Sanches');
  });

  it('"Sair e voltar" sai só desta sessão, apaga a marca e recarrega a página', async () => {
    gravarEntrouComo(MARCA);
    await abrirTela();

    fireEvent.click(screen.getByRole('button', { name: /Sair e voltar para a minha conta/ }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringMatching(/\/login$/)));
    // `local`: o padrão (global) derrubaria o Richard no balcão e no celular.
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(localStorage.getItem(CHAVE_ENTROU_COMO)).toBeNull();
  });

  it('entrou pelo link numa janela sem conta (sem "por"): o botão não promete "voltar para a minha conta"', async () => {
    gravarEntrouComo({ ...MARCA, por: '' });
    await abrirTela();
    expect(screen.getByRole('button', { name: 'Sair desta conta' })).toBeInTheDocument();
  });
});
