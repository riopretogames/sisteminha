import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, silenciarConsole } from '@/test/apoio';
import { bancoComFiltros } from '@/test/bancoComFiltros';

/**
 * Contas, Fluxo de Caixa e Relatório Financeiro — revisão de 24/09/2026.
 *
 * - Achado 57: o Fluxo e o Relatório Financeiro não enxergavam venda nenhuma
 *   do PDV (a venda não cria título). Agosto: R$ 36 mil vendidos e o Fluxo
 *   dizendo "Entrou R$ 150".
 * - Achado 58: o Relatório Financeiro chamava de "Já pago" o pedaço pago de
 *   quem VENCIA no período — o mesmo erro que o Fluxo corrigiu em 21/08.
 * - Achado 65: o título criado pela entrega da OS podia ser reaberto e
 *   cancelado pela tela.
 * - Achado 72: Contas a Receber falava em crediário, que a loja não faz.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'u1', tenant_id: 'loja-1' } },
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

/** O rótulo de um Indicador e o valor dele ficam lado a lado no mesmo cartão. */
function cartao(rotulo: string) {
  return screen.getByText(rotulo).parentElement as HTMLElement;
}

describe('Contas a Receber — título automático da OS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('o título criado pela entrega da OS não oferece Reabrir nem Cancelar', async () => {
    mockSupabase.atual = bancoComFiltros({
      titulos_financeiros: [
        {
          id: 't-os', natureza: 'receber', descricao: 'OS OS-202608-0010 — serviço', valor: 150,
          valor_pago: 150, vencimento: '2026-08-20', status: 'pago', pago_em: '2026-08-20',
          os_id: 'os-10', venda_id: null, categoria_id: null, fornecedor_id: null, cliente_id: null,
        },
        {
          id: 't-manual', natureza: 'receber', descricao: 'Repasse do cartão', valor: 900,
          valor_pago: 900, vencimento: '2026-08-21', status: 'pago', pago_em: '2026-08-21',
          os_id: null, venda_id: null, categoria_id: null, fornecedor_id: null, cliente_id: null,
        },
      ],
    });
    const { default: ContasReceber } = await import('./ContasReceber');
    renderizarTela(<ContasReceber />);

    await screen.findByText('OS OS-202608-0010 — serviço');
    // Só o título manual pode ser reaberto.
    expect(screen.getAllByTitle('Reabrir')).toHaveLength(1);
    expect(screen.getByText('Automático (OS)')).toBeInTheDocument();
  });

  it('não fala mais em crediário nem venda a prazo', async () => {
    mockSupabase.atual = bancoComFiltros({ titulos_financeiros: [] });
    const { default: ContasReceber } = await import('./ContasReceber');
    const { container } = renderizarTela(<ContasReceber />);

    await screen.findByText('Contas a Receber');
    expect(container.textContent ?? '').not.toMatch(/crediário|venda a prazo/i);
  });
});

describe('Fluxo de Caixa e Relatório Financeiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const VENDAS_DE_AGOSTO = [
    { id: 'v1', created_at: '2026-08-05T10:00:00', status: 'pago', total: 1000, valor_faturamento_real: null },
    { id: 'v2', created_at: '2026-08-06T15:00:00', status: 'pago', total: 500, valor_faturamento_real: null },
    // Cancelada: não entra.
    { id: 'v3', created_at: '2026-08-07T11:00:00', status: 'cancelado', total: 999, valor_faturamento_real: null },
    // Julho: fora do período.
    { id: 'v4', created_at: '2026-07-30T11:00:00', status: 'pago', total: 777, valor_faturamento_real: null },
  ];
  const DEVOLUCAO_DE_AGOSTO = [{ id: 'd1', created_at: '2026-08-08T09:00:00', valor_devolvido_cliente: 200 }];

  it('o Fluxo de Caixa soma as vendas do balcão no que entrou', async () => {
    vi.setSystemTime(new Date('2026-08-20T12:00:00'));
    mockSupabase.atual = bancoComFiltros({
      titulos_financeiros: [
        // A única entrada que o Fluxo enxergava antes: a OS de R$ 150.
        { id: 't1', natureza: 'receber', descricao: 'OS OS-202608-0002 — serviço', valor: 150,
          vencimento: '2026-08-10', status: 'pago', pago_em: '2026-08-10' },
      ],
      vendas: VENDAS_DE_AGOSTO,
      devolucoes: DEVOLUCAO_DE_AGOSTO,
    });
    const { default: FluxoCaixa } = await import('./FluxoCaixa');
    renderizarTela(<FluxoCaixa />);

    // 150 da OS + (1.000 + 500 − 200 devolvidos) das vendas = 1.450.
    await waitFor(() => expect(cartao('Entrou')).toHaveTextContent(/1\.450,00/));
    expect(cartao('Entrou')).toHaveTextContent(/1\.300,00 em vendas do balcão/);
    expect(screen.getByText('Vendas do balcão (PDV)')).toBeInTheDocument();
  });

  it('o Relatório Financeiro conta o "Já pago" pela DATA DO PAGAMENTO, como o Fluxo', async () => {
    // Setembro de 2026, com os títulos reais do achado: venceram em agosto e
    // foram pagos em setembro.
    vi.setSystemTime(new Date('2026-09-20T12:00:00'));
    mockSupabase.atual = bancoComFiltros({
      titulos_financeiros: [
        { id: 'a', natureza: 'pagar', descricao: 'Fornecedor', valor: 10000, valor_pago: 10000,
          vencimento: '2026-08-14', status: 'pago', pago_em: '2026-09-14' },
        { id: 'b', natureza: 'pagar', descricao: 'Conta de agosto', valor: 1111, valor_pago: 1111,
          vencimento: '2026-08-02', status: 'pago', pago_em: '2026-09-02' },
        { id: 'c', natureza: 'receber', descricao: 'OS de setembro', valor: 1950, valor_pago: 1950,
          vencimento: '2026-09-10', status: 'pago', pago_em: '2026-09-10' },
      ],
      vendas: [],
      devolucoes: [],
    });
    const { default: RelatorioFinanceiro } = await import('../relatorios/RelatorioFinanceiro');
    renderizarTela(<RelatorioFinanceiro />);

    // Antes: "Já pago R$ 0,00" e realizado +1.950 — o contrário do Fluxo.
    await waitFor(() => expect(cartao('Já pago')).toHaveTextContent(/11\.111,00/));
    expect(cartao('Já recebido')).toHaveTextContent(/1\.950,00/);
    expect(cartao('Resultado realizado')).toHaveTextContent(/-R\$\s*9\.161,00|−R\$\s*9\.161,00|R\$\s*-9\.161,00/);
  });

  it('o Relatório Financeiro também enxerga as vendas do balcão', async () => {
    vi.setSystemTime(new Date('2026-08-20T12:00:00'));
    mockSupabase.atual = bancoComFiltros({
      titulos_financeiros: [],
      vendas: VENDAS_DE_AGOSTO,
      devolucoes: DEVOLUCAO_DE_AGOSTO,
    });
    const { default: RelatorioFinanceiro } = await import('../relatorios/RelatorioFinanceiro');
    renderizarTela(<RelatorioFinanceiro />);

    await waitFor(() => expect(cartao('Vendas do balcão')).toHaveTextContent(/1\.300,00/));
    expect(cartao('Resultado realizado')).toHaveTextContent(/1\.300,00/);
  });
});
