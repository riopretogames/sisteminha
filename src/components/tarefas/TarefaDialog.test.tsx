import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { bancoFalso, renderizarTela, silenciarConsole } from '@/test/apoio';
import { TarefaDialog } from '@/components/tarefas/TarefaDialog';
import { quandoFoi } from '@/lib/tarefas';
import type { AcoesDoQuadro, HorarioOpcao, ItemDeConferencia, Lista, PropsTarefaDialog, Tarefa } from '@/types/tarefas';

/**
 * A ficha da tarefa.
 *
 * O que estes testes seguram:
 * - a ficha mostra o andamento DO DIA (recorrente feita hoje = "Feito hoje";
 *   avulsa vencida = "Atrasada"), não o status cru gravado no banco;
 * - trocar o status passa pela ação do quadro (que sabe a regra do feito de
 *   hoje), nunca grava direto;
 * - quem não tem `tasks.edit` não recebe campo de edição que o banco vai
 *   recusar — mas, se for responsável pela tarefa, marca o andamento, que é
 *   exatamente o que a policy e o gatilho `travas_das_tarefas` deixam.
 *
 * v2 (24/09):
 * - o horário se escolhe das sugestões da loja (ou digitado) e grava "HH:MM";
 * - a ficha diz em que pé está a conferência do gerente, e quem confere
 *   aprova ou devolve dali mesmo — pela mesma porta da aba Conferência;
 * - feito já conferido fica travado para quem não confere.
 */

const HOJE = new Date('2026-09-23T10:00:00'); // quarta-feira

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const EU = { id: 'u-felipe', nome: 'Felipe Bottaro', avatar_url: null };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-felipe', profile: { id: 'u-felipe', nome: 'Felipe Bottaro', avatar_url: null, email: null, tenant_id: 't1' } },
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

// A conferência tem teste próprio (useConferencia.test); aqui importa só que
// a ficha chame aprovar/devolver com o feito certo.
const mockConferencia = vi.hoisted(() => ({
  itens: [] as ItemDeConferencia[],
  aprovar: vi.fn(),
  devolver: vi.fn(),
}));
vi.mock('@/hooks/useConferencia', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/useConferencia')>();
  return {
    ...original,
    useConferencia: () => ({
      itens: mockConferencia.itens,
      carregando: false,
      erro: null,
      recarregar: vi.fn(),
      aprovar: mockConferencia.aprovar,
      devolver: mockConferencia.devolver,
    }),
  };
});

const LISTA_GERENTE: Lista = {
  id: 'l-gerente',
  quadro_id: 'q1',
  nome: 'Gerente',
  cor: 'bg-amber-500 text-white',
  responsavel_id: null,
  responsavel: null,
  ordem: 1024,
  arquivada_em: null,
};

const LISTA_DONO: Lista = { ...LISTA_GERENTE, id: 'l-dono', nome: 'Dono', cor: 'bg-purple-500 text-white', ordem: 2048 };

function umaTarefa(parcial: Partial<Tarefa> = {}): Tarefa {
  return {
    id: 't1',
    quadro_id: 'q1',
    lista_id: 'l-gerente',
    titulo: 'Conferência do caixa',
    descricao: null,
    prioridade: 'normal',
    status: 'nao_iniciado',
    dias_semana: [0, 1, 2, 3, 4, 5, 6],
    periodo_id: 'p-tarde',
    periodo: { id: 'p-tarde', descricao: 'Tarde (15 às 19)' },
    prazo: null,
    concluida_em: null,
    ordem: 1024,
    arquivada_em: null,
    criado_por: null,
    created_at: '2026-09-20T10:00:00',
    updated_at: '2026-09-20T10:00:00',
    responsaveis: [],
    etiquetas: [],
    checklist_total: 0,
    checklist_feitos: 0,
    comentarios_total: 0,
    feita_hoje: false,
    horario: null,
    conferencia: 'nenhuma',
    anexos_total: 0,
    ...parcial,
  };
}

function acoesFalsas(): AcoesDoQuadro {
  const ok = () => vi.fn().mockResolvedValue(undefined);
  return {
    criarTarefa: vi.fn().mockResolvedValue(true),
    atualizarTarefa: ok(),
    moverTarefa: ok(),
    definirStatus: ok(),
    alternarFeito: ok(),
    arquivarTarefa: ok(),
    definirResponsaveis: ok(),
    definirEtiquetas: ok(),
    criarLista: ok(),
    atualizarLista: ok(),
    moverLista: ok(),
    arquivarLista: ok(),
  };
}

function abrirFicha(parcial: Partial<PropsTarefaDialog> = {}, tabelas: Record<string, unknown[]> = {}) {
  mockSupabase.atual = bancoFalso({ tarefas_checklist: [], tarefas_comentarios: [], profiles: [], ...tabelas });
  const props: PropsTarefaDialog = {
    tarefa: umaTarefa(),
    listas: [LISTA_GERENTE, LISTA_DONO],
    podeEditar: true,
    podeGerenciar: false,
    acoes: acoesFalsas(),
    pessoas: [EU, { id: 'u-pedro', nome: 'Pedro Henrique', avatar_url: null }],
    periodos: [
      { id: 'p-manha', descricao: 'Manhã (7 às 11)', ativo: true },
      { id: 'p-tarde', descricao: 'Tarde (15 às 19)', ativo: true },
    ],
    etiquetas: [{ id: 'e1', descricao: 'Rotina', cor: 'bg-emerald-500 text-white' }],
    horarios: [],
    podeConferir: false,
    onClose: vi.fn(),
    ...parcial,
  };
  renderizarTela(<TarefaDialog {...props} />);
  return props;
}

/** Abre um seletor pelo teclado: o jsdom não tem o "pointer capture" que o clique usa. */
async function abrirSeletor(nome: string) {
  const gatilho = screen.getByRole('combobox', { name: nome });
  fireEvent.keyDown(gatilho, { key: 'ArrowDown' });
  return screen.findAllByRole('option');
}

describe('Ficha da tarefa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('não aparece com a tarefa nula (ficha fechada)', () => {
    abrirFicha({ tarefa: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abre com o título, a lista e o período da tarefa', async () => {
    abrirFicha();
    const ficha = await screen.findByRole('dialog');
    expect(within(ficha).getByDisplayValue('Conferência do caixa')).toBeInTheDocument();
    expect(within(ficha).getAllByText('Gerente').length).toBeGreaterThan(0);
    expect(within(ficha).getAllByText('Tarde (15 às 19)').length).toBeGreaterThan(0);
    // Recorrente: a bolinha grande fala em "hoje", não em concluir de vez. E,
    // como ainda não foi feita, o texto convida a marcar em vez de afirmar
    // "Feita hoje" (que se lia como se já estivesse feita).
    expect(within(ficha).getByText('Marcar como feita hoje')).toBeInTheDocument();
    expect(within(ficha).queryByText('Feita hoje')).not.toBeInTheDocument();
  });

  it('recorrente feita hoje: o texto da bolinha grande diz "Feita hoje"', async () => {
    abrirFicha({ tarefa: umaTarefa({ feita_hoje: true }) });
    const ficha = await screen.findByRole('dialog');
    expect(within(ficha).getByText('Feita hoje')).toBeInTheDocument();
    expect(within(ficha).getByText(/Amanhã ela volta a ficar pendente sozinha/)).toBeInTheDocument();
  });

  it('mudar o status chama acoes.definirStatus (quem sabe a regra do feito de hoje)', async () => {
    const props = abrirFicha();
    await screen.findByRole('dialog');

    const opcoes = await abrirSeletor('Status');
    const fazendo = opcoes.find((o) => o.textContent === 'Fazendo');
    expect(fazendo).toBeDefined();
    fireEvent.click(fazendo!);

    await waitFor(() => {
      expect(props.acoes.definirStatus).toHaveBeenCalledWith({ id: 't1', status: 'fazendo' });
    });
    // Nunca grava o status por fora da regra.
    expect(props.acoes.atualizarTarefa).not.toHaveBeenCalled();
  });

  it('recorrente feita hoje mostra "Feito hoje" no status', async () => {
    abrirFicha({ tarefa: umaTarefa({ feita_hoje: true }) });
    await screen.findByRole('dialog');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Feito hoje');
  });

  it('avulsa com prazo vencido mostra "Atrasada", sem ninguém ter gravado isso', async () => {
    abrirFicha({ tarefa: umaTarefa({ dias_semana: [], periodo: null, periodo_id: null, prazo: '2026-09-20' }) });
    await screen.findByRole('dialog');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Atrasada');
    expect(screen.getByText('Marcar como concluída')).toBeInTheDocument();
  });

  it('a bolinha grande marca o feito pela ação do quadro', async () => {
    const props = abrirFicha();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como feita hoje' }));
    expect(props.acoes.alternarFeito).toHaveBeenCalledWith('t1');
  });

  it('o título salva ao sair do campo; apagar tudo desfaz em vez de salvar vazio', async () => {
    const props = abrirFicha();
    await screen.findByRole('dialog');
    const campo = screen.getByRole('textbox', { name: 'Título da tarefa' });

    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '   ' } });
    fireEvent.blur(campo);
    expect(props.acoes.atualizarTarefa).not.toHaveBeenCalled();
    expect(campo).toHaveValue('Conferência do caixa');

    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: 'Conferência do caixa e do cofre ' } });
    fireEvent.blur(campo);
    expect(props.acoes.atualizarTarefa).toHaveBeenCalledWith({
      id: 't1',
      titulo: 'Conferência do caixa e do cofre',
    });
  });

  it('arquivar pede confirmação e só então arquiva', async () => {
    const props = abrirFicha();
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Arquivar tarefa' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(props.acoes.arquivarTarefa).not.toHaveBeenCalled();

    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Arquivar tarefa' }));
    expect(props.acoes.arquivarTarefa).toHaveBeenCalledWith('t1');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('sem tasks.edit e sem ser responsável: só vê (nada que o banco vai recusar)', async () => {
    abrirFicha({ podeEditar: false });
    const ficha = await screen.findByRole('dialog');

    expect(within(ficha).queryByRole('textbox', { name: 'Título da tarefa' })).not.toBeInTheDocument();
    expect(within(ficha).getByRole('heading', { name: 'Conferência do caixa' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Prioridade' })).toBeDisabled();
    expect(within(ficha).queryByRole('button', { name: 'Arquivar tarefa' })).not.toBeInTheDocument();
    expect(within(ficha).getByText(/você está só vendo esta tarefa/i)).toBeInTheDocument();
  });

  it('responsável sem tasks.edit marca o andamento, mas não edita o resto', async () => {
    abrirFicha({ podeEditar: false, tarefa: umaTarefa({ responsaveis: [EU] }) });
    const ficha = await screen.findByRole('dialog');

    expect(screen.getByRole('combobox', { name: 'Status' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Marcar como feita hoje' })).not.toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Prioridade' })).toBeDisabled();
    expect(within(ficha).getByText(/esta tarefa é sua/i)).toBeInTheDocument();
  });

  it('dono da coluna conta como responsável (a "coluna do Pedro" é do Pedro)', async () => {
    abrirFicha({
      podeEditar: false,
      listas: [{ ...LISTA_GERENTE, responsavel_id: 'u-felipe', responsavel: EU }, LISTA_DONO],
    });
    await screen.findByRole('dialog');
    expect(screen.getByRole('combobox', { name: 'Status' })).not.toBeDisabled();
  });

  it('mostra checklist e comentários do banco, com o nome de quem comentou', async () => {
    abrirFicha(
      {},
      {
        tarefas_checklist: [
          { id: 'c1', tarefa_id: 't1', titulo: 'Contar as notas', feito: true, ordem: 1024 },
          { id: 'c2', tarefa_id: 't1', titulo: 'Conferir a maquininha', feito: false, ordem: 2048 },
        ],
        tarefas_comentarios: [
          { id: 'm1', tarefa_id: 't1', autor_id: 'u-pedro', texto: 'Faltou troco ontem', created_at: '2026-09-23T09:30:00' },
        ],
        profiles: [{ id: 'u-pedro', nome: 'Pedro Henrique', avatar_url: null }],
      },
    );
    const ficha = await screen.findByRole('dialog');

    expect(await within(ficha).findByText('Faltou troco ontem')).toBeInTheDocument();
    expect(within(ficha).getByText('Pedro Henrique')).toBeInTheDocument();
    expect(within(ficha).getByText('há 30 min')).toBeInTheDocument();
    expect(within(ficha).getByText('1/2')).toBeInTheDocument();
    expect(within(ficha).getByDisplayValue('Contar as notas')).toBeInTheDocument();
    // Comentário de outra pessoa, sem tasks.manage: não tem "Apagar".
    expect(within(ficha).queryByRole('button', { name: 'Apagar comentário' })).not.toBeInTheDocument();
  });

  it('quem gerencia pode apagar o comentário de outra pessoa', async () => {
    abrirFicha(
      { podeGerenciar: true },
      {
        tarefas_comentarios: [
          { id: 'm1', tarefa_id: 't1', autor_id: 'u-pedro', texto: 'Faltou troco', created_at: '2026-09-23T09:30:00' },
        ],
      },
    );
    const ficha = await screen.findByRole('dialog');
    expect(await within(ficha).findByRole('button', { name: 'Apagar comentário' })).toBeInTheDocument();
  });

  it('mantém no seletor o período desativado que a tarefa já tem', async () => {
    abrirFicha({
      tarefa: umaTarefa({ periodo_id: 'p-velho', periodo: { id: 'p-velho', descricao: 'Madrugada' } }),
      periodos: [{ id: 'p-manha', descricao: 'Manhã (7 às 11)', ativo: true }],
    });
    await screen.findByRole('dialog');
    const opcoes = await abrirSeletor('Período');
    expect(opcoes.map((o) => o.textContent)).toContain('Madrugada (desativado)');
  });
});

/** Como o catálogo `tarefa_horario` chega à ficha (horariosDoCatalogo). */
const HORARIOS: HorarioOpcao[] = [
  { id: 'h1', descricao: '07:30', ativo: true, valor: '07:30' },
  { id: 'h2', descricao: '10:00', ativo: true, valor: '10:00' },
  // Mesma hora escrita de outro jeito: aparece uma vez só.
  { id: 'h3', descricao: '10h', ativo: true, valor: '10:00' },
  { id: 'h4', descricao: 'Depois do almoço', ativo: true, valor: null },
];

describe('Ficha da tarefa — horário (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('escolher uma sugestão grava a hora "10:00"', async () => {
    const props = abrirFicha({ horarios: HORARIOS });
    await screen.findByRole('dialog');

    const opcoes = await abrirSeletor('Horário');
    expect(opcoes.map((o) => o.textContent)).toEqual([
      'Sem horário',
      '07:30',
      '10:00',
      'Depois do almoço— não parece um horário',
      'Outro horário...',
    ]);
    fireEvent.click(opcoes.find((o) => o.textContent === '10:00')!);

    await waitFor(() => {
      expect(props.acoes.atualizarTarefa).toHaveBeenCalledWith({ id: 't1', horario: '10:00' });
    });
  });

  it('item do catálogo que não parece hora aparece desativado, dizendo por quê', async () => {
    abrirFicha({ horarios: HORARIOS });
    await screen.findByRole('dialog');
    const opcoes = await abrirSeletor('Horário');
    const ruim = opcoes.find((o) => o.textContent?.startsWith('Depois do almoço'))!;
    expect(ruim).toHaveAttribute('aria-disabled', 'true');
    expect(ruim).toHaveAttribute('title', 'Não parece um horário');
  });

  it('a hora já gravada aparece mesmo fora das sugestões, e "Sem horário" limpa', async () => {
    const props = abrirFicha({ horarios: HORARIOS, tarefa: umaTarefa({ horario: '10:15' }) });
    const ficha = await screen.findByRole('dialog');

    expect(screen.getByRole('combobox', { name: 'Horário' })).toHaveTextContent('10:15');
    // No topo da ficha, a hora vem antes do turno.
    expect(within(ficha).getAllByText('10:15').length).toBeGreaterThan(0);

    const opcoes = await abrirSeletor('Horário');
    expect(opcoes.map((o) => o.textContent)).toContain('10:15(digitado)');
    fireEvent.click(opcoes.find((o) => o.textContent === 'Sem horário')!);

    await waitFor(() => {
      expect(props.acoes.atualizarTarefa).toHaveBeenCalledWith({ id: 't1', horario: null });
    });
  });

  it('"Outro horário..." abre um campo de hora; a hora digitada é gravada ao sair do campo', async () => {
    const props = abrirFicha({ horarios: HORARIOS });
    await screen.findByRole('dialog');

    const opcoes = await abrirSeletor('Horário');
    fireEvent.click(opcoes.find((o) => o.textContent === 'Outro horário...')!);

    const campo = await screen.findByLabelText('Outro horário');
    // Pela metade não grava (e não fecha: a pessoa ainda está digitando).
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.blur(campo);
    expect(props.acoes.atualizarTarefa).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Outro horário')).toBeInTheDocument();

    fireEvent.change(campo, { target: { value: '16:45' } });
    fireEvent.blur(campo);
    expect(props.acoes.atualizarTarefa).toHaveBeenCalledWith({ id: 't1', horario: '16:45' });
    expect(screen.queryByLabelText('Outro horário')).not.toBeInTheDocument();
  });

  it('sem tasks.edit o horário só aparece (o banco recusaria a mudança)', async () => {
    abrirFicha({ horarios: HORARIOS, podeEditar: false, tarefa: umaTarefa({ responsaveis: [EU], horario: '07:30' }) });
    await screen.findByRole('dialog');
    expect(screen.getByRole('combobox', { name: 'Horário' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Horário' })).toHaveTextContent('07:30');
  });
});

/** O feito de hoje do Pedro, como a aba Conferência o traz. */
function itemDaAba(parcial: Partial<ItemDeConferencia> = {}): ItemDeConferencia {
  return {
    tarefa_id: 't1',
    dia: '2026-09-23',
    titulo: 'Conferência do caixa',
    prioridade: 'normal',
    dias_semana: [0, 1, 2, 3, 4, 5, 6],
    horario: null,
    quadro_id: 'q1',
    quadro_nome: 'Loja',
    lista_id: 'l-gerente',
    lista_nome: 'Gerente',
    lista_cor: null,
    feita_por: 'u-pedro',
    feita_em: '2026-09-23T09:30:00',
    ...parcial,
  };
}

describe('Ficha da tarefa — conferência do gerente (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
    mockConferencia.itens = [];
    mockConferencia.aprovar.mockResolvedValue(undefined);
    mockConferencia.devolver.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('feita e esperando o gerente: selo "Aguardando conferência", e sem botões para quem não confere', async () => {
    abrirFicha({ tarefa: umaTarefa({ feita_hoje: true, conferencia: 'aguardando' }) });
    const ficha = await screen.findByRole('dialog');

    expect(within(ficha).getByText('Aguardando conferência')).toBeInTheDocument();
    expect(within(ficha).getByText(/Enviada para a conferência do gerente/)).toBeInTheDocument();
    expect(within(ficha).queryByRole('button', { name: 'Conferir' })).not.toBeInTheDocument();
    expect(within(ficha).queryByRole('button', { name: 'Devolver' })).not.toBeInTheDocument();
    // Enquanto espera, quem fez ainda desfaz um engano.
    expect(screen.getByRole('button', { name: 'Desmarcar "feita hoje"' })).toBeEnabled();
  });

  it('quem confere: "Conferir" aprova o feito de HOJE da tarefa que se repete', async () => {
    mockConferencia.itens = [itemDaAba()];
    abrirFicha({ podeConferir: true, tarefa: umaTarefa({ feita_hoje: true, conferencia: 'aguardando' }) });
    const ficha = await screen.findByRole('dialog');

    // Diz quem marcou, pelo cadastro.
    expect(within(ficha).getByText('Pedro Henrique')).toBeInTheDocument();

    fireEvent.click(within(ficha).getByRole('button', { name: 'Conferir' }));
    await waitFor(() => expect(mockConferencia.aprovar).toHaveBeenCalledTimes(1));
    expect(mockConferencia.aprovar).toHaveBeenCalledWith(
      expect.objectContaining({ tarefa_id: 't1', dia: '2026-09-23' }),
    );
    expect(mockConferencia.devolver).not.toHaveBeenCalled();
  });

  it('quem confere: "Devolver" pede confirmação (com o nome de quem fez) e devolve a avulsa sem dia', async () => {
    mockConferencia.itens = [itemDaAba({ dia: null, dias_semana: [] })];
    abrirFicha({
      podeConferir: true,
      tarefa: umaTarefa({
        dias_semana: [],
        concluida_em: '2026-09-23T09:30:00',
        conferencia: 'aguardando',
      }),
    });
    const ficha = await screen.findByRole('dialog');

    fireEvent.click(within(ficha).getByRole('button', { name: 'Devolver' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(within(confirmacao).getByText('Devolver para Pedro Henrique?')).toBeInTheDocument();
    expect(mockConferencia.devolver).not.toHaveBeenCalled();

    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Devolver tarefa' }));
    await waitFor(() => expect(mockConferencia.devolver).toHaveBeenCalledTimes(1));
    expect(mockConferencia.devolver).toHaveBeenCalledWith(expect.objectContaining({ tarefa_id: 't1', dia: null }));
  });

  it('a aba ainda não carregou: a ficha monta o feito a partir da própria tarefa', async () => {
    abrirFicha({ podeConferir: true, tarefa: umaTarefa({ feita_hoje: true, conferencia: 'aguardando' }) });
    const ficha = await screen.findByRole('dialog');

    fireEvent.click(within(ficha).getByRole('button', { name: 'Conferir' }));
    await waitFor(() =>
      expect(mockConferencia.aprovar).toHaveBeenCalledWith(
        expect.objectContaining({ tarefa_id: 't1', dia: '2026-09-23', quadro_id: 'q1' }),
      ),
    );
  });

  it('conferida: selo verde, e bolinha e status travados para quem não confere', async () => {
    abrirFicha({ tarefa: umaTarefa({ feita_hoje: true, conferencia: 'conferida' }) });
    const ficha = await screen.findByRole('dialog');

    expect(within(ficha).getByText('Conferida pelo gerente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conferida pelo gerente. Só ele pode devolver.' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDisabled();
  });

  it('conferida: o status fica travado também para quem confere (desfazer é pelo "Devolver", que pergunta)', async () => {
    abrirFicha({ podeConferir: true, tarefa: umaTarefa({ feita_hoje: true, conferencia: 'conferida' }) });
    await screen.findByRole('dialog');

    const status = screen.getByRole('combobox', { name: 'Status' });
    expect(status).toBeDisabled();
    expect(status).toHaveAttribute('title', 'Conferida. Para desfazer, use "Devolver".');
  });

  it('aberta pela aba num feito de ONTEM: faixa daquele dia, e os botões mexem no feito de ontem', async () => {
    const ontem = itemDaAba({ dia: '2026-09-22', feita_em: '2026-09-22T17:45:00' });
    // Hoje também há feito esperando: o "Conferir" da faixa NÃO pode aprovar o de hoje.
    mockConferencia.itens = [itemDaAba(), ontem];
    abrirFicha({
      podeConferir: true,
      diaDaConferencia: '2026-09-22',
      tarefa: umaTarefa({ feita_hoje: true, conferencia: 'aguardando' }),
    });
    await screen.findByRole('dialog');

    const faixa = screen.getByRole('region', { name: 'Feito de ontem' });
    expect(within(faixa).getByText('Feito de ontem aguardando conferência')).toBeInTheDocument();
    expect(within(faixa).getByText('Pedro Henrique')).toBeInTheDocument();

    fireEvent.click(within(faixa).getByRole('button', { name: 'Conferir' }));
    await waitFor(() => expect(mockConferencia.aprovar).toHaveBeenCalledTimes(1));
    expect(mockConferencia.aprovar).toHaveBeenCalledWith(ontem);

    fireEvent.click(within(faixa).getByRole('button', { name: 'Devolver' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(within(confirmacao).getByText('Devolver para Pedro?')).toBeInTheDocument();
    expect(within(confirmacao).getByText(/O feito de ontem é desfeito/)).toBeInTheDocument();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Devolver tarefa' }));
    await waitFor(() => expect(mockConferencia.devolver).toHaveBeenCalledWith(ontem));
  });

  it('feito de ontem sem nada hoje: a ficha continua "Marcar como feita hoje", mas com a faixa de ontem', async () => {
    mockConferencia.itens = [itemDaAba({ dia: '2026-09-22', feita_em: '2026-09-22T17:45:00' })];
    abrirFicha({ podeConferir: true, diaDaConferencia: '2026-09-22', tarefa: umaTarefa() });
    await screen.findByRole('dialog');

    expect(screen.getByRole('region', { name: 'Feito de ontem' })).toBeInTheDocument();
    // Um Conferir só: o da faixa (o bloco de hoje não tem o que conferir).
    expect(screen.getAllByRole('button', { name: 'Conferir' })).toHaveLength(1);
  });

  it('sem o dia no endereço (ou com o dia de hoje), não há faixa: é a ficha de sempre', async () => {
    mockConferencia.itens = [itemDaAba({ dia: '2026-09-22' })];
    abrirFicha({ podeConferir: true, diaDaConferencia: '2026-09-23', tarefa: umaTarefa() });
    await screen.findByRole('dialog');
    expect(screen.queryByRole('region', { name: /Feito de/ })).not.toBeInTheDocument();
  });

  it('conferida, para quem confere: só "Devolver" (desfaz a conferência junto)', async () => {
    abrirFicha({ podeConferir: true, tarefa: umaTarefa({ feita_hoje: true, conferencia: 'conferida' }) });
    const ficha = await screen.findByRole('dialog');

    expect(within(ficha).queryByRole('button', { name: 'Conferir' })).not.toBeInTheDocument();
    fireEvent.click(within(ficha).getByRole('button', { name: 'Devolver' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(within(confirmacao).getByText(/junto com a conferência/)).toBeInTheDocument();
  });
});

describe('Ficha da tarefa — anexos (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
  });

  it('a seção Anexos aparece, e quem edita pode anexar', async () => {
    abrirFicha();
    const ficha = await screen.findByRole('dialog');
    expect(within(ficha).getByRole('heading', { name: 'Anexos' })).toBeInTheDocument();
    expect(await within(ficha).findByRole('button', { name: 'Anexar arquivo' })).toBeInTheDocument();
  });

  it('responsável sem tasks.edit também anexa (é andamento); quem só vê, não', async () => {
    abrirFicha({ podeEditar: false, tarefa: umaTarefa({ responsaveis: [EU] }) });
    const ficha = await screen.findByRole('dialog');
    expect(await within(ficha).findByRole('button', { name: 'Anexar arquivo' })).toBeInTheDocument();
  });

  it('quem só vê a tarefa não recebe botão de anexar', async () => {
    abrirFicha({ podeEditar: false });
    const ficha = await screen.findByRole('dialog');
    expect(await within(ficha).findByText('Nenhum arquivo anexado.')).toBeInTheDocument();
    expect(within(ficha).queryByRole('button', { name: 'Anexar arquivo' })).not.toBeInTheDocument();
  });
});

describe('quandoFoi', () => {
  const agora = new Date('2026-09-23T15:00:00');

  it('fala como se fala no balcão', () => {
    expect(quandoFoi('2026-09-23T14:59:40', agora)).toBe('agora mesmo');
    expect(quandoFoi('2026-09-23T14:55:00', agora)).toBe('há 5 min');
    expect(quandoFoi('2026-09-23T09:10:00', agora)).toBe('hoje às 09:10');
    expect(quandoFoi('2026-09-22T18:30:00', agora)).toBe('ontem às 18:30');
    expect(quandoFoi('2026-09-12T10:00:00', agora)).toBe('12/09 às 10:00');
    expect(quandoFoi('2025-12-31T10:00:00', agora)).toBe('31/12/2025 às 10:00');
  });

  it('relógio adiantado de outro computador não vira "há -3 min"', () => {
    expect(quandoFoi('2026-09-23T15:03:00', agora)).toBe('agora mesmo');
  });
});
