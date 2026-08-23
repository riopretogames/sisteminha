import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * As outras duas telas de Estoque, vistas por quem não enxerga custo.
 *
 * Fecha a Parte 1 do roteiro manual: Movimentações e Estoque Crítico eram os
 * passos que sobravam para serem feitos com um segundo usuário, em janela
 * anônima.
 *
 * O ponto de cada uma é diferente:
 *   • Movimentações ESCONDE a coluna de valor.
 *   • Estoque Crítico TROCA a pergunta: quem vê custo lê "quanto custa repor";
 *     quem não vê lê "quanto isso vale na venda". Some o número de custo sem
 *     deixar o quadro vazio — um quadro em branco não ajuda ninguém.
 */

const PRODUTO_CRITICO = {
  id: 'p1',
  nome: 'Cabo HDMI 2.1',
  categoria: 'Acessório',
  preco: 79.9,
  custo: null,
  margem_percent: null,
  estoque_atual: 1,
  estoque_minimo: 5,
  estoque_maximo: 30,
  localizacao: 'Gaveta B',
  ativo: true,
  codigo_barra: '111',
  marca: null,
  modelo: null,
  imei_serial: null,
  observacoes: null,
  foto_url: null,
  garantia_meses: 3,
  tenant_id: 't1',
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
  condicao_id: null,
  cor_id: null,
  grupo_produto_id: null,
  marca_id: null,
  memoria_id: null,
  modelo_id: null,
};

const MOVIMENTO = {
  id: 'm1',
  produto_id: 'p1',
  tipo: 'entrada',
  quantidade: 10,
  custo_unitario: 40,
  valor_total: 400,
  motivo: 'Entrada de mercadoria',
  origem: 'entrada:EM0001',
  usuario_id: 'u1',
  saldo_anterior: 0,
  saldo_depois: 10,
  created_at: '2026-08-23T10:00:00Z',
  tenant_id: 't1',
  produtos: { nome: 'Cabo HDMI 2.1' },
};

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    session: {},
    loading: false,
    can: (p: string) => mockCan(p),
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

const TABELAS = {
  vw_produtos: [PRODUTO_CRITICO],
  vw_movimentos_estoque: [MOVIMENTO],
  movimentos_estoque: [MOVIMENTO],
  profiles: [{ id: 'u1', nome: 'Felipe' }],
  catalogos: [],
};

describe('Estoque Crítico por perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('quem NÃO vê custo lê "Valor em venda" — o quadro não fica vazio', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'vendedor' }));
    mockSupabase.atual = bancoFalso(TABELAS);
    const { default: EstoqueCritico } = await import('./EstoqueCritico');
    renderizarTela(<EstoqueCritico />);

    await waitFor(() => {
      expect(screen.getByText(/valor em venda/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/custo para repor/i)).not.toBeInTheDocument();
  });

  it('quem vê custo lê "Custo para repor tudo"', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    mockSupabase.atual = bancoFalso({
      ...TABELAS,
      vw_produtos: [{ ...PRODUTO_CRITICO, custo: 40, margem_percent: 49.9 }],
    });
    const { default: EstoqueCritico } = await import('./EstoqueCritico');
    renderizarTela(<EstoqueCritico />);

    await waitFor(() => {
      expect(screen.getByText(/custo para repor tudo/i)).toBeInTheDocument();
    });
  });

  it('a tela abre e lista o produto em falta, com ou sem custo', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'vendedor' }));
    mockSupabase.atual = bancoFalso(TABELAS);
    const { default: EstoqueCritico } = await import('./EstoqueCritico');
    renderizarTela(<EstoqueCritico />);

    await waitFor(() => {
      expect(screen.getByText('Cabo HDMI 2.1')).toBeInTheDocument();
    });
  });
});

describe('Movimentações de Estoque por perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('esconde a coluna Valor de quem não vê custo', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'vendedor' }));
    mockSupabase.atual = bancoFalso(TABELAS);
    const { default: EstoqueMovimentacoes } = await import('./EstoqueMovimentacoes');
    renderizarTela(<EstoqueMovimentacoes />);

    // Espera o PRODUTO, que aparece uma vez só. Esperar por "movimenta" casa
    // com o título e com o motivo do lançamento ao mesmo tempo.
    await waitFor(() => {
      expect(screen.getByText('Cabo HDMI 2.1')).toBeInTheDocument();
    });
    expect(screen.queryByRole('columnheader', { name: /^valor$/i })).not.toBeInTheDocument();
  });

  it('mostra a coluna Valor para quem vê custo', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    mockSupabase.atual = bancoFalso(TABELAS);
    const { default: EstoqueMovimentacoes } = await import('./EstoqueMovimentacoes');
    renderizarTela(<EstoqueMovimentacoes />);

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /^valor$/i })).toBeInTheDocument();
    });
  });
});
