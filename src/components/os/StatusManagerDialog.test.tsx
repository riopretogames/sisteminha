import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * "Gerenciar Status" — achado da revisão de 24/09: salvar recarregava a lista
 * do quadro, mas não a lista guardada (por 5 minutos) que a ficha da OS, o
 * seletor de etapa e OS Finalizadas usam. A etapa nova ou renomeada aparecia
 * no quadro e sumia da ficha até o tempo passar.
 */

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'p1', tenant_id: 'loja-1' } },
    can: () => true,
  }),
}));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

describe('Gerenciar Status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('salvar renova a lista de etapas que a ficha da OS usa', async () => {
    mockSupabase.atual = bancoFalso({ os_status_config: [] });
    const { StatusManagerDialog } = await import('./StatusManagerDialog');
    const cliente = new QueryClient();
    const renovar = vi.spyOn(cliente, 'invalidateQueries');
    const aoMudar = vi.fn();

    render(
      <QueryClientProvider client={cliente}>
        <StatusManagerDialog
          open
          onOpenChange={() => {}}
          statuses={[
            {
              id: 's1', tenant_id: 'loja-1', key: 'aguardando', label: 'Aguardando Peça', color: 'bg-amber-500 text-white',
              icon: 'circle', ordem: 30, ativo: true, sistema: false, created_at: '', updated_at: '',
            },
          ]}
          onStatusesChange={aoMudar}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => expect(aoMudar).toHaveBeenCalled());
    expect(renovar).toHaveBeenCalledWith({ queryKey: ['os-status-config'] });
  });
});
