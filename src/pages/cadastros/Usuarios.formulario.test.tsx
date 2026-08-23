import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * O formulário de novo usuário: o que ele barra antes de deixar salvar.
 *
 * Validação de formulário parece detalhe até alguém criar uma conta com senha
 * "123" e o sistema aceitar. Estes testes cobrem os passos 3 e parte do 1 do
 * roteiro manual — digitar errado e conferir que o botão não deixa passar.
 *
 * O ponto de todos eles é o mesmo: o botão só libera quando dá MESMO para
 * salvar. Botão que libera e depois devolve erro ensina a equipe a clicar e
 * torcer.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

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

async function abrirFormulario() {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  mockSupabase.atual = bancoFalso({ profiles: [], user_roles: [] });

  const { default: Usuarios } = await import('./Usuarios');
  renderizarTela(<Usuarios />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /novo usuário/i })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: /novo usuário/i }));

  const dialogo = await screen.findByRole('dialog');
  return {
    dialogo,
    nome: within(dialogo).getByLabelText(/nome completo/i),
    email: within(dialogo).getByLabelText(/e-mail/i),
    senha: within(dialogo).getByLabelText(/^senha$/i),
    botao: within(dialogo).getByRole('button', { name: /criar usuário/i }),
  };
}

function digitar(campo: HTMLElement, valor: string) {
  fireEvent.change(campo, { target: { value: valor } });
}

describe('Formulário de novo usuário', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('começa com o botão travado — formulário vazio não cria ninguém', async () => {
    const f = await abrirFormulario();
    expect(f.botao).toBeDisabled();
  });

  it('senha curta NÃO libera o botão', async () => {
    // O servidor exige 8 caracteres. A tela exige o mesmo, para a pessoa
    // descobrir antes de clicar e não depois de tomar erro.
    const f = await abrirFormulario();
    digitar(f.nome, 'Maria Souza');
    digitar(f.email, 'maria@loja.com');
    digitar(f.senha, '123');

    expect(f.botao).toBeDisabled();
  });

  it('e-mail sem arroba NÃO libera, e a tela explica por quê', async () => {
    const f = await abrirFormulario();
    digitar(f.nome, 'Maria Souza');
    digitar(f.email, 'maria-arroba-loja');
    digitar(f.senha, 'senhaforte123');

    expect(f.botao).toBeDisabled();
    // Diz o que está errado, em vez de só travar o botão em silêncio.
    expect(
      within(f.dialogo).getByText(/esse e-mail não parece válido/i),
    ).toBeInTheDocument();
  });

  it('sem nome NÃO libera, mesmo com e-mail e senha bons', async () => {
    const f = await abrirFormulario();
    digitar(f.email, 'maria@loja.com');
    digitar(f.senha, 'senhaforte123');

    expect(f.botao).toBeDisabled();
  });

  it('com tudo preenchido certo, o botão LIBERA', async () => {
    const f = await abrirFormulario();
    digitar(f.nome, 'Maria Souza');
    digitar(f.email, 'maria@loja.com');
    digitar(f.senha, 'senhaforte123');

    await waitFor(() => {
      expect(f.botao).not.toBeDisabled();
    });
  });

  it('o botão Sortear gera senha que já passa na regra', async () => {
    const f = await abrirFormulario();
    digitar(f.nome, 'Maria Souza');
    digitar(f.email, 'maria@loja.com');

    fireEvent.click(within(f.dialogo).getByRole('button', { name: /sortear/i }));

    await waitFor(() => {
      expect(f.botao).not.toBeDisabled();
    });
    // Sem as letras e números que se confundem ao ditar em voz alta.
    const senha = (f.senha as HTMLInputElement).value;
    expect(senha.length).toBeGreaterThanOrEqual(8);
    expect(senha).not.toMatch(/[ilo01]/);
  });

  it('avisa que a senha não aparece de novo depois de salvar', async () => {
    // Detalhe que evita chamado: quem não anota, perde.
    const f = await abrirFormulario();
    expect(
      within(f.dialogo).getByText(/o sistema não mostra a senha de novo/i),
    ).toBeInTheDocument();
  });
});
