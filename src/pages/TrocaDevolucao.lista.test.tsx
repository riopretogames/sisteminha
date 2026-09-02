import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * A lista de vendas da tela de Troca e Devolução.
 *
 * Pedido do Felipe em 02/09, com a tela aberta na frente: *"falta muita
 * informação. Só tem a OV, não sei qual é o produto, não sei qual é o valor.
 * Eu tenho que clicar para saber"*. A lista tinha três colunas — número, data
 * e cliente — e três vendas do mesmo cliente no mesmo dia ficam indistinguíveis:
 * achar a certa era entrar em cada uma e voltar.
 *
 * E voltar era o outro problema: *"quando eu clico numa devolução, não consigo
 * voltar para trás"*. O botão existia, dizia "Trocar de venda" e ficava no
 * canto direito — ninguém o leu como o caminho de volta.
 */

const VENDAS = [
  {
    id: 'v1',
    numero_venda: 'OV0006',
    created_at: '2026-08-27T22:03:00Z',
    status: 'concluida',
    total: 1250.5,
    clientes: { id: 'c1', nome: 'Adriana Prado' },
    vendedor: { nome: 'Ana do Balcão' },
    itens_venda: [
      { quantidade: 1, produtos: { nome: 'Controle DualSense Branco' } },
      { quantidade: 2, produtos: { nome: 'Cabo HDMI 2.1' } },
    ],
    // Vendeu 3 peças, voltaram as 3: não há mais o que devolver.
    devolucoes: [{ devolucao_itens: [{ quantidade: 1 }, { quantidade: 2 }] }],
  },
  {
    id: 'v2',
    numero_venda: 'OV0005',
    created_at: '2026-08-25T12:45:00Z',
    status: 'concluida',
    total: 180,
    clientes: null,
    vendedor: { nome: 'Felipe Bottaro' },
    itens_venda: [{ quantidade: 1, produtos: { nome: 'Alexa Echo Dot' } }],
    devolucoes: [],
  },
  {
    id: 'v3',
    numero_venda: 'OV0004',
    created_at: '2026-08-25T12:43:00Z',
    status: 'concluida',
    total: 900,
    clientes: { id: 'c1', nome: 'Adriana Prado' },
    vendedor: { nome: 'Ana do Balcão' },
    // Vendeu 3 do mesmo produto, voltou 1: parcial.
    itens_venda: [{ quantidade: 3, produtos: { nome: 'Jogo God of War' } }],
    devolucoes: [{ devolucao_itens: [{ quantidade: 1 }] }],
  },
];

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

async function abrir() {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  mockSupabase.atual = bancoFalso({
    vendas: VENDAS,
    itens_venda: [],
    devolucoes: [],
    vw_produtos: [],
    formas_pagamento: [],
  });
  const { default: TrocaDevolucao } = await import('./TrocaDevolucao');
  return renderizarTela(<TrocaDevolucao />);
}

/** A linha da venda, para perguntar o que está escrito NELA e não na tela toda. */
async function linhaDa(numero: string) {
  const celula = await screen.findByText(numero);
  const linha = celula.closest('tr');
  if (!linha) throw new Error(`não achei a linha da venda ${numero}`);
  return within(linha);
}

describe('A lista de vendas da Troca e Devolução', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('mostra produto, vendedor e valor sem precisar entrar na venda', async () => {
    await abrir();
    const linha = await linhaDa('OV0005');

    expect(linha.getByText(/Alexa Echo Dot/)).toBeInTheDocument();
    expect(linha.getByText('Felipe Bottaro')).toBeInTheDocument();
    expect(linha.getByText(/180,00/)).toBeInTheDocument();
  });

  it('venda com vários produtos mostra o primeiro e quantos mais', async () => {
    // Cabe numa coluna e ainda deixa reconhecer a venda de relance.
    await abrir();
    const linha = await linhaDa('OV0006');

    expect(linha.getByText('Controle DualSense Branco + 1 item')).toBeInTheDocument();
  });

  describe('o aviso do que já voltou', () => {
    it('avisa na linha quando a venda já foi devolvida inteira', async () => {
      // Era o caso da tela do Felipe: ele clicou na OV0006 e só ali descobriu
      // "nada disponível pra devolver". Dois cliques e a dúvida de ter errado
      // a venda.
      await abrir();
      const linha = await linhaDa('OV0006');

      expect(linha.getByText(/já devolvida/i)).toBeInTheDocument();
    });

    it('conta PEÇAS, não linhas: 1 de 3 unidades é devolução em parte', async () => {
      // Contando linhas, a OV0004 (uma linha de produto, 1 de 3 unidades
      // devolvida) apareceria como totalmente devolvida — e a loja deixaria de
      // devolver as outras 2 achando que já tinham voltado.
      await abrir();
      const linha = await linhaDa('OV0004');

      expect(linha.getByText(/devolvida em parte/i)).toBeInTheDocument();
    });

    it('venda intocada não ganha selo nenhum', async () => {
      await abrir();
      const linha = await linhaDa('OV0005');

      expect(linha.queryByText(/devolvida/i)).not.toBeInTheDocument();
    });
  });

  describe('a busca', () => {
    it('acha pelo nome do produto — é do que o cliente lembra', async () => {
      await abrir();

      fireEvent.change(await screen.findByPlaceholderText(/buscar por número/i), {
        target: { value: 'god of war' },
      });

      expect(await screen.findByText('OV0004')).toBeInTheDocument();
      expect(screen.queryByText('OV0005')).not.toBeInTheDocument();
    });

    it('acha pelo vendedor', async () => {
      await abrir();

      fireEvent.change(await screen.findByPlaceholderText(/buscar por número/i), {
        target: { value: 'felipe' },
      });

      expect(await screen.findByText('OV0005')).toBeInTheDocument();
      expect(screen.queryByText('OV0006')).not.toBeInTheDocument();
    });

    it('busca vazia continua mostrando tudo', async () => {
      await abrir();

      expect(await screen.findByText('OV0006')).toBeInTheDocument();
      expect(screen.getByText('OV0005')).toBeInTheDocument();
      expect(screen.getByText('OV0004')).toBeInTheDocument();
    });
  });

  describe('as duas ações da linha', () => {
    /**
     * Antes, a linha inteira era um clique só e ele começava a devolução.
     * Pedido do Felipe em 02/09: *"quando clicar na OV0003, abrir todas as
     * informações que a gente consegue consultar, inclusive os históricos de
     * movimentações"*. Duas ações no mesmo lugar viravam adivinhação — então
     * cada uma ganhou o seu, com o que ela faz escrito nela.
     */
    it('o número da venda abre a ficha completa, não a devolução', async () => {
      await abrir();

      fireEvent.click(await screen.findByRole('button', { name: 'OV0005' }));

      // A ficha abre por cima, com o cabeçalho da venda. As etapas da
      // devolução continuam onde estavam.
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByText(/2\. O que está voltando\?/)).not.toBeInTheDocument();
    });

    it('o botão Devolver é que começa a devolução', async () => {
      await abrir();
      const linha = await linhaDa('OV0005');

      fireEvent.click(linha.getByRole('button', { name: /devolver/i }));

      expect(await screen.findByText(/2\. O que está voltando\?/)).toBeInTheDocument();
    });

    it('quem não pode ver venda não recebe a ficha — só devolve', async () => {
      // A ficha mostra o comercial inteiro (CPF, telefone, formas de
      // pagamento, descontos). É a mesma trava do Relatório de Vendas.
      mockCan.mockImplementation(montarCan({ perfil: 'administrador', menos: ['sales.view'] }));
      mockSupabase.atual = bancoFalso({
        vendas: VENDAS, itens_venda: [], devolucoes: [], vw_produtos: [], formas_pagamento: [],
      });
      const { default: TrocaDevolucao } = await import('./TrocaDevolucao');
      renderizarTela(<TrocaDevolucao />);

      const linha = await linhaDa('OV0005');
      expect(linha.queryByRole('button', { name: 'OV0005' })).not.toBeInTheDocument();
      expect(linha.getByRole('button', { name: /devolver/i })).toBeInTheDocument();
    });
  });

  describe('o caminho de volta', () => {
    it('depois de escolher a venda, existe um botão que diz para onde volta', async () => {
      await abrir();
      const linha = await linhaDa('OV0005');
      fireEvent.click(linha.getByRole('button', { name: /devolver/i }));

      expect(await screen.findByRole('button', { name: /voltar para a lista de vendas/i }))
        .toBeInTheDocument();
    });

    it('e ele volta mesmo para a lista', async () => {
      await abrir();
      const linha = await linhaDa('OV0005');
      fireEvent.click(linha.getByRole('button', { name: /devolver/i }));
      fireEvent.click(await screen.findByRole('button', { name: /voltar para a lista/i }));

      // A lista de novo, com as três vendas.
      expect(await screen.findByText('OV0006')).toBeInTheDocument();
      expect(screen.getByText('OV0004')).toBeInTheDocument();
    });

    it('a ficha continua a um clique no meio da devolução', async () => {
      // A pergunta que aparece com o cliente na frente: "isso foi pago como?".
      // Ter de voltar para a lista para consultar apagaria o preenchimento.
      await abrir();
      const linha = await linhaDa('OV0004');
      fireEvent.click(linha.getByRole('button', { name: /devolver/i }));

      fireEvent.click(await screen.findByRole('button', { name: /ver ficha completa/i }));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
  });
});
