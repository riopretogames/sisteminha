import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { hojeISO } from '@/lib/format';
import { bancoFalso, montarCan, renderizarTela, silenciarConsole, type UsuarioDeTeste } from '@/test/apoio';
import Conferencia from './Conferencia';

/**
 * A página Conferência do menu: a mesma lista da aba do quadro, mas de TODOS
 * os quadros — o gerente confere a loja e a assistência de uma vez. O que é
 * da página: juntar os quadros (cada item diz de qual é), pôr o nome de quem
 * marcou pelo cadastro e mostrar os botões só para quem confere.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'u1', nome: 'Richard', tenant_id: 'loja-1' } },
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

const AGORA = new Date().toISOString();

function tarefa(id: string, titulo: string, quadro: string, coluna: string) {
  return {
    id,
    titulo,
    prioridade: 'normal',
    dias_semana: [0, 1, 2, 3, 4, 5, 6],
    horario: null,
    arquivada_em: null,
    quadro_id: `q-${quadro.toLowerCase()}`,
    lista_id: `l-${coluna.toLowerCase()}`,
    quadro: { nome: quadro, arquivado_em: null },
    lista: { nome: coluna, cor: null, arquivada_em: null },
  };
}

const BANCO = {
  profiles: [{ id: 'u-pedro', nome: 'Pedro Henrique', avatar_url: null }],
  tarefas_conclusoes: [
    {
      tarefa_id: 't-copos',
      dia: hojeISO(),
      concluida_em: AGORA,
      concluida_por: 'u-pedro',
      conferida_em: null,
      tarefa: tarefa('t-copos', 'Repor os copos', 'Loja', 'Pedro'),
    },
    {
      tarefa_id: 't-bancada',
      dia: hojeISO(),
      concluida_em: AGORA,
      concluida_por: 'u-leo',
      conferida_em: null,
      tarefa: tarefa('t-bancada', 'Limpar a bancada', 'Assistência', 'Técnico'),
    },
  ],
};

function abrir(usuario: UsuarioDeTeste) {
  mockCan.mockImplementation(montarCan(usuario));
  mockSupabase.atual = bancoFalso(BANCO);
  return renderizarTela(<Conferencia />);
}

describe('Página Conferência', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
  });

  it('junta os feitos de todos os quadros, cada um com o quadro e a coluna', async () => {
    abrir({ perfil: 'gerente' });

    expect(screen.getByRole('heading', { level: 1, name: 'Conferência' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '2 feitas aguardando conferência' })).toBeInTheDocument();

    const copos = screen.getByRole('button', { name: 'Repor os copos' }).closest('li')!;
    expect(within(copos).getByText('Loja')).toBeInTheDocument();
    expect(within(copos).getByText('Pedro')).toBeInTheDocument();
    expect(await within(copos).findByText('Pedro Henrique')).toBeInTheDocument();

    const bancada = screen.getByRole('button', { name: 'Limpar a bancada' }).closest('li')!;
    expect(within(bancada).getByText('Assistência')).toBeInTheDocument();
    expect(within(bancada).getByText('Técnico')).toBeInTheDocument();
  });

  it('o gerente técnico confere: os botões aparecem', async () => {
    abrir({ perfil: 'gerente_tecnico' });

    await screen.findByRole('button', { name: 'Repor os copos' });
    expect(screen.getAllByRole('button', { name: /conferido/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /devolver/i })).toHaveLength(2);
  });

  it('sem permissão de conferir, a lista aparece sem os botões', async () => {
    abrir({ perfil: 'gerente', menos: ['tasks.review'] });

    await screen.findByRole('button', { name: 'Repor os copos' });
    expect(screen.getByText('Só quem confere tarefas pode aprovar ou devolver.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /conferido/i })).not.toBeInTheDocument();
  });
});
