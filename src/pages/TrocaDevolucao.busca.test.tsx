import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, silenciarConsole } from '@/test/apoio';

/**
 * A busca da Troca e Devolução alcança TODAS as vendas, não só as recentes.
 *
 * Achado de 24/09: a lista vinha com `.limit(200)` e a busca filtrava só essas
 * 200 já carregadas. Com a loja em uso, 200 vendas passam em poucas semanas —
 * e uma venda mais antiga, ainda dentro dos 90 dias de garantia, sumia da
 * única tela por onde se começa uma devolução. O cliente voltava para trocar e
 * o sistema dizia "Nenhuma venda encontrada".
 *
 * O dublê comum do banco devolve a tabela inteira para qualquer consulta, e
 * aqui isso esconderia o defeito (a venda antiga "apareceria" mesmo sem busca
 * no banco). Este dublê obedece aos filtros que a busca usa.
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

interface VendaFalsa {
  id: string;
  numero_venda: string;
  created_at: string;
  status: string;
  total: number;
  origem_venda_id: null;
  cliente_id: string | null;
  vendedor_id: string;
  clientes: { id: string; nome: string } | null;
  vendedor: { nome: string };
  itens_venda: Array<{ quantidade: number; produtos: { nome: string; imei_serial: string | null } }>;
  devolucoes: [];
}

/** 200 vendas recentes de balcão, todas de "Consumidor final". */
const RECENTES: VendaFalsa[] = Array.from({ length: 200 }, (_, i) => ({
  id: `r${i}`,
  numero_venda: `OV${String(1000 + i)}`,
  created_at: new Date(Date.UTC(2026, 8, 20, 12, 0, 0) - i * 60_000).toISOString(),
  status: 'pago',
  total: 50,
  origem_venda_id: null,
  cliente_id: null,
  vendedor_id: 'vend-ana',
  clientes: null,
  vendedor: { nome: 'Ana do Balcão' },
  itens_venda: [{ quantidade: 1, produtos: { nome: 'Cabo USB-C', imei_serial: null } }],
  devolucoes: [],
}));

/** A venda de julho, ainda na garantia, que ficou fora das 200 recentes. */
const ANTIGA: VendaFalsa = {
  id: 'antiga',
  numero_venda: 'OV0001',
  created_at: '2026-07-01T14:00:00Z',
  status: 'pago',
  total: 3500,
  origem_venda_id: null,
  cliente_id: 'c-joana',
  vendedor_id: 'vend-bruno',
  clientes: { id: 'c-joana', nome: 'Joana Antiga' },
  vendedor: { nome: 'Bruno' },
  itens_venda: [{ quantidade: 1, produtos: { nome: 'iPhone 13 seminovo', imei_serial: '356789012345678' } }],
  devolucoes: [],
};

const TODAS = [...RECENTES, ANTIGA];
const CLIENTES = [{ id: 'c-joana', nome: 'Joana Antiga' }];
const PRODUTOS = [
  { id: 'prod-iphone', nome: 'iPhone 13 seminovo', imei_serial: '356789012345678' },
  { id: 'prod-cabo', nome: 'Cabo USB-C', imei_serial: null },
];
const ITENS = [{ venda_id: 'antiga', produto_id: 'prod-iphone' }];
const PESSOAS = [
  { id: 'vend-ana', nome: 'Ana do Balcão' },
  { id: 'vend-bruno', nome: 'Bruno' },
];

type Chamada = [string, unknown[]];

/** O `%termo%` de um ilike, sem os curingas, em minúsculas. */
const termoDo = (padrao: unknown) => String(padrao).replace(/%/g, '').toLowerCase();

function achar(chamadas: Chamada[], metodo: string, coluna?: string) {
  return chamadas.find(([m, args]) => m === metodo && (coluna === undefined || args[0] === coluna));
}

/** Responde cada consulta pelos filtros que ela recebeu. */
function responder(tabela: string, chamadas: Chamada[]): unknown[] {
  if (tabela === 'vendas') {
    const porNumero = achar(chamadas, 'ilike', 'numero_venda');
    if (porNumero) return TODAS.filter((v) => v.numero_venda.toLowerCase().includes(termoDo(porNumero[1][1])));
    const porId = achar(chamadas, 'eq', 'id') ?? achar(chamadas, 'in', 'id');
    if (porId) {
      const ids = ([] as unknown[]).concat(porId[1][1]);
      return TODAS.filter((v) => ids.includes(v.id));
    }
    const porCliente = achar(chamadas, 'in', 'cliente_id');
    if (porCliente) return TODAS.filter((v) => (porCliente[1][1] as string[]).includes(v.cliente_id ?? ''));
    const porVendedor = achar(chamadas, 'in', 'vendedor_id');
    if (porVendedor) return TODAS.filter((v) => (porVendedor[1][1] as string[]).includes(v.vendedor_id));
    // Sem busca: as mais recentes, até o limite pedido.
    const limite = achar(chamadas, 'limit');
    return RECENTES.slice(0, limite ? Number(limite[1][0]) : RECENTES.length);
  }
  if (tabela === 'clientes') {
    const f = achar(chamadas, 'ilike', 'nome');
    return f ? CLIENTES.filter((c) => c.nome.toLowerCase().includes(termoDo(f[1][1]))) : CLIENTES;
  }
  if (tabela === 'profiles') {
    const f = achar(chamadas, 'ilike', 'nome');
    return f ? PESSOAS.filter((p) => p.nome.toLowerCase().includes(termoDo(f[1][1]))) : PESSOAS;
  }
  if (tabela === 'vw_produtos') {
    // `.or('nome.ilike."%x%",imei_serial.ilike."%x%"')` — basta o termo.
    const f = achar(chamadas, 'or');
    if (!f) return [];
    const termo = termoDo(String(f[1][0]).match(/nome\.ilike\."([^"]*)"/)?.[1] ?? '');
    return PRODUTOS.filter(
      (p) => p.nome.toLowerCase().includes(termo) || (p.imei_serial ?? '').includes(termo),
    );
  }
  if (tabela === 'itens_venda') {
    const f = achar(chamadas, 'in', 'produto_id');
    return f ? ITENS.filter((i) => (f[1][1] as string[]).includes(i.produto_id)) : [];
  }
  return [];
}

function bancoQueObedece() {
  const from = (tabela: string) => {
    const chamadas: Chamada[] = [];
    const consulta: Record<string, unknown> = {};
    for (const m of [
      'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'in', 'or', 'is',
      'not', 'order', 'limit', 'range', 'insert', 'update', 'delete',
    ]) {
      consulta[m] = (...args: unknown[]) => {
        chamadas.push([m, args]);
        return consulta;
      };
    }
    const resultado = () => ({ data: responder(tabela, chamadas), error: null });
    consulta.single = () => Promise.resolve({ ...resultado(), data: resultado().data[0] ?? null });
    consulta.maybeSingle = consulta.single;
    consulta.then = (aceitar: (r: unknown) => unknown, recusar?: (e: unknown) => unknown) =>
      Promise.resolve(resultado()).then(aceitar, recusar);
    return consulta;
  };
  return {
    from,
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
  };
}

async function abrir() {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  mockSupabase.atual = bancoQueObedece();
  const { default: TrocaDevolucao } = await import('./TrocaDevolucao');
  return renderizarTela(<TrocaDevolucao />);
}

const buscar = async (texto: string) =>
  fireEvent.change(await screen.findByPlaceholderText(/buscar por número/i), {
    target: { value: texto },
  });

describe('Troca e Devolução: a busca vai ao banco inteiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('sem busca, a venda antiga não está na lista — e a tela avisa que a lista é parcial', async () => {
    await abrir();

    expect(await screen.findByText('OV1000')).toBeInTheDocument();
    expect(screen.queryByText('OV0001')).not.toBeInTheDocument();
    expect(screen.getByText(/200 vendas mais recentes/)).toBeInTheDocument();
  });

  it('acha pelo NÚMERO uma venda fora das 200 recentes', async () => {
    await abrir();
    await screen.findByText('OV1000');

    await buscar('OV0001');

    expect(await screen.findByText('OV0001', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('acha pelo nome do CLIENTE', async () => {
    await abrir();
    await screen.findByText('OV1000');

    await buscar('joana');

    expect(await screen.findByText('OV0001', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('acha pelo IMEI do aparelho que o cliente trouxe na mão', async () => {
    await abrir();
    await screen.findByText('OV1000');

    await buscar('356789012345678');

    expect(await screen.findByText('OV0001', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('acha pelo vendedor', async () => {
    await abrir();
    await screen.findByText('OV1000');

    await buscar('bruno');

    expect(await screen.findByText('OV0001', {}, { timeout: 3000 })).toBeInTheDocument();
    // E a busca refina: as vendas da Ana não aparecem.
    expect(screen.queryByText('OV1000')).not.toBeInTheDocument();
  });
});
