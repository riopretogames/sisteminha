import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * O aviso "Caixa aberto desde ontem" (achado 67, revisão de 24/09/2026).
 *
 * O filtro contava blocos de 24 horas: um caixa aberto às 23h de ontem só
 * avisava às 23h de hoje — e o estrago (as vendas do dia caindo na sessão de
 * ontem) acontece justamente de manhã.
 */

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
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

function embrulho({ children }: { children: ReactNode }) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

async function avisosCom(caixaAbertoEm: string) {
  mockSupabase.atual = bancoFalso({
    vw_produtos: [],
    service_orders: [],
    titulos_financeiros: [],
    caixa_sessoes: [{ id: 'cx', aberto_em: caixaAbertoEm }],
  });
  const { useAvisos } = await import('./useAvisos');
  const { result } = renderHook(() => useAvisos(), { wrapper: embrulho });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result.current.data ?? [];
}

describe('sino — caixa esquecido aberto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Quinta, 8h da manhã: a loja acabou de abrir.
    vi.setSystemTime(new Date(2026, 8, 24, 8, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caixa aberto ontem às 23h já avisa hoje às 8h, antes da primeira venda', async () => {
    const avisos = await avisosCom(new Date(2026, 8, 23, 23, 0).toISOString());
    expect(avisos.map((a) => a.id)).toContain('caixa-aberto');
  });

  it('caixa aberto hoje cedo não avisa', async () => {
    const avisos = await avisosCom(new Date(2026, 8, 24, 7, 30).toISOString());
    expect(avisos.map((a) => a.id)).not.toContain('caixa-aberto');
  });
});
