import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { montarCan, bancoFalso, silenciarConsole, type UsuarioDeTeste } from '@/test/apoio';

/**
 * A tela de um quadro — o que é da PÁGINA, não das visões.
 *
 * Kanban e Tabela têm os testes deles; aqui fica o que só a página faz:
 * encontrar (ou não) o quadro, trocar de visão sem perder os dados, filtrar
 * pelo resumo colorido, abrir a ficha pelo endereço (`?tarefa=`) — que é o
 * que Minhas Tarefas e um link mandado no WhatsApp usam — e esconder
 * "Adicionar coluna" de quem não pode editar.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

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
