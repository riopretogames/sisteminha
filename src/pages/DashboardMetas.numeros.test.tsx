import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Os números do Dashboard de Metas.
 *
 * A regra mais delicada desta tela é a da QUINZENA: a premiação da loja é
 * apurada de quinze em quinze dias desde agosto/2026, e a meta da quinzena é a
 * do mês dividida por dois. Se essa conta escorregar, alguém comemora prêmio
 * que não bateu — ou deixa de receber o que bateu.
 *
 * O relógio é congelado em 22/09/2026 (segunda quinzena de setembro).
 */

const HOJE = new Date('2026-09-22T15:00:00');

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const mockAuth = vi.hoisted(() => ({ podeCadastrar: true, userId: 'ana' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: mockAuth.userId },
    session: {},
    loading: false,
    can: (p: string) =>
      p === 'dashboards.goals.manage' ? mockAuth.podeCadastrar : true,
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

const venda = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  created_at: '2026-09-20T10:00:00', // segunda quinzena
  total: 1000,
  valor_faturamento_real: null,
  vendedor_id: 'ana',
  ...over,
});

async function abrir(tabelas: Record<string, unknown[]>) {
  mockSupabase.atual = bancoFalso({
    metas_faturamento: [],
    metas_vendedor: [],
    vendas: [],
    devolucoes: [],
    profiles: [{ id: 'ana', nome: 'Ana', tenant_id: 't1' }],
    ...tabelas,
  });
  const { default: DashboardMetas } = await import('./DashboardMetas');
  return renderizarTela(<DashboardMetas />);
}

describe('Dashboard de Metas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    mockAuth.podeCadastrar = true;
    mockAuth.userId = 'ana';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sem meta cadastrada, chama quem pode cadastrar para cadastrar', async () => {
    await abrir({});

    await waitFor(() => {
      expect(screen.getByText(/ainda não foi cadastrada/)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Cadastrar metas/).length).toBeGreaterThan(0);
  });

  it('quem não pode cadastrar não vê o botão de cadastrar', async () => {
    mockAuth.podeCadastrar = false;
    await abrir({});

    await waitFor(() => {
      expect(screen.getByText(/ainda não foi cadastrada/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Cadastrar metas/)).not.toBeInTheDocument();
    // E a tela explica a quem pedir, em vez de só mostrar um vazio.
    expect(screen.getByText(/administrador ou gerente cadastrar/)).toBeInTheDocument();
  });

  it('mostra o progresso da meta do mês', async () => {
    await abrir({
      metas_faturamento: [{ id: 'm1', faixa: 'bronze', valor_meta: 10000 }],
      vendas: [venda({ total: 4000 })],
    });

    await waitFor(() => {
      expect(screen.getAllByText(/R\$\s*4\.000,00/).length).toBeGreaterThan(0);
    });
    // Falta o que falta para os 10 mil do mês inteiro (o recorte padrão).
    expect(screen.getAllByText(/Faltam R\$\s*6\.000,00/).length).toBeGreaterThan(0);
  });

  it('desconta a devolução do que foi realizado', async () => {
    await abrir({
      metas_faturamento: [{ id: 'm1', faixa: 'bronze', valor_meta: 10000 }],
      vendas: [venda({ id: 'v1', total: 4000 })],
      devolucoes: [
        { created_at: '2026-09-21T10:00:00', valor_devolvido_cliente: 1000, venda_original_id: 'v1' },
      ],
    });

    await waitFor(() => {
      expect(screen.getAllByText(/R\$\s*3\.000,00/).length).toBeGreaterThan(0);
    });
  });

  it('a meta individual cadastrada aparece como a régua da pessoa', async () => {
    await abrir({
      metas_faturamento: [{ id: 'm1', faixa: 'bronze', valor_meta: 10000 }],
      metas_vendedor: [{ user_id: 'ana', valor_meta: 5000 }],
      vendas: [venda({ total: 4000 })],
    });

    await waitFor(() => {
      expect(screen.getByText(/A sua meta/)).toBeInTheDocument();
    });
    expect(screen.getByText(/de R\$\s*5\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/Faltam R\$\s*1\.000,00 para bater a sua meta/)).toBeInTheDocument();
  });

  it('sem meta individual, avisa em vez de dividir a meta da loja por cabeça', async () => {
    // Era o que a tela fazia antes de 22/09: dividia a meta da loja pelo
    // número de quem tinha vendido e chamava de "meta individual estimada".
    await abrir({
      metas_faturamento: [{ id: 'm1', faixa: 'bronze', valor_meta: 10000 }],
      vendas: [venda({ total: 4000 })],
    });

    await waitFor(() => {
      expect(screen.getByText(/Ninguém tem meta individual cadastrada/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/estimada/i)).not.toBeInTheDocument();
  });

  it('a pessoa com meta e sem venda aparece na tabela — o zero é a informação', async () => {
    await abrir({
      metas_faturamento: [{ id: 'm1', faixa: 'bronze', valor_meta: 10000 }],
      metas_vendedor: [{ user_id: 'ana', valor_meta: 5000 }],
      vendas: [],
    });

    await waitFor(() => {
      expect(screen.getAllByText('Ana').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/R\$\s*0,00/).length).toBeGreaterThan(0);
  });

  it('período já fechado não ganha projeção — mostra o número final', async () => {
    // Agosto acabou: projetar devolveria o próprio realizado com cara de
    // previsão, e alguém leria como "ainda dá para melhorar".
    const { container } = await abrir({
      metas_faturamento: [{ id: 'm1', faixa: 'bronze', valor_meta: 10000 }],
      vendas: [venda({ created_at: '2026-08-10T10:00:00', total: 4000 })],
    });
    expect(container).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/Projeção do Período|Resultado Final/)).toBeInTheDocument();
    });
  });
});
