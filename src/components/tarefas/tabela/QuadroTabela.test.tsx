import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderizarTela, silenciarConsole } from '@/test/apoio';
import type { AcoesDoQuadro, Lista, PropsVisaoQuadro, Tarefa } from '@/types/tarefas';
import { QuadroTabela } from './QuadroTabela';
import { descreverResumoDeStatus } from './resumoDoGrupo';
import { estiloDaLista } from './estiloDaLista';

/**
 * A visão Tabela (o Monday do Felipe dentro do sisteminha).
 *
 * O ponto que mais importa aqui é a célula de status mostrar a situação DO
 * DIA, e não o valor cru do banco: a tarefa que se repete aparece "Feito"
 * hoje (e pendente amanhã, sem ninguém zerar nada — o trabalho que o Felipe
 * fazia à mão no Monday), e a avulsa vencida aparece "Atrasada" sem ninguém
 * ter gravado isso. Se a tabela lesse o status cru, as duas mentiriam.
 *
 * O outro é a porta estreita do responsável: sem permissão de editar, quem
 * faz a tarefa ainda marca o andamento dela — e só isso.
 */

// Quarta-feira, 23/09/2026.
const HOJE = new Date('2026-09-23T10:00:00');

const mockUsuario = vi.hoisted(() => ({ id: 'u-felipe' as string | null }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUsuario.id ? { id: mockUsuario.id } : null,
    session: {},
    loading: false,
    can: () => true,
    canAny: () => true,
    hasRole: () => false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const PEDRO = { id: 'u-pedro', nome: 'Pedro Henrique', avatar_url: null };
const RICHARD = { id: 'u-richard', nome: 'Richard', avatar_url: null };

const LISTAS: Lista[] = [
  {
    id: 'l1',
    quadro_id: 'q1',
    nome: 'Pedro',
    cor: 'bg-blue-500 text-white',
    responsavel_id: PEDRO.id,
    responsavel: PEDRO,
    ordem: 1024,
    arquivada_em: null,
  },
  {
    id: 'l2',
    quadro_id: 'q1',
    nome: 'Gabriel',
    cor: null,
    responsavel_id: null,
    responsavel: null,
    ordem: 2048,
    arquivada_em: null,
  },
];

function tarefa(parcial: Partial<Tarefa> & Pick<Tarefa, 'id' | 'lista_id' | 'titulo'>): Tarefa {
  return {
    quadro_id: 'q1',
    descricao: null,
    prioridade: 'normal',
    status: 'nao_iniciado',
    dias_semana: [],
    periodo_id: null,
    periodo: null,
    prazo: null,
    concluida_em: null,
    ordem: 1024,
    arquivada_em: null,
    criado_por: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    responsaveis: [],
    etiquetas: [],
    checklist_total: 0,
    checklist_feitos: 0,
    comentarios_total: 0,
    feita_hoje: false,
    ...parcial,
  };
}

const TAREFAS: Tarefa[] = [
  // Recorrente, com status cru "não iniciado", mas feita HOJE.
  tarefa({
    id: 't1',
    lista_id: 'l1',
    titulo: 'Repor os copos',
    dias_semana: [0, 1, 2, 3, 4, 5, 6],
    prioridade: 'livre',
    feita_hoje: true,
    ordem: 1024,
  }),
  // Avulsa com prazo de domingo passado, sem concluir.
  tarefa({
    id: 't2',
    lista_id: 'l1',
    titulo: 'Fazer o pedido das sacolas',
    status: 'fazendo',
    prazo: '2026-09-20',
    ordem: 2048,
  }),
  tarefa({
    id: 't3',
    lista_id: 'l2',
    titulo: 'Conferência do caixa',
    dias_semana: [1, 3, 5],
    status: 'fazendo',
    prioridade: 'alta',
    responsaveis: [RICHARD],
    etiquetas: [{ id: 'e1', descricao: 'Atenção', cor: 'bg-red-500 text-white' }],
    checklist_total: 5,
    checklist_feitos: 2,
  }),
];

function acoesFalsas(): AcoesDoQuadro {
  const nada = () => vi.fn(async () => {});
  return {
    criarTarefa: vi.fn(async () => true),
    atualizarTarefa: nada(),
    moverTarefa: nada(),
    definirStatus: nada(),
    alternarFeito: nada(),
    arquivarTarefa: nada(),
    definirResponsaveis: nada(),
    definirEtiquetas: nada(),
    criarLista: vi.fn(async () => true),
    atualizarLista: nada(),
    moverLista: nada(),
    arquivarLista: nada(),
  };
}

function abrirTabela(extra: Partial<PropsVisaoQuadro> = {}) {
  const props: PropsVisaoQuadro = {
    listas: LISTAS,
    tarefas: TAREFAS,
    podeEditar: true,
    acoes: acoesFalsas(),
    onAbrirTarefa: vi.fn(),
    pessoas: [PEDRO, RICHARD],
    periodos: [],
    etiquetas: [],
    ...extra,
  };
  const tela = renderizarTela(<QuadroTabela {...props} />);
  return { ...props, tela };
}

/** A linha (tr) da tarefa com este título. */
const linha = (titulo: string) => screen.getByRole('button', { name: titulo }).closest('tr') as HTMLElement;

describe('Tabela do quadro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
    localStorage.clear();
    mockUsuario.id = 'u-felipe';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra um grupo por lista, na ordem, com o nome e a contagem', () => {
    abrirTabela();

    const grupos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(grupos).toEqual(['Pedro', 'Gabriel']);
    expect(screen.getByText('2 tarefas')).toBeInTheDocument();
    expect(screen.getByText('1 tarefa')).toBeInTheDocument();
    // A "coluna do Pedro" diz de quem é.
    expect(screen.getByText(/Coluna de Pedro/)).toBeInTheDocument();

    for (const t of TAREFAS) expect(screen.getByRole('button', { name: t.titulo })).toBeInTheDocument();
  });

  it('status do dia: "Feito" para a recorrente feita hoje e "Atrasada" para a avulsa vencida', () => {
    abrirTabela();

    // O status cru da t1 é "não iniciado": quem manda é a conclusão de hoje.
    expect(within(linha('Repor os copos')).getByRole('button', { name: 'Feito' })).toBeInTheDocument();
    // Ninguém gravou "atrasada": é o prazo de 20/09 que passou.
    expect(within(linha('Fazer o pedido das sacolas')).getByRole('button', { name: 'Atrasada' })).toBeInTheDocument();
    expect(within(linha('Conferência do caixa')).getByRole('button', { name: 'Fazendo' })).toBeInTheDocument();
  });

  it('mostra as colunas do Monday: prioridade, frequência, etiqueta e checklist', () => {
    abrirTabela();

    const cabecalhos = screen.getAllByRole('columnheader').slice(0, 9).map((th) => th.textContent);
    expect(cabecalhos).toEqual([
      'Tarefa',
      'Pessoas',
      'Prioridade',
      'Status',
      'Frequência',
      'Período',
      'Etiquetas',
      'Prazo',
      'Checklist',
    ]);

    const conferencia = within(linha('Conferência do caixa'));
    expect(conferencia.getByRole('button', { name: 'Alta' })).toBeInTheDocument();
    expect(conferencia.getByText('Seg')).toBeInTheDocument();
    expect(conferencia.getByText('Qua')).toBeInTheDocument();
    expect(conferencia.getByText('Sex')).toBeInTheDocument();
    expect(conferencia.getByText('Atenção')).toBeInTheDocument();
    expect(conferencia.getByText('2/5')).toBeInTheDocument();
    expect(within(linha('Repor os copos')).getByText('Todos os dias')).toBeInTheDocument();
  });

  it('clicar no título abre a ficha da tarefa', () => {
    const { onAbrirTarefa } = abrirTabela();

    fireEvent.click(screen.getByRole('button', { name: 'Conferência do caixa' }));

    expect(onAbrirTarefa).toHaveBeenCalledWith('t3');
  });

  it('a bolinha marca o feito de hoje sem abrir a ficha', () => {
    const { acoes, onAbrirTarefa } = abrirTabela();

    fireEvent.click(within(linha('Conferência do caixa')).getByRole('button', { name: 'Marcar como feita hoje' }));

    expect(acoes.alternarFeito).toHaveBeenCalledWith('t3');
    expect(onAbrirTarefa).not.toHaveBeenCalled();
  });

  it('escolher um status na célula pintada grava pelo definirStatus', async () => {
    const { acoes } = abrirTabela();

    fireEvent.click(within(linha('Conferência do caixa')).getByRole('button', { name: 'Fazendo' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Não fazer por enquanto' }));

    expect(acoes.definirStatus).toHaveBeenCalledWith({ id: 't3', status: 'pausada' });
  });

  it('o seletor de status explica que o "Feito" da recorrente vale só para hoje', async () => {
    abrirTabela();

    fireEvent.click(within(linha('Repor os copos')).getByRole('button', { name: 'Feito' }));

    expect(await screen.findByText(/vale só para hoje/)).toBeInTheDocument();
    // O que já está valendo vem marcado.
    expect(screen.getByRole('option', { name: 'Feito' })).toHaveAttribute('aria-selected', 'true');
  });

  it('escolher uma prioridade grava pelo atualizarTarefa', async () => {
    const { acoes } = abrirTabela();

    fireEvent.click(within(linha('Conferência do caixa')).getByRole('button', { name: 'Alta' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Urgente' }));

    expect(acoes.atualizarTarefa).toHaveBeenCalledWith({ id: 't3', prioridade: 'urgente' });
  });

  it('escolher a mesma opção não grava nada', async () => {
    const { acoes } = abrirTabela();

    fireEvent.click(within(linha('Conferência do caixa')).getByRole('button', { name: 'Alta' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Alta' }));

    expect(acoes.atualizarTarefa).not.toHaveBeenCalled();
  });

  it('Enter na linha "Adicionar tarefa" cria na lista certa e deixa o campo pronto para a próxima', async () => {
    const { acoes } = abrirTabela();

    const campo = screen.getByRole('textbox', { name: 'Adicionar tarefa em Gabriel' });
    fireEvent.change(campo, { target: { value: '  Varrer a loja  ' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    await waitFor(() => {
      expect(acoes.criarTarefa).toHaveBeenCalledWith({ lista_id: 'l2', titulo: 'Varrer a loja' });
    });
    await waitFor(() => expect(campo).toHaveValue(''));
  });

  it('se o banco recusar a tarefa nova, o título digitado fica no campo para tentar de novo', async () => {
    const acoes = acoesFalsas();
    acoes.criarTarefa = vi.fn(async () => false);
    abrirTabela({ acoes });

    const campo = screen.getByRole('textbox', { name: 'Adicionar tarefa em Gabriel' });
    fireEvent.change(campo, { target: { value: 'Varrer a loja' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    await waitFor(() => expect(acoes.criarTarefa).toHaveBeenCalled());
    await waitFor(() => expect(campo).not.toBeDisabled());
    expect(campo).toHaveValue('Varrer a loja');
  });

  it('Enter com o campo vazio não cria tarefa em branco', () => {
    const { acoes } = abrirTabela();

    const campo = screen.getByRole('textbox', { name: 'Adicionar tarefa em Pedro' });
    fireEvent.change(campo, { target: { value: '   ' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    expect(acoes.criarTarefa).not.toHaveBeenCalled();
  });

  it('sem permissão de editar: nada de criar nem de mudar prioridade — mas o responsável marca o andamento', () => {
    // O Pedro é o dono da coluna "Pedro" (l1) e não tem nada na do Gabriel.
    mockUsuario.id = PEDRO.id;
    abrirTabela({ podeEditar: false });

    expect(screen.queryByPlaceholderText('Adicionar tarefa')).not.toBeInTheDocument();

    const doGabriel = within(linha('Conferência do caixa'));
    // Prioridade vira só cor, sem botão.
    expect(doGabriel.getByText('Alta')).toBeInTheDocument();
    expect(doGabriel.queryByRole('button', { name: 'Alta' })).not.toBeInTheDocument();
    // Tarefa que não é dele: nem status nem bolinha.
    expect(doGabriel.queryByRole('button', { name: 'Fazendo' })).not.toBeInTheDocument();
    expect(doGabriel.getByRole('button', { name: /Só quem faz esta tarefa/ })).toBeDisabled();

    // Na coluna dele, o status continua clicável (a porta estreita do banco).
    const doPedro = within(linha('Fazer o pedido das sacolas'));
    expect(doPedro.getByRole('button', { name: 'Atrasada' })).toBeInTheDocument();
    expect(doPedro.getByRole('button', { name: 'Marcar como concluída' })).toBeEnabled();
    expect(doPedro.queryByRole('button', { name: 'Normal' })).not.toBeInTheDocument();
  });

  it('o rodapé de cada grupo resume o andamento, como a barrinha do Monday', () => {
    abrirTabela();

    expect(screen.getAllByRole('img', { name: '1 feita · 1 atrasada' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: '1 fazendo' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: '1 normal · 1 livre' })).toBeInTheDocument();
  });

  it('recolher um grupo esconde as linhas dele e o navegador lembra na próxima vez', () => {
    const { tela } = abrirTabela();

    fireEvent.click(screen.getByRole('button', { name: 'Pedro' }));

    expect(screen.queryByRole('button', { name: 'Repor os copos' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conferência do caixa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pedro' })).toHaveAttribute('aria-expanded', 'false');

    tela.unmount();
    abrirTabela();
    expect(screen.queryByRole('button', { name: 'Repor os copos' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mostrar tarefas/ }));
    expect(screen.getByRole('button', { name: 'Repor os copos' })).toBeInTheDocument();
  });

  it('quadro sem listas explica o que fazer, em vez de mostrar uma tabela vazia', () => {
    abrirTabela({ listas: [], tarefas: [] });

    expect(screen.getByText('Este quadro ainda não tem colunas')).toBeInTheDocument();
    expect(screen.getByText(/Adicionar coluna/)).toBeInTheDocument();
  });

  it('grupo sem tarefas (por exemplo, pelo filtro) continua aparecendo', () => {
    abrirTabela({ tarefas: TAREFAS.filter((t) => t.lista_id === 'l1') });

    expect(screen.getByRole('heading', { name: 'Gabriel' })).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma tarefa nesta coluna/)).toBeInTheDocument();
  });

  it('com filtro ligado, o grupo vazio diz que é o filtro e oferece limpar', () => {
    const onLimparFiltros = vi.fn();
    abrirTabela({ tarefas: TAREFAS.filter((t) => t.lista_id === 'l1'), filtroAtivo: true, onLimparFiltros });

    expect(screen.getByText(/Nenhuma tarefa desta coluna com esse filtro/)).toBeInTheDocument();
    expect(screen.queryByText(/Escreva a primeira/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(onLimparFiltros).toHaveBeenCalled();
  });
});

describe('Aparência da Tabela', () => {
  it('a faixa do grupo sai da cor da lista, escrita por extenso', () => {
    expect(estiloDaLista({ cor: 'bg-purple-500 text-white', nome: 'Gerente' }).borda).toBe('border-l-purple-500');
    // A versão clara da etiqueta ("bg-x-500/10 text-x-600") também vale.
    expect(estiloDaLista({ cor: 'bg-amber-500/10 text-amber-600', nome: 'X' }).texto).toContain('text-amber-600');
    // Cor que o arquivo não conhece: cinza, nunca sem cor.
    expect(estiloDaLista({ cor: 'bg-marrom-500', nome: 'X' }).borda).toBe('border-l-slate-500');
    // Sem cor: sempre a mesma para o mesmo nome.
    expect(estiloDaLista({ cor: null, nome: 'Gabriel' })).toEqual(estiloDaLista({ cor: null, nome: 'Gabriel' }));
  });

  it('o resumo fala como gente: singular, plural e só o que existe', () => {
    expect(descreverResumoDeStatus({ feito: 3, fazendo: 2, nao_iniciado: 5, pausada: 0, atrasada: 0 })).toBe(
      '3 feitas · 2 fazendo · 5 não iniciadas',
    );
    expect(descreverResumoDeStatus({ feito: 1, fazendo: 0, nao_iniciado: 1, pausada: 2, atrasada: 1 })).toBe(
      '1 feita · 1 atrasada · 1 não iniciada · 2 não fazer por enquanto',
    );
    expect(descreverResumoDeStatus({ feito: 0, fazendo: 0, nao_iniciado: 0, pausada: 0, atrasada: 0 })).toBe(
      'Nenhuma tarefa',
    );
  });
});
