import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderizarTela, montarCan, silenciarConsole } from '@/test/apoio';
import { OS_ETAPAS } from '@/config/osStatus';

/**
 * O quadro/lista de OS — a tela que fica aberta o dia inteiro no balcão.
 *
 * O que estes testes protegem (revisão de 24/09):
 *   • a decisão de mover uma OS usa a OS como está NO BANCO agora, não a
 *     lista carregada horas antes;
 *   • o seletor da lista segue a mesma regra da ficha (lib/decisaoDoLaudo);
 *   • o motivo que o banco escreveu aparece, em vez de "Tente novamente";
 *   • "Nova OS" só para quem pode abrir OS.
 */

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
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

const ETAPAS = [
  { id: '1', key: OS_ETAPAS.AGUARDANDO_ANALISE, label: 'Entrada / Análise', numero: '1',
    color: 'bg-violet-500 text-white', ordem: 10, ativo: true, sistema: true },
  { id: '2', key: OS_ETAPAS.AGUARDANDO_APROVACAO, label: 'Aguardando aprovação', numero: '2a',
    color: 'bg-orange-500 text-white', ordem: 20, ativo: true, sistema: true },
  { id: '3', key: 'aguardando_peca', label: 'Aguardando Peça', numero: '2b',
    color: 'bg-amber-500 text-white', ordem: 30, ativo: true, sistema: false },
  { id: '4', key: OS_ETAPAS.APROVADO, label: 'Aprovado / Executar', numero: '3',
    color: 'bg-green-600 text-white', ordem: 40, ativo: true, sistema: true },
  { id: '6', key: OS_ETAPAS.FINALIZADO, label: 'Finalizado', numero: '5',
    color: 'bg-cyan-500 text-white', ordem: 60, ativo: true, sistema: true },
  { id: '7', key: OS_ETAPAS.ENTREGUE, label: 'Entregue', numero: '6',
    color: 'bg-emerald-500 text-white', ordem: 70, ativo: true, sistema: true },
];

type LinhaOS = Record<string, unknown>;

function linhaOS(campos: Partial<LinhaOS> = {}): LinhaOS {
  return {
    id: 'os-1',
    numero_os: 'OS-202609-0001',
    cliente_id: 'c1',
    marca: 'Sony',
    modelo: null,
    numero_serie: null,
    defeito_cliente: 'Não liga',
    status: OS_ETAPAS.FINALIZADO,
    tipo: 'paga',
    prioridade: 'normal',
    laudo_aprovado: true,
    laudo_eletronico: true,
    valor_orcado_recusado: null,
    laudo_motivo_recusa: null,
    total_orcamento: 450,
    tecnico_id: null,
    prazo_previsto: null,
    created_at: '2026-09-20T10:00:00+00:00',
    clientes: { nome: 'Adriana Prado' },
    tecnico: null,
    ...campos,
  };
}

/**
 * O banco de mentira do quadro. Ele sabe distinguir as três leituras de OS
 * que a tela faz — a fila (em andamento), as encerradas recentes e a
 * RELEITURA de uma OS só, antes de mover — porque o ponto do teste é
 * justamente a releitura trazer outra coisa que a lista. O erro de gravação
 * vem como objeto comum, que é como o Supabase entrega.
 */
function montarBanco(opcoes: {
  naLista: LinhaOS;
  noBancoAgora?: LinhaOS;
  gravacaoRecusada?: string;
}) {
  const gravacoes: unknown[] = [];

  const consultaDeOS = () => {
    let releitura = false;
    let encerradas = false;
    let gravando = false;
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'gte', 'order', 'range', 'limit']) c[m] = () => c;
    c.in = () => {
      encerradas = true;
      return c;
    };
    c.eq = (coluna: string) => {
      if (coluna === 'id' && !gravando) releitura = true;
      return c;
    };
    c.update = (dados: unknown) => {
      gravando = true;
      gravacoes.push(dados);
      return c;
    };
    const resultado = () => {
      if (gravando) {
        return {
          data: null,
          error: opcoes.gravacaoRecusada ? { message: opcoes.gravacaoRecusada, code: '42501' } : null,
        };
      }
      if (releitura) return { data: opcoes.noBancoAgora ?? opcoes.naLista, error: null };
      return { data: encerradas ? [] : [opcoes.naLista], error: null };
    };
    c.maybeSingle = () => Promise.resolve(resultado());
    c.then = (aceitar: (r: unknown) => unknown) => Promise.resolve(resultado()).then(aceitar);
    return c;
  };

  const lista = (dados: unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'in', 'not', 'range']) c[m] = () => c;
    c.then = (aceitar: (r: unknown) => unknown) =>
      Promise.resolve({ data: dados, error: null }).then(aceitar);
    return c;
  };

  return {
    gravacoes,
    banco: {
      from: (tabela: string) => {
        if (tabela === 'service_orders') return consultaDeOS();
        if (tabela === 'os_status_config') return lista(ETAPAS);
        return lista([]);
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
}

async function abrirQuadro(
  perfil: 'tecnico' | 'vendedor' | 'administrador',
  banco: ReturnType<typeof montarBanco>,
) {
  mockCan.mockImplementation(montarCan({ perfil }));
  mockSupabase.atual = banco.banco;
  const { default: OrdensServico } = await import('./OrdensServico');
  renderizarTela(<OrdensServico />);
  // A linha da OS na grade (o modo padrão).
  const numero = await screen.findByText('OS-202609-0001');
  return numero.closest('tr') as HTMLElement;
}

/** Abre o seletor de etapa da linha e escolhe a etapa pelo nome. */
async function escolherEtapa(linha: HTMLElement, nome: RegExp) {
  const gatilho = within(linha).getByRole('combobox');
  fireEvent.keyDown(gatilho, { key: 'ArrowDown' });
  const opcoes = await screen.findAllByRole('option');
  const alvo = opcoes.find((o) => nome.test(o.textContent ?? ''));
  if (!alvo) throw new Error(`a etapa ${nome} não está no seletor: ${opcoes.map((o) => o.textContent).join(' | ')}`);
  fireEvent.keyDown(alvo, { key: 'Enter' });
}

async function nomesDoSeletor(linha: HTMLElement) {
  const gatilho = within(linha).getByRole('combobox');
  fireEvent.keyDown(gatilho, { key: 'ArrowDown' });
  const opcoes = await screen.findAllByRole('option');
  return opcoes.map((o) => o.textContent ?? '').join(' | ');
}

describe('O quadro de OS', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    try {
      localStorage.clear();
    } catch {
      // sem armazenamento: o quadro abre na grade do mesmo jeito
    }
  });

  it('decide sobre a OS como está no banco AGORA, não como estava na lista', async () => {
    // Na lista (carregada cedo), a OS vale R$ 450. No banco, alguém já a
    // deixou em R$ 0. Entregar agora seria sair sem cobrança — e o técnico
    // não pode fazer isso. Se a tela usasse a lista velha, abriria o
    // pagamento de R$ 450.
    const banco = montarBanco({
      naLista: linhaOS({ total_orcamento: 450 }),
      noBancoAgora: linhaOS({ total_orcamento: 0 }),
    });
    const linha = await abrirQuadro('tecnico', banco);

    await escolherEtapa(linha, /Entregue/);

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(String(mockToast.mock.calls.at(-1)![0].description)).toMatch(/R\$ 0,00/);
    expect(banco.gravacoes).toHaveLength(0);
  });

  it('em "Aguardando aprovação", a lista não oferece a Peça nem a entrega — nem a quem aprova', async () => {
    const banco = montarBanco({
      naLista: linhaOS({ status: OS_ETAPAS.AGUARDANDO_APROVACAO, laudo_aprovado: null }),
    });
    const linha = await abrirQuadro('vendedor', banco);

    const nomes = await nomesDoSeletor(linha);
    expect(nomes).not.toMatch(/Aguardando Peça|Entregue|Finalizado|Aprovado \/ Executar/);
    expect(nomes).toMatch(/Entrada \/ Análise/);
  });

  it('o motivo que o banco escreveu aparece — não "Tente novamente"', async () => {
    const motivo = 'Sem permissão para aprovar orçamento de OS.';
    const banco = montarBanco({
      naLista: linhaOS({ status: OS_ETAPAS.APROVADO, tipo: 'garantia', total_orcamento: 0 }),
      gravacaoRecusada: motivo,
    });
    const linha = await abrirQuadro('administrador', banco);

    await escolherEtapa(linha, /Finalizado/);

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: motivo })),
    );
  });

  it('"Nova OS" só aparece para quem pode abrir OS', async () => {
    const banco = montarBanco({ naLista: linhaOS() });
    await abrirQuadro('tecnico', banco);
    expect(screen.queryByRole('button', { name: /nova os/i })).not.toBeInTheDocument();
  });

  it('o vendedor, que abre OS, vê o botão', async () => {
    const banco = montarBanco({ naLista: linhaOS() });
    await abrirQuadro('vendedor', banco);
    expect(screen.getByRole('button', { name: /nova os/i })).toBeInTheDocument();
  });
});
