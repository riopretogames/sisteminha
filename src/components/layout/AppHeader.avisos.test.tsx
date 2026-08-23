import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * O sino de avisos.
 *
 * Até 23/08 ele era enfeite: nenhum clique, e o número "3" DIGITADO no
 * código. Estes testes existem para isso não voltar — em especial o que
 * confere que o número bate com a quantidade de avisos, e o que confere que
 * o sino some quando não há nada pendente.
 *
 * O caso mais importante é o da permissão: quem não vê financeiro não pode
 * ser avisado de conta vencida. Avisar alguém de um problema que ela não tem
 * como abrir nem resolver é só angústia.
 */

const HOJE = new Date('2026-08-23T15:00:00');

const PRODUTO_ZERADO = { id: 'p1', estoque_atual: 0, estoque_minimo: 3 };
const PRODUTO_OK = { id: 'p2', estoque_atual: 50, estoque_minimo: 3 };
const OS_PARADA = { id: 'o1', status: 'aprovado', created_at: '2026-07-20T09:00:00' };
const OS_NOVA = { id: 'o2', status: 'aprovado', created_at: '2026-08-23T09:00:00' };
const TITULO_VENCIDO = { id: 't1', valor: 250, vencimento: '2026-08-01' };

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

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

async function abrirCabecalho(
  perfil: 'administrador' | 'vendedor',
  tabelas: Record<string, unknown[]>,
) {
  mockCan.mockImplementation(montarCan({ perfil }));
  mockSupabase.atual = bancoFalso({
    vw_produtos: [],
    service_orders: [],
    titulos_financeiros: [],
    caixa_sessoes: [],
    ...tabelas,
  });
  const { AppHeader } = await import('./AppHeader');
  return renderizarTela(<AppHeader />);
}

const sino = () => screen.getByRole('button', { name: /avisos/i });

/**
 * Abre o menu do sino.
 *
 * `fireEvent.click` nao serve: o menu suspenso do sistema escuta o PONTEIRO
 * (pointerdown), nao o clique. Com clique simples o botao recebe o evento e
 * nada acontece -- o teste falha parecendo que o menu esta quebrado, quando na
 * verdade e o teste que nao sabe abrir.
 */
function abrirMenu() {
  fireEvent.pointerDown(
    sino(),
    new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
  );
}

describe('Sino de avisos', () => {
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

  it('NÃO mostra número quando não há nada pendente', async () => {
    // O defeito antigo: mostrava "3" com a loja em dia.
    await abrirCabecalho('administrador', { vw_produtos: [PRODUTO_OK] });

    await waitFor(() => {
      expect(sino()).toBeInTheDocument();
    });
    expect(sino().textContent).not.toMatch(/\d/);
  });

  it('diz "loja em dia" ao abrir sem pendência', async () => {
    await abrirCabecalho('administrador', { vw_produtos: [PRODUTO_OK] });

    await waitFor(() => expect(sino()).toBeInTheDocument());
    abrirMenu();

    await waitFor(() => {
      expect(screen.getByText(/nada pendente/i)).toBeInTheDocument();
    });
  });

  it('o número bate com a quantidade de avisos', async () => {
    // Três problemas diferentes = três avisos.
    await abrirCabecalho('administrador', {
      vw_produtos: [PRODUTO_ZERADO],
      service_orders: [OS_PARADA],
      titulos_financeiros: [TITULO_VENCIDO],
    });

    await waitFor(() => {
      expect(sino().textContent).toContain('3');
    });
  });

  it('avisa de produto zerado, com o caminho para resolver', async () => {
    await abrirCabecalho('administrador', { vw_produtos: [PRODUTO_ZERADO] });

    await waitFor(() => expect(sino().textContent).toContain('1'));
    abrirMenu();

    await waitFor(() => {
      expect(screen.getByText(/1 produto\(s\) no fim do estoque/)).toBeInTheDocument();
    });
    expect(screen.getByText(/1 já zerado/)).toBeInTheDocument();
  });

  it('avisa de aparelho parado, dizendo há quantos dias', async () => {
    await abrirCabecalho('administrador', { service_orders: [OS_PARADA, OS_NOVA] });

    await waitFor(() => expect(sino().textContent).toContain('1'));
    abrirMenu();

    await waitFor(() => {
      expect(screen.getByText(/1 aparelho\(s\) parado\(s\)/)).toBeInTheDocument();
    });
    // A OS de hoje não entra: só conta a partir de 7 dias.
    expect(screen.getByText(/há 34 dias/)).toBeInTheDocument();
  });

  it('NÃO avisa de conta vencida quem não pode ver financeiro', async () => {
    // O ponto principal: avisar de um problema que a pessoa não consegue
    // abrir nem resolver é só angústia.
    await abrirCabecalho('vendedor', { titulos_financeiros: [TITULO_VENCIDO] });

    await waitFor(() => expect(sino()).toBeInTheDocument());
    abrirMenu();

    await waitFor(() => {
      expect(screen.getByText(/nada pendente/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/conta\(s\) vencida/)).not.toBeInTheDocument();
  });

  it('avisa de conta vencida quem PODE ver, com o valor em atraso', async () => {
    await abrirCabecalho('administrador', { titulos_financeiros: [TITULO_VENCIDO] });

    await waitFor(() => expect(sino().textContent).toContain('1'));
    abrirMenu();

    await waitFor(() => {
      expect(screen.getByText(/1 conta\(s\) vencida/)).toBeInTheDocument();
    });
    expect(screen.getByText(/R\$ 250,00 em atraso/)).toBeInTheDocument();
  });
});
