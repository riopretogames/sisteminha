import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Os números do Dashboard de Assistência.
 *
 * Dois pontos merecem teste de verdade, porque são regra e não conta:
 *
 *   • APARELHO PARADO muda de cor conforme o tempo. É um alerta operacional:
 *     se a cor não acompanhar os dias, o aviso deixa de avisar.
 *   • SERVIÇO É TEXTO LIVRE. "Troca de tela" e "troca de tela " precisam
 *     contar como um só, senão o carro-chefe da bancada aparece espalhado em
 *     três linhas e nenhuma parece importante.
 */

const HOJE = new Date('2026-08-23T15:00:00');

function os(over: Record<string, unknown>) {
  return {
    id: 'o',
    numero_os: 'OS0001',
    created_at: '2026-08-23T09:00:00',
    updated_at: '2026-08-23T09:00:00',
    data_finalizacao: null,
    status: 'aguardando_analise',
    reparo_inviavel: false,
    laudo_aprovado: null,
    total_orcamento: 200,
    valor_final_pago: null,
    tecnico_id: 'tec1',
    tecnico: { nome: 'Carlos' },
    equipamento_id: 'eq1',
    equipamento: { descricao: 'Celular' },
    clientes: { nome: 'Cliente Teste' },
    itens: [],
    ...over,
  };
}

const servico = (descricao: string, preco: number) => ({
  descricao,
  produto_id: null,
  quantidade: 1,
  preco_cobrado: preco,
  horas_mao_obra: 1,
});
const peca = (descricao: string, preco: number) => ({
  descricao,
  produto_id: 'p1',
  quantidade: 1,
  preco_cobrado: preco,
  horas_mao_obra: null,
});
/** Frete, terceirização: o que a loja repassa e não é peça nem mão de obra. */
const outroCusto = (descricao: string, preco: number) => ({
  descricao,
  produto_id: null,
  tipo_item: 'complementar',
  quantidade: 1,
  preco_cobrado: preco,
  horas_mao_obra: null,
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

async function abrir(ordens: unknown[]) {
  mockSupabase.atual = bancoFalso({ service_orders: ordens });
  const { default: DashboardAssistencia } = await import('./DashboardAssistencia');
  return renderizarTela(<DashboardAssistencia />);
}

describe('Dashboard de Assistência — os números', () => {
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

  it('conta os aparelhos que entraram hoje', async () => {
    await abrir([
      os({ id: '1', created_at: '2026-08-23T09:00:00' }),
      os({ id: '2', created_at: '2026-08-23T11:00:00' }),
      os({ id: '3', created_at: '2026-08-18T11:00:00' }), // semana, não hoje
    ]);

    await waitFor(() => {
      expect(screen.getByText('Entraram Hoje')).toBeInTheDocument();
    });
    expect(screen.getByText(/3 nesta semana/)).toBeInTheDocument();
  });

  it('lista os aparelhos parados, do mais antigo para o mais novo', async () => {
    await abrir([
      os({ id: '1', numero_os: 'OS0009', created_at: '2026-08-21T09:00:00' }),
      os({ id: '2', numero_os: 'OS0001', created_at: '2026-07-20T09:00:00' }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('OS0001')).toBeInTheDocument();
    });
    // O mais antigo primeiro: aparelho esquecido é o que precisa aparecer.
    const linhas = screen.getAllByRole('row');
    const textos = linhas.map((l) => l.textContent ?? '');
    const iAntigo = textos.findIndex((t) => t.includes('OS0001'));
    const iNovo = textos.findIndex((t) => t.includes('OS0009'));
    expect(iAntigo).toBeLessThan(iNovo);
  });

  it('pinta de VERMELHO o que passou de 15 dias parado', async () => {
    await abrir([os({ id: '1', created_at: '2026-07-20T09:00:00' })]); // 34 dias

    await waitFor(() => {
      expect(screen.getByText('34 dia(s)')).toBeInTheDocument();
    });
    expect(screen.getByText('34 dia(s)').className).toMatch(/text-red-600/);
  });

  it('pinta de LARANJA entre 7 e 15 dias', async () => {
    await abrir([os({ id: '1', created_at: '2026-08-13T09:00:00' })]); // 10 dias

    await waitFor(() => {
      expect(screen.getByText('10 dia(s)')).toBeInTheDocument();
    });
    expect(screen.getByText('10 dia(s)').className).toMatch(/text-amber-600/);
  });

  it('junta as variações de digitação do mesmo serviço numa linha só', async () => {
    // O ponto principal: sem isso, "Troca de tela" apareceria três vezes.
    await abrir([
      os({
        id: '1',
        status: 'entregue',
        data_finalizacao: '2026-08-22T10:00:00',
        valor_final_pago: 300,
        itens: [servico('Troca de tela', 300)],
      }),
      os({
        id: '2',
        status: 'entregue',
        data_finalizacao: '2026-08-22T11:00:00',
        valor_final_pago: 300,
        itens: [servico('troca de tela ', 300)],
      }),
      os({
        id: '3',
        status: 'entregue',
        data_finalizacao: '2026-08-22T12:00:00',
        valor_final_pago: 300,
        itens: [servico('TROCA DE TELA', 300)],
      }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('Troca de tela')).toBeInTheDocument();
    });
    // Uma linha só, com as três vezes somadas.
    expect(screen.getAllByText(/^Troca de tela$/i)).toHaveLength(1);
  });

  it('separa mão de obra de peça pelo vínculo com o cadastro', async () => {
    await abrir([
      os({
        id: '1',
        status: 'entregue',
        data_finalizacao: '2026-08-22T10:00:00',
        valor_final_pago: 500,
        itens: [servico('Limpeza', 200), peca('Bateria', 300)],
      }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('Mão de Obra da Semana')).toBeInTheDocument();
    });
    expect(screen.getByText('Peças da Semana')).toBeInTheDocument();
    // 200 de mão de obra em 500 = 40%; peça fica com 60%.
    expect(screen.getByText(/40% do serviço entregue/)).toBeInTheDocument();
    expect(screen.getByText(/60% do serviço entregue/)).toBeInTheDocument();
  });

  describe('a OS que o cliente RECUSOU (achado da revisão de 01/09)', () => {
    /**
     * A recusada anda pelas mesmas etapas da aprovada desde 01/09 — ela volta
     * para a bancada, o técnico remonta e o cliente vem buscar. Ou seja: ela
     * PASSA por "entregue" como qualquer outra, mas o que entrou no caixa foi
     * só a taxa de análise. Somar os itens dela é contar como faturamento da
     * semana o reparo que ninguém fez.
     */
    const recusada = os({
      id: 'recusada',
      status: 'entregue',
      laudo_aprovado: false,
      data_finalizacao: '2026-08-22T10:00:00',
      // O que o cliente pagou é a taxa de análise, não o orçamento recusado.
      valor_final_pago: 80,
      itens: [servico('Troca de placa', 450), peca('Placa lógica', 600)],
    });

    it('as peças e a mão de obra dela NÃO entram na conta da semana', async () => {
      await abrir([recusada]);

      await waitFor(() => {
        expect(screen.getByText('Mão de Obra da Semana')).toBeInTheDocument();
      });
      // Nem os R$ 450 do serviço, nem os R$ 600 da peça que voltou ao estoque.
      expect(screen.queryByText('R$ 450,00')).not.toBeInTheDocument();
      expect(screen.queryByText('R$ 600,00')).not.toBeInTheDocument();
      expect(
        screen.getByText(/Nenhum serviço lançado nesta semana/),
      ).toBeInTheDocument();
    });

    it('a peça devolvida não aparece em "Peças Mais Usadas"', async () => {
      await abrir([recusada]);

      await waitFor(() => {
        expect(screen.getByText('Peças Mais Usadas')).toBeInTheDocument();
      });
      expect(screen.queryByText('Placa lógica')).not.toBeInTheDocument();
      expect(screen.queryByText('Troca de placa')).not.toBeInTheDocument();
    });

    it('mas ela continua contando como entrega e como faturamento da taxa', async () => {
      // O aparelho saiu da loja e os R$ 80 entraram: isso aconteceu de verdade
      // e some do painel se a correção for larga demais.
      await abrir([recusada]);

      await waitFor(() => {
        expect(screen.getByText('Entregues na Semana')).toBeInTheDocument();
      });
      expect(screen.getByText(/R\$ 80,00 recebidos/)).toBeInTheDocument();
    });
  });

  it('mostra os "outros custos" — frete e terceirização — em cartão próprio', async () => {
    // Antes eles eram calculados e não apareciam em lugar nenhum: os dois
    // cartões ao lado somavam menos do que a OS cobrou, sem nome para a
    // diferença.
    await abrir([
      os({
        id: '1',
        status: 'entregue',
        data_finalizacao: '2026-08-22T10:00:00',
        valor_final_pago: 600,
        itens: [servico('Limpeza', 200), peca('Bateria', 300), outroCusto('Frete da peça', 100)],
      }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('Outros Custos da Semana')).toBeInTheDocument();
    });
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument();
    // E a porcentagem passa a ser sobre a conta INTEIRA: 200 em 600 = 33%,
    // não 40% (que era 200 em 500, ignorando o frete).
    expect(screen.getByText(/33% do serviço entregue/)).toBeInTheDocument();
  });

  it('bancada vazia não quebra nem inventa número', async () => {
    await abrir([]);

    await waitFor(() => {
      expect(screen.getByText('Dashboard de Assistência')).toBeInTheDocument();
    });
    expect(screen.getByText(/Nenhuma OS em aberto. Bancada limpa./)).toBeInTheDocument();
  });
});
