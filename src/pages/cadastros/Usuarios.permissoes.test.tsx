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
      // O nome da permissão é o do catálogo (é o que aparece nas caixinhas da
      // ficha e em Perfis e Permissões) — não um apelido que ninguém acha.
      expect(within(ficha).getAllByText(/alterar perfis e permissões/i).length).toBeGreaterThan(0);
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

/**
 * A "Lista de Perfil" da ficha (as caixinhas de exceção).
 *
 * Achado 74 (revisão de 24/09): quem tinha só "Criar, editar e desativar
 * usuários" abria a ficha com as caixinhas LIBERADAS, e cada clique voltava
 * erro do banco — criar ou tirar exceção exige "Alterar perfis e permissões".
 *
 * Achado 81: o gerente tinha 17 exceções que repetiam o perfil. Não mudavam
 * nada no dia, mas faziam o perfil deixar de valer para ele — tirar "Ver
 * financeiro" do perfil Gerente não tirava dele. A ficha agora aponta e
 * oferece voltar a seguir o perfil.
 */
describe('Ficha do usuário: exceções de permissão', () => {
  const CATALOGO = [
    { key: 'sales.view', modulo: 'Vendas', descricao: 'Ver vendas' },
    { key: 'finance.view', modulo: 'Financeiro', descricao: 'Ver financeiro' },
    { key: 'inventory.cost.view', modulo: 'Estoque', descricao: 'Ver custo e margem' },
  ];
  const DO_PERFIL = [
    { role: 'vendedor', permission_key: 'sales.view' },
    { role: 'vendedor', permission_key: 'finance.view' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  async function abrirFichaDaMaria(
    opcoes: Parameters<typeof montarCan>[0],
    excecoes: unknown[],
  ) {
    mockCan.mockImplementation(montarCan(opcoes));
    const banco = bancoFalso({
      profiles: PERFIS,
      user_roles: PAPEIS,
      permissions: CATALOGO,
      role_permissions: DO_PERFIL,
      user_permissions: excecoes,
    });
    // Anota cada "apagar" pedido ao banco, para o teste conferir o que a
    // tela mandou apagar.
    const apagados: string[] = [];
    const fromOriginal = banco.from;
    banco.from = (tabela: string) => {
      const consulta = fromOriginal(tabela) as Record<string, (...a: unknown[]) => unknown>;
      const apagar = consulta.delete;
      consulta.delete = (...a: unknown[]) => {
        apagados.push(tabela);
        return apagar(...a);
      };
      return consulta;
    };
    mockSupabase.atual = banco;

    const { default: Usuarios } = await import('./Usuarios');
    renderizarTela(<Usuarios />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /gerenciar/i }).length).toBe(2);
    });
    // A lista vem na ordem do banco: Felipe, depois Maria (vendedora).
    fireEvent.click(screen.getAllByRole('button', { name: /gerenciar/i })[1]);
    const ficha = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(ficha).getByText('Ver vendas')).toBeInTheDocument();
    });
    return { ficha, apagados };
  }

  it('quem só gerencia usuários vê as caixinhas, mas travadas, e a tela diz por quê', async () => {
    const { ficha } = await abrirFichaDaMaria(
      { perfil: 'vendedor', extras: ['users.manage'] },
      [],
    );

    const caixas = within(ficha).getAllByRole('checkbox');
    expect(caixas.length).toBe(3);
    for (const caixa of caixas) expect(caixa).toBeDisabled();
    expect(within(ficha).getByText(/criar ou tirar uma exceção exige/i)).toBeInTheDocument();
  });

  it('quem pode alterar perfis e permissões mexe nas caixinhas', async () => {
    const { ficha } = await abrirFichaDaMaria({ perfil: 'administrador' }, []);

    for (const caixa of within(ficha).getAllByRole('checkbox')) expect(caixa).not.toBeDisabled();
    expect(within(ficha).queryByText(/criar ou tirar uma exceção exige/i)).not.toBeInTheDocument();
  });

  it('aponta a exceção que só repete o perfil e oferece voltar a seguir o perfil', async () => {
    const { ficha, apagados } = await abrirFichaDaMaria({ perfil: 'administrador' }, [
      // Repete o perfil (vendedor já tem "Ver financeiro" neste teste).
      { permission_key: 'finance.view', concedida: true, motivo: null, definida_por: null },
      // Exceção de verdade: dá algo que o perfil não dá.
      { permission_key: 'inventory.cost.view', concedida: true, motivo: null, definida_por: null },
    ]);

    await waitFor(() => {
      expect(within(ficha).getByText(/1 exceção repete/i)).toBeInTheDocument();
    });
    expect(within(ficha).getByText('repete o perfil')).toBeInTheDocument();
    expect(within(ficha).getByText('concedido à parte')).toBeInTheDocument();

    fireEvent.click(within(ficha).getByRole('button', { name: /voltar a seguir o perfil/i }));
    await waitFor(() => {
      expect(apagados).toContain('user_permissions');
    });
  });

  it('quem não pode alterar exceções vê o aviso de repetida, mas sem o botão', async () => {
    const { ficha } = await abrirFichaDaMaria(
      { perfil: 'vendedor', extras: ['users.manage'] },
      [{ permission_key: 'finance.view', concedida: true, motivo: null, definida_por: null }],
    );

    await waitFor(() => {
      expect(within(ficha).getByText(/1 exceção repete/i)).toBeInTheDocument();
    });
    expect(
      within(ficha).queryByRole('button', { name: /voltar a seguir o perfil/i }),
    ).not.toBeInTheDocument();
  });
});
