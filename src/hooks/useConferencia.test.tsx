import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bancoFalso, silenciarConsole } from '@/test/apoio';
import { montarItensDeConferencia, useConferencia } from './useConferencia';

/**
 * A aba Conferência (v2). O que estes testes seguram:
 * - junta o feito do dia (recorrente) e a avulsa concluída numa lista só;
 * - aprovar e devolver passam SEMPRE pela função `conferir_tarefa`, com o dia
 *   certo (nulo = avulsa) — é a única porta que o banco deixa;
 * - o item some na hora e VOLTA se o banco recusar, com aviso em português.
 */

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: vi.fn() }));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

const TAREFA_REC = {
  id: 't-rec',
  titulo: 'Repor os copos',
  prioridade: 'normal',
  dias_semana: [1, 3, 5],
  horario: null,
  arquivada_em: null,
  quadro_id: 'q1',
  lista_id: 'l-pedro',
  quadro: { nome: 'Loja', arquivado_em: null },
  lista: { nome: 'Pedro', cor: null, arquivada_em: null },
};

const CONCLUSAO = {
  tarefa_id: 't-rec',
  dia: '2026-09-23',
  concluida_em: '2026-09-23T13:00:00Z',
  concluida_por: 'u-pedro',
  conferida_em: null,
  tarefa: TAREFA_REC,
};

const AVULSA = {
  ...TAREFA_REC,
  id: 't-av',
  titulo: 'Fazer o pedido das sacolas',
  dias_semana: [],
  concluida_em: '2026-09-23T12:00:00Z',
  conferida_em: null,
};

function montar(rpc: (nome: string, args: unknown) => Promise<{ data: null; error: unknown }>, quadroId?: string) {
  const banco = bancoFalso({ tarefas_conclusoes: [CONCLUSAO], tarefas: [AVULSA] });
  mockSupabase.atual = { ...banco, rpc: vi.fn(rpc) };
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
  const r = renderHook(() => useConferencia(quadroId), { wrapper });
  return { ...r, rpc: (mockSupabase.atual as { rpc: ReturnType<typeof vi.fn> }).rpc };
}

describe('useConferencia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
  });

  it('junta o feito do dia e a avulsa concluída, o mais recente primeiro', async () => {
    const { result } = montar(() => Promise.resolve({ data: null, error: null }));
    await waitFor(() => expect(result.current.itens).toHaveLength(2));
    expect(result.current.itens.map((i) => [i.tarefa_id, i.dia])).toEqual([
      ['t-rec', '2026-09-23'],
      ['t-av', null],
    ]);
  });

  it('avulsa: diz de quem ela é — o responsável da tarefa, ou o dono da coluna', () => {
    // O banco não guarda quem concluiu a avulsa; sem isso, numa coluna com
    // nome de função ("Vendedor sênior"), o gerente não saberia de quem é.
    const semNinguem = montarItensDeConferencia([], [AVULSA]);
    expect(semNinguem[0].feita_por).toBeNull();

    const doDono = montarItensDeConferencia([], [
      { ...AVULSA, lista: { ...AVULSA.lista, responsavel_id: 'u-pedro' }, tarefas_responsaveis: [] },
    ]);
    expect(doDono[0].feita_por).toBe('u-pedro');

    const escalado = montarItensDeConferencia([], [
      { ...AVULSA, lista: { ...AVULSA.lista, responsavel_id: 'u-pedro' }, tarefas_responsaveis: [{ user_id: 'u-gabriel' }] },
    ]);
    expect(escalado[0].feita_por).toBe('u-gabriel');
  });

  it('aprovar dá o aviso com o nome da tarefa (o clique não pergunta antes)', async () => {
    const { result } = montar(() => Promise.resolve({ data: null, error: null }));
    await waitFor(() => expect(result.current.itens).toHaveLength(2));
    await act(() => result.current.aprovar(result.current.itens[0]));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: '"Repor os copos" conferida' }));
  });

  it('com quadro escolhido, deixa de fora o de outro quadro', async () => {
    const { result } = montar(() => Promise.resolve({ data: null, error: null }), 'outro-quadro');
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.itens).toEqual([]);
  });

  it('aprovar chama conferir_tarefa com o dia do feito; avulsa vai com dia nulo', async () => {
    const { result, rpc } = montar(() => Promise.resolve({ data: null, error: null }));
    await waitFor(() => expect(result.current.itens).toHaveLength(2));
    const [rec, avulsa] = result.current.itens;

    await act(() => result.current.aprovar(rec));
    expect(rpc).toHaveBeenCalledWith('conferir_tarefa', { _tarefa_id: 't-rec', _dia: '2026-09-23', _aprovada: true });

    await act(() => result.current.devolver(avulsa));
    expect(rpc).toHaveBeenCalledWith('conferir_tarefa', { _tarefa_id: 't-av', _dia: null, _aprovada: false });
  });

  it('recusa do banco: o item volta para a lista e o aviso sai em português', async () => {
    let recusar: (v: { data: null; error: unknown }) => void = () => {};
    const { result } = montar(
      () =>
        new Promise((r) => {
          recusar = r;
        }),
    );
    await waitFor(() => expect(result.current.itens).toHaveLength(2));
    const rec = result.current.itens[0];

    let pendente: Promise<void> = Promise.resolve();
    act(() => {
      pendente = result.current.aprovar(rec);
    });
    // Sai da lista na hora, antes de o banco responder.
    await waitFor(() => expect(result.current.itens.map((i) => i.tarefa_id)).toEqual(['t-av']));

    await act(async () => {
      recusar({ data: null, error: { message: 'Seu perfil de acesso não permite conferir tarefas.', code: 'P0001' } });
      await pendente;
    });
    await waitFor(() => expect(result.current.itens.map((i) => i.tarefa_id)).toContain('t-rec'));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Não foi possível conferir',
        description: 'Seu perfil de acesso não permite conferir tarefas.',
        variant: 'destructive',
      }),
    );
  });

  it('dentro de um quadro, o banco já filtra os feitos do dia pelo quadro da tarefa', async () => {
    // Grava o que a tela pediu ao banco, em vez de confiar no dublê (que
    // ignora filtros): sem o `!inner` e o filtro no embed, a aba do quadro
    // leria os feitos da loja inteira a cada 30 segundos.
    const pedidos: { tabela: string; metodo: string; args: unknown[] }[] = [];
    const banco = bancoFalso({ tarefas_conclusoes: [CONCLUSAO], tarefas: [AVULSA] });
    const from = (tabela: string) => {
      const q = banco.from(tabela) as Record<string, unknown>;
      for (const m of ['select', 'eq', 'is']) {
        const original = q[m] as (...a: unknown[]) => unknown;
        q[m] = (...args: unknown[]) => {
          pedidos.push({ tabela, metodo: m, args });
          return original(...args);
        };
      }
      return q;
    };
    mockSupabase.atual = { ...banco, from, rpc: vi.fn() };
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useConferencia('q1'), { wrapper });
    await waitFor(() => expect(result.current.itens).toHaveLength(2));

    const daConclusao = pedidos.filter((p) => p.tabela === 'tarefas_conclusoes');
    expect(String(daConclusao.find((p) => p.metodo === 'select')?.args[0])).toContain('tarefa:tarefas!inner(');
    expect(daConclusao).toContainEqual({ tabela: 'tarefas_conclusoes', metodo: 'eq', args: ['tarefa.quadro_id', 'q1'] });
    expect(pedidos).toContainEqual({ tabela: 'tarefas', metodo: 'eq', args: ['quadro_id', 'q1'] });
  });

  it('na página geral (sem quadro), não corta por quadro', async () => {
    const pedidos: { tabela: string; metodo: string; args: unknown[] }[] = [];
    const banco = bancoFalso({ tarefas_conclusoes: [CONCLUSAO], tarefas: [AVULSA] });
    const from = (tabela: string) => {
      const q = banco.from(tabela) as Record<string, unknown>;
      for (const m of ['select', 'eq']) {
        const original = q[m] as (...a: unknown[]) => unknown;
        q[m] = (...args: unknown[]) => {
          pedidos.push({ tabela, metodo: m, args });
          return original(...args);
        };
      }
      return q;
    };
    mockSupabase.atual = { ...banco, from, rpc: vi.fn() };
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useConferencia(), { wrapper });
    await waitFor(() => expect(result.current.itens).toHaveLength(2));

    expect(String(pedidos.find((p) => p.tabela === 'tarefas_conclusoes' && p.metodo === 'select')?.args[0])).not.toContain('!inner');
    expect(pedidos.filter((p) => p.metodo === 'eq')).toEqual([]);
  });
});
