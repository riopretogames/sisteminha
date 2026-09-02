import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * O PDV usa a regra de campos obrigatórios da venda — não só a tem.
 *
 * Os testes de `lib/vendaObrigatorios` provam que a REGRA está certa. Estes
 * provam que a TELA a chama, que é onde esse tipo de coisa se perde: em 01/09
 * cinco campos da OS apareciam em Campos Obrigatórios, a loja ligava, e o
 * balcão continuava salvando sem eles — a função existia, estava testada, e
 * ninguém a tinha chamado.
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

const PRODUTO = {
  id: 'p1',
  nome: 'Echo Dot 5',
  preco: 349,
  custo: 200,
  estoque_atual: 5,
  ativo: true,
  apto_venda: true,
  categoria: 'Acessório',
  marca: 'Amazon',
  imei_serial: null,
};

/**
 * `exigidos` é o que a loja configurou em Cadastros > Campos Obrigatórios.
 * Vazio = padrão de fábrica, que não exige nada na venda.
 */
async function abrirPDV(
  exigidos: Array<{ campo: string; obrigatorio: boolean }> = [],
  opcoes: { configuracaoFalha?: boolean } = {},
) {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  mockSupabase.atual = bancoFalso(
    {
      vw_produtos: [PRODUTO],
      clientes: [{ id: 'c1', nome: 'Adriana Prado', telefones: ['17910000001'], liberado_venda: true }],
      formas_pagamento: [{ id: 'f1', descricao: 'Dinheiro', contem_taxa: false, taxa_percent: 0, ativo: true }],
      catalogos: [],
      campos_obrigatorios: exigidos,
    },
    opcoes.configuracaoFalha ? { falham: ['campos_obrigatorios'] } : {},
  );
  const { default: PDV } = await import('./PDV');
  return renderizarTela(<PDV />);
}

/** Põe o produto no carrinho, que é o que destrava "Finalizar Venda". */
async function porNoCarrinho() {
  fireEvent.click(await screen.findByText('Echo Dot 5'));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /finalizar venda/i })).toBeEnabled();
  });
}

const avisos = () => mockToast.mock.calls.map((c) => (c[0] as { title: string }).title);

/**
 * O botão que escolhe o cliente no carrinho.
 *
 * Não dá para pegar só pelo nome: ao lado dele mora o "Cadastrar cliente
 * novo", e os dois casam com /cliente/. Este descarta o vizinho pelo rótulo.
 */
async function botaoDoCliente() {
  const candidatos = await screen.findAllByRole('button', { name: /cliente/i });
  const botao = candidatos.find(
    (b) => !/cadastrar/i.test(b.getAttribute('aria-label') ?? ''),
  );
  expect(botao, 'o botão de escolher cliente sumiu do carrinho').toBeDefined();
  return botao!;
}

describe('PDV: o que a loja exige para fechar a venda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('no padrão de fábrica, vende sem cliente — a fila do balcão não trava', async () => {
    await abrirPDV();
    await porNoCarrinho();

    fireEvent.click(screen.getByRole('button', { name: /finalizar venda/i }));

    // A janela de pagamento abriu, sem cobrar cliente nenhum.
    expect(await screen.findByText(/Adicionar Pagamento/i)).toBeInTheDocument();
    expect(avisos()).not.toContain('Falta o cliente');
  });

  it('com o cliente exigido, não deixa nem abrir o pagamento', async () => {
    await abrirPDV([{ campo: 'cliente_id', obrigatorio: true }]);
    await porNoCarrinho();

    fireEvent.click(screen.getByRole('button', { name: /finalizar venda/i }));

    await waitFor(() => {
      expect(avisos()).toContain('Falta o cliente');
    });
    // E o aviso não é um beco: a janela de escolher cliente abre junto.
    expect(await screen.findByText(/Selecionar Cliente/i)).toBeInTheDocument();
    expect(screen.queryByText(/Adicionar Pagamento/i)).not.toBeInTheDocument();
  });

  it('o botão do cliente ganha asterisco enquanto falta', async () => {
    await abrirPDV([{ campo: 'cliente_id', obrigatorio: true }]);

    const botao = await botaoDoCliente();
    await waitFor(() => {
      expect(botao.textContent).toContain('*');
    });
  });

  describe('a janela que o sistema abre para resolver a falta do cliente', () => {
    it('não oferece mais "Sem cliente" quando a loja exige o cliente', async () => {
      // Oferecer uma saída que a regra recusa é o que fazia o vendedor rodar
      // em círculo: clicava em "Sem cliente", a janela fechava, o Finalizar
      // Venda recusava de novo, a mesma janela abria de novo.
      await abrirPDV([{ campo: 'cliente_id', obrigatorio: true }]);
      await porNoCarrinho();

      fireEvent.click(screen.getByRole('button', { name: /finalizar venda/i }));

      expect(await screen.findByText(/Selecionar Cliente/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^sem cliente$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Esta loja exige o cliente na venda/i)).toBeInTheDocument();
    });

    it('sem exigência, "Sem cliente" continua lá — é o normal do balcão', async () => {
      await abrirPDV();
      await porNoCarrinho();

      fireEvent.click(await botaoDoCliente());

      expect(await screen.findByRole('button', { name: /^sem cliente$/i })).toBeInTheDocument();
      expect(screen.getByText(/continue sem vincular/i)).toBeInTheDocument();
    });
  });

  it('avisa quando não consegue ler o que a loja exige', async () => {
    // Sem resposta do banco vale o padrão de fábrica, que na venda é "não
    // exige nada" — ou seja, a falha fica IDÊNTICA a "a dona não exigiu nada".
    // O silêncio aqui é o mesmo que já custou caro nesta tela em 21/08.
    await abrirPDV([], { configuracaoFalha: true });

    await waitFor(() => {
      expect(avisos()).toContain('Não consegui ler o que esta loja exige na venda');
    });
  });

  it('sem exigência, o botão do cliente não tem asterisco', async () => {
    await abrirPDV();

    const botao = await botaoDoCliente();
    // Espera a configuração chegar antes de afirmar que não há asterisco:
    // olhar antes da resposta faria o teste passar mesmo com a regra ligada.
    await waitFor(() => {
      expect(screen.getByText('Echo Dot 5')).toBeInTheDocument();
    });
    expect(botao.textContent).not.toContain('*');
  });
});
