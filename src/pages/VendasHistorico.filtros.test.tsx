import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Os filtros do Histórico de Vendas — achados de 24/09.
 *
 * - O período ia ao banco sem fuso ('2026-09-14T23:59:59'), e o banco o lia
 *   como horário de Londres: venda feita depois das 21h caía no dia seguinte.
 * - O filtro de vendedor listava só quem está ativo: as vendas de quem saiu da
 *   loja não davam para filtrar.
 * - O filtro de forma de pagamento era uma lista fixa do código, com
 *   "Crediário" (que a loja não usa) e sem "Shopee" nem "Link de Pagamento".
 */

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'p1', tenant_id: 'loja-1' } },
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

const VENDAS = [
  {
    id: 'v1',
    numero_venda: 'OV0008',
    created_at: new Date(2026, 8, 14, 21, 36).toISOString(),
    status: 'pago',
    total: 150,
    valor_faturamento_real: null,
    vendedor_id: 'vend-que-saiu',
    subtotal: 150,
    descontos: 0,
    clientes: null,
    vendedor: { nome: 'Carlos' },
    itens_venda: [],
    pagamentos_venda: [{ forma: 'cartao_credito', forma_pagamento_id: 'f-shopee' }],
    devolucoes: [],
  },
];

type Chamada = [string, string, unknown[]];

/** O dublê de sempre, anotando os filtros que cada consulta recebeu. */
function bancoQueAnota() {
  const base = bancoFalso({
    vendas: VENDAS,
    profiles: [{ id: 'vend-ana', nome: 'Ana' }],
    formas_pagamento: [
      { id: 'f-credito', descricao: 'Cartão Crédito', ativo: true },
      { id: 'f-shopee', descricao: 'Shopee', ativo: true },
    ],
  });
  const chamadas: Chamada[] = [];
  return {
    chamadas,
    banco: {
      ...base,
      from: (tabela: string) => {
        const consulta = base.from(tabela) as Record<string, (...args: unknown[]) => unknown>;
        for (const m of ['gte', 'lt', 'lte']) {
          const original = consulta[m];
          consulta[m] = (...args: unknown[]) => {
            chamadas.push([tabela, m, args]);
            return original(...args);
          };
        }
        return consulta;
      },
    },
  };
}

async function abrir() {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  const { banco, chamadas } = bancoQueAnota();
  mockSupabase.atual = banco;
  const { default: VendasHistorico } = await import('./VendasHistorico');
  renderizarTela(<VendasHistorico />);
  await screen.findByText('OV0008');
  return chamadas;
}

function abrirLista(rotulo: string) {
  fireEvent.pointerDown(
    screen.getByLabelText(rotulo),
    new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
  );
}

describe('Histórico de Vendas: filtros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('o período vai ao banco no horário da loja, com fim na meia-noite seguinte', async () => {
    const chamadas = await abrir();

    fireEvent.change(screen.getByLabelText('Data de'), { target: { value: '2026-09-14' } });
    fireEvent.change(screen.getByLabelText('Data até'), { target: { value: '2026-09-14' } });

    await waitFor(() => {
      expect(chamadas).toContainEqual(['vendas', 'gte', ['created_at', new Date(2026, 8, 14).toISOString()]]);
    });
    expect(chamadas).toContainEqual(['vendas', 'lt', ['created_at', new Date(2026, 8, 15).toISOString()]]);
    // A régua antiga, sem fuso, não é mais usada.
    expect(chamadas.some(([, m, args]) => m === 'lte' && String(args[1]).includes('T23:59:59'))).toBe(false);
    // E a venda das 21h36 do dia 14 continua na lista do dia 14.
    expect(await screen.findByText('OV0008')).toBeInTheDocument();
  });

  it('quem saiu da loja continua no filtro de vendedor, marcado como inativo', async () => {
    await abrir();
    abrirLista('Vendedor');

    expect(await screen.findByRole('option', { name: 'Carlos (inativo)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ana' })).toBeInTheDocument();
  });

  it('as formas de pagamento são as cadastradas pela loja', async () => {
    await abrir();
    abrirLista('Forma de pagamento');

    expect(await screen.findByRole('option', { name: 'Shopee' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cartão Crédito' })).toBeInTheDocument();
    // A lista fixa antiga tinha "Crediário", que a loja não usa.
    expect(screen.queryByRole('option', { name: 'Crediário' })).not.toBeInTheDocument();
  });
});
