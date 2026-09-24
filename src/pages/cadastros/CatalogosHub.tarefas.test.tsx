import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Listas do Sistema com a aba nova de Tarefas da equipe (23/09).
 *
 * Regra das listas editáveis: os turnos do dia e as etiquetas dos cartões são
 * da loja, não do sistema — o Monday do Felipe tem "7 às 11", "11 às 15",
 * "15 às 19" e "Livre", mas isso muda se o horário da loja mudar. Então os
 * dois têm que aparecer aqui, onde a loja cadastra, sem ninguém mexer em
 * código.
 */

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'u1', tenant_id: 'loja-1' } },
    session: {},
    loading: false,
    can: (p: string) => mockCan(p),
    canAny: () => true,
    hasRole: () => false,
  }),
}));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

describe('Listas do Sistema — Tarefas da equipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    silenciarConsole();
  });

  it('tem a aba "Tarefas da equipe" com os turnos do dia e as etiquetas', async () => {
    mockCan.mockImplementation(montarCan({ perfil: 'administrador' }));
    mockSupabase.atual = bancoFalso({});
    const { default: CatalogosHub } = await import('./CatalogosHub');
    renderizarTela(<CatalogosHub />);

    const aba = screen.getByRole('tab', { name: 'Tarefas da equipe' });
    // O Radix troca de aba no "apertar" do mouse, não no clique inteiro.
    fireEvent.mouseDown(aba, { button: 0 });

    // O primeiro catálogo da aba abre sozinho (título grande à direita); os
    // dois aparecem na lista da esquerda para escolher.
    expect(await screen.findByRole('heading', { name: 'Períodos do dia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Períodos do dia/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Etiquetas de tarefa/ })).toBeInTheDocument();
  });
});
