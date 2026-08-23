import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Estoque aberto por quem NÃO vê custo.
 *
 * Este é o teste do pior defeito que este sistema já teve: a tela de Estoque
 * ficava TOTALMENTE BRANCA para Vendedor e Técnico. Eles não conseguiam nem
 * consultar o preço de um produto para o cliente na frente do balcão.
 *
 * A causa era de uma linha: a tela fazia conta com a margem, e a margem chega
 * VAZIA para quem não tem permissão de ver custo (é assim que a proteção de
 * custo funciona — a view devolve nulo em vez de negar a consulta). Fazer
 * conta com nada derruba a tela inteira.
 *
 * Nenhum teste de cálculo pegaria isso. Só abrir a tela com o crachá errado.
 */

const PRODUTOS_SEM_CUSTO = [
  {
    id: 'p1',
    nome: 'Controle DualSense Branco',
    categoria: 'Acessório',
    preco: 429.9,
    // Vazios de propósito: é exatamente o que a view devolve para quem não
    // tem `inventory.cost.view`.
    custo: null,
    margem_percent: null,
    estoque_atual: 5,
    estoque_minimo: 2,
    estoque_maximo: 20,
    localizacao: 'Prateleira A',
    ativo: true,
    codigo_barra: '789',
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
  },
];

const PRODUTOS_COM_CUSTO = [
  { ...PRODUTOS_SEM_CUSTO[0], custo: 300, margem_percent: 43.3 },
];

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-teste' },
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

async function abrirEstoque(perfil: 'administrador' | 'vendedor', produtos: unknown[]) {
  const can = montarCan({ perfil });
  mockCan.mockImplementation(can);
  mockSupabase.atual = bancoFalso({ vw_produtos: produtos, catalogos: [] });

  const { default: Estoque } = await import('./Estoque');
  return renderizarTela(<Estoque />);
}

describe('Estoque com perfil que não vê custo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('A TELA ABRE — não fica em branco com custo e margem vazios', async () => {
    // O defeito original: a tela quebrava inteira ao tentar arredondar uma
    // margem que veio nula.
    await abrirEstoque('vendedor', PRODUTOS_SEM_CUSTO);

    await waitFor(() => {
      expect(screen.getByText('Controle DualSense Branco')).toBeInTheDocument();
    });
  });

  it('esconde as colunas Custo e Margem de quem não pode vê-las', async () => {
    await abrirEstoque('vendedor', PRODUTOS_SEM_CUSTO);

    await waitFor(() => {
      expect(screen.getByText('Controle DualSense Branco')).toBeInTheDocument();
    });

    expect(screen.queryByRole('columnheader', { name: /custo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /margem/i })).not.toBeInTheDocument();
  });

  it('o preço de venda CONTINUA visível — é o que o vendedor precisa no balcão', async () => {
    await abrirEstoque('vendedor', PRODUTOS_SEM_CUSTO);

    await waitFor(() => {
      expect(screen.getByText('Controle DualSense Branco')).toBeInTheDocument();
    });
    // Esconder custo não pode esconder o preço: sem ele o vendedor não
    // atende ninguém, que era o efeito prático do bug original.
    expect(screen.getByText(/429,90/)).toBeInTheDocument();
  });

  it('mostra Custo e Margem para quem TEM a permissão', async () => {
    await abrirEstoque('administrador', PRODUTOS_COM_CUSTO);

    await waitFor(() => {
      expect(screen.getByText('Controle DualSense Branco')).toBeInTheDocument();
    });
    expect(screen.getByRole('columnheader', { name: /custo/i })).toBeInTheDocument();
  });
});
