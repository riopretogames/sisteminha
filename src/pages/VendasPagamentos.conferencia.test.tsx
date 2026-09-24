import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Vendas > Pagamentos bate com a gaveta.
 *
 * Achado de 24/09: a tela se apresenta como "conferência de caixa", mas
 * somava o que o cliente ENTREGOU. Pago R$ 100 numa venda de R$ 80, o card
 * "Dinheiro na gaveta" mostrava R$ 100 — a gaveta tinha R$ 80. O aparelho
 * recebido na troca entrava no "Total recebido" e no card "A prazo" (que ele
 * não é), e a devolução em dinheiro nem aparecia.
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

const FORMAS = [
  { id: 'f-din', descricao: 'Dinheiro', forma_enum: 'dinheiro', entra_no_caixa: true },
  { id: 'f-pix', descricao: 'PIX', forma_enum: 'pix', entra_no_caixa: false },
];

const VENDAS = [
  {
    // R$ 80 pagos com uma nota de R$ 100: R$ 20 de troco.
    id: 'v1',
    numero_venda: 'OV0010',
    created_at: '2026-09-10T15:00:00Z',
    status: 'pago',
    total: 80,
    clientes: null,
    pagamentos_venda: [
      { id: 'pg1', forma: 'dinheiro', forma_pagamento_id: 'f-din', parcelas: 1, valor: 100, gateway_id: null },
    ],
  },
  {
    // PS4 de R$ 400 na troca + R$ 30 no PIX, numa compra de R$ 430.
    id: 'v2',
    numero_venda: 'OV0011',
    created_at: '2026-09-11T15:00:00Z',
    status: 'pago',
    total: 430,
    clientes: { nome: 'Adriana Prado' },
    pagamentos_venda: [
      { id: 'pg2', forma: 'vale_troca', forma_pagamento_id: null, parcelas: 1, valor: 400, gateway_id: null },
      { id: 'pg3', forma: 'pix', forma_pagamento_id: 'f-pix', parcelas: 1, valor: 30, gateway_id: null },
    ],
  },
];

const DEVOLUCOES = [
  {
    // R$ 50 devolvidos em dinheiro (sem forma informada = dinheiro, como no caixa).
    id: 'd1',
    numero_devolucao: 'DV-0001',
    created_at: '2026-09-12T15:00:00Z',
    valor_devolvido_cliente: 50,
    forma_pagamento_id: null,
    venda_original_id: 'v-antiga',
    venda_original: { numero_venda: 'OV0001', clientes: { nome: 'Bruno Lima' } },
  },
];

async function abrir() {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  mockSupabase.atual = bancoFalso({
    vendas: VENDAS,
    devolucoes: DEVOLUCOES,
    formas_pagamento: FORMAS,
  });
  const { default: VendasPagamentos } = await import('./VendasPagamentos');
  return renderizarTela(<VendasPagamentos />);
}

/** O valor de um card, pelo rótulo dele. */
async function card(rotulo: string) {
  const titulo = await screen.findByText(rotulo, { selector: 'p' });
  return titulo.parentElement!.textContent ?? '';
}

describe('Vendas > Pagamentos: a conferência bate com a gaveta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('dinheiro na gaveta já sem o troco e sem a devolução em dinheiro', async () => {
    await abrir();
    // R$ 100 entregues − R$ 20 de troco − R$ 50 devolvidos = R$ 30.
    await waitFor(async () => {
      expect(await card('Dinheiro na gaveta')).toMatch(/R\$\s?30,00/);
    });
  });

  it('o aparelho da troca não é dinheiro: fica fora do total e ganha card próprio', async () => {
    await abrir();
    await waitFor(async () => {
      expect(await card('Recebido em aparelho')).toMatch(/R\$\s?400,00/);
    });
    // Total = 100 − 20 (troco) + 30 (PIX) − 50 (devolução). Sem os R$ 400.
    expect(await card('Total recebido')).toMatch(/R\$\s?60,00/);
    // E o aparelho não é "a prazo".
    expect(screen.queryByText('A prazo', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('troco e devolução aparecem em linhas próprias, saindo', async () => {
    await abrir();
    expect(await screen.findByText('Troco devolvido (dinheiro)')).toBeInTheDocument();
    expect(screen.getByText('Devolução DV-0001 (Dinheiro)')).toBeInTheDocument();
    expect(await card('Devolvido a clientes')).toMatch(/R\$\s?50,00/);
  });
});
