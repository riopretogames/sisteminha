import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * O cadastro de cliente obedecendo à configuração da loja.
 *
 * Os 20 testes de `lib/clienteObrigatorios` provam a REGRA. Este prova o
 * caminho inteiro: a linha gravada em `campos_obrigatorios` chega ao
 * formulário e muda o que ele cobra.
 *
 * É o pedido do Felipe em 28/08 — *"tem loja para quem é importante ter o
 * Instagram; para mim não é"* — do jeito que ele vai acontecer na prática:
 * o dono liga a chavinha em Configurações e o balcão sente na hora seguinte.
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

async function abrir(configuracao: Array<{ campo: string; obrigatorio: boolean }>) {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  mockSupabase.atual = bancoFalso({
    campos_obrigatorios: configuracao,
    catalogos: [],
    clientes: [],
    'rpc:buscar_clientes_semelhantes': [],
  });
  const { ClienteFormDialog } = await import('./ClienteFormDialog');
  return renderizarTela(<ClienteFormDialog open onOpenChange={() => {}} />);
}

/** Preenche o nome e tenta salvar — o caminho de quem está com fila no balcão. */
async function salvarSoComNome() {
  const nome = await screen.findByLabelText(/nome completo/i);
  fireEvent.change(nome, { target: { value: 'Adriana Prado' } });
  fireEvent.click(screen.getByRole('button', { name: /cadastrar/i }));
}

describe('Cadastro de cliente: o que a loja configurou', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('sem configuração, só o nome é cobrado — a loja do Felipe continua igual', async () => {
    await abrir([]);
    await salvarSoComNome();

    // Nenhum aviso vermelho de campo faltando.
    await waitFor(() => {
      const avisos = mockToast.mock.calls.map((c) => c[0] as { variant?: string });
      expect(avisos.filter((a) => a.variant === 'destructive')).toHaveLength(0);
    });
  });

  it('com Instagram exigido, salvar só com o nome é barrado', async () => {
    await abrir([{ campo: 'instagram', obrigatorio: true }]);
    await salvarSoComNome();

    await waitFor(() => {
      const vermelhos = mockToast.mock.calls
        .map((c) => c[0] as { title: string; variant?: string })
        .filter((a) => a.variant === 'destructive');
      expect(vermelhos.length).toBeGreaterThan(0);
      expect(vermelhos[0].title).toMatch(/instagram/i);
    });
  });

  it('preenchendo o Instagram, o cadastro passa', async () => {
    await abrir([{ campo: 'instagram', obrigatorio: true }]);

    const nome = await screen.findByLabelText(/nome completo/i);
    fireEvent.change(nome, { target: { value: 'Adriana Prado' } });
    fireEvent.change(screen.getByLabelText(/instagram/i), { target: { value: '@adriana' } });
    fireEvent.click(screen.getByRole('button', { name: /cadastrar/i }));

    await waitFor(() => {
      const vermelhos = mockToast.mock.calls
        .map((c) => c[0] as { variant?: string })
        .filter((a) => a.variant === 'destructive');
      expect(vermelhos).toHaveLength(0);
    });
  });

  it('o asterisco aparece no campo que a loja passou a exigir', async () => {
    await abrir([{ campo: 'telefone', obrigatorio: true }]);

    await waitFor(() => {
      const rotulo = screen.getByText(/Telefone \/ WhatsApp/i).closest('label');
      expect(rotulo?.textContent).toContain('*');
    });
  });

  it('e não aparece no campo que ela não exige', async () => {
    await abrir([]);

    await waitFor(() => {
      const rotulo = screen.getByText(/^Instagram$/i).closest('label');
      expect(rotulo?.textContent).not.toContain('*');
    });
  });
});
