import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderizarTela, silenciarConsole } from '@/test/apoio';
import { QuadroKanban } from '@/components/tarefas/kanban/QuadroKanban';
import { TODOS_OS_DIAS_LISTA } from '@/config/tarefas';
import type { AcoesDoQuadro, Lista, Pessoa, PropsVisaoQuadro, Tarefa } from '@/types/tarefas';

/**
 * A visão Kanban do quadro de tarefas.
 *
 * O que estes testes seguram:
 * - as colunas e os cartões aparecem onde deviam, na ordem gravada, com a
 *   contagem certa no cabeçalho;
 * - clicar no cartão abre a ficha, mas clicar na bolinha só marca o feito (a
 *   bolinha mora DENTRO do cartão — sem cuidado, marcar abriria a ficha junto);
 * - sem permissão de editar, a pessoa não vê como criar nem mexer em coluna,
 *   mas continua marcando o feito das tarefas que são dela (é a regra do
 *   banco: o responsável marca o andamento mesmo sem editar o quadro).
 *
 * O arrastar e soltar em si não é simulado aqui (o navegador de mentira não
 * mede tamanho de nada); as contas dele estão em regrasDoKanban.test.ts.
 */

const USUARIO = 'u-pedro';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-pedro' },
    session: {},
    loading: false,
    can: () => true,
    canAny: () => true,
    hasRole: () => false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const PEDRO: Pessoa = { id: USUARIO, nome: 'Pedro Henrique', avatar_url: null };
const GABRIEL: Pessoa = { id: 'u-gabriel', nome: 'Gabriel', avatar_url: null };

function lista(p: Partial<Lista> & Pick<Lista, 'id' | 'nome' | 'ordem'>): Lista {
  return { quadro_id: 'q1', cor: null, responsavel_id: null, responsavel: null, arquivada_em: null, ...p };
}

function tarefa(p: Partial<Tarefa> & Pick<Tarefa, 'id' | 'lista_id' | 'titulo'>): Tarefa {
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
    created_at: '2026-09-23T10:00:00Z',
    updated_at: '2026-09-23T10:00:00Z',
    responsaveis: [],
    etiquetas: [],
    checklist_total: 0,
    checklist_feitos: 0,
    comentarios_total: 0,
    feita_hoje: false,
    horario: null,
    conferencia: 'nenhuma',
    anexos_total: 0,
    ...p,
  };
}

/** Coluna do Pedro (dono = quem está logado) e coluna do Gabriel. */
const LISTAS: Lista[] = [
  lista({ id: 'l-pedro', nome: 'Pedro', ordem: 1024, responsavel_id: USUARIO, responsavel: PEDRO }),
  lista({ id: 'l-gabriel', nome: 'Gabriel', ordem: 2048, cor: 'bg-purple-500 text-white' }),
];

// De propósito fora de ordem: o quadro tem que desenhar pela `ordem`, não
// pela ordem em que as tarefas chegaram.
const TAREFAS: Tarefa[] = [
  tarefa({ id: 't-copos', lista_id: 'l-pedro', titulo: 'Repor os copos', ordem: 2048 }),
  tarefa({
    id: 't-telefones',
    lista_id: 'l-pedro',
    titulo: 'Ligar os telefones da loja ao chegar',
    ordem: 1024,
    dias_semana: [...TODOS_OS_DIAS_LISTA],
    prioridade: 'alta',
  }),
  tarefa({ id: 't-lixo', lista_id: 'l-gabriel', titulo: 'Tirar o lixo', ordem: 1024, responsaveis: [GABRIEL] }),
];

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

function abrirQuadro(extra: Partial<PropsVisaoQuadro> = {}) {
  const props: PropsVisaoQuadro = {
    listas: LISTAS,
    tarefas: TAREFAS,
    podeEditar: true,
    acoes: acoesFalsas(),
    onAbrirTarefa: vi.fn(),
    pessoas: [PEDRO, GABRIEL],
    periodos: [],
    etiquetas: [],
    ...extra,
  };
  renderizarTela(<QuadroKanban {...props} />);
  return props;
}

const coluna = (nome: string) => screen.getByRole('region', { name: `Coluna ${nome}` });
const cartoesDa = (nome: string) =>
  within(coluna(nome))
    .getAllByRole('button', { name: /^Abrir a tarefa / })
    .map((b) => b.getAttribute('aria-label')?.replace('Abrir a tarefa ', ''));

describe('QuadroKanban', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
  });

  it('desenha as colunas na ordem, cada uma com os seus cartões e a contagem', () => {
    abrirQuadro();

    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Coluna Pedro',
      'Coluna Gabriel',
    ]);
    expect(cartoesDa('Pedro')).toEqual(['Ligar os telefones da loja ao chegar', 'Repor os copos']);
    expect(cartoesDa('Gabriel')).toEqual(['Tirar o lixo']);

    expect(within(coluna('Pedro')).getByTitle('2 tarefas, 0 feitas')).toHaveTextContent('2');
    expect(within(coluna('Gabriel')).getByTitle('1 tarefa, 0 feitas')).toHaveTextContent('1');
  });

  it('mostra no cartão os dias e a prioridade fora do normal', () => {
    abrirQuadro();
    const telefones = screen.getByRole('button', { name: 'Abrir a tarefa Ligar os telefones da loja ao chegar' });
    expect(within(telefones).getByText('Todos os dias')).toBeInTheDocument();
    expect(within(telefones).getByText('Alta')).toBeInTheDocument();
    // "Normal" é o comum e não polui o cartão.
    const copos = screen.getByRole('button', { name: 'Abrir a tarefa Repor os copos' });
    expect(within(copos).queryByText('Normal')).not.toBeInTheDocument();
  });

  it('clicar no cartão abre a ficha da tarefa', () => {
    const props = abrirQuadro();
    fireEvent.click(screen.getByText('Repor os copos'));
    expect(props.onAbrirTarefa).toHaveBeenCalledWith('t-copos');
  });

  it('Enter no cartão também abre a ficha (quem usa o teclado)', () => {
    const props = abrirQuadro();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Abrir a tarefa Tirar o lixo' }), { key: 'Enter' });
    expect(props.onAbrirTarefa).toHaveBeenCalledWith('t-lixo');
  });

  it('a bolinha marca o feito SEM abrir a ficha', () => {
    const props = abrirQuadro();
    const copos = screen.getByRole('button', { name: 'Abrir a tarefa Repor os copos' });
    fireEvent.click(within(copos).getByRole('button', { name: 'Marcar como concluída' }));

    expect(props.acoes.alternarFeito).toHaveBeenCalledWith('t-copos');
    expect(props.onAbrirTarefa).not.toHaveBeenCalled();
  });

  it('com permissão de editar: "Adicionar tarefa" cria na coluna certa e continua aberto para a próxima', async () => {
    const props = abrirQuadro();
    fireEvent.click(within(coluna('Gabriel')).getByRole('button', { name: /Adicionar tarefa/ }));

    const caixa = within(coluna('Gabriel')).getByRole('textbox', { name: 'Título da nova tarefa' });
    fireEvent.change(caixa, { target: { value: '  Varrer a loja  ' } });
    fireEvent.keyDown(caixa, { key: 'Enter' });

    expect(props.acoes.criarTarefa).toHaveBeenCalledWith({ lista_id: 'l-gabriel', titulo: 'Varrer a loja' });
    // Montar a coluna é digitar várias em seguida: a caixa volta limpa, aberta.
    expect(await within(coluna('Gabriel')).findByRole('textbox', { name: 'Título da nova tarefa' })).toHaveValue('');
  });

  it('Shift+Enter quebra a linha em vez de criar, e Esc fecha sem criar', () => {
    const props = abrirQuadro();
    fireEvent.click(within(coluna('Pedro')).getByRole('button', { name: /Adicionar tarefa/ }));
    const caixa = within(coluna('Pedro')).getByRole('textbox', { name: 'Título da nova tarefa' });
    fireEvent.change(caixa, { target: { value: 'Conferir' } });

    fireEvent.keyDown(caixa, { key: 'Enter', shiftKey: true });
    expect(props.acoes.criarTarefa).not.toHaveBeenCalled();

    fireEvent.keyDown(caixa, { key: 'Escape' });
    expect(within(coluna('Pedro')).queryByRole('textbox', { name: 'Título da nova tarefa' })).not.toBeInTheDocument();
    expect(props.acoes.criarTarefa).not.toHaveBeenCalled();
  });

  it('sem permissão de editar: some "Adicionar tarefa" e o menu da coluna', () => {
    abrirQuadro({ podeEditar: false });
    expect(screen.queryByRole('button', { name: /Adicionar tarefa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Opções da coluna/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mover a coluna/ })).not.toBeInTheDocument();
  });

  it('sem permissão de editar: o dono da coluna ainda marca o feito das tarefas dele, e só delas', () => {
    const props = abrirQuadro({ podeEditar: false });

    // Coluna do Pedro (é ele que está logado): bolinha liberada.
    const copos = screen.getByRole('button', { name: 'Abrir a tarefa Repor os copos' });
    const bolinhaDoPedro = within(copos).getByRole('button', { name: 'Marcar como concluída' });
    expect(bolinhaDoPedro).toBeEnabled();
    fireEvent.click(bolinhaDoPedro);
    expect(props.acoes.alternarFeito).toHaveBeenCalledWith('t-copos');

    // Tarefa do Gabriel: o banco recusaria, então a tela nem oferece.
    const lixo = screen.getByRole('button', { name: 'Abrir a tarefa Tirar o lixo' });
    expect(within(lixo).getByRole('button', { name: /Só quem edita/ })).toBeDisabled();
  });

  it('feita hoje aparece riscada; avulsa vencida aparece como atrasada', () => {
    abrirQuadro({
      tarefas: [
        tarefa({
          id: 't-feita',
          lista_id: 'l-pedro',
          titulo: 'Repor os copos',
          dias_semana: [...TODOS_OS_DIAS_LISTA],
          feita_hoje: true,
        }),
        tarefa({ id: 't-atrasada', lista_id: 'l-gabriel', titulo: 'Pedido das sacolas', prazo: '2020-01-02' }),
      ],
    });

    expect(screen.getByText('Repor os copos')).toHaveClass('line-through');
    expect(within(coluna('Pedro')).getByTitle('1 tarefa, 1 feita')).toBeInTheDocument();

    const atrasada = screen.getByRole('button', { name: 'Abrir a tarefa Pedido das sacolas' });
    expect(within(atrasada).getByText('Venceu 02/01')).toBeInTheDocument();
    expect(atrasada).toHaveClass('border-l-red-500');
  });

  it('v2: a hora vem antes do turno, o clipe conta os anexos, e a conferida ganha selo e trava a bolinha', () => {
    abrirQuadro({
      periodos: [
        { id: 'p-manha', descricao: 'Manhã', ativo: true },
        { id: 'p-livre', descricao: 'Livre', ativo: true, padrao: true },
      ],
      tarefas: [
        tarefa({
          id: 't-tel',
          lista_id: 'l-pedro',
          titulo: 'Ligar os telefones',
          horario: '07:30',
          periodo_id: 'p-manha',
          periodo: { id: 'p-manha', descricao: 'Manhã' },
          anexos_total: 2,
        }),
        tarefa({
          id: 't-caixa',
          lista_id: 'l-gabriel',
          titulo: 'Conferir o caixa',
          dias_semana: [...TODOS_OS_DIAS_LISTA],
          feita_hoje: true,
          conferencia: 'conferida',
          horario: '18:00',
          periodo_id: 'p-livre',
          periodo: { id: 'p-livre', descricao: 'Livre' },
        }),
      ],
    });

    const telefones = screen.getByRole('button', { name: 'Abrir a tarefa Ligar os telefones' });
    expect(within(telefones).getByTitle('Às 07:30 · Manhã')).toHaveTextContent('07:30·Manhã');
    expect(within(telefones).getByTitle('2 anexos')).toHaveTextContent('2');
    expect(within(telefones).queryByText('Conferida')).not.toBeInTheDocument();

    const caixa = screen.getByRole('button', { name: 'Abrir a tarefa Conferir o caixa' });
    expect(within(caixa).getByText('Conferida')).toBeInTheDocument();
    // O turno padrão ("Livre") continua fora do cartão; a hora aparece sozinha.
    expect(within(caixa).getByTitle('Às 18:00')).toHaveTextContent('18:00');
    expect(within(caixa).queryByText('Livre')).not.toBeInTheDocument();
    // Desfazer um feito conferido é só com o gerente (o banco recusaria).
    expect(within(caixa).getByRole('button', { name: 'Conferida pelo gerente. Só ele pode devolver.' })).toBeDisabled();
  });

  it('coluna vazia avisa que não tem tarefa, em vez de sumir', () => {
    abrirQuadro({ tarefas: [] });
    expect(within(coluna('Gabriel')).getByText('Nenhuma tarefa por aqui')).toBeInTheDocument();
  });

  it('quadro sem listas explica o que fazer', () => {
    abrirQuadro({ listas: [], tarefas: [] });
    expect(screen.getByText('Este quadro ainda não tem listas')).toBeInTheDocument();
  });
});
