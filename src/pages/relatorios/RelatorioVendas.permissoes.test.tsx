import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Quem pode abrir a ficha da venda a partir do Relatório de Vendas.
 *
 * Este teste existe por causa de um defeito real, achado na revisão de 28/08 e
 * corrigido no mesmo dia: ao tornar a linha do relatório clicável, o clique
 * ficou sem conferir permissão nenhuma.
 *
 * A conta que torna isso sério: o relatório abre com `reports.view`, e a ficha
 * é conteúdo do módulo Venda (`sales.view`). O perfil **Gerente Técnico** tem
 * o primeiro e não tem o segundo — para ele o menu Venda nem existe. Sem a
 * conferência, um clique passava a mostrar produtos, IMEI, desconto por item,
 * formas de pagamento e a linha do tempo de qualquer venda.
 *
 * E o banco não segura: a policy de leitura de `vendas` filtra por loja, não
 * por permissão. Quem protege é a tela — por isso o teste é aqui.
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

const VENDA = {
  id: 'venda-1',
  numero_venda: 'OV0006',
  created_at: '2026-08-27T22:03:00',
  status: 'pago',
  subtotal: 429.9,
  descontos: 0,
  total: 429.9,
  valor_faturamento_real: null,
  clientes: { nome: 'Adriana Prado' },
};

/**
 * `menos: ['sales.view']` reproduz o Gerente Técnico com precisão: ele tem
 * relatórios, estoque e OS, e não tem o módulo Venda. Usar um perfil sem
 * permissão nenhuma faria o teste passar por motivo errado — a tela ficaria
 * vazia e o clique não abriria coisa alguma de qualquer jeito.
 */
async function abrir(quem: 'com acesso a venda' | 'sem acesso a venda') {
  mockCan.mockImplementation(
    montarCan(
      quem === 'com acesso a venda'
        ? { perfil: 'administrador' }
        : { perfil: 'administrador', menos: ['sales.view'] },
    ),
  );
  mockSupabase.atual = bancoFalso({
    vendas: [VENDA],
    devolucoes: [],
    profiles: [{ id: 'p1', nome: 'Felipe', ativo: true }],
  });
  const { default: RelatorioVendas } = await import('./RelatorioVendas');
  return renderizarTela(<RelatorioVendas />);
}

describe('Relatório de Vendas: quem abre a ficha da venda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('quem NÃO tem acesso a Venda não consegue abrir a ficha pela linha', async () => {
    await abrir('sem acesso a venda');
    await waitFor(() => expect(screen.getByText('OV0006')).toBeInTheDocument());

    fireEvent.click(screen.getByText('OV0006'));

    // A linha continua sendo linha de relatório: nenhum diálogo abre.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('quem tem acesso a Venda abre a ficha clicando na linha', async () => {
    await abrir('com acesso a venda');
    await waitFor(() => expect(screen.getByText('OV0006')).toBeInTheDocument());

    fireEvent.click(screen.getByText('OV0006'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('o relatório em si continua aberto para quem só tem relatórios', async () => {
    // O ponto da correção é tirar o CLIQUE, não a tela: o Gerente Técnico
    // continua vendo número, data, cliente, desconto e total, como sempre viu.
    await abrir('sem acesso a venda');
    await waitFor(() => {
      expect(screen.getByText('OV0006')).toBeInTheDocument();
      expect(screen.getByText('Adriana Prado')).toBeInTheDocument();
    });
  });
});
