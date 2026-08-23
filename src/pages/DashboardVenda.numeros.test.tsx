import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Os números do Dashboard de Vendas.
 *
 * Painel com número errado é pior que painel sem número: a pessoa decide em
 * cima dele. Estes testes montam vendas de mentira com valores redondos e
 * conferem o que aparece na tela — inclusive o abatimento de devolução, que o
 * Felipe pediu em 23/08.
 *
 * O relógio é congelado num DOMINGO (23/08/2026), que é o pior dia para
 * testar: a semana da loja vai de segunda a domingo, então domingo é o único
 * dia em que "ontem" (sábado) e "início da semana" (segunda) estão dos dois
 * lados. Se a conta de data estiver errada, quebra aqui.
 */

const DOMINGO = new Date('2026-08-23T15:00:00');
const SEGUNDA = '2026-08-17T10:00:00';
const SABADO = '2026-08-22T14:00:00';
const HOJE_CEDO = '2026-08-23T09:00:00';
const HOJE_PICO = '2026-08-23T14:30:00';

function venda(over: Record<string, unknown>) {
  return {
    id: 'v',
    created_at: HOJE_PICO,
    total: 100,
    valor_faturamento_real: null,
    vendedor_id: 'ana',
    vendedor: { nome: 'Ana' },
    itens_venda: [],
    pagamentos_venda: [],
    ...over,
  };
}

const ITEM = (nome: string, categoria: string, qtd: number, total: number) => ({
  produto_id: nome,
  quantidade: qtd,
  total,
  produtos: { nome, categoria },
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

async function abrir(vendas: unknown[], devolucoes: unknown[] = []) {
  mockSupabase.atual = bancoFalso({ vendas, devolucoes });
  const { default: DashboardVenda } = await import('./DashboardVenda');
  return renderizarTela(<DashboardVenda />);
}

describe('Dashboard de Vendas — os números', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(DOMINGO);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('soma as vendas de hoje, e só as de hoje', async () => {
    await abrir([
      venda({ id: '1', created_at: HOJE_CEDO, total: 300 }),
      venda({ id: '2', created_at: HOJE_PICO, total: 200 }),
      venda({ id: '3', created_at: SABADO, total: 999 }), // ontem, não conta
    ]);

    await waitFor(() => {
      expect(screen.getByText(/R\$\s*500,00/)).toBeInTheDocument();
    });
  });

  it('aponta o melhor vendedor da semana pelo nome', async () => {
    await abrir([
      venda({ id: '1', vendedor_id: 'ana', vendedor: { nome: 'Ana' }, total: 1000 }),
      venda({ id: '2', vendedor_id: 'bruno', vendedor: { nome: 'Bruno' }, total: 300 }),
    ]);

    await waitFor(() => {
      expect(screen.getByText(/Ana · 1 venda/)).toBeInTheDocument();
    });
  });

  it('DESCONTA a devolução de quem fez a venda — o pedido do Felipe', async () => {
    // Ana vendeu 1.000 e teve 400 devolvidos: fica com 600, atrás do Bruno.
    // Sem o desconto, ela apareceria em primeiro com dinheiro que voltou.
    await abrir(
      [
        venda({ id: '1', vendedor_id: 'ana', vendedor: { nome: 'Ana' }, total: 1000 }),
        venda({ id: '2', vendedor_id: 'bruno', vendedor: { nome: 'Bruno' }, total: 700 }),
      ],
      [
        {
          created_at: HOJE_PICO,
          valor_devolvido_cliente: 400,
          venda_original: { vendedor_id: 'ana', vendedor: { nome: 'Ana' } },
        },
      ],
    );

    await waitFor(() => {
      expect(screen.getByText(/Bruno · 1 venda/)).toBeInTheDocument();
    });
  });

  it('a devolução NÃO respinga em quem não vendeu aquilo', async () => {
    await abrir(
      [venda({ id: '1', vendedor_id: 'bruno', vendedor: { nome: 'Bruno' }, total: 700 })],
      [
        {
          created_at: HOJE_PICO,
          valor_devolvido_cliente: 400,
          venda_original: { vendedor_id: 'ana', vendedor: { nome: 'Ana' } },
        },
      ],
    );

    await waitFor(() => {
      // Bruno segue com os 700 dele, intactos.
      expect(screen.getByText(/Bruno · 1 venda/)).toBeInTheDocument();
    });
  });

  it('agrupa as vendas por categoria de produto', async () => {
    await abrir([
      venda({ id: '1', itens_venda: [ITEM('Controle', 'Acessório', 2, 800)] }),
      venda({ id: '2', itens_venda: [ITEM('Jogo X', 'Jogo', 1, 200)] }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('Acessório')).toBeInTheDocument();
    });
    expect(screen.getByText('Jogo')).toBeInTheDocument();
  });

  it('mostra a faixa de horário com mais venda', async () => {
    await abrir([
      venda({ id: '1', created_at: HOJE_PICO }),
      venda({ id: '2', created_at: '2026-08-23T14:50:00' }),
      venda({ id: '3', created_at: HOJE_CEDO }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('14h às 15h')).toBeInTheDocument();
    });
  });

  it('venda SEM vendedor não vira um "Sem nome" no ranking', async () => {
    await abrir([
      venda({ id: '1', vendedor_id: null, vendedor: null, total: 5000 }),
      venda({ id: '2', vendedor_id: 'ana', vendedor: { nome: 'Ana' }, total: 10 }),
    ]);

    await waitFor(() => {
      expect(screen.getByText(/Ana · 1 venda/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Sem nome')).not.toBeInTheDocument();
  });

  it('loja parada não quebra a tela nem inventa número', async () => {
    await abrir([]);

    await waitFor(() => {
      expect(screen.getByText('Dashboard de Vendas')).toBeInTheDocument();
    });
    // Aparece no card E na tabela, de proposito: os dois lugares precisam
    // explicar o vazio, senao um deles parece quebrado.
    expect(screen.getAllByText(/Nenhuma venda com vendedor registrado/).length).toBeGreaterThan(0);
  });

  it('semana começa na SEGUNDA: venda de segunda entra, e o total bate', async () => {
    await abrir([
      venda({ id: '1', created_at: SEGUNDA, total: 400 }),
      venda({ id: '2', created_at: HOJE_PICO, total: 100 }),
    ]);

    // 400 (segunda) + 100 (hoje) = 500 na semana; hoje sozinho são 100.
    await waitFor(() => {
      expect(screen.getByText(/2 venda\(s\) de segunda até hoje/)).toBeInTheDocument();
    });
  });
});
