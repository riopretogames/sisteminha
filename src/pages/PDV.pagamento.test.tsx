import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * O fechamento da venda no PDV — achados da revisão de 24/09.
 *
 * 1. "Falta R$ 0,00": 9,90 + 69,90 dá 79.80000000000001 no computador. O
 *    vendedor digitava 79,80 e o botão de confirmar ficava desligado.
 * 2. Troco que não entrou em dinheiro (aparelho de troca ou cartão lançado a
 *    mais) aparecia em verde como troco comum, e saía da gaveta sem aviso.
 * 3. Depois de fechar, não havia como imprimir o comprovante sem sair do PDV.
 * 4. Clientes e produtos paravam no milésimo, sem aviso (o Supabase corta
 *    calado em 1.000 linhas).
 */

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'pessoa-1', tenant_id: 'loja-1' } },
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

const produto = (id: string, nome: string, preco: number) => ({
  id, nome, preco, estoque_atual: 5, imei_serial: null, codigo_barra: null,
  grupo_produto_id: null, marca_id: null, cor_id: null, condicao_id: null, memoria_id: null,
});

const CAPA = produto('p1', 'Capa de controle', 9.9);
const CONTROLE = produto('p2', 'Controle genérico', 69.9);
const FONE = produto('p3', 'Fone de ouvido', 80);

const forma = (id: string, descricao: string, forma_enum: string, entra_no_caixa: boolean) => ({
  id, descricao, forma_enum, max_parcelas: 1, contem_taxa: false, taxa_percent: 0, entra_no_caixa, ativo: true,
});

const DEBITO = forma('f-deb', 'Cartão Débito', 'cartao_debito', false);
const DINHEIRO = forma('f-din', 'Dinheiro', 'dinheiro', true);

interface Gravacao {
  tabela: string;
  valores: unknown;
}

/**
 * O dublê de sempre, mais: anota o que a tela manda gravar, e pagina a tabela
 * de clientes como o Supabase de verdade — no máximo mil linhas por pedido,
 * cortando calado o resto.
 */
function montarBanco(tabelas: Record<string, unknown[]>, clientesGrandes?: unknown[]) {
  const base = bancoFalso(tabelas);
  const gravacoes: Gravacao[] = [];
  return {
    gravacoes,
    banco: {
      ...base,
      from: (tabela: string) => {
        if (tabela === 'clientes' && clientesGrandes) {
          let de = 0;
          let ate = 999; // sem pedir página, o Supabase entrega só as mil primeiras
          const consulta: Record<string, unknown> = {};
          for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'ilike', 'in', 'is']) {
            consulta[m] = () => consulta;
          }
          consulta.range = (a: number, b: number) => {
            de = a;
            ate = b;
            return consulta;
          };
          consulta.then = (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) =>
            Promise.resolve({ data: clientesGrandes.slice(de, ate + 1), error: null }).then(ok, erro);
          return consulta;
        }
        const consulta = base.from(tabela) as Record<string, unknown>;
        consulta.insert = (valores: unknown) => {
          gravacoes.push({ tabela, valores });
          return consulta;
        };
        return consulta;
      },
    },
  };
}

async function abrirPDV(opcoes: {
  produtos: unknown[];
  formas?: unknown[];
  clientesGrandes?: unknown[];
  perfil?: 'administrador' | 'vendedor';
}) {
  mockCan.mockImplementation(montarCan({ perfil: opcoes.perfil ?? 'administrador' }));
  const { banco, gravacoes } = montarBanco(
    {
      vw_produtos: opcoes.produtos,
      clientes: [],
      formas_pagamento: opcoes.formas ?? [DEBITO, DINHEIRO],
      catalogos: [],
      campos_obrigatorios: [],
      // A venda gravada volta com id e número (é o `.insert().select().single()`).
      vendas: [{ id: 'v-nova', numero_venda: 'OV0100' }],
    },
    opcoes.clientesGrandes,
  );
  mockSupabase.atual = banco;
  const { default: PDV } = await import('./PDV');
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/pdv']}>
        <Routes>
          <Route path="/pdv" element={<PDV />} />
          <Route path="/vendas/:id/comprovante" element={<p>Tela do comprovante</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return gravacoes;
}

async function porNoCarrinho(...nomes: string[]) {
  for (const nome of nomes) fireEvent.click(await screen.findByText(nome));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /finalizar venda/i })).toBeEnabled();
  });
}

async function abrirPagamento() {
  fireEvent.click(screen.getByRole('button', { name: /finalizar venda/i }));
  await screen.findByText(/Adicionar Pagamento/i);
}

/** Lança um pagamento pelo formulário manual, na forma que estiver escolhida. */
function lancarManual(valor: string) {
  const campo = screen.getByPlaceholderText('Valor');
  fireEvent.change(campo, { target: { value: valor } });
  const botoes = within(campo.parentElement!).getAllByRole('button');
  fireEvent.click(botoes[botoes.length - 1]);
}

describe('PDV: pagamento em centavos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('R$ 9,90 + R$ 69,90 pagos com R$ 79,80 no débito fecham — sem "Falta R$ 0,00"', async () => {
    await abrirPDV({ produtos: [CAPA, CONTROLE] });
    await porNoCarrinho('Capa de controle', 'Controle genérico');
    await abrirPagamento();

    lancarManual('79.80');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirmar venda/i })).toBeEnabled();
    });
    expect(screen.queryByText('Falta')).not.toBeInTheDocument();
    expect(screen.queryByText('Troco')).not.toBeInTheDocument();
  });

  it('o banco recebe subtotal, desconto e total que fecham no centavo', async () => {
    // Desconto digitado com 3 casas: antes ia inteiro, e o banco arredondava
    // cada coluna do seu jeito — desconto + total dava 1 centavo a mais.
    const gravacoes = await abrirPDV({ produtos: [produto('p9', 'Jogo', 100)] });
    await porNoCarrinho('Jogo');
    fireEvent.change(screen.getByLabelText(/Desconto \(R\$\)/), { target: { value: '10.555' } });
    await abrirPagamento();
    lancarManual('89.44');

    fireEvent.click(await screen.findByRole('button', { name: /confirmar venda/i }));

    await waitFor(() => {
      expect(gravacoes.some((g) => g.tabela === 'vendas')).toBe(true);
    });
    const venda = gravacoes.find((g) => g.tabela === 'vendas')!.valores as {
      subtotal: number;
      descontos: number;
      total: number;
    };
    expect(venda.descontos).toBe(10.56);
    expect(venda.total).toBe(89.44);
    expect(Math.round((venda.subtotal - venda.descontos) * 100)).toBe(Math.round(venda.total * 100));
  });
});

describe('PDV: troco que não entrou pela gaveta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('troco comum em dinheiro não assusta ninguém', async () => {
    // Dinheiro primeiro na lista: é a forma já escolhida no formulário.
    await abrirPDV({ produtos: [FONE], formas: [DINHEIRO, DEBITO] });
    await porNoCarrinho('Fone de ouvido');
    await abrirPagamento();

    lancarManual('100');

    expect(await screen.findByText('Troco')).toBeInTheDocument();
    expect(screen.queryByText(/não entrou em dinheiro/)).not.toBeInTheDocument();
  });

  it('cartão lançado a mais: avisa que o troco vai sair da gaveta sem ter entrado nela', async () => {
    await abrirPDV({ produtos: [FONE], formas: [DEBITO, DINHEIRO] });
    await porNoCarrinho('Fone de ouvido');
    await abrirPagamento();

    lancarManual('100');

    expect(await screen.findByText(/não entrou em dinheiro/)).toBeInTheDocument();
  });
});

describe('PDV: depois de fechar a venda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('oferece imprimir o comprovante sem sair do PDV', async () => {
    await abrirPDV({ produtos: [FONE], formas: [DINHEIRO, DEBITO] });
    await porNoCarrinho('Fone de ouvido');
    await abrirPagamento();
    lancarManual('100');

    fireEvent.click(await screen.findByRole('button', { name: /confirmar venda/i }));

    expect(await screen.findByText('Venda finalizada!')).toBeInTheDocument();
    // O troco fica escrito na janela: o carrinho já foi limpo para o próximo.
    expect(screen.getByText(/Troco: R\$\s?20,00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /imprimir comprovante/i }));
    expect(await screen.findByText('Tela do comprovante')).toBeInTheDocument();
  });

  it('"Nova venda" fecha a janela e o PDV continua lá', async () => {
    await abrirPDV({ produtos: [FONE], formas: [DINHEIRO, DEBITO] });
    await porNoCarrinho('Fone de ouvido');
    await abrirPagamento();
    lancarManual('80');
    fireEvent.click(await screen.findByRole('button', { name: /confirmar venda/i }));

    fireEvent.click(await screen.findByRole('button', { name: /nova venda/i }));

    await waitFor(() => {
      expect(screen.queryByText('Venda finalizada!')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Carrinho vazio')).toBeInTheDocument();
  });
});

describe('PDV: a lista de clientes não para no milésimo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('acha um cliente depois do milésimo na ordem alfabética', async () => {
    // Com a base do sistema antigo importada, quem estava depois do milésimo
    // não aparecia na busca do PDV — e o vendedor cadastrava de novo.
    const clientes = Array.from({ length: 1200 }, (_, i) => ({
      id: `c${i}`,
      nome: `Cliente ${String(i + 1).padStart(4, '0')}`,
      telefones: [],
      liberado_venda: true,
    }));
    await abrirPDV({ produtos: [FONE], clientesGrandes: clientes });

    const botoes = await screen.findAllByRole('button', { name: /cliente/i });
    const botaoCliente = botoes.find((b) => !/cadastrar/i.test(b.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(botaoCliente);
    fireEvent.change(await screen.findByPlaceholderText(/buscar por nome ou telefone/i), {
      target: { value: 'Cliente 1150' },
    });

    expect(await screen.findByRole('button', { name: /Cliente 1150/ })).toBeInTheDocument();
  });
});
