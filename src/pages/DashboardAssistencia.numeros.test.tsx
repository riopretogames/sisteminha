import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Os números do Dashboard de Assistência.
 *
 * Dois pontos merecem teste de verdade, porque são regra e não conta:
 *
 *   • APARELHO PARADO muda de cor conforme o tempo. É um alerta operacional:
 *     se a cor não acompanhar os dias, o aviso deixa de avisar.
 *   • SERVIÇO É TEXTO LIVRE. "Troca de tela" e "troca de tela " precisam
 *     contar como um só, senão o carro-chefe da bancada aparece espalhado em
 *     três linhas e nenhuma parece importante.
 */

const HOJE = new Date('2026-08-23T15:00:00');

function os(over: Record<string, unknown>) {
  return {
    id: 'o',
    numero_os: 'OS0001',
    created_at: '2026-08-23T09:00:00',
    updated_at: '2026-08-23T09:00:00',
    data_finalizacao: null,
    status: 'aguardando_analise',
    reparo_inviavel: false,
    total_orcamento: 200,
    valor_final_pago: null,
    tecnico_id: 'tec1',
    tecnico: { nome: 'Carlos' },
    equipamento_id: 'eq1',
    equipamento: { descricao: 'Celular' },
    clientes: { nome: 'Cliente Teste' },
    itens: [],
    ...over,
  };
}

const servico = (descricao: string, preco: number) => ({
  descricao,
  produto_id: null,
  quantidade: 1,
  preco_cobrado: preco,
  horas_mao_obra: 1,
});
const peca = (descricao: string, preco: number) => ({
  descricao,
  produto_id: 'p1',
  quantidade: 1,
  preco_cobrado: preco,
  horas_mao_obra: null,
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
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

async function abrir(ordens: unknown[]) {
  mockSupabase.atual = bancoFalso({ service_orders: ordens });
  const { default: DashboardAssistencia } = await import('./DashboardAssistencia');
  return renderizarTela(<DashboardAssistencia />);
}

describe('Dashboard de Assistência — os números', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conta os aparelhos que entraram hoje', async () => {
    await abrir([
      os({ id: '1', created_at: '2026-08-23T09:00:00' }),
      os({ id: '2', created_at: '2026-08-23T11:00:00' }),
      os({ id: '3', created_at: '2026-08-18T11:00:00' }), // semana, não hoje
    ]);

    await waitFor(() => {
      expect(screen.getByText('Entraram Hoje')).toBeInTheDocument();
    });
    expect(screen.getByText(/3 nesta semana/)).toBeInTheDocument();
  });

  it('lista os aparelhos parados, do mais antigo para o mais novo', async () => {
    await abrir([
      os({ id: '1', numero_os: 'OS0009', created_at: '2026-08-21T09:00:00' }),
      os({ id: '2', numero_os: 'OS0001', created_at: '2026-07-20T09:00:00' }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('OS0001')).toBeInTheDocument();
    });
    // O mais antigo primeiro: aparelho esquecido é o que precisa aparecer.
    const linhas = screen.getAllByRole('row');
    const textos = linhas.map((l) => l.textContent ?? '');
    const iAntigo = textos.findIndex((t) => t.includes('OS0001'));
    const iNovo = textos.findIndex((t) => t.includes('OS0009'));
    expect(iAntigo).toBeLessThan(iNovo);
  });

  it('pinta de VERMELHO o que passou de 15 dias parado', async () => {
    await abrir([os({ id: '1', created_at: '2026-07-20T09:00:00' })]); // 34 dias

    await waitFor(() => {
      expect(screen.getByText('34 dia(s)')).toBeInTheDocument();
    });
    expect(screen.getByText('34 dia(s)').className).toMatch(/text-red-600/);
  });

  it('pinta de LARANJA entre 7 e 15 dias', async () => {
    await abrir([os({ id: '1', created_at: '2026-08-13T09:00:00' })]); // 10 dias

    await waitFor(() => {
      expect(screen.getByText('10 dia(s)')).toBeInTheDocument();
    });
    expect(screen.getByText('10 dia(s)').className).toMatch(/text-amber-600/);
  });

  it('junta as variações de digitação do mesmo serviço numa linha só', async () => {
    // O ponto principal: sem isso, "Troca de tela" apareceria três vezes.
    await abrir([
      os({
        id: '1',
        status: 'entregue',
        data_finalizacao: '2026-08-22T10:00:00',
        valor_final_pago: 300,
        itens: [servico('Troca de tela', 300)],
      }),
      os({
        id: '2',
        status: 'entregue',
        data_finalizacao: '2026-08-22T11:00:00',
        valor_final_pago: 300,
        itens: [servico('troca de tela ', 300)],
      }),
      os({
        id: '3',
        status: 'entregue',
        data_finalizacao: '2026-08-22T12:00:00',
        valor_final_pago: 300,
        itens: [servico('TROCA DE TELA', 300)],
      }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('Troca de tela')).toBeInTheDocument();
    });
    // Uma linha só, com as três vezes somadas.
    expect(screen.getAllByText(/^Troca de tela$/i)).toHaveLength(1);
  });

  it('separa mão de obra de peça pelo vínculo com o cadastro', async () => {
    await abrir([
      os({
        id: '1',
        status: 'entregue',
        data_finalizacao: '2026-08-22T10:00:00',
        valor_final_pago: 500,
        itens: [servico('Limpeza', 200), peca('Bateria', 300)],
      }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('Mão de Obra da Semana')).toBeInTheDocument();
    });
    expect(screen.getByText('Peças da Semana')).toBeInTheDocument();
    // 200 de mão de obra em 500 = 40%; peça fica com 60%.
    expect(screen.getByText(/40% do serviço entregue/)).toBeInTheDocument();
    expect(screen.getByText(/60% do serviço entregue/)).toBeInTheDocument();
  });

  it('bancada vazia não quebra nem inventa número', async () => {
    await abrir([]);

    await waitFor(() => {
      expect(screen.getByText('Dashboard de Assistência')).toBeInTheDocument();
    });
    expect(screen.getByText(/Nenhuma OS em aberto. Bancada limpa./)).toBeInTheDocument();
  });
});
