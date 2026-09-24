import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Cadastros > Clientes com mais de mil clientes (achado de 24/09).
 *
 * O Supabase entrega no máximo mil linhas por pedido e corta calado o resto.
 * Com a base do sistema antigo importada, quem estava depois do milésimo na
 * ordem alfabética sumia da lista e da busca, e o contador "{n} de {total}"
 * mentia. Este dublê pagina como o Supabase de verdade.
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

const CLIENTES = Array.from({ length: 1200 }, (_, i) => ({
  id: `c${i}`,
  nome: `Cliente ${String(i + 1).padStart(4, '0')}`,
  telefones: [],
  cpf_cnpj: null,
  email: null,
  instagram: null,
  origem_id: null,
  liberado_venda: true,
  cliente_tags: [],
}));

function bancoQuePagina() {
  const base = bancoFalso({ catalogos: [], campos_obrigatorios: [] });
  return {
    ...base,
    from: (tabela: string) => {
      if (tabela !== 'clientes') return base.from(tabela);
      let de = 0;
      let ate = 999; // sem pedir página, só as mil primeiras
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
        Promise.resolve({ data: CLIENTES.slice(de, ate + 1), error: null }).then(ok, erro);
      return consulta;
    },
  };
}

describe('Cadastros > Clientes: mais de mil clientes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('conta todos e acha quem está depois do milésimo', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    mockSupabase.atual = bancoQuePagina();
    const { default: Clientes } = await import('./Clientes');
    renderizarTela(<Clientes />);

    expect(await screen.findByText('1200 de 1200')).toBeInTheDocument();
    // A tabela desenha 200 e avisa; a busca alcança todos.
    expect(screen.getByText(/Mostrando 200 de 1200 clientes/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/buscar por nome/i), {
      target: { value: 'Cliente 1150' },
    });
    expect(await screen.findByText('Cliente 1150')).toBeInTheDocument();
  });
});
