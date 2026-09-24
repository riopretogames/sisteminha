import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { bancoFalso, renderizarTela, silenciarConsole } from '@/test/apoio';
import { TarefaDialog } from '@/components/tarefas/TarefaDialog';
import { quandoFoi } from '@/lib/tarefas';
import type { AcoesDoQuadro, Lista, PropsTarefaDialog, Tarefa } from '@/types/tarefas';

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
