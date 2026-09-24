import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Nova entrada de mercadoria — o dinheiro que ela manda para o banco.
 *
 * O defeito de 24/09: o campo de preço é numérico, o navegador entrega
 * "12.5", e a tela convertia com uma função de texto brasileiro que apaga os
 * pontos. Uma película comprada a R$ 12,50 entrava com custo de R$ 125,00 e
 * lançava no financeiro uma compra PAGA dez vezes maior; o custo médio do
 * produto explodia junto. Nenhum teste pegava porque nenhum abria a tela com
 * um preço de centavos.
 *
 * E a outra metade: loja sem fornecedor cadastrado (o banco de produção tinha
 * zero) via a lista vazia e o botão cinza para sempre, sem uma palavra.
 */

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
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

const PELICULA = {
  id: 'p1',
  nome: 'Película 3D iPhone 13',
  codigo_barra: null,
  estoque_atual: 0,
  custo: 12.5,
};

type Consulta = Record<string, (...args: unknown[]) => unknown>;

/** Banco de mentira que anota as chamadas de função e os filtros de fornecedor. */
function montarBanco(fornecedores: unknown[]) {
  const banco = bancoFalso({ fornecedores, vw_produtos: [PELICULA] });
  const rpc = vi.fn(banco.rpc);
  const filtrosFornecedor: unknown[][] = [];
  const fromOriginal = banco.from;
  const from = (tabela: string) => {
    const consulta = fromOriginal(tabela) as unknown as Consulta;
    if (tabela === 'fornecedores') {
      const eqOriginal = consulta.eq;
      consulta.eq = (...args: unknown[]) => {
        filtrosFornecedor.push(args);
        return eqOriginal(...args);
      };
    }
    return consulta;
  };
  mockSupabase.atual = { ...banco, from, rpc };
  return { rpc, filtrosFornecedor };
}

async function abrir(
  opcoes: { perfil?: string; menos?: string[]; fornecedores?: unknown[]; comProduto?: boolean } = {},
) {
  mockCan.mockImplementation(
    montarCan({ perfil: opcoes.perfil ?? 'administrador', menos: opcoes.menos }),
  );
  const espioes = montarBanco(opcoes.fornecedores ?? [{ id: 'f1', nome: 'Distribuidora Rio Preto' }]);
  const { DialogNovaEntrada } = await import('./DialogNovaEntrada');
  renderizarTela(
    <DialogNovaEntrada
      onFechar={vi.fn()}
      itensIniciais={opcoes.comProduto === false ? [] : [{ produto: PELICULA, quantidade: 1 }]}
    />,
  );
  await screen.findByText('Nova entrada de mercadoria');
  return espioes;
}

/** Abre o seletor pelo teclado: o jsdom não tem o "pointer capture" do clique. */
async function escolherFornecedor(nome: string) {
  const gatilho = await screen.findByRole('combobox', { name: 'Fornecedor' });
  fireEvent.keyDown(gatilho, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: nome }));
}

describe('Nova entrada de mercadoria: preço com centavos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('custo de R$ 12,50 aparece como R$ 12,50 — não R$ 125,00', async () => {
    await abrir();

    // O preço sugerido é o custo que o produto já tem.
    expect(screen.getByLabelText('Preço de compra (unidade)')).toHaveValue(12.5);
    expect(screen.getByTestId('total-p1-0')).toHaveTextContent(/12,50/);
    expect(screen.getByTestId('total-da-compra')).toHaveTextContent(/12,50/);
    expect(screen.getByTestId('total-da-compra')).not.toHaveTextContent(/125/);
  });

  it('manda para o banco 12.5 de custo e 1 de quantidade', async () => {
    const { rpc } = await abrir();
    await escolherFornecedor('Distribuidora Rio Preto');

    fireEvent.click(screen.getByRole('button', { name: /dar entrada/i }));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith(
        'registrar_entrada_mercadoria',
        expect.objectContaining({
          _fornecedor_id: 'f1',
          _itens: [
            expect.objectContaining({ produto_id: 'p1', quantidade: 1, custo_unitario: 12.5 }),
          ],
        }),
      );
    });
  });

  it('R$ 1,48 digitado continua R$ 1,48 (virava R$ 148,00)', async () => {
    const { rpc } = await abrir();
    await escolherFornecedor('Distribuidora Rio Preto');

    fireEvent.change(screen.getByLabelText('Preço de compra (unidade)'), {
      target: { value: '1.48' },
    });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } });

    expect(screen.getByTestId('total-da-compra')).toHaveTextContent(/4,44/);

    fireEvent.click(screen.getByRole('button', { name: /dar entrada/i }));
    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith(
        'registrar_entrada_mercadoria',
        expect.objectContaining({
          _itens: [expect.objectContaining({ quantidade: 3, custo_unitario: 1.48 })],
        }),
      );
    });
  });

  it('quantidade quebrada (1,5) não vira 15: o botão trava e a tela diz por quê', async () => {
    const { rpc } = await abrir();
    await escolherFornecedor('Distribuidora Rio Preto');

    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '1.5' } });

    expect(screen.getByRole('button', { name: /dar entrada/i })).toBeDisabled();
    expect(screen.getByText('Só número inteiro, maior que zero.')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sem fornecedor escolhido, a tela diz o que falta', async () => {
    await abrir();
    expect(screen.getByRole('button', { name: /dar entrada/i })).toBeDisabled();
    expect(screen.getByText('Escolha o fornecedor.')).toBeInTheDocument();
  });
});

describe('Nova entrada de mercadoria: loja sem fornecedor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('AVISA que falta cadastrar fornecedor e leva a Cadastros', async () => {
    await abrir({ fornecedores: [] });

    expect(await screen.findByText('Nenhum fornecedor cadastrado ainda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cadastros › fornecedores/i })).toHaveAttribute(
      'href',
      '/cadastros/fornecedores',
    );
  });

  it('quem não cadastra fornecedor recebe o aviso sem link (não oferece porta fechada)', async () => {
    // Exceção por usuário: movimenta estoque e vê custo, mas não mexe em
    // Cadastros de fornecedor.
    await abrir({ fornecedores: [], menos: ['registry.suppliers.manage'] });

    expect(await screen.findByText(/peça a quem cuida dos cadastros/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cadastros › fornecedores/i })).not.toBeInTheDocument();
  });

  it('a lista de fornecedores pede só os ATIVOS', async () => {
    const { filtrosFornecedor } = await abrir();
    await screen.findByRole('combobox', { name: 'Fornecedor' });
    await waitFor(() => {
      expect(filtrosFornecedor).toContainEqual(['ativo', true]);
    });
  });
});
