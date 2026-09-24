import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Nova OS: o cliente que foi cadastrado DEPOIS de a tela abrir, e o preço do
 * serviço tabelado. Achados da revisão de 24/09.
 *
 * O formulário de cliente é trocado por um dublê aqui de propósito: o que se
 * testa é o que a NOVA OS faz quando ele diz "use este cadastro" — o próprio
 * formulário tem os testes dele.
 */

const mockToast = vi.fn();
const mockCan = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'pessoa-felipe', tenant_id: 'loja-1' } },
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

// O dublê do formulário: um botão que faz o que o formulário de verdade faz
// quando acha um cadastro repetido e o atendente escolhe usá-lo.
vi.mock('@/components/clientes/ClienteFormDialog', () => ({
  ClienteFormDialog: (props: { open: boolean; onUsarExistente?: (id: string) => void }) =>
    props.open ? (
      <button type="button" onClick={() => props.onUsarExistente?.('c-novo')}>
        dublê: usar o cadastro que já existe
      </button>
    ) : null,
}));

/** A lista da tela tem só a Adriana; a Bruna foi cadastrada em outro terminal. */
function montarBanco() {
  const base = bancoFalso({
    tenants: [{ id: 'loja-1', taxa_analise: 80 }],
    profiles: [{ id: 'pessoa-felipe', nome: 'Felipe Bottaro', ativo: true }],
    catalogos: [],
  });
  const pedidasPorId: string[] = [];

  const clientes = () => {
    let porId: string | null = null;
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'range', 'in', 'limit']) c[m] = () => c;
    c.eq = (coluna: string, valor: string) => {
      if (coluna === 'id') {
        porId = valor;
        pedidasPorId.push(valor);
      }
      return c;
    };
    const resultado = () =>
      porId
        ? { data: porId === 'c-novo' ? { id: 'c-novo', nome: 'Bruna Recém-Cadastrada', telefones: ['17999990000'], liberado_venda: true } : null, error: null }
        : { data: [{ id: 'c1', nome: 'Adriana Prado', telefones: ['17910000001'], liberado_venda: true }], error: null };
    c.maybeSingle = () => Promise.resolve(resultado());
    c.single = () => Promise.resolve(resultado());
    c.then = (aceitar: (r: unknown) => unknown) => Promise.resolve(resultado()).then(aceitar);
    return c;
  };

  return {
    pedidasPorId,
    banco: { ...base, from: (t: string) => (t === 'clientes' ? clientes() : base.from(t)) },
  };
}

async function abrirTela() {
  mockCan.mockImplementation(montarCan({ perfil: 'vendedor' }));
  const { banco, pedidasPorId } = montarBanco();
  mockSupabase.atual = banco;
  const { default: NovaOS } = await import('./NovaOS');
  renderizarTela(<NovaOS />);
  return { pedidasPorId };
}

describe('Nova OS', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('"Usar este cadastro" seleciona o cliente cadastrado depois de a tela abrir', async () => {
    // Antes: a tela procurava só na lista que carregou ao abrir; o clique
    // fechava o diálogo sem selecionar ninguém e sem aviso — e criar de novo
    // é barrado pela regra de cliente único.
    const { pedidasPorId } = await abrirTela();

    fireEvent.click(await screen.findByRole('button', { name: /novo cliente/i }));
    fireEvent.click(await screen.findByRole('button', { name: /usar o cadastro que já existe/i }));

    await waitFor(() =>
      expect(document.getElementById('cliente')).toHaveTextContent('Bruna Recém-Cadastrada'),
    );
    expect(pedidasPorId).toContain('c-novo');
  });

  it('serviço tabelado e pago pede o preço combinado no balcão', async () => {
    // A OS tabelada nascia em R$ 0 e podia chegar à entrega sem nada a cobrar.
    await abrirTela();

    expect(screen.queryByLabelText(/preço combinado/i)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText(/vai ter laudo eletrônico/i));

    expect(await screen.findByLabelText(/preço combinado/i)).toBeInTheDocument();
  });
});
