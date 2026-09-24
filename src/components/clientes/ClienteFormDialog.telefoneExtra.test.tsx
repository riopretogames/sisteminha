import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * O telefone EXTRA também é procurado antes de salvar (achado de 24/09).
 *
 * O banco confere todos os telefones da ficha e recusa o repetido. A tela
 * procurava só o principal: um telefone extra que já era de outro cliente só
 * aparecia ao salvar, como erro cru — sem o "Usar este cadastro" que a regra
 * de cliente único (CLAUDE.md) manda oferecer.
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

/** Só este número já é de alguém: o do Bruno. */
const TELEFONE_DO_BRUNO = '17991112222';

async function abrir() {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  const base = bancoFalso({ campos_obrigatorios: [], catalogos: [], clientes: [] });
  mockSupabase.atual = {
    ...base,
    // A procura do banco responde pelo telefone que recebeu, como a de verdade.
    rpc: (_nome: string, args: { _telefone?: string }) =>
      Promise.resolve({
        data:
          args?._telefone === TELEFONE_DO_BRUNO
            ? [
                {
                  id: 'c-bruno',
                  nome: 'Bruno Lima',
                  cpf_cnpj: null,
                  telefones: ['(17) 99111-2222'],
                  liberado_venda: true,
                  motivo: 'telefone',
                },
              ]
            : [],
        error: null,
      }),
  };
  const { ClienteFormDialog } = await import('./ClienteFormDialog');
  return renderizarTela(<ClienteFormDialog open onOpenChange={() => {}} onUsarExistente={() => {}} />);
}

describe('Cadastro de cliente: telefone extra repetido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('acha o dono do telefone extra e oferece usar o cadastro dele', async () => {
    await abrir();
    fireEvent.change(await screen.findByLabelText(/nome completo/i), { target: { value: 'Bruna Lima' } });
    const extra = screen.getByLabelText('Telefone extra');
    fireEvent.change(extra, { target: { value: '(17) 99111-2222' } });
    fireEvent.blur(extra);

    expect(await screen.findByText('Bruno Lima')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /usar este cadastro/i })).toBeInTheDocument();
  });

  it('telefone extra que não é de ninguém não inventa aviso', async () => {
    await abrir();
    const extra = await screen.findByLabelText('Telefone extra');
    fireEvent.change(extra, { target: { value: '(17) 98888-7777' } });
    fireEvent.blur(extra);

    // Dá tempo da procura voltar antes de afirmar que nada apareceu.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/já está cadastrado/i)).not.toBeInTheDocument();
  });
});
