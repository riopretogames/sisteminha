import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Tela de Usuários vista por quem não pode gerenciar usuários.
 *
 * Cobre os testes 7 e 8 do roteiro manual, que só se faziam entrando no
 * sistema com um segundo usuário, em janela anônima. Aqui roda em segundo e
 * meio, sem ninguém precisar sair da própria conta.
 *
 * A pergunta que estes testes respondem é sempre a mesma: quem não pode fazer
 * a coisa CONSEGUE VER O BOTÃO? Botão visível que só devolve erro é pior que
 * botão ausente — ensina a equipe a ignorar aviso.
 */

const PERFIS = [
  { id: 'u1', nome: 'Felipe Bottaro', email: 'felipe@loja.com', ativo: true, arquivado_em: null },
  { id: 'u2', nome: 'Maria Souza', email: 'maria@loja.com', ativo: true, arquivado_em: null },
];
const PAPEIS = [
  { user_id: 'u1', role: 'administrador' },
  { user_id: 'u2', role: 'vendedor' },
];

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
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

async function abrirUsuarios(opcoes: Parameters<typeof montarCan>[0]) {
  mockCan.mockImplementation(montarCan(opcoes));
  mockSupabase.atual = bancoFalso({
    profiles: PERFIS,
    user_roles: PAPEIS,
    permissions: [],
    user_permissions: [],
  });

  const { default: Usuarios } = await import('./Usuarios');
  return renderizarTela(<Usuarios />);
}

describe('Tela de Usuários por perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('esconde "Novo usuário" de quem não pode gerenciar usuários', async () => {
    // Teste 7 do roteiro manual. A trava de verdade é no servidor; esconder o
    // botão é educação com quem está usando.
    await abrirUsuarios({ perfil: 'vendedor' });

    await waitFor(() => {
      expect(screen.getByText('Usuários')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /novo usuário/i })).not.toBeInTheDocument();
  });

  it('mostra "Novo usuário" para quem pode', async () => {
    await abrirUsuarios({ perfil: 'administrador' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /novo usuário/i })).toBeInTheDocument();
    });
  });

  it('a lista de pessoas aparece — não fica vazia por falta de crachá', async () => {
    // O padrão de falha que já mordeu quatro telas deste sistema: abre, não
    // traz nada, e parece "não tem cadastro nenhum".
    await abrirUsuarios({ perfil: 'administrador' });

    await waitFor(() => {
      expect(screen.getByText('Felipe Bottaro')).toBeInTheDocument();
    });
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
  });

  it('mostra o perfil de cada pessoa, não um rótulo em branco', async () => {
    await abrirUsuarios({ perfil: 'administrador' });

    await waitFor(() => {
      expect(screen.getByText('Administrador')).toBeInTheDocument();
    });
    expect(screen.getByText('Vendedor')).toBeInTheDocument();
  });

  it('trava o seletor de Perfil de quem não pode trocar perfil', async () => {
    // Teste 8 do roteiro manual. Ver o cadastro é `users.manage`; trocar o
    // PERFIL é `roles.manage`. São concedidas separadamente, então quem tem
    // só a primeira abre a ficha mas não muda o poder de ninguém.
    await abrirUsuarios({ perfil: 'administrador', menos: ['roles.manage'] });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /gerenciar/i }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole('button', { name: /gerenciar/i })[0]);

    const ficha = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(ficha).getByText(/gerenciar perfis de acesso/i)).toBeInTheDocument();
    });

    // O seletor existe, mas desabilitado — some a possibilidade, não a
    // informação de qual perfil a pessoa tem.
    const seletor = within(ficha).getAllByRole('combobox')[0];
    expect(seletor).toBeDisabled();
  });

  it('libera o seletor de Perfil para quem PODE trocar perfil', async () => {
    await abrirUsuarios({ perfil: 'administrador' });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /gerenciar/i }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole('button', { name: /gerenciar/i })[0]);

    const ficha = await screen.findByRole('dialog');
    const seletor = within(ficha).getAllByRole('combobox')[0];
    expect(seletor).not.toBeDisabled();
  });
});
