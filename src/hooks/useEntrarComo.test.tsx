import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CHAVE_ENTROU_COMO, lerEntrouComo } from '@/lib/entrarComo';

/**
 * Os botões "Entrar como" e "Copiar link" (revisão de 24/09).
 *
 * - "Entrar como" grava a marca da faixa COM o id da pessoa (achado 16): é
 *   ele que faz a faixa acender em qualquer aba em que essa pessoa estiver.
 * - "Copiar link" avisa o servidor que é só um link (achado 23): a auditoria
 *   registra "gerou acesso", não "entrou como".
 * - Nada em inglês na tela: acesso vencido e área de transferência recusada
 *   viram frase de balcão; e se não der para copiar, o link aparece para
 *   copiar à mão, em vez de se perder (ele já está na auditoria).
 */

const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-felipe', profile: { id: 'u-felipe', nome: 'Felipe Bottaro' } },
    session: {},
    loading: false,
    can: () => true,
    canAny: () => true,
    hasRole: () => false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const mockSupabase = vi.hoisted(() => ({
  invoke: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mockSupabase.invoke },
    auth: { verifyOtp: mockSupabase.verifyOtp },
  },
}));

function envolver() {
  const cliente = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
}

async function usar() {
  const { useEntrarComo } = await import('./useEntrarComo');
  return renderHook(() => useEntrarComo(), { wrapper: envolver() }).result;
}

describe('useEntrarComo', () => {
  const locationOriginal = window.location;
  const assign = vi.fn();
  const writeText = vi.fn();
  const prompt = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSupabase.invoke.mockResolvedValue({ data: { token_hash: 'hash-123', nome: 'Richard Sanches' }, error: null });
    mockSupabase.verifyOtp.mockResolvedValue({ data: {}, error: null });
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...locationOriginal, origin: 'https://riopretogames.com.br', assign },
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.spyOn(window, 'prompt').mockImplementation(prompt);
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: locationOriginal });
    vi.restoreAllMocks();
  });

  it('"Entrar como" troca a sessão e grava a marca com o id da pessoa e quem entrou', async () => {
    const resultado = await usar();
    resultado.current.entrarComo.mutate({ userId: 'u-richard', nome: 'Richard' });

    await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringMatching(/\/home$/)));
    expect(mockSupabase.invoke).toHaveBeenCalledWith('admin-usuarios', {
      body: { acao: 'entrar_como', user_id: 'u-richard', modo: 'entrar' },
    });
    expect(mockSupabase.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-123', type: 'magiclink' });
    expect(lerEntrouComo()).toEqual(
      expect.objectContaining({ alvoId: 'u-richard', nome: 'Richard Sanches', por: 'Felipe Bottaro' }),
    );
  });

  it('acesso vencido: aviso em português e nenhuma marca gravada', async () => {
    mockSupabase.verifyOtp.mockResolvedValue({ data: {}, error: new Error('Email link is invalid or has expired') });
    const resultado = await usar();
    resultado.current.entrarComo.mutate({ userId: 'u-richard', nome: 'Richard' });

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Não foi possível entrar como essa pessoa',
          description: 'Esse acesso não vale mais (ele vale por uma hora e só uma vez). Peça outro.',
        }),
      ),
    );
    expect(localStorage.getItem(CHAVE_ENTROU_COMO)).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('"Copiar link" avisa o servidor que é só um link e copia o endereço certo', async () => {
    const resultado = await usar();
    resultado.current.linkDeAcesso.mutate('u-richard');

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Link copiado' })),
    );
    expect(mockSupabase.invoke).toHaveBeenCalledWith('admin-usuarios', {
      body: { acao: 'entrar_como', user_id: 'u-richard', modo: 'link' },
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/login\?acesso=hash-123$/));
    // O link não troca a conta de ninguém aqui, e não acende faixa.
    expect(mockSupabase.verifyOtp).not.toHaveBeenCalled();
    expect(localStorage.getItem(CHAVE_ENTROU_COMO)).toBeNull();
  });

  it('o navegador não deixou copiar: o link aparece para copiar à mão, em vez de se perder', async () => {
    const recusa = new Error('Document is not focused.');
    recusa.name = 'NotAllowedError';
    writeText.mockRejectedValue(recusa);
    const resultado = await usar();
    resultado.current.linkDeAcesso.mutate('u-richard');

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Link gerado' })),
    );
    expect(prompt).toHaveBeenCalledWith(expect.stringMatching(/copiar/i), expect.stringMatching(/acesso=hash-123/));
  });

  it('recusa do servidor chega com a frase dele, em português', async () => {
    mockSupabase.invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: { json: () => Promise.resolve({ erro: 'Esse usuário não é da sua loja.' }) },
      }),
    });
    const resultado = await usar();
    resultado.current.linkDeAcesso.mutate('u-richard');

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Não foi possível gerar o link', description: 'Esse usuário não é da sua loja.' }),
      ),
    );
  });
});
