import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { useConferencia } from '@/hooks/useConferencia';
import { hojeISO } from '@/lib/format';
import { dataLocalISO } from '@/lib/tarefas';
import { renderizarTela, silenciarConsole } from '@/test/apoio';
import type { ItemDeConferencia, Pessoa } from '@/types/tarefas';
import { ConferenciaView } from './ConferenciaView';

/**
 * A lista da Conferência (v2). O hook que fala com o banco tem os testes dele
 * (useConferencia.test); aqui entra só o que a TELA faz com o que ele entrega:
 *
 * - mostra cada feito com quem marcou e onde a tarefa mora;
 * - "Conferido" aprova na hora; "Devolver" pergunta antes (desfaz trabalho de
 *   alguém) e só então devolve;
 * - quem não confere vê a lista, sem os botões;
 * - clicar na tarefa abre a ficha dela.
 */

type RetornoDaConferencia = ReturnType<typeof useConferencia>;

const mockHook = vi.hoisted(() => ({ valor: null as unknown, quadroPedido: 'nao-chamado' as string | undefined }));
vi.mock('@/hooks/useConferencia', () => ({
  useConferencia: (quadroId?: string) => {
    mockHook.quadroPedido = quadroId;
    return mockHook.valor;
  },
}));

const HOJE = hojeISO();
const ONTEM = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dataLocalISO(d);
})();

const PESSOAS: Pessoa[] = [
  { id: 'u-pedro', nome: 'Pedro Henrique', avatar_url: null },
  { id: 'u-gabriel', nome: 'Gabriel Souza', avatar_url: null },
];

function item(parcial: Partial<ItemDeConferencia> = {}): ItemDeConferencia {
  return {
    tarefa_id: 't-copos',
    dia: HOJE,
    titulo: 'Repor os copos',
    prioridade: 'normal',
    dias_semana: [1, 3, 5],
    horario: null,
    quadro_id: 'q-loja',
    quadro_nome: 'Loja',
    lista_id: 'l-pedro',
    lista_nome: 'Vendedor sênior',
    lista_cor: 'bg-red-500 text-white',
    feita_por: 'u-pedro',
    feita_em: new Date().toISOString(),
    ...parcial,
  };
}

const COPOS = item();
const SACOLAS = item({
  tarefa_id: 't-sacolas',
  dia: null,
  titulo: 'Fazer o pedido das sacolas',
  prioridade: 'urgente',
  dias_semana: [],
  horario: '10:00',
  lista_id: 'l-gerente',
  lista_nome: 'Gerente',
  feita_por: null,
});
const LIXO_DE_ONTEM = item({ tarefa_id: 't-lixo', dia: ONTEM, titulo: 'Tirar o lixo', feita_por: 'u-gabriel' });

function conferencia(parcial: Partial<RetornoDaConferencia> = {}): RetornoDaConferencia {
  return {
    itens: [],
    carregando: false,
    erro: null,
    recarregar: vi.fn() as unknown as RetornoDaConferencia['recarregar'],
    aprovar: vi.fn(() => Promise.resolve()),
    devolver: vi.fn(() => Promise.resolve()),
    ...parcial,
  };
}

/** A linha inteira de um feito, achada pelo título. */
function linhaDe(titulo: string): HTMLElement {
  const li = screen.getByRole('button', { name: titulo }).closest('li');
  if (!li) throw new Error(`linha de "${titulo}" não encontrada`);
  return li;
}

describe('ConferenciaView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
  });

  it('mostra os feitos agrupados por dia, com quem marcou e a coluna', () => {
    mockHook.valor = conferencia({ itens: [COPOS, SACOLAS, LIXO_DE_ONTEM] });
    renderizarTela(<ConferenciaView quadroId="q-loja" pessoas={PESSOAS} podeConferir />);

    expect(mockHook.quadroPedido).toBe('q-loja');
    expect(screen.getByRole('heading', { name: '3 feitas aguardando conferência' })).toBeInTheDocument();

    const hoje = screen.getByRole('region', { name: 'Hoje' });
    expect(within(hoje).getByRole('button', { name: 'Repor os copos' })).toBeInTheDocument();
    expect(within(hoje).getByRole('button', { name: 'Fazer o pedido das sacolas' })).toBeInTheDocument();

    const ontem = screen.getByRole('region', { name: 'Ontem' });
    expect(within(ontem).getByRole('button', { name: 'Tirar o lixo' })).toBeInTheDocument();
    expect(within(ontem).getByText('Ficou sem conferir')).toBeInTheDocument();

    // Quem marcou vem do cadastro; a avulsa não guarda quem clicou.
    expect(within(linhaDe('Repor os copos')).getByText('Pedro Henrique')).toBeInTheDocument();
    expect(within(linhaDe('Tirar o lixo')).getByText('Gabriel Souza')).toBeInTheDocument();
    expect(within(linhaDe('Fazer o pedido das sacolas')).getByText(/^Concluída às/)).toBeInTheDocument();

    // Dentro do quadro, o endereço é só a coluna (o quadro é o que está aberto).
    expect(within(linhaDe('Repor os copos')).getByText('Vendedor sênior')).toBeInTheDocument();
    expect(within(linhaDe('Repor os copos')).queryByText('Loja')).not.toBeInTheDocument();

    // Horário e prioridade alta aparecem; prioridade normal não polui.
    const sacolas = linhaDe('Fazer o pedido das sacolas');
    expect(within(sacolas).getByText('10:00')).toBeInTheDocument();
    expect(within(sacolas).getByText('Urgente')).toBeInTheDocument();
    expect(within(linhaDe('Repor os copos')).queryByText('Normal')).not.toBeInTheDocument();
  });

  it('avulsa com responsável: diz de quem é (o banco não guarda quem clicou)', () => {
    mockHook.valor = conferencia({ itens: [{ ...SACOLAS, feita_por: 'u-pedro' }] });
    renderizarTela(<ConferenciaView quadroId="q-loja" pessoas={PESSOAS} podeConferir />);

    const linha = linhaDe('Fazer o pedido das sacolas');
    expect(within(linha).getByText(/^Responsável:/)).toBeInTheDocument();
    expect(within(linha).getByText('Pedro Henrique')).toBeInTheDocument();
    expect(within(linha).queryByText(/marcou às/)).not.toBeInTheDocument();

    fireEvent.click(within(linha).getByRole('button', { name: /devolver/i }));
    expect(within(screen.getByRole('alertdialog')).getByText('Devolver para Pedro?')).toBeInTheDocument();
  });

  it('"Conferido" aprova o item na hora, sem perguntar', () => {
    const hook = conferencia({ itens: [COPOS, SACOLAS] });
    mockHook.valor = hook;
    renderizarTela(<ConferenciaView quadroId="q-loja" pessoas={PESSOAS} podeConferir />);

    fireEvent.click(within(linhaDe('Fazer o pedido das sacolas')).getByRole('button', { name: /conferido/i }));

    expect(hook.aprovar).toHaveBeenCalledTimes(1);
    expect(hook.aprovar).toHaveBeenCalledWith(SACOLAS);
    expect(hook.devolver).not.toHaveBeenCalled();
  });

  it('"Devolver" pergunta antes e só devolve depois do sim', () => {
    const hook = conferencia({ itens: [COPOS] });
    mockHook.valor = hook;
    renderizarTela(<ConferenciaView quadroId="q-loja" pessoas={PESSOAS} podeConferir />);

    fireEvent.click(within(linhaDe('Repor os copos')).getByRole('button', { name: /devolver/i }));

    const pergunta = screen.getByRole('alertdialog');
    expect(within(pergunta).getByText('Devolver para Pedro?')).toBeInTheDocument();
    expect(within(pergunta).getByText(/volta a aparecer pendente para Pedro hoje/)).toBeInTheDocument();
    expect(hook.devolver).not.toHaveBeenCalled();

    fireEvent.click(within(pergunta).getByRole('button', { name: /devolver tarefa/i }));
    expect(hook.devolver).toHaveBeenCalledWith(COPOS);
    expect(hook.aprovar).not.toHaveBeenCalled();
  });

  it('"Voltar" na pergunta não devolve nada', () => {
    const hook = conferencia({ itens: [COPOS] });
    mockHook.valor = hook;
    renderizarTela(<ConferenciaView quadroId="q-loja" pessoas={PESSOAS} podeConferir />);

    fireEvent.click(within(linhaDe('Repor os copos')).getByRole('button', { name: /devolver/i }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Voltar' }));

    expect(hook.devolver).not.toHaveBeenCalled();
  });

  it('sem permissão de conferir: a lista aparece, sem os botões, com o aviso', () => {
    mockHook.valor = conferencia({ itens: [COPOS, SACOLAS] });
    renderizarTela(<ConferenciaView quadroId="q-loja" pessoas={PESSOAS} podeConferir={false} />);

    expect(screen.getByRole('button', { name: 'Repor os copos' })).toBeInTheDocument();
    expect(screen.getByText('Só quem confere tarefas pode aprovar ou devolver.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /conferido/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /devolver/i })).not.toBeInTheDocument();
  });

  it('vazio: diz que está tudo conferido', () => {
    mockHook.valor = conferencia({ itens: [] });
    renderizarTela(<ConferenciaView quadroId="q-loja" pessoas={PESSOAS} podeConferir />);

    expect(screen.getByText('Nada para conferir.')).toBeInTheDocument();
    expect(screen.getByText('Tudo que a equipe marcou como feito já foi conferido.')).toBeInTheDocument();
  });

  it('erro de leitura: explica e deixa tentar de novo', () => {
    const hook = conferencia({ erro: new Error('Failed to fetch') });
    mockHook.valor = hook;
    renderizarTela(<ConferenciaView pessoas={PESSOAS} podeConferir />);

    expect(screen.getByText('Não foi possível carregar a conferência.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(hook.recarregar).toHaveBeenCalled();
  });

  it('dentro do quadro, clicar na tarefa chama onAbrirTarefa com o item', () => {
    mockHook.valor = conferencia({ itens: [COPOS] });
    const onAbrirTarefa = vi.fn();
    renderizarTela(
      <ConferenciaView quadroId="q-loja" pessoas={PESSOAS} podeConferir onAbrirTarefa={onAbrirTarefa} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Repor os copos' }));
    expect(onAbrirTarefa).toHaveBeenCalledWith(COPOS);
  });

  it('na página geral mostra o quadro de cada item, e o clique abre a ficha no quadro, na aba Conferência', () => {
    mockHook.valor = conferencia({ itens: [COPOS] });

    function Endereco() {
      const l = useLocation();
      return <p>Endereço: {l.pathname + l.search}</p>;
    }

    render(
      <MemoryRouter initialEntries={['/tarefas/conferencia']}>
        <Routes>
          <Route
            path="/tarefas/conferencia"
            element={<ConferenciaView pessoas={PESSOAS} podeConferir />}
          />
          <Route path="/tarefas/:id" element={<Endereco />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(mockHook.quadroPedido).toBeUndefined();
    expect(within(linhaDe('Repor os copos')).getByText('Loja')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Repor os copos' }));
    // O dia do feito vai junto: a ficha abre no feito clicado, não no de hoje.
    expect(screen.getByText(`Endereço: /tarefas/q-loja?aba=conferencia&tarefa=t-copos&dia=${HOJE}`)).toBeInTheDocument();
  });
});
