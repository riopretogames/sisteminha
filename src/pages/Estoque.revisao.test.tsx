import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Lista de Estoque — dois achados da revisão de 24/09.
 *
 *  1. APARELHO DE TROCA COM PREÇO SUMIA. Desde 25/08 o vendedor pode dizer no
 *     PDV por quanto vai revender o aparelho recebido em troca. O banco cria o
 *     produto desligado da venda com esse preço — e a lista só chamava de
 *     "Aguardando revisão" o desligado com preço ZERO. O PS4 usado com preço
 *     ganhava a etiqueta "Inativo" (igual a produto excluído) e ninguém sabia
 *     que precisava ser revisado.
 *  2. CORTE CALADO EM 1.000. A API do banco devolve no máximo 1.000 linhas por
 *     pedido; com o catálogo do sistema antigo importado, o produto depois do
 *     milésimo em ordem alfabética sumiria da busca.
 */

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

function produto(parcial: Record<string, unknown>) {
  return {
    id: 'x',
    nome: 'Produto',
    codigo_barra: null,
    imei_serial: null,
    marca: null,
    modelo: null,
    grupo_produto_id: null,
    marca_id: null,
    modelo_id: null,
    cor_id: null,
    condicao_id: null,
    memoria_id: null,
    categoria: 'acessorio',
    custo: null,
    preco: 100,
    margem_percent: null,
    estoque_atual: 5,
    estoque_minimo: 1,
    localizacao: 'vitrine',
    ativo: true,
    created_at: '2026-08-01T10:00:00Z',
    ...parcial,
  };
}

const PS4_DA_TROCA = produto({ id: 'troca', nome: 'PS4 usado da troca', ativo: false, preco: 900, estoque_atual: 1 });
const EXCLUIDO = produto({ id: 'velho', nome: 'Capinha fora de linha', ativo: false, preco: 0, estoque_atual: 3 });
const A_VENDA = produto({ id: 'ok', nome: 'Controle DualSense', ativo: true });

async function abrirEstoque(tabelas: Record<string, unknown[]>, perfil = 'administrador') {
  mockCan.mockImplementation(montarCan({ perfil }));
  mockSupabase.atual = bancoFalso({ catalogos: [], ...tabelas });
  const { default: Estoque } = await import('./Estoque');
  return renderizarTela(<Estoque />);
}

describe('Estoque: aparelho recebido em troca esperando revisão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('troca desligada da venda COM preço entra no aviso "Aguardando revisão"', async () => {
    await abrirEstoque({
      vw_produtos: [PS4_DA_TROCA, EXCLUIDO, A_VENDA],
      entradas_produto: [{ produto_id: 'troca' }],
    });

    expect(await screen.findByText('Aguardando revisão')).toBeInTheDocument();
    // Conta só o aparelho da troca: a capinha excluída (preço zero, mas não
    // veio de troca) não está esperando ninguém.
    expect(screen.getByText(/^1 aparelho\(s\) recebido\(s\) em troca/)).toBeInTheDocument();
  });

  it('com o filtro "não apto", a troca tem a etiqueta certa e o excluído vira "Inativo"', async () => {
    await abrirEstoque({
      vw_produtos: [PS4_DA_TROCA, EXCLUIDO, A_VENDA],
      entradas_produto: [{ produto_id: 'troca' }],
    });

    fireEvent.click(await screen.findByText('Aguardando revisão'));

    const linhaTroca = (await screen.findByText('PS4 usado da troca')).closest('tr')!;
    expect(within(linhaTroca).getByText('Aguardando revisão')).toBeInTheDocument();
    const linhaExcluido = screen.getByText('Capinha fora de linha').closest('tr')!;
    // Antes, inativo com preço zero ganhava "Aguardando revisão" sem ter vindo
    // de troca.
    expect(within(linhaExcluido).getByText('Inativo')).toBeInTheDocument();
    expect(within(linhaExcluido).queryByText('Aguardando revisão')).not.toBeInTheDocument();
  });

  it('sem nenhuma troca pendente, não há aviso', async () => {
    await abrirEstoque({ vw_produtos: [EXCLUIDO, A_VENDA], entradas_produto: [] });
    await screen.findByText('Controle DualSense');
    expect(screen.queryByText('Aguardando revisão')).not.toBeInTheDocument();
  });
});

/**
 * Consulta de mentira que se comporta como a API do banco: sem `range`, para
 * nas primeiras 1.000 linhas, calada; com `range`, devolve só a página pedida.
 */
function consultaComLimiteDeMil(linhas: unknown[]) {
  const consulta: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'or', 'not', 'order', 'limit', 'filter']) {
    consulta[m] = () => consulta;
  }
  consulta.range = (de: number, ate: number) =>
    Promise.resolve({ data: linhas.slice(de, ate + 1), error: null });
  consulta.then = (aceitar: (r: unknown) => unknown) =>
    Promise.resolve({ data: linhas.slice(0, 1000), error: null }).then(aceitar);
  return consulta;
}

describe('Estoque: catálogo com mais de 1.000 produtos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('o produto 1.001 aparece na lista', async () => {
    // Mil produtos antigos (fora de linha, para a tela não ter que desenhar
    // mil linhas) e o milésimo primeiro, à venda, no fim da ordem alfabética.
    const antigos = Array.from({ length: 1000 }, (_, i) =>
      produto({ id: `a${i}`, nome: `Antigo ${String(i).padStart(4, '0')}`, ativo: false, preco: 10 }),
    );
    const ultimo = produto({ id: 'z', nome: 'Zeta Controle Pro', ativo: true });

    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    const banco = bancoFalso({ catalogos: [], entradas_produto: [] });
    mockSupabase.atual = {
      ...banco,
      from: (tabela: string) =>
        tabela === 'vw_produtos' ? consultaComLimiteDeMil([...antigos, ultimo]) : banco.from(tabela),
    };
    const { default: Estoque } = await import('./Estoque');
    renderizarTela(<Estoque />);

    await waitFor(() => {
      expect(screen.getByText('Zeta Controle Pro')).toBeInTheDocument();
    });
  });
});
