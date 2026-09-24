import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Minhas Tarefas — a tela que a equipe abre todo dia.
 *
 * O que estes testes seguram:
 *   - a conta do cabeçalho ("Você tem 2 tarefas hoje. 1 já feita.") bate com
 *     as tarefas da pessoa e com o feito de HOJE, que mora em
 *     `tarefas_conclusoes` e não no status — é o que faz a tarefa de todo dia
 *     voltar pendente amanhã sem ninguém zerar nada;
 *   - a feita aparece riscada e vai para o fim, a pendente não;
 *   - o agrupamento segue o turno, e "sem horário" fica por último;
 *   - sem nada para hoje, a tela diz isso e aponta o caminho.
 */

// Uma quarta-feira de manhã: "Bom dia".
const AGORA = new Date('2026-09-23T09:30:00');
const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'u1', nome: 'Pedro Henrique', tenant_id: 'loja-1' } },
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

const MANHA = { id: 'p-manha', descricao: 'Manhã (7 às 11)' };

/** Uma linha de `tarefas` como a consulta de Minhas Tarefas devolve. */
function linhaDeTarefa(id: string, titulo: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    quadro_id: 'q-loja',
    lista_id: 'l-pedro',
    titulo,
    descricao: null,
    prioridade: 'normal',
    status: 'nao_iniciado',
    dias_semana: TODOS_OS_DIAS,
    periodo_id: MANHA.id,
    prazo: null,
    concluida_em: null,
    ordem: 1024,
    arquivada_em: null,
    criado_por: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    periodo: MANHA,
    tarefas_responsaveis: [{ user_id: 'u1', profiles: { id: 'u1', nome: 'Pedro Henrique', avatar_url: null } }],
    tarefas_etiquetas: [],
    tarefas_checklist: [],
    tarefas_comentarios: [],
    quadro: { nome: 'Loja', arquivado_em: null },
    lista: { nome: 'Vendedor sênior', responsavel_id: null, arquivada_em: null },
    ...extra,
  };
}

const CATALOGO_DE_TURNOS = [
  { id: MANHA.id, tenant_id: 'loja-1', tipo: 'tarefa_periodo', descricao: MANHA.descricao, cor: null, ordem: 10, ativo: true, padrao: false },
  { id: 'p-livre', tenant_id: 'loja-1', tipo: 'tarefa_periodo', descricao: 'Livre', cor: null, ordem: 40, ativo: true, padrao: true },
];

async function abrirMinhasTarefas(tabelas: Record<string, unknown[]>) {
  mockCan.mockImplementation(montarCan({ perfil: 'vendedor' }));
  mockSupabase.atual = bancoFalso({
    catalogos: CATALOGO_DE_TURNOS,
    tarefas_quadros: [],
    tarefas_listas: [],
    ...tabelas,
  });
  const { default: MinhasTarefas } = await import('./MinhasTarefas');
  return renderizarTela(<MinhasTarefas />);
}

describe('Minhas Tarefas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conta as tarefas de hoje e as já feitas no cabeçalho', async () => {
    await abrirMinhasTarefas({
      tarefas_responsaveis: [{ tarefa_id: 't1' }, { tarefa_id: 't2' }],
      tarefas: [linhaDeTarefa('t1', 'Repor os copos'), linhaDeTarefa('t2', 'Ligar os telefones da loja')],
      // O feito de hoje da t1: é isto, e não o status, que a torna "feita".
      tarefas_conclusoes: [{ tarefa_id: 't1' }],
    });

    expect(await screen.findByText('Você tem 2 tarefas hoje. 1 já feita.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bom dia, Pedro.');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('a feita hoje aparece riscada e depois da pendente', async () => {
    await abrirMinhasTarefas({
      tarefas_responsaveis: [{ tarefa_id: 't1' }, { tarefa_id: 't2' }],
      // A feita vem primeiro na ordem do quadro, de propósito: a tela é que
      // tem que mandá-la para o fim.
      tarefas: [
        linhaDeTarefa('t1', 'Repor os copos', { ordem: 1024 }),
        linhaDeTarefa('t2', 'Ligar os telefones da loja', { ordem: 2048 }),
      ],
      tarefas_conclusoes: [{ tarefa_id: 't1' }],
    });

    const feita = await screen.findByRole('button', { name: 'Repor os copos' });
    const pendente = screen.getByRole('button', { name: 'Ligar os telefones da loja' });

    expect(feita).toHaveClass('line-through');
    expect(pendente).not.toHaveClass('line-through');
    expect(pendente.compareDocumentPosition(feita) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // A bolinha diz o estado para quem usa leitor de tela, e é por ela que
    // se desfaz um clique errado.
    expect(screen.getByRole('button', { name: 'Desmarcar: ainda não terminei' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Marcar como feita' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('agrupa por turno, com "sem horário" por último', async () => {
    await abrirMinhasTarefas({
      tarefas_responsaveis: [{ tarefa_id: 't1' }, { tarefa_id: 't2' }],
      tarefas: [
        linhaDeTarefa('t1', 'Conferir o caixa', { periodo_id: null, periodo: null }),
        linhaDeTarefa('t2', 'Responder a OLX cedo'),
      ],
      tarefas_conclusoes: [],
    });

    const manha = await screen.findByRole('heading', { name: 'Manhã (7 às 11)' });
    const semHorario = screen.getByRole('heading', { name: 'Sem horário definido' });
    expect(manha.compareDocumentPosition(semHorario) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Você tem 2 tarefas hoje. Nenhuma feita ainda.')).toBeInTheDocument();
  });

  it('avulsa vencida aparece como atrasada, com a data do prazo', async () => {
    await abrirMinhasTarefas({
      tarefas_responsaveis: [{ tarefa_id: 't1' }],
      tarefas: [linhaDeTarefa('t1', 'Fazer o pedido das sacolas', { dias_semana: [], prazo: '2026-09-20' })],
      tarefas_conclusoes: [],
    });

    expect(await screen.findByText('Venceu em 20/09')).toBeInTheDocument();
    expect(screen.getByText('Atrasada')).toBeInTheDocument();
  });

  it('sem nada para hoje, diz isso e aponta os quadros', async () => {
    await abrirMinhasTarefas({ tarefas_responsaveis: [], tarefas: [], tarefas_conclusoes: [] });

    expect(await screen.findByText('Nada para hoje.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma tarefa sua para hoje.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: /ver os quadros/i })).toHaveAttribute('href', '/tarefas'));
  });
});
