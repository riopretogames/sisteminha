import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * A tela onde a loja escolhe o que exige.
 *
 * O pior defeito que este sistema já teve foi uma tela ficando BRANCA para um
 * perfil — por isso toda tela nova nasce com pelo menos a prova de que abre e
 * mostra o que promete.
 *
 * Desde 02/09 ela mora em **Cadastros** (era Configurações) e tem três abas:
 * venda, OS e cliente. A aba da venda abre primeiro por ser a tela mais usada
 * da loja.
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
  const { default: CamposObrigatorios } = await import('./CamposObrigatorios');
  return renderizarTela(<CamposObrigatorios />);
}

/**
 * Radix só monta a aba escolhida, então trocar de aba é parte do teste.
 *
 * Clique sozinho não basta fora do navegador: a aba do Radix ativa no FOCO
 * (activationMode automático), e o clique do jsdom não foca. Mandar os dois
 * eventos é o que reproduz o que o mouse de verdade faz.
 */
async function irParaAba(nome: RegExp) {
  const aba = await screen.findByRole('tab', { name: nome });
  fireEvent.mouseDown(aba);
  fireEvent.focus(aba);
  fireEvent.click(aba);
}

describe('Cadastros > Campos Obrigatórios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('abre na aba da venda, com as chavinhas da venda', async () => {
    await abrir();

    expect(await screen.findByText('Campos obrigatórios')).toBeInTheDocument();
    expect(await screen.findByLabelText(/Exigir Cliente da venda/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exigir Origem da venda/i)).toBeInTheDocument();
  });

  it('a venda não exige nada de fábrica — é assim que o balcão trabalha', async () => {
    await abrir();

    await waitFor(() => {
      expect(screen.getByLabelText(/Exigir Cliente da venda/i)).not.toBeChecked();
    });
    expect(screen.getByLabelText(/Exigir Origem da venda/i)).not.toBeChecked();
  });

  it('mostra ligado o que a loja configurou', async () => {
    await abrir([{ campo: 'cliente_id', obrigatorio: true }]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Exigir Cliente da venda/i)).toBeChecked();
    });
    // e desligado o que ela não configurou
    expect(screen.getByLabelText(/Exigir Origem da venda/i)).not.toBeChecked();
  });

  describe('a aba da Ordem de Serviço', () => {
    it('mostra o padrão de fábrica ligado, sem nenhuma linha no banco', async () => {
      await abrir();
      await irParaAba(/Ordem de Serviço/i);

      await waitFor(() => {
        expect(screen.getByLabelText(/Exigir Marca/i)).toBeChecked();
      });
      // O técnico ficou de fora de propósito: quem atende raramente sabe quem
      // vai consertar.
      expect(screen.getByLabelText(/Exigir Técnico responsável/i)).not.toBeChecked();
    });

    it('NÃO oferece o Modelo, que saiu da tela de abertura', async () => {
      // Chavinha para um campo que não aparece no formulário é chavinha que
      // mente: a dona liga, confia, e o balcão continua sem pedir. Foi o
      // defeito de 01/09, com cinco campos de uma vez.
      await abrir();
      await irParaAba(/Ordem de Serviço/i);

      await waitFor(() => {
        expect(screen.getByLabelText(/Exigir Marca/i)).toBeInTheDocument();
      });
      expect(screen.queryByLabelText(/Exigir Modelo/i)).not.toBeInTheDocument();
    });
  });

  describe('a aba do cadastro de cliente', () => {
    it('traz o campo do exemplo do Felipe, com chavinha própria', async () => {
      await abrir();
      await irParaAba(/Cadastro de cliente/i);

      expect(await screen.findByLabelText(/Exigir Instagram/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Exigir Telefone \/ WhatsApp/i)).toBeInTheDocument();
    });

    it('o que o banco recusa vazio não pode ser desligado', async () => {
      await abrir();
      await irParaAba(/Cadastro de cliente/i);

      const nome = await screen.findByLabelText(/Exigir Nome completo/i);
      expect(nome).toBeDisabled();
      // e continua ligado, mesmo desabilitado
      expect(nome).toBeChecked();
    });
  });
});
