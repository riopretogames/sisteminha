import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, bancoFalso, silenciarConsole } from '@/test/apoio';
import type { SelecaoPeriodo } from '@/lib/periodo';

/**
 * Os números do Dashboard de Vendas.
 *
 * Painel com número errado é pior que painel sem número: a pessoa decide em
 * cima dele. Estes testes montam vendas de mentira com valores redondos e
 * conferem o que aparece na tela — inclusive o abatimento de devolução, que o
 * Felipe pediu em 23/08, e os filtros de período/vendedor/categoria, que ele
 * pediu em 22/09.
 *
 * O relógio é congelado num DOMINGO (23/08/2026), que é o pior dia para
 * testar: a semana da loja vai de segunda a domingo, então domingo é o único
 * dia em que "ontem" (sábado) e "início da semana" (segunda) estão dos dois
 * lados. Se a conta de data estiver errada, quebra aqui.
 */

const DOMINGO = new Date('2026-08-23T15:00:00');
const SEGUNDA = '2026-08-17T10:00:00';
const SABADO = '2026-08-22T14:00:00';
const HOJE_CEDO = '2026-08-23T09:00:00';
const HOJE_PICO = '2026-08-23T14:30:00';
const MES_PASSADO = '2026-07-15T10:00:00';

function venda(over: Record<string, unknown>) {
  return {
    id: 'v',
    created_at: HOJE_PICO,
    total: 100,
    valor_faturamento_real: null,
    vendedor_id: 'ana',
    vendedor: { nome: 'Ana' },
    itens_venda: [],
    pagamentos_venda: [],
    ...over,
  };
}

const ITEM = (
  nome: string,
  categoria: string,
  qtd: number,
  total: number,
  grupo_produto_id: string | null = null,
) => ({
  produto_id: nome,
  quantidade: qtd,
  total,
  produtos: { nome, categoria, grupo_produto_id },
});

/** O cadastro de Grupo de Produto (Cadastros > Listas do Sistema). */
const GRUPOS = [
  { id: 'g-console', descricao: 'Console', ativo: true, ordem: 1 },
  { id: 'g-jogo', descricao: 'Jogo', ativo: true, ordem: 2 },
];

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    session: {},
    loading: false,
    can: () => true,
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

/**
 * Deixa a tela já aberta com um filtro escolhido.
 *
 * A tela lê o filtro do próprio navegador (é preferência de quem olha, não
 * dado da loja), então plantar a preferência antes de abrir é exatamente o
 * mesmo caminho que a pessoa percorre ao escolher no campo — e não depende de
 * abrir menu suspenso dentro do teste.
 */
function filtrar(periodo: SelecaoPeriodo, extras: Record<string, unknown> = {}) {
  localStorage.setItem(
    'sisteminha:filtros:venda',
    JSON.stringify({ periodo, pessoaId: '', categoria: '', comparar: true, ...extras }),
  );
}

async function abrir(
  vendas: unknown[],
  devolucoes: unknown[] = [],
  profiles: unknown[] = [],
  catalogos: unknown[] = GRUPOS,
) {
  mockSupabase.atual = bancoFalso({ vendas, devolucoes, profiles, catalogos });
  const { default: DashboardVenda } = await import('./DashboardVenda');
  return renderizarTela(<DashboardVenda />);
}

describe('Dashboard de Vendas — os números', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    // Sem isto um teste herda o filtro do anterior e a suíte passa a depender
    // da ordem em que roda.
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(DOMINGO);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('com o período "hoje", soma as vendas de hoje e só as de hoje', async () => {
    filtrar({ atalho: 'hoje' });
    await abrir([
      venda({ id: '1', created_at: HOJE_CEDO, total: 300 }),
      venda({ id: '2', created_at: HOJE_PICO, total: 200 }),
      venda({ id: '3', created_at: SABADO, total: 999 }), // ontem, não conta
    ]);

    await waitFor(() => {
      expect(screen.getAllByText(/R\$\s*500,00/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/R\$\s*1\.499,00/)).not.toBeInTheDocument();
  });

  it('o padrão da tela é o mês corrente — pega o mês todo, não só a semana', async () => {
    await abrir([
      venda({ id: '1', created_at: SEGUNDA, total: 400 }),
      venda({ id: '2', created_at: HOJE_PICO, total: 100 }),
      venda({ id: '3', created_at: MES_PASSADO, total: 999 }), // mês passado, fora
    ]);

    await waitFor(() => {
      expect(screen.getAllByText(/R\$\s*500,00/).length).toBeGreaterThan(0);
    });
  });

  it('o período personalizado vai de ponta a ponta — o pedido de "quinta a quinta"', async () => {
    // 17/08 é segunda e 22/08 é sábado: quem escolhe 17 a 22 tem que levar os
    // dois extremos, inclusive o que aconteceu no último dia.
    filtrar({ atalho: 'personalizado', de: '2026-08-17', ate: '2026-08-22' });
    await abrir([
      venda({ id: '1', created_at: SEGUNDA, total: 400 }),
      venda({ id: '2', created_at: SABADO, total: 100 }),
      venda({ id: '3', created_at: HOJE_PICO, total: 999 }), // 23/08, fora
    ]);

    await waitFor(() => {
      expect(screen.getAllByText(/R\$\s*500,00/).length).toBeGreaterThan(0);
    });
  });

  it('filtrar por vendedor deixa na tela só o dinheiro daquela pessoa', async () => {
    filtrar({ atalho: 'este-mes' }, { pessoaId: 'ana' });
    await abrir([
      venda({ id: '1', vendedor_id: 'ana', vendedor: { nome: 'Ana' }, total: 700 }),
      venda({ id: '2', vendedor_id: 'bruno', vendedor: { nome: 'Bruno' }, total: 900 }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByText(/R\$\s*700,00/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
  });

  it('filtrar por grupo de produto soma só os itens daquele grupo dentro da venda', async () => {
    // A venda tem um console de 1.000 e um jogo de 200. Filtrando "Jogo", o
    // painel tem que mostrar 200 — e não a venda inteira dentro de "Jogo".
    filtrar({ atalho: 'este-mes' }, { categoria: 'g-jogo' });
    await abrir([
      venda({
        id: '1',
        total: 1200,
        itens_venda: [
          ITEM('Console', 'acessorio', 1, 1000, 'g-console'),
          ITEM('Jogo X', 'acessorio', 1, 200, 'g-jogo'),
        ],
      }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByText(/R\$\s*200,00/).length).toBeGreaterThan(0);
    });
    // E avisa que devolução não entra nesse modo, em vez de mostrar um número
    // que parece exato e não é.
    expect(screen.getByText(/apenas os itens desse/i)).toBeInTheDocument();
  });

  it('produto sem grupo é achável pela opção "Sem grupo definido"', async () => {
    // Em 23/09, 11 dos 12 produtos ativos estavam sem grupo. Sem esta opção
    // eles sumiriam de qualquer filtro, e não haveria como achá-los para
    // corrigir o cadastro.
    filtrar({ atalho: 'este-mes' }, { categoria: '__sem_grupo__' });
    await abrir([
      venda({
        id: '1',
        total: 1300,
        itens_venda: [
          ITEM('Console', 'acessorio', 1, 1000, 'g-console'),
          ITEM('Sem classificação', 'acessorio', 1, 300, null),
        ],
      }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByText(/R\$\s*300,00/).length).toBeGreaterThan(0);
    });
  });

  it('compara com o período anterior em porcentagem', async () => {
    // Ontem 200, hoje 300: +50%.
    filtrar({ atalho: 'hoje' });
    await abrir([
      venda({ id: '1', created_at: HOJE_PICO, total: 300 }),
      venda({ id: '2', created_at: SABADO, total: 200 }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByText('+50%').length).toBeGreaterThan(0);
    });
  });

  it('sem período anterior para comparar, a tela diz isso em vez de inventar +100%', async () => {
    filtrar({ atalho: 'hoje' });
    await abrir([venda({ id: '1', created_at: HOJE_PICO, total: 300 })]);

    await waitFor(() => {
      expect(screen.getAllByText(/para comparar/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('+100%')).not.toBeInTheDocument();
  });


  it('vendedor CADASTRADO aparece no filtro mesmo sem ter vendido no período', async () => {
    // O defeito que o Felipe achou em 23/09: a lista de vendedores era montada
    // a partir das vendas carregadas, então quem não vendeu sumia do filtro —
    // justamente a pessoa que se quer procurar ("por que a Luana não vendeu?").
    await abrir(
      [venda({ id: '1', vendedor_id: 'ana', vendedor: { nome: 'Ana' }, total: 300 })],
      [],
      [
        { id: 'ana', nome: 'Ana' },
        { id: 'luana', nome: 'Luana' },
      ],
    );

    await waitFor(() => {
      expect(screen.getByText('Dashboard de Vendas')).toBeInTheDocument();
    });

    // Abre a lista do campo "Vendedor".
    const campo = await screen.findByLabelText('Vendedor');
    fireEvent.pointerDown(
      campo,
      new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Luana' })).toBeInTheDocument();
    });
  });

  it('o filtro mostra TODOS os grupos cadastrados, mesmo os sem venda no período', async () => {
    // Antes só aparecia o que tinha venda no período — o Felipe viu a lista
    // com um item sozinho, e ainda em minúsculo ("acessorio").
    await abrir([
      venda({ id: '1', itens_venda: [ITEM('Controle', 'acessorio', 1, 100, 'g-console')] }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('Dashboard de Vendas')).toBeInTheDocument();
    });

    const campo = await screen.findByLabelText('Grupo de produto');
    fireEvent.pointerDown(
      campo,
      new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
    );

    // "Jogo" não teve venda nenhuma no período e mesmo assim está na lista.
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Jogo' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'Console' })).toBeInTheDocument();
  });

  it('aponta o melhor vendedor pelo nome', async () => {
    await abrir([
      venda({ id: '1', vendedor_id: 'ana', vendedor: { nome: 'Ana' }, total: 1000 }),
      venda({ id: '2', vendedor_id: 'bruno', vendedor: { nome: 'Bruno' }, total: 300 }),
    ]);

    await waitFor(() => {
      expect(screen.getByText(/Ana · 1 venda/)).toBeInTheDocument();
    });
  });

  it('DESCONTA a devolução de quem fez a venda — o pedido do Felipe', async () => {
    // Ana vendeu 1.000 e teve 400 devolvidos: fica com 600, atrás do Bruno.
    // Sem o desconto, ela apareceria em primeiro com dinheiro que voltou.
    await abrir(
      [
        venda({ id: '1', vendedor_id: 'ana', vendedor: { nome: 'Ana' }, total: 1000 }),
        venda({ id: '2', vendedor_id: 'bruno', vendedor: { nome: 'Bruno' }, total: 700 }),
      ],
      [
        {
          created_at: HOJE_PICO,
          valor_devolvido_cliente: 400,
          venda_original: { vendedor_id: 'ana', vendedor: { nome: 'Ana' } },
        },
      ],
    );

    await waitFor(() => {
      expect(screen.getByText(/Bruno · 1 venda/)).toBeInTheDocument();
    });
  });

  it('a devolução NÃO respinga em quem não vendeu aquilo', async () => {
    await abrir(
      [venda({ id: '1', vendedor_id: 'bruno', vendedor: { nome: 'Bruno' }, total: 700 })],
      [
        {
          created_at: HOJE_PICO,
          valor_devolvido_cliente: 400,
          venda_original: { vendedor_id: 'ana', vendedor: { nome: 'Ana' } },
        },
      ],
    );

    await waitFor(() => {
      // Bruno segue com os 700 dele, intactos.
      expect(screen.getByText(/Bruno · 1 venda/)).toBeInTheDocument();
    });
  });

  it('o ranking agrupa pelo Grupo de Produto, com o nome do cadastro', async () => {
    // O ranking fala a mesma língua do filtro de propósito: agrupar por um
    // campo e filtrar por outro faria a tabela e o filtro discordarem.
    await abrir([
      venda({ id: '1', itens_venda: [ITEM('Controle', 'acessorio', 2, 800, 'g-console')] }),
      venda({ id: '2', itens_venda: [ITEM('Jogo X', 'acessorio', 1, 200, 'g-jogo')] }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByText('Console').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Jogo').length).toBeGreaterThan(0);
  });

  it('item sem grupo aparece no ranking como "Sem grupo definido", não some', async () => {
    await abrir([venda({ id: '1', itens_venda: [ITEM('Avulso', 'acessorio', 1, 500, null)] })]);

    await waitFor(() => {
      expect(screen.getAllByText('Sem grupo definido').length).toBeGreaterThan(0);
    });
  });

  it('mostra a faixa de horário com mais venda', async () => {
    await abrir([
      venda({ id: '1', created_at: HOJE_PICO }),
      venda({ id: '2', created_at: '2026-08-23T14:50:00' }),
      venda({ id: '3', created_at: HOJE_CEDO }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('14h às 15h')).toBeInTheDocument();
    });
  });

  it('venda SEM vendedor não vira um "Sem nome" no ranking', async () => {
    await abrir([
      venda({ id: '1', vendedor_id: null, vendedor: null, total: 5000 }),
      venda({ id: '2', vendedor_id: 'ana', vendedor: { nome: 'Ana' }, total: 10 }),
    ]);

    await waitFor(() => {
      expect(screen.getByText(/Ana · 1 venda/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Sem nome')).not.toBeInTheDocument();
  });

  it('loja parada não quebra a tela nem inventa número', async () => {
    await abrir([]);

    await waitFor(() => {
      expect(screen.getByText('Dashboard de Vendas')).toBeInTheDocument();
    });
    // Aparece no card E na tabela, de proposito: os dois lugares precisam
    // explicar o vazio, senao um deles parece quebrado.
    expect(screen.getAllByText(/Nenhuma venda com vendedor registrado/).length).toBeGreaterThan(0);
  });

  it('se as vendas não carregam, avisa — e não apaga o filtro de quem já saiu da loja', async () => {
    // Segunda rodada da revisão (23/09). Quem saiu da loja só entra na lista
    // do filtro pelas vendas que fez; com a consulta em erro, a lista vinha
    // sem essa pessoa e o filtro escolhido era apagado à toa.
    filtrar({ atalho: 'este-mes' }, { pessoaId: 'saiu-da-loja' });
    mockSupabase.atual = bancoFalso(
      { profiles: [{ id: 'ana', nome: 'Ana' }], catalogos: GRUPOS },
      { falham: ['vendas'] },
    );
    const { default: DashboardVenda } = await import('./DashboardVenda');
    renderizarTela(<DashboardVenda />);

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar as vendas deste período/)).toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem('sisteminha:filtros:venda') ?? '{}').pessoaId).toBe('saiu-da-loja');
  });
});
