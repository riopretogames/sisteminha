import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { hojeISO } from '@/lib/format';
import { montarCan, bancoFalso, silenciarConsole, type UsuarioDeTeste } from '@/test/apoio';

/**
 * A tela de um quadro — o que é da PÁGINA, não das visões.
 *
 * Kanban e Tabela têm os testes deles; aqui fica o que só a página faz:
 * encontrar (ou não) o quadro, trocar de visão sem perder os dados, filtrar
 * pelo resumo colorido, abrir a ficha pelo endereço (`?tarefa=`) — que é o
 * que Minhas Tarefas e um link mandado no WhatsApp usam — e esconder
 * "Adicionar coluna" de quem não pode editar.
 *
 * v2: o corte da conferência também é da página. O feito que espera o
 * gerente sai do Kanban e da Tabela e aparece só na aba Conferência (com o
 * contador no botão da aba); o conferido continua no quadro como feito.
 */

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: vi.fn() }));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'u1', nome: 'Felipe Bottaro', tenant_id: 'loja-1' } },
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

const QUADRO = {
  id: 'q-loja',
  nome: 'Loja',
  descricao: 'Rotina do balcão.',
  cor: 'bg-blue-500 text-white',
  ordem: 1024,
  arquivado_em: null,
  created_at: '2026-09-23T10:00:00Z',
  updated_at: '2026-09-23T10:00:00Z',
};

const LISTA = {
  id: 'l-pedro',
  quadro_id: 'q-loja',
  nome: 'Vendedor sênior',
  cor: 'bg-red-500 text-white',
  responsavel_id: null,
  responsavel: null,
  ordem: 1024,
  arquivada_em: null,
};

function linhaDeTarefa(id: string, titulo: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    quadro_id: 'q-loja',
    lista_id: 'l-pedro',
    titulo,
    descricao: null,
    prioridade: 'normal',
    status: 'nao_iniciado',
    dias_semana: [0, 1, 2, 3, 4, 5, 6],
    periodo_id: null,
    prazo: null,
    concluida_em: null,
    ordem: 1024,
    arquivada_em: null,
    criado_por: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    periodo: null,
    tarefas_responsaveis: [],
    tarefas_etiquetas: [],
    tarefas_checklist: [],
    tarefas_comentarios: [],
    ...extra,
  };
}

const TAREFAS = [
  linhaDeTarefa('t1', 'Repor os copos'),
  // "Fazendo" de tarefa que se repete só vale no dia em que foi marcado
  // (montarTarefa): a gravação precisa ser de hoje para continuar "fazendo".
  linhaDeTarefa('t2', 'Ligar os telefones da loja', {
    status: 'fazendo',
    ordem: 2048,
    updated_at: new Date().toISOString(),
  }),
];

function abrirQuadro(
  endereco: string,
  tabelas: Record<string, unknown[]>,
  usuario: UsuarioDeTeste = { perfil: 'administrador' },
) {
  mockCan.mockImplementation(montarCan(usuario));
  mockSupabase.atual = bancoFalso(tabelas);
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return import('./Quadro').then(({ default: Quadro }) =>
    render(
      <QueryClientProvider client={cliente}>
        <MemoryRouter initialEntries={[endereco]}>
          <Routes>
            <Route path="/tarefas/:id" element={<Quadro />} />
            <Route path="/tarefas" element={<p>Lista de quadros</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
}

const QUADRO_COMPLETO = {
  tarefas_quadros: [QUADRO],
  tarefas_listas: [LISTA],
  tarefas: TAREFAS,
  tarefas_conclusoes: [],
};

describe('Tela do quadro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    try {
      localStorage.clear();
    } catch {
      // Sem armazenamento no ambiente: cada teste já começa no Kanban.
    }
  });

  it('diz "Quadro não encontrado" e oferece o caminho de volta', async () => {
    await abrirQuadro('/tarefas/nao-existe', { tarefas_quadros: [] });

    expect(await screen.findByText('Quadro não encontrado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /voltar para os quadros/i }));
    expect(await screen.findByText('Lista de quadros')).toBeInTheDocument();
  });

  it('abre no Kanban e troca para a Tabela sem perder as tarefas', async () => {
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);

    expect(await screen.findByRole('heading', { level: 1, name: /loja/i })).toBeInTheDocument();
    expect(screen.getAllByText('Repor os copos').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('radio', { name: /tabela/i }));
    expect(screen.getByRole('radio', { name: /tabela/i })).toHaveAttribute('data-state', 'on');
    expect(screen.getAllByText('Repor os copos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ligar os telefones da loja').length).toBeGreaterThan(0);
  });

  it('"Hoje" e os dias trocam para a Tabela por pessoa; "Todas" volta ao Kanban', async () => {
    // Felipe, 24/09: "Todas" é o Kanban dele; o dia é o Monday da equipe.
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);
    await screen.findByRole('heading', { level: 1, name: /loja/i });
    expect(screen.getByRole('radio', { name: /kanban/i })).toHaveAttribute('data-state', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByRole('radio', { name: /tabela/i })).toHaveAttribute('data-state', 'on');

    fireEvent.click(screen.getByRole('button', { name: /^Sex/ }));
    expect(screen.getByRole('radio', { name: /tabela/i })).toHaveAttribute('data-state', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(screen.getByRole('radio', { name: /kanban/i })).toHaveAttribute('data-state', 'on');
  });

  it('"Todas" volta a abrir no Kanban mesmo depois de alguém usar "Hoje" e sair da tela', async () => {
    // Achado da revisão de 24/09: a troca automática para a Tabela ficava
    // gravada no navegador, e o quadro abria em "Todas" com a Tabela para
    // todo mundo que usasse aquele computador (o balcão é compartilhado).
    const primeira = await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);
    await screen.findByRole('heading', { level: 1, name: /loja/i });
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByRole('radio', { name: /tabela/i })).toHaveAttribute('data-state', 'on');
    primeira.unmount();

    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);
    await screen.findByRole('heading', { level: 1, name: /loja/i });
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: /kanban/i })).toHaveAttribute('data-state', 'on');
  });

  it('a Tabela escolhida à mão em "Todas" é lembrada; a escolha feita num dia vale só para o dia', async () => {
    const primeira = await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);
    await screen.findByRole('heading', { level: 1, name: /loja/i });
    fireEvent.click(screen.getByRole('radio', { name: /tabela/i }));
    primeira.unmount();

    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);
    await screen.findByRole('heading', { level: 1, name: /loja/i });
    expect(screen.getByRole('radio', { name: /tabela/i })).toHaveAttribute('data-state', 'on');

    // Num dia, quem quiser vê o Kanban...
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    fireEvent.click(screen.getByRole('radio', { name: /kanban/i }));
    expect(screen.getByRole('radio', { name: /kanban/i })).toHaveAttribute('data-state', 'on');
    // ...mas voltar para "Todas" devolve a escolha de "Todas" (a Tabela).
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(screen.getByRole('radio', { name: /tabela/i })).toHaveAttribute('data-state', 'on');
  });

  it('trocar de quadro com um dia ligado volta para "Todas" e para a visão de "Todas"', async () => {
    // A tela do quadro não é desmontada ao trocar de quadro (mesma rota, outro
    // id): o filtro zera, e a visão tem que acompanhar.
    function IrParaOutroQuadro() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/tarefas/q-oficina')}>
          Ir para outro quadro
        </button>
      );
    }
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    mockSupabase.atual = bancoFalso(QUADRO_COMPLETO);
    const cliente = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
    });
    const { default: Quadro } = await import('./Quadro');
    render(
      <QueryClientProvider client={cliente}>
        <MemoryRouter initialEntries={['/tarefas/q-loja']}>
          <Routes>
            <Route
              path="/tarefas/:id"
              element={
                <>
                  <IrParaOutroQuadro />
                  <Quadro />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { level: 1, name: /loja/i });
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByRole('radio', { name: /tabela/i })).toHaveAttribute('data-state', 'on');

    fireEvent.click(screen.getByRole('button', { name: 'Ir para outro quadro' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('radio', { name: /kanban/i })).toHaveAttribute('data-state', 'on');
  });

  it('a visão gravada pela versão antiga (que guardava a troca automática) não vale mais', async () => {
    try {
      localStorage.setItem('tarefas_view_mode', 'grid');
    } catch {
      // Sem armazenamento no ambiente: o teste continua valendo (abre no Kanban).
    }
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);
    await screen.findByRole('heading', { level: 1, name: /loja/i });
    expect(screen.getByRole('radio', { name: /kanban/i })).toHaveAttribute('data-state', 'on');
  });

  it('chip de outro dia avisa que a situação e a bolinha são as de hoje', async () => {
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);
    await screen.findByRole('heading', { level: 1, name: /loja/i });
    expect(screen.queryByText(/Mostrando as tarefas de/)).not.toBeInTheDocument();

    // Um chip que NÃO seja o de hoje (o teste roda em qualquer dia da semana).
    const [chip, nome] = new Date().getDay() === 1 ? [/^Ter/, 'terça'] : [/^Seg/, 'segunda'];
    fireEvent.click(screen.getByRole('button', { name: chip }));
    expect(screen.getByText(/Mostrando as tarefas de/)).toHaveTextContent(`Mostrando as tarefas de ${nome}`);
    // A bolinha da tarefa (que é de todos os dias) trava nesse chip.
    const titulo = screen.getAllByText('Repor os copos')[0];
    const linha = titulo.closest('tr') as HTMLElement;
    expect(within(linha).getByRole('button', { name: /Você está vendo as tarefas de/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.queryByText(/Mostrando as tarefas de/)).not.toBeInTheDocument();
  });

  it('não existe chip de Domingo no quadro', async () => {
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);
    await screen.findByRole('heading', { level: 1, name: /loja/i });
    expect(screen.getByRole('button', { name: /^Sáb/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Dom/ })).not.toBeInTheDocument();
  });

  it('o resumo colorido conta as tarefas e filtra ao clicar', async () => {
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);

    const fazendo = await screen.findByRole('button', { name: 'Fazendo: 1 tarefa' });
    expect(screen.getByRole('button', { name: 'Não iniciado: 1 tarefa' })).toBeInTheDocument();

    fireEvent.click(fazendo);
    expect(fazendo).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Repor os copos')).not.toBeInTheDocument();
    expect(screen.getAllByText('Ligar os telefones da loja').length).toBeGreaterThan(0);
  });

  it('abre a ficha da tarefa pelo endereço (?tarefa=)', async () => {
    await abrirQuadro('/tarefas/q-loja?tarefa=t2', QUADRO_COMPLETO);

    const ficha = await screen.findByRole('dialog');
    expect(within(ficha).getByDisplayValue('Ligar os telefones da loja')).toBeInTheDocument();

    // Fechar (Esc) tira a tarefa do endereço: a ficha não reabre sozinha
    // quando o quadro se recarrega a cada 30 segundos.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sem permissão de editar, não aparece "Adicionar coluna"', async () => {
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO, { perfil: 'vendedor', menos: ['tasks.edit'] });

    await screen.findByRole('heading', { level: 1, name: /loja/i });
    expect(screen.queryByRole('button', { name: /adicionar coluna/i })).not.toBeInTheDocument();
  });

  it('com permissão de editar, aparece "Adicionar coluna"', async () => {
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO, { perfil: 'vendedor' });

    await screen.findByRole('heading', { level: 1, name: /loja/i });
    expect(screen.getByRole('button', { name: /adicionar coluna/i })).toBeInTheDocument();
  });
});

/* ── Conferência do gerente (v2) ─────────────────────────────────────────── */

const AGORA = new Date().toISOString();
const HOJE = hojeISO();

/** O endereço (quadro › coluna) que a aba Conferência embute em cada tarefa. */
const ENDERECO = {
  quadro: { nome: 'Loja', arquivado_em: null },
  lista: { nome: 'Vendedor sênior', cor: 'bg-red-500 text-white', arquivada_em: null },
};

/** O feito de hoje de uma tarefa que se repete, como tarefas_conclusoes devolve. */
function feitoDeHoje(tarefa: ReturnType<typeof linhaDeTarefa>, extra: Record<string, unknown> = {}) {
  return {
    tarefa_id: tarefa.id,
    dia: HOJE,
    concluida_em: AGORA,
    concluida_por: 'u-pedro',
    conferida_em: null,
    tarefa: { ...tarefa, ...ENDERECO },
    ...extra,
  };
}

const VARRER = linhaDeTarefa('t3', 'Varrer a loja', { ordem: 3072 });
const CAIXA = linhaDeTarefa('t5', 'Conferir o caixa', { ordem: 4096 });
const SACOLAS = linhaDeTarefa('t4', 'Fazer o pedido das sacolas', {
  dias_semana: [],
  concluida_em: AGORA,
  conferida_em: null,
  ordem: 5120,
  ...ENDERECO,
});

/**
 * Quatro situações num quadro só: "Repor os copos" e "Ligar os telefones"
 * por fazer; "Varrer a loja" (se repete) e "Fazer o pedido das sacolas"
 * (avulsa) feitas e esperando o gerente; "Conferir o caixa" feita e já
 * conferida.
 */
const COM_CONFERENCIA = {
  tarefas_quadros: [QUADRO],
  tarefas_listas: [LISTA],
  tarefas: [...TAREFAS, VARRER, CAIXA, SACOLAS],
  tarefas_conclusoes: [feitoDeHoje(VARRER), feitoDeHoje(CAIXA, { conferida_em: AGORA })],
};

describe('Conferência no quadro (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    try {
      localStorage.clear();
    } catch {
      // Sem armazenamento no ambiente: cada teste já começa no Kanban.
    }
  });

  it('o feito que espera o gerente sai do Kanban e da Tabela; o conferido fica, como feito', async () => {
    await abrirQuadro('/tarefas/q-loja', COM_CONFERENCIA);

    await screen.findByRole('heading', { level: 1, name: /loja/i });
    expect(screen.getAllByText('Repor os copos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Conferir o caixa').length).toBeGreaterThan(0);
    expect(screen.queryByText('Varrer a loja')).not.toBeInTheDocument();
    expect(screen.queryByText('Fazer o pedido das sacolas')).not.toBeInTheDocument();
    // O resumo conta o que está no quadro: "Feito" é só o já conferido.
    expect(screen.getByRole('button', { name: 'Feito: 1 tarefa' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /tabela/i }));
    expect(screen.getAllByText('Conferir o caixa').length).toBeGreaterThan(0);
    expect(screen.queryByText('Varrer a loja')).not.toBeInTheDocument();
    expect(screen.queryByText('Fazer o pedido das sacolas')).not.toBeInTheDocument();
  });

  it('o botão da aba conta o que espera; a aba lista os feitos, sem os filtros do quadro', async () => {
    await abrirQuadro('/tarefas/q-loja', COM_CONFERENCIA);

    const aba = await screen.findByRole('radio', { name: 'Conferência: 2 aguardando' });
    expect(screen.getByLabelText('Buscar tarefa')).toBeInTheDocument();

    fireEvent.click(aba);
    expect(aba).toHaveAttribute('data-state', 'on');
    expect(await screen.findByRole('heading', { name: '2 feitas aguardando conferência' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Varrer a loja' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fazer o pedido das sacolas' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Buscar tarefa')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /adicionar coluna/i })).not.toBeInTheDocument();

    // Voltar ao Kanban traz os filtros de volta.
    fireEvent.click(screen.getByRole('radio', { name: /kanban/i }));
    expect(screen.getByLabelText('Buscar tarefa')).toBeInTheDocument();
  });

  it('o endereço com ?aba=conferencia abre direto na aba', async () => {
    await abrirQuadro('/tarefas/q-loja?aba=conferencia', COM_CONFERENCIA);

    expect(await screen.findByRole('heading', { name: '2 feitas aguardando conferência' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /conferência/i })).toHaveAttribute('data-state', 'on');
  });

  it('sem nada esperando, a aba diz que está tudo conferido e o botão fica sem contador', async () => {
    await abrirQuadro('/tarefas/q-loja?aba=conferencia', QUADRO_COMPLETO);

    expect(await screen.findByText('Nada para conferir.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Conferência' })).toBeInTheDocument();
  });

  it('"Conferido" na aba confere o feito de hoje pela função do banco', async () => {
    await abrirQuadro('/tarefas/q-loja?aba=conferencia', COM_CONFERENCIA);
    const rpc = vi.spyOn(mockSupabase.atual as { rpc: (...a: unknown[]) => unknown }, 'rpc');

    const linha = (await screen.findByRole('button', { name: 'Varrer a loja' })).closest('li')!;
    fireEvent.click(within(linha).getByRole('button', { name: /conferido/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('conferir_tarefa', { _tarefa_id: 't3', _dia: HOJE, _aprovada: true }),
    );
  });

  it('na aba, clicar na tarefa abre a ficha dela, mesmo ela estando fora do Kanban', async () => {
    await abrirQuadro('/tarefas/q-loja?aba=conferencia', COM_CONFERENCIA);

    fireEvent.click(await screen.findByRole('button', { name: 'Varrer a loja' }));
    const ficha = await screen.findByRole('dialog');
    expect(within(ficha).getByDisplayValue('Varrer a loja')).toBeInTheDocument();
  });

  it('quem não confere vê a aba, mas sem os botões', async () => {
    await abrirQuadro('/tarefas/q-loja?aba=conferencia', COM_CONFERENCIA, { perfil: 'vendedor' });

    expect(await screen.findByRole('button', { name: 'Varrer a loja' })).toBeInTheDocument();
    expect(screen.getByText('Só quem confere tarefas pode aprovar ou devolver.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /conferido/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /devolver/i })).not.toBeInTheDocument();
  });

  it('marcar a bolinha no cartão avisa que a tarefa foi para a conferência', async () => {
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);

    const titulo = await screen.findByText('Repor os copos');
    const bolinha = titulo.parentElement?.querySelector<HTMLButtonElement>('button[aria-pressed]');
    expect(bolinha).toBeTruthy();
    fireEvent.click(bolinha!);

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Enviada para a conferência' })),
    );
  });

  it('o aviso de "enviada para a conferência" oferece Desfazer (quem clicou sem querer não é gerente)', async () => {
    await abrirQuadro('/tarefas/q-loja', QUADRO_COMPLETO);

    const titulo = await screen.findByText('Repor os copos');
    fireEvent.click(titulo.parentElement!.querySelector<HTMLButtonElement>('button[aria-pressed]')!);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Enviada para a conferência' })),
    );

    // (O banco de teste não guarda gravação, então aqui se confere o botão e
    // que ele roda sem erro; a volta do status é da ação do quadro, testada
    // em useQuadro.)
    const aviso = mockToast.mock.calls.find(([t]) => t.title === 'Enviada para a conferência')![0];
    const acao = aviso.action as { props: { children: unknown; onClick: () => void } };
    expect(acao.props.children).toBe('Desfazer');

    act(() => acao.props.onClick());
    expect(await screen.findByText('Repor os copos')).toBeInTheDocument();
  });
});
