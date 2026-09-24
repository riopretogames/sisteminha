import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';
import { mesCorrente } from '@/lib/format';
import { deISO } from '@/lib/periodo';

/**
 * Estoque Crítico e Movimentações — achados da revisão de 24/09.
 *
 *  • O "Repor" fazia um ajuste manual por fora: somava o número, mas não
 *    pedia fornecedor nem preço, não recalculava o custo e não lançava a
 *    compra no financeiro. Agora abre a Entrada de Mercadoria já preenchida.
 *  • Peça única vendida (mínimo 0) saía do alerta nunca — agora sai.
 *  • Movimentações filtravam o período pelo dia de Londres.
 */

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

const MOUSE = {
  id: 'p1',
  nome: 'Mouse Gamer 16000 DPI',
  marca: null,
  categoria: 'acessorio',
  codigo_barra: null,
  custo: 80,
  preco: 199.9,
  estoque_atual: 18,
  estoque_minimo: 20,
};

const SEMINOVO_VENDIDO = {
  id: 'p2',
  nome: 'Ps5 slim',
  marca: null,
  categoria: 'celular',
  codigo_barra: null,
  custo: 1000,
  preco: 1400,
  estoque_atual: 0,
  estoque_minimo: 0,
};

describe('Estoque Crítico: botão Repor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('abre a ENTRADA DE MERCADORIA com o produto e o que falta — e não ajusta nada por fora', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    const banco = bancoFalso({ vw_produtos: [MOUSE], fornecedores: [], catalogos: [] });
    const rpc = vi.fn(banco.rpc);
    mockSupabase.atual = { ...banco, rpc };
    const { default: EstoqueCritico } = await import('./EstoqueCritico');
    renderizarTela(<EstoqueCritico />);

    fireEvent.click(await screen.findByRole('button', { name: /repor/i }));

    expect(await screen.findByText('Nova entrada de mercadoria')).toBeInTheDocument();
    // Faltam 2 para o mínimo de 20.
    expect(screen.getByLabelText('Quantidade')).toHaveValue(2);
    // O preço sugerido é o custo atual, e o total vai para o financeiro.
    expect(screen.getByLabelText('Preço de compra (unidade)')).toHaveValue(80);
    expect(screen.getByTestId('total-da-compra')).toHaveTextContent(/160,00/);
    expect(rpc).not.toHaveBeenCalledWith('ajustar_estoque_produto', expect.anything());
  });

  it('quem movimenta estoque mas não vê custo não recebe um Repor que o banco recusaria', async () => {
    // Dar entrada exige ver custo (o preço de compra é digitado ali).
    mockCan.mockImplementation(montarCan({ perfil: 'tecnico', extras: ['inventory.adjust'] }));
    mockSupabase.atual = bancoFalso({ vw_produtos: [{ ...MOUSE, custo: null }], catalogos: [] });
    const { default: EstoqueCritico } = await import('./EstoqueCritico');
    renderizarTela(<EstoqueCritico />);

    await screen.findByText('Mouse Gamer 16000 DPI');
    expect(screen.queryByRole('button', { name: /repor/i })).not.toBeInTheDocument();
  });

  it('peça única vendida (mínimo 0, estoque 0) não fica no alerta', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    mockSupabase.atual = bancoFalso({ vw_produtos: [MOUSE, SEMINOVO_VENDIDO], catalogos: [] });
    const { default: EstoqueCritico } = await import('./EstoqueCritico');
    renderizarTela(<EstoqueCritico />);

    await screen.findByText('Mouse Gamer 16000 DPI');
    expect(screen.queryByText('Ps5 slim')).not.toBeInTheDocument();
  });
});

type Consulta = Record<string, (...args: unknown[]) => unknown>;

describe('Movimentações: período no relógio de Rio Preto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('pede ao banco do primeiro instante LOCAL do mês até a meia-noite local depois do último dia', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    const banco = bancoFalso({ vw_movimentos_estoque: [], profiles: [], catalogos: [] });
    const filtros: unknown[][] = [];
    mockSupabase.atual = {
      ...banco,
      from: (tabela: string) => {
        const consulta = banco.from(tabela) as unknown as Consulta;
        if (tabela === 'vw_movimentos_estoque') {
          for (const m of ['gte', 'lt', 'lte']) {
            const original = consulta[m];
            consulta[m] = (...args: unknown[]) => {
              filtros.push([m, ...args]);
              return original(...args);
            };
          }
        }
        return consulta;
      },
    };
    const { default: EstoqueMovimentacoes } = await import('./EstoqueMovimentacoes');
    renderizarTela(<EstoqueMovimentacoes />);

    const { inicio, fim } = mesCorrente();
    const fimExclusivo = deISO(fim);
    fimExclusivo.setDate(fimExclusivo.getDate() + 1);

    await waitFor(() => {
      expect(filtros).toContainEqual(['gte', 'created_at', deISO(inicio).toISOString()]);
    });
    expect(filtros).toContainEqual(['lt', 'created_at', fimExclusivo.toISOString()]);
    // O limite antigo era texto sem fuso ("…T23:59:59"), lido pelo banco como
    // hora de Londres.
    expect(filtros.some(([m]) => m === 'lte')).toBe(false);
  });
});
