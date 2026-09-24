import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * A importação de clientes respeita a regra do nome repetido (achado de 24/09).
 *
 * "Nome igual sem telefone nem CPF não cria cadastro" morava só no formulário;
 * o banco barra CPF e telefone, mas não nome. A importação gravava direto, e
 * importar a mesma planilha duas vezes criava fichas repetidas.
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

async function importar(csv: string, jaCadastrados: Array<{ nome: string }>) {
  mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
  const base = bancoFalso({ clientes: jaCadastrados });
  const gravados: unknown[] = [];
  mockSupabase.atual = {
    ...base,
    from: (tabela: string) => {
      const consulta = base.from(tabela) as Record<string, unknown>;
      consulta.insert = (valores: unknown) => {
        gravados.push(...([] as unknown[]).concat(valores));
        return consulta;
      };
      return consulta;
    },
  };
  const { default: ClientesImportar } = await import('./ClientesImportar');
  const { container } = renderizarTela(<ClientesImportar />);

  const arquivo = new File([csv], 'clientes.csv', { type: 'text/csv' });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [arquivo] } });
  fireEvent.click(await screen.findByRole('button', { name: /importar \d+ cliente/i }));
  return gravados;
}

describe('Importar clientes: nome repetido sem telefone nem CPF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('não grava quem já existe só pelo nome — nem com acento diferente', async () => {
    const gravados = await importar('nome;telefone;email;cpf_cnpj\nJoão Silva;;;\nCliente Novo;;;\n', [
      { nome: 'Joao Silva' },
    ]);

    await waitFor(() => {
      expect(screen.getByText(/já existia/i)).toBeInTheDocument();
    });
    expect(gravados).toEqual([expect.objectContaining({ nome: 'Cliente Novo' })]);
  });

  it('com telefone, o homônimo entra — quem confere o telefone é o banco', async () => {
    const gravados = await importar('nome;telefone;email;cpf_cnpj\nJoão Silva;(17) 99262-4169;;\n', [
      { nome: 'João Silva' },
    ]);

    await waitFor(() => {
      expect(gravados).toEqual([expect.objectContaining({ nome: 'João Silva' })]);
    });
  });
});
