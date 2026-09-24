import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Ficha do produto (/estoque/:id) — os quatro achados da revisão de 24/09.
 *
 *  1. ESTOQUE FANTASMA. O gerente abre a ficha do Controle PS5 (3 unidades) e
 *     vai para outra aba; o balcão vende 1 (fica 2); ele volta, muda só o
 *     preço e salva — e o estoque voltava para 3, com um "Ajuste manual" no
 *     nome dele. O campo mostrava o número velho, e salvar comparava o velho
 *     com o relido.
 *  2. MÍNIMO 0 não gravava: digitar 0 e salvar voltava 1.
 *  3. PRODUTO INEXISTENTE ficava girando para sempre.
 *  4. EXCLUIR pedia uma permissão na lista e outra na ficha.
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

// A ficha lê o id do endereço (/estoque/:id).
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useParams: () => ({ id: 'p1' }),
}));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

const CONTROLE = {
  id: 'p1',
  nome: 'Controle DualSense Branco',
  codigo_barra: '789',
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
  custo: 300,
  preco: 429.9,
  margem_percent: 43.3,
  estoque_atual: 3,
  estoque_minimo: 1,
  estoque_maximo: 100,
  localizacao: 'vitrine',
  garantia_meses: 3,
  observacoes: null,
  ativo: true,
  created_at: '2026-08-01T10:00:00Z',
};

type Consulta = Record<string, (...args: unknown[]) => unknown>;

/**
 * Banco de mentira cujo produto pode MUDAR no meio do teste (é assim que se
 * simula a venda feita no balcão enquanto a ficha está aberta), e que anota o
 * que a tela gravou.
 */
function montarBanco(opcoes: { produtos?: unknown[]; erroNoAjuste?: string } = {}) {
  const tabelas: Record<string, unknown[]> = {
    vw_produtos: opcoes.produtos ?? [CONTROLE],
    vw_movimentos_estoque: [],
    catalogos: [],
  };
  const banco = bancoFalso(tabelas);
  const gravacoes: Record<string, unknown>[] = [];
  const rpc = vi.fn((nome: string) =>
    Promise.resolve(
      nome === 'ajustar_estoque_produto' && opcoes.erroNoAjuste
        ? { data: null, error: { message: opcoes.erroNoAjuste } }
        : { data: null, error: null },
    ),
  );
  const fromOriginal = banco.from;
  const from = (tabela: string) => {
    const consulta = fromOriginal(tabela) as unknown as Consulta;
    if (tabela === 'produtos') {
      consulta.update = (payload: unknown) => {
        gravacoes.push(payload as Record<string, unknown>);
        return consulta;
      };
    }
    return consulta;
  };
  mockSupabase.atual = { ...banco, from, rpc };
  return {
    rpc,
    gravacoes,
    /** O balcão vendeu: o banco passa a ter outro saldo. */
    mudarEstoqueNoBanco: (n: number) => {
      tabelas.vw_produtos = [{ ...CONTROLE, estoque_atual: n }];
    },
  };
}

async function abrirFicha(perfil = 'administrador', opcoes: Parameters<typeof montarBanco>[0] = {}) {
  mockCan.mockImplementation(montarCan({ perfil }));
  const banco = montarBanco(opcoes);
  const { default: EstoqueDetalhe } = await import('./EstoqueDetalhe');
  renderizarTela(<EstoqueDetalhe />);
  return banco;
}

const campo = (id: string) => document.getElementById(id) as HTMLInputElement;

describe('Ficha do produto: estoque que muda com a ficha aberta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });
  afterEach(() => {
    focusManager.setFocused(undefined);
  });

  it('venda no balcão + volta para a janela: o campo acompanha o banco e salvar o PREÇO não mexe no estoque', async () => {
    const banco = await abrirFicha();
    await waitFor(() => expect(campo('estoque_atual')).toHaveValue(3));

    // O balcão vende 1 enquanto a ficha está aberta em outra aba.
    banco.mudarEstoqueNoBanco(2);
    // A pessoa volta para a janela: o sistema relê o produto sozinho.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(campo('estoque_atual')).toHaveValue(2));

    fireEvent.change(campo('preco'), { target: { value: '449.9' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(banco.gravacoes).toHaveLength(1));
    expect(banco.gravacoes[0]).toMatchObject({ preco: 449.9 });
    // O defeito: aqui ia um ajuste para 3, recriando a unidade vendida.
    expect(banco.rpc).not.toHaveBeenCalledWith('ajustar_estoque_produto', expect.anything());
  });

  it('mesmo SEM reler, salvar sem mexer no campo não chama o ajuste', async () => {
    const banco = await abrirFicha();
    await waitFor(() => expect(campo('estoque_atual')).toHaveValue(3));

    fireEvent.change(campo('preco'), { target: { value: '449.9' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(banco.gravacoes).toHaveLength(1));
    expect(banco.rpc).not.toHaveBeenCalledWith('ajustar_estoque_produto', expect.anything());
  });

  it('quem MEXE no estoque manda o número novo e o saldo que viu, para o banco conferir', async () => {
    const banco = await abrirFicha();
    await waitFor(() => expect(campo('estoque_atual')).toHaveValue(3));

    fireEvent.change(campo('estoque_atual'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(banco.rpc).toHaveBeenCalledWith('ajustar_estoque_produto', {
        _produto_id: 'p1',
        _nova_quantidade: 5,
        _saldo_anterior: 3,
      });
    });
  });

  it('se o banco recusa (o saldo mudou), avisa que o estoque NÃO foi alterado e mostra o número real', async () => {
    const banco = await abrirFicha('administrador', {
      erroNoAjuste: 'O estoque deste produto mudou enquanto a ficha estava aberta (era 3, agora é 2).',
    });
    await waitFor(() => expect(campo('estoque_atual')).toHaveValue(3));

    banco.mudarEstoqueNoBanco(2);
    fireEvent.change(campo('estoque_atual'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Ficha salva, mas o estoque NÃO foi alterado',
          variant: 'destructive',
        }),
      );
    });
    await waitFor(() => expect(campo('estoque_atual')).toHaveValue(2));
  });

  it('campo de estoque apagado não zera o estoque: recusa e não grava nada', async () => {
    const banco = await abrirFicha();
    await waitFor(() => expect(campo('estoque_atual')).toHaveValue(3));

    fireEvent.change(campo('estoque_atual'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Estoque atual inválido' }),
      );
    });
    expect(banco.gravacoes).toHaveLength(0);
    expect(banco.rpc).not.toHaveBeenCalled();
  });
});

describe('Ficha do produto: mínimo 0, produto inexistente e excluir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('mínimo 0 é gravado como 0 (o antigo "|| 1" trocava por 1)', async () => {
    const banco = await abrirFicha();
    await waitFor(() => expect(campo('estoque_minimo')).toHaveValue(1));

    fireEvent.change(campo('estoque_minimo'), { target: { value: '0' } });
    fireEvent.change(campo('estoque_maximo'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(banco.gravacoes).toHaveLength(1));
    expect(banco.gravacoes[0]).toMatchObject({ estoque_minimo: 0, estoque_maximo: 0 });
  });

  it('produto que não existe diz "não encontrado" em vez de girar para sempre', async () => {
    await abrirFicha('administrador', { produtos: [] });
    expect(await screen.findByText('Produto não encontrado')).toBeInTheDocument();
  });

  it('o Gerente Técnico vê o Excluir na ficha — igual à lista do Estoque', async () => {
    // Ele tem inventory.edit (o que o banco exige para excluir, que é
    // desligar o produto) mas não inventory.delete.
    await abrirFicha('gerente_tecnico');
    expect(await screen.findByRole('button', { name: /excluir/i })).toBeInTheDocument();
  });

  it('o Vendedor (sem editar produto) não vê o Excluir', async () => {
    await abrirFicha('vendedor');
    await waitFor(() => expect(campo('nome')).toHaveValue('Controle DualSense Branco'));
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });
});
