import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Os números do Dashboard de Metas, pela regra da planilha "Metas RPG" (a
 * fonte das metas desde 23/09/2026):
 *
 *   - meta de cada vendedor = meta da loja ÷ número de vendedores do mês;
 *   - quinzena = metade, e só nos meses apurados por quinzena;
 *   - quem não tem o perfil Vendedor fica fora da apuração, mas as vendas
 *     contam para a loja.
 *
 * O relógio é congelado em 22/09/2026 (segunda quinzena de setembro).
 */

const HOJE = new Date('2026-09-22T15:00:00');

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const mockAuth = vi.hoisted(() => ({ podeVerCadastro: true, userId: 'ana' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: mockAuth.userId },
    session: {},
    loading: false,
    can: (p: string) => (p === 'dashboards.goals.manage' ? mockAuth.podeVerCadastro : true),
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
  created_at: '2026-09-20T10:00:00', // segunda quinzena de setembro
  total: 1000,
  valor_faturamento_real: null,
  vendedor_id: 'ana',
  itens_venda: [],
  ...over,
});

const BRONZE_10_MIL = [{ faixa: 'bronze', valor_meta: 10000 }];
const SETEMBRO_QUINZENAL = [{ vendedores: 2, apuracao: 'quinzenal' }];

async function abrir(tabelas: Record<string, unknown[]>) {
  mockSupabase.atual = bancoFalso({
    vw_metas_mes: SETEMBRO_QUINZENAL,
    metas_faturamento: [],
    metas_campanha: [],
    vendas: [],
    devolucoes: [],
    'rpc:pessoas_da_apuracao': [{ id: 'ana', nome: 'Ana' }],
    profiles: [
      { id: 'ana', nome: 'Ana' },
      { id: 'richard', nome: 'Richard' },
    ],
    ...tabelas,
  });
  const { default: DashboardMetas } = await import('./DashboardMetas');
  return renderizarTela(<DashboardMetas />);
}

/** Escolhe uma opção num campo de lista (Select) da tela. */
async function escolher(rotuloDoCampo: string, opcao: string) {
  const campo = await screen.findByLabelText(rotuloDoCampo);
  fireEvent.pointerDown(campo, new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

describe('Dashboard de Metas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    mockAuth.podeVerCadastro = true;
    mockAuth.userId = 'ana';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sem meta do mês na planilha, diz de onde a meta vem', async () => {
    await abrir({});

    await waitFor(() => {
      expect(screen.getByText(/ainda não chegou da planilha/)).toBeInTheDocument();
    });
  });

  it('quem cadastra meta vê o atalho para Cadastros > Metas; quem não cadastra, não', async () => {
    await abrir({ metas_faturamento: BRONZE_10_MIL });
    await waitFor(() => {
      expect(screen.getByText('Ver as metas cadastradas')).toBeInTheDocument();
    });

    vi.resetModules();
    mockAuth.podeVerCadastro = false;
    document.body.innerHTML = '';
    await abrir({ metas_faturamento: BRONZE_10_MIL });
    await waitFor(() => {
      expect(screen.getByText('Dashboard de Metas')).toBeInTheDocument();
    });
    expect(screen.queryByText('Ver as metas cadastradas')).not.toBeInTheDocument();
  });

  it('mostra quanto falta para a meta da loja no mês', async () => {
    await abrir({ metas_faturamento: BRONZE_10_MIL, vendas: [venda({ total: 4000 })] });

    await waitFor(() => {
      expect(screen.getAllByText(/Faltam R\$\s*6\.000,00/).length).toBeGreaterThan(0);
    });
  });

  it('desconta a devolução do que a loja faturou', async () => {
    await abrir({
      metas_faturamento: BRONZE_10_MIL,
      vendas: [venda({ id: 'v1', total: 4000 })],
      devolucoes: [
        { created_at: '2026-09-21T10:00:00', valor_devolvido_cliente: 1000, venda_original_id: 'v1' },
      ],
    });

    await waitFor(() => {
      expect(screen.getAllByText(/R\$\s*3\.000,00/).length).toBeGreaterThan(0);
    });
  });

  it('a meta do vendedor é a da loja dividida pelos vendedores do mês', async () => {
    // R$ 10.000 ÷ 2 vendedores = R$ 5.000 para a Ana. Ela vendeu 4.000:
    // faltam 1.000 para o Bronze individual.
    await abrir({ metas_faturamento: BRONZE_10_MIL, vendas: [venda({ total: 4000 })] });

    await waitFor(() => {
      expect(screen.getByText(/A sua meta/)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Faltam R\$\s*1\.000,00 para Bronze/).length).toBeGreaterThan(0);
    // E não existe mais a "meta individual estimada" dividida por quem vendeu.
    expect(screen.queryByText(/estimada/i)).not.toBeInTheDocument();
  });

  it('com 3 vendedores no mês, a régua de cada um muda sozinha', async () => {
    await abrir({
      vw_metas_mes: [{ vendedores: 4, apuracao: 'quinzenal' }],
      metas_faturamento: BRONZE_10_MIL,
      vendas: [venda({ total: 1000 })],
    });

    // 10.000 ÷ 4 = 2.500; vendeu 1.000 → faltam 1.500.
    await waitFor(() => {
      expect(screen.getAllByText(/Faltam R\$\s*1\.500,00 para Bronze/).length).toBeGreaterThan(0);
    });
  });

  it('na quinzena, a régua individual é metade da do mês', async () => {
    // Venda no dia 20 → 2ª quinzena. 10.000 ÷ 2 vendedores ÷ 2 = 2.500.
    await abrir({ metas_faturamento: BRONZE_10_MIL, vendas: [venda({ total: 2000 })] });
    await waitFor(() => {
      expect(screen.getByText(/A sua meta/)).toBeInTheDocument();
    });

    await escolher('Apuração', '2ª quinzena (dia 16 ao fim)');

    await waitFor(() => {
      expect(screen.getAllByText(/Faltam R\$\s*500,00 para Bronze/).length).toBeGreaterThan(0);
    });
  });

  it('mês de 4 períodos não oferece quinzena — mostra só o mês inteiro', async () => {
    await abrir({
      vw_metas_mes: [{ vendedores: 2, apuracao: 'quatro_periodos' }],
      metas_faturamento: BRONZE_10_MIL,
    });

    await waitFor(() => {
      expect(screen.getByText(/foi apurado em 4 períodos/)).toBeInTheDocument();
    });
    const campo = await screen.findByLabelText('Apuração');
    fireEvent.pointerDown(campo, new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Mês inteiro' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /quinzena/ })).not.toBeInTheDocument();
  });

  it('o gerente fica fora da apuração, mas a venda dele conta para a loja', async () => {
    await abrir({
      metas_faturamento: BRONZE_10_MIL,
      vendas: [
        venda({ id: 'v1', vendedor_id: 'ana', total: 2000 }),
        venda({ id: 'v2', vendedor_id: 'richard', total: 3000 }),
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('fora da apuração')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Richard').length).toBeGreaterThan(0);
    // Loja: 2.000 + 3.000 = 5.000 → faltam 5.000 para os 10.000.
    expect(screen.getAllByText(/Faltam R\$\s*5\.000,00/).length).toBeGreaterThan(0);
  });

  it('vendedor sem venda nenhuma aparece na tabela — o zero é a informação', async () => {
    await abrir({ metas_faturamento: BRONZE_10_MIL, vendas: [] });

    await waitFor(() => {
      expect(screen.getAllByText('Ana').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/R\$\s*0,00/).length).toBeGreaterThan(0);
  });

  it('campanha soma só o grupo de produto dela, na quinzena escolhida', async () => {
    await abrir({
      metas_faturamento: BRONZE_10_MIL,
      metas_campanha: [
        { chave: 'acessorios', nome: 'Acessórios', grupo_produto_id: 'g-acess', periodicidade: 'quinzenal', faixa: 'bronze', meta: 3000, premio: 60 },
        { chave: 'acessorios', nome: 'Acessórios', grupo_produto_id: 'g-acess', periodicidade: 'quinzenal', faixa: 'prata', meta: 4000, premio: 110 },
      ],
      vendas: [
        venda({
          total: 5000,
          itens_venda: [
            { total: 3200, produtos: { grupo_produto_id: 'g-acess' } },
            { total: 1800, produtos: { grupo_produto_id: 'g-console' } },
          ],
        }),
      ],
    });

    // No mês inteiro, a tela pede para escolher a quinzena.
    await waitFor(() => {
      expect(screen.getByText(/As campanhas são apuradas por quinzena/)).toBeInTheDocument();
    });

    await escolher('Apuração', '2ª quinzena (dia 16 ao fim)');

    // Só os 3.200 de acessório contam: Bronze batido, faltam 800 para Prata.
    await waitFor(() => {
      expect(screen.getByText(/R\$\s*3\.200,00/)).toBeInTheDocument();
    });
    expect(screen.getByText(/R\$\s*800,00 p\/ Prata/)).toBeInTheDocument();
  });

  it('campanha sem grupo de produto ligado avisa em vez de somar zero calada', async () => {
    await abrir({
      vw_metas_mes: SETEMBRO_QUINZENAL,
      metas_faturamento: BRONZE_10_MIL,
      metas_campanha: [
        { chave: 'jogos', nome: 'Jogos', grupo_produto_id: null, periodicidade: 'mensal', faixa: 'bronze', meta: 750, premio: 30 },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText(/ainda não está ligada a um Grupo de Produto/)).toBeInTheDocument();
    });
  });
});
