import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Minhas Tarefas no computador compartilhado do balcão (achado 21 da revisão
 * de 24/09): o Pedro sai, o Gabriel entra na mesma aba. A lista do Pedro não
 * pode aparecer para o Gabriel enquanto o banco não responde — senão a
 * bolinha marca a tarefa do Pedro no nome do Gabriel.
 */

const AGORA = new Date('2026-09-23T09:30:00'); // quarta

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const mockUsuario = vi.hoisted(() => ({ id: 'u-pedro' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: mockUsuario.id },
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

const TAREFA_DO_PEDRO = {
  id: 't-pedro',
  quadro_id: 'q-loja',
  lista_id: 'l-pedro',
  titulo: 'Repor os copos',
  descricao: null,
  prioridade: 'normal',
  status: 'nao_iniciado',
  dias_semana: [0, 1, 2, 3, 4, 5, 6],
  periodo_id: null,
  prazo: null,
  concluida_em: null,
  ordem: 1024,
  arquivada_em: null,
  criado_por: null,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  quadro: { nome: 'Loja', arquivado_em: null },
  lista: { nome: 'Pedro', responsavel_id: 'u-pedro', arquivada_em: null },
};

/** Banco que nunca responde: é o "enquanto o banco não responde". */
function bancoParado() {
  const parado: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order']) parado[m] = () => parado;
  parado.then = () => new Promise(() => {});
  return { from: () => parado };
}

describe('useMinhasTarefas — troca de pessoa na mesma aba', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(AGORA);
    mockUsuario.id = 'u-pedro';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('o Gabriel não vê a lista do Pedro enquanto a dele carrega', async () => {
    mockSupabase.atual = bancoFalso({
      tarefas_responsaveis: [{ tarefa_id: 't-pedro' }],
      tarefas_listas: [],
      tarefas: [TAREFA_DO_PEDRO],
      tarefas_conclusoes: [],
    });
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const envolver = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    );
    const { useMinhasTarefas } = await import('./useMinhasTarefas');
    const { result, rerender } = renderHook(() => useMinhasTarefas(), { wrapper: envolver });

    await waitFor(() => expect(result.current.tarefas.map((t) => t.titulo)).toEqual(['Repor os copos']));

    // O Pedro saiu, o Gabriel entrou na mesma aba — e o banco ainda não respondeu.
    mockSupabase.atual = bancoParado();
    mockUsuario.id = 'u-gabriel';
    rerender();

    expect(result.current.tarefas).toEqual([]);
    expect(result.current.carregando).toBe(true);
  });
});
