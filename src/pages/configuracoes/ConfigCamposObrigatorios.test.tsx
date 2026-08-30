import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * A tela onde a loja escolhe o que exige.
 *
 * O pior defeito que este sistema já teve foi uma tela ficando BRANCA para um
 * perfil — por isso toda tela nova nasce com pelo menos a prova de que abre e
 * mostra o que promete.
 */

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'p1', tenant_id: 'loja-1' } },
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

async function abrir(configuracao: Array<{ campo: string; obrigatorio: boolean }> = []) {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  mockSupabase.atual = bancoFalso({ campos_obrigatorios: configuracao });
  const { default: ConfigCamposObrigatorios } = await import('./ConfigCamposObrigatorios');
  return renderizarTela(<ConfigCamposObrigatorios />);
}

describe('Configurações > Campos Obrigatórios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('abre mostrando os campos do cadastro de cliente', async () => {
    await abrir();

    expect(await screen.findByText('Campos obrigatórios')).toBeInTheDocument();
    // O campo do exemplo do Felipe está lá, com chavinha própria.
    expect(await screen.findByLabelText(/Exigir Instagram/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exigir Telefone \/ WhatsApp/i)).toBeInTheDocument();
  });

  it('o que o banco recusa vazio não pode ser desligado', async () => {
    await abrir();

    const nome = await screen.findByLabelText(/Exigir Nome completo/i);
    expect(nome).toBeDisabled();
    // e continua ligado, mesmo desabilitado
    expect(nome).toBeChecked();
  });

  it('mostra ligado o que a loja configurou', async () => {
    await abrir([{ campo: 'instagram', obrigatorio: true }]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Exigir Instagram/i)).toBeChecked();
    });
    // e desligado o que ela não configurou
    expect(screen.getByLabelText(/Exigir E-mail/i)).not.toBeChecked();
  });

  it('o padrão de fábrica da OS aparece ligado sem nenhuma linha no banco', async () => {
    await abrir();

    // A aba da OS só monta quando escolhida, mas as chavinhas do cliente já
    // provam a leitura do padrão: nome ligado, Instagram desligado.
    await waitFor(() => {
      expect(screen.getByLabelText(/Exigir Instagram/i)).not.toBeChecked();
      expect(screen.getByLabelText(/Exigir Nome completo/i)).toBeChecked();
    });
  });
});
