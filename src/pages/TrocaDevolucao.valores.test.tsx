import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within, waitFor, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Quanto a Troca e Devolução manda devolver — e o que ela grava.
 *
 * Achados da revisão de 24/09:
 *
 * 1. A tela devolvia o PREÇO DE TABELA, não o que o cliente pagou. O PDV dá o
 *    desconto na venda inteira e grava o preço cheio no item. Prova com dado
 *    real: a VD-202608-0003 (itens de R$ 2.000, desconto de R$ 500, paga com
 *    PIX de R$ 1.500) mandava devolver R$ 2.000,00.
 * 2. A conta em número quebrado deixava resíduo: uma troca "sem diferença"
 *    virava "cliente paga a mais R$ 0,00" e exigia forma de pagamento.
 * 3. A venda nova da troca não passava pelos campos que a loja exige na venda.
 */

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
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

/** A venda real do achado: R$ 2.000 em itens, R$ 500 de desconto, R$ 1.500 pagos. */
const VD_0003 = {
  id: 'v3',
  numero_venda: 'VD-202608-0003',
  created_at: '2026-08-10T15:00:00Z',
  status: 'pago',
  total: 1500,
  origem_venda_id: null,
  clientes: { id: 'c1', nome: 'Adriana Prado' },
  vendedor: { nome: 'Felipe Bottaro' },
  itens_venda: [{ quantidade: 1, produtos: { nome: 'PlayStation 5', imei_serial: 'SN-PS5-1' } }],
  devolucoes: [],
};

const ITEM_PS5 = {
  id: 'i1',
  produto_id: 'ps5',
  quantidade: 1,
  preco_unitario: 2000,
  total: 2000,
  produtos: { nome: 'PlayStation 5' },
};

const FORMAS = [{ id: 'f-dinheiro', descricao: 'Dinheiro', forma_enum: 'dinheiro' }];

interface Gravacao {
  tabela: string;
  valores: unknown;
}

/**
 * O dublê de sempre, mais um caderno do que a tela mandou GRAVAR. É o que
 * interessa aqui: não basta a tela mostrar o valor certo, o banco tem que
 * receber o valor certo.
 */
function bancoQueAnota(
  tabelas: Record<string, unknown[]>,
  exigidos: Array<{ campo: string; obrigatorio: boolean }> = [],
) {
  const base = bancoFalso({ ...tabelas, campos_obrigatorios: exigidos });
  const gravacoes: Gravacao[] = [];
  const banco = {
    ...base,
    from: (tabela: string) => {
      const consulta = base.from(tabela) as Record<string, unknown>;
      consulta.insert = (valores: unknown) => {
        gravacoes.push({ tabela, valores });
        return consulta;
      };
      return consulta;
    },
  };
  return { banco, gravacoes };
}

async function abrirNaVenda(
  venda: typeof VD_0003,
  itens: unknown[],
  opcoes: { produtos?: unknown[]; exigidos?: Array<{ campo: string; obrigatorio: boolean }> } = {},
) {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  const { banco, gravacoes } = bancoQueAnota(
    {
      vendas: [venda],
      itens_venda: itens,
      // A devolução gravada volta com número; o dublê devolve esta linha no
      // `.insert().select().single()`. Sem itens: nada foi devolvido antes.
      devolucoes: [{ id: 'd1', numero_devolucao: 'DV-0001', devolucao_itens: [] }],
      vw_produtos: opcoes.produtos ?? [],
      formas_pagamento: FORMAS,
      catalogos: [],
    },
    opcoes.exigidos,
  );
  mockSupabase.atual = banco;
  const { default: TrocaDevolucao } = await import('./TrocaDevolucao');
  renderizarTela(<TrocaDevolucao />);

  const celula = await screen.findByText(venda.numero_venda);
  fireEvent.click(within(celula.closest('tr')!).getByRole('button', { name: /devolver/i }));
  await screen.findByText(/2\. O que está voltando\?/);
  return gravacoes;
}

/** O campo "Devolver" da linha do produto. */
async function marcarParaDevolver(produto: string, quantidade: number) {
  const linha = (await screen.findByText(produto)).closest('tr')!;
  fireEvent.change(within(linha).getByPlaceholderText('0'), { target: { value: String(quantidade) } });
}

/** O valor escrito ao lado do rótulo do acerto ("Devolver ao cliente", "Diferença"...). */
function valorDoAcerto(rotulo: RegExp) {
  const titulo = screen.getByText(rotulo);
  return titulo.parentElement!.textContent ?? '';
}

describe('Troca e Devolução: o valor devolvido é o que o cliente pagou', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('VD-202608-0003: quem pagou R$ 1.500 recebe R$ 1.500, não R$ 2.000', async () => {
    await abrirNaVenda(VD_0003, [ITEM_PS5]);
    await marcarParaDevolver('PlayStation 5', 1);

    await waitFor(() => {
      expect(valorDoAcerto(/Devolver ao cliente/)).toMatch(/1\.500,00/);
    });
    expect(valorDoAcerto(/Devolver ao cliente/)).not.toMatch(/2\.000,00/);
  });

  it('a tela mostra o pago por unidade e explica a diferença para a etiqueta', async () => {
    await abrirNaVenda(VD_0003, [ITEM_PS5]);

    const linha = (await screen.findByText('PlayStation 5')).closest('tr')!;
    expect(within(linha).getByText(/1\.500,00/)).toBeInTheDocument();
    expect(within(linha).getByText(/tabela R\$\s?2\.000,00 — a venda teve desconto/)).toBeInTheDocument();
  });

  it('grava na devolução o valor pago, não o de tabela', async () => {
    const gravacoes = await abrirNaVenda(VD_0003, [ITEM_PS5]);
    await marcarParaDevolver('PlayStation 5', 1);

    // Forma da devolução: Dinheiro.
    const seletor = await screen.findByRole('combobox');
    fireEvent.pointerDown(seletor, new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    fireEvent.click(await screen.findByRole('option', { name: 'Dinheiro' }));

    fireEvent.click(screen.getByRole('button', { name: /confirmar devolução/i }));

    await waitFor(() => {
      expect(gravacoes.some((g) => g.tabela === 'devolucao_itens')).toBe(true);
    });
    const devolucao = gravacoes.find((g) => g.tabela === 'devolucoes')!.valores as {
      valor_devolvido_cliente: number;
    };
    expect(devolucao.valor_devolvido_cliente).toBe(1500);

    const itens = gravacoes.find((g) => g.tabela === 'devolucao_itens')!.valores as Array<{
      preco_unitario: number;
      quantidade: number;
    }>;
    expect(itens).toEqual([expect.objectContaining({ quantidade: 1, preco_unitario: 1500 })]);

    // O produto volta direto para o estoque de venda (achado 35, a decisão
    // de separar "volta para venda" de "vai para revisão" é do Felipe). Até
    // lá, o aviso lembra de conferir e leva ao produto.
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Devolução registrada!' }));
    });
    const aviso = mockToast.mock.calls.find(
      (c) => (c[0] as { title: string }).title === 'Devolução registrada!',
    )![0] as { description: string; action: unknown };
    expect(aviso.description).toMatch(/devolver R\$\s?1\.500,00/);
    expect(aviso.description).toMatch(/se veio com defeito, tire da venda no Estoque/);
    expect(aviso.action).toBeTruthy();
  });

  it('venda sem desconto continua devolvendo o preço cheio', async () => {
    await abrirNaVenda({ ...VD_0003, total: 2000 }, [ITEM_PS5]);
    await marcarParaDevolver('PlayStation 5', 1);

    await waitFor(() => {
      expect(valorDoAcerto(/Devolver ao cliente/)).toMatch(/2\.000,00/);
    });
  });

  it('três unidades com desconto: devolver as três devolve o total pago, nem um centavo a mais', async () => {
    // R$ 30 em itens com R$ 1 de desconto. Por unidade daria R$ 9,67 × 3 = R$ 29,01.
    const venda = { ...VD_0003, total: 29, numero_venda: 'OV0200' };
    const item = { ...ITEM_PS5, quantidade: 3, preco_unitario: 10, total: 30, produtos: { nome: 'Cabo HDMI' } };
    await abrirNaVenda(venda, [item]);
    await marcarParaDevolver('Cabo HDMI', 3);

    await waitFor(() => {
      expect(valorDoAcerto(/Devolver ao cliente/)).toMatch(/29,00/);
    });
  });
});

describe('Troca e Devolução: conta em centavos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('troca que empata no centavo não pede forma de pagamento', async () => {
    // Devolve um item de R$ 79,80 e leva dois de R$ 9,90 + R$ 69,90. Em número
    // quebrado sobrava 0,000000000000014 e a tela pedia "como o cliente vai
    // pagar" uma diferença de R$ 0,00.
    const venda = { ...VD_0003, total: 79.8, numero_venda: 'OV0300' };
    const item = { ...ITEM_PS5, preco_unitario: 79.8, total: 79.8, produtos: { nome: 'Headset' } };
    await abrirNaVenda(venda, [item], {
      produtos: [
        { id: 'n1', nome: 'Capa de controle', preco: 9.9, estoque_atual: 5 },
        { id: 'n2', nome: 'Controle genérico', preco: 69.9, estoque_atual: 5 },
      ],
    });
    await marcarParaDevolver('Headset', 1);

    const buscaProduto = screen.getByPlaceholderText('Buscar produto…');
    fireEvent.change(buscaProduto, { target: { value: 'capa' } });
    fireEvent.click(await screen.findByRole('button', { name: /Capa de controle/ }));
    fireEvent.change(buscaProduto, { target: { value: 'controle gen' } });
    fireEvent.click(await screen.findByRole('button', { name: /Controle genérico/ }));

    await waitFor(() => {
      expect(screen.getByText('Diferença')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Cliente paga a mais/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Forma de pagamento/)).not.toBeInTheDocument();
  });
});

describe('Troca e Devolução: a venda nova passa pelos campos que a loja exige', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('loja que exige cliente não grava venda nova de troca sem cliente', async () => {
    const venda = { ...VD_0003, total: 100, clientes: null, numero_venda: 'OV0400' };
    const item = { ...ITEM_PS5, preco_unitario: 100, total: 100, produtos: { nome: 'Jogo usado' } };
    const gravacoes = await abrirNaVenda(venda, [item], {
      produtos: [{ id: 'n1', nome: 'Jogo novo', preco: 100, estoque_atual: 2 }],
      exigidos: [{ campo: 'cliente_id', obrigatorio: true }],
    });
    await marcarParaDevolver('Jogo usado', 1);
    fireEvent.change(screen.getByPlaceholderText('Buscar produto…'), { target: { value: 'jogo novo' } });
    fireEvent.click(await screen.findByRole('button', { name: /Jogo novo/ }));

    fireEvent.click(await screen.findByRole('button', { name: /confirmar devolução/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Falta o cliente' }));
    });
    // E nada foi gravado: nem venda nova, nem devolução.
    expect(gravacoes.filter((g) => g.tabela === 'vendas' || g.tabela === 'devolucoes')).toEqual([]);
  });

  it('a venda nova herda a origem da venda original', async () => {
    const venda = { ...VD_0003, total: 100, origem_venda_id: 'origem-instagram', numero_venda: 'OV0500' };
    const item = { ...ITEM_PS5, preco_unitario: 100, total: 100, produtos: { nome: 'Jogo usado' } };
    const gravacoes = await abrirNaVenda(venda, [item], {
      produtos: [{ id: 'n1', nome: 'Jogo novo', preco: 100, estoque_atual: 2 }],
    });
    await marcarParaDevolver('Jogo usado', 1);
    fireEvent.change(screen.getByPlaceholderText('Buscar produto…'), { target: { value: 'jogo novo' } });
    fireEvent.click(await screen.findByRole('button', { name: /Jogo novo/ }));

    fireEvent.click(await screen.findByRole('button', { name: /confirmar devolução/i }));

    await waitFor(() => {
      expect(gravacoes.some((g) => g.tabela === 'vendas')).toBe(true);
    });
    const vendaNova = gravacoes.find((g) => g.tabela === 'vendas')!.valores as {
      origem_venda_id: string | null;
      total: number;
      valor_faturamento_real: number;
    };
    expect(vendaNova.origem_venda_id).toBe('origem-instagram');
    expect(vendaNova.total).toBe(100);
    expect(vendaNova.valor_faturamento_real).toBe(0);
  });
});

describe('Troca e Devolução: a venda pode vir escolhida pelo endereço', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('o botão "Trocar ou devolver" da ficha abre a tela já na venda', async () => {
    // A ficha manda `?venda=<id>`. A venda não precisa estar na lista das
    // recentes — é justamente a porta para a venda antiga.
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    mockSupabase.atual = bancoFalso({
      vendas: [VD_0003],
      itens_venda: [ITEM_PS5],
      devolucoes: [],
      vw_produtos: [],
      formas_pagamento: FORMAS,
      catalogos: [],
    });
    const { default: TrocaDevolucao } = await import('./TrocaDevolucao');
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={cliente}>
        <MemoryRouter initialEntries={['/vendas/troca-devolucao?venda=v3']}>
          <TrocaDevolucao />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/2\. O que está voltando\?/)).toBeInTheDocument();
    expect(await screen.findByText('PlayStation 5')).toBeInTheDocument();
  });
});
