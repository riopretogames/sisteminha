import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';
import { OS_ETAPAS } from '@/config/osStatus';

/**
 * O botão "Iniciar reparo", como o organograma do Felipe (30/08) o descreve:
 * *"só o perfil Técnico vê este botão"* e *"reparo começa aqui"*.
 *
 * Os dois casos que estes testes seguram são os que estragariam o registro:
 * o vendedor conseguindo marcar que estava com o aparelho na bancada, e o
 * botão continuar aparecendo depois de alguém já ter começado — o que faria
 * um segundo clique reescrever a hora do primeiro.
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

const mockRpc = vi.hoisted(() => vi.fn());
const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

async function montar(opcoes: {
  perfil: 'tecnico' | 'vendedor' | 'administrador';
  status?: string;
  iniciadoEm?: string | null;
}) {
  mockCan.mockImplementation(montarCan({ perfil: opcoes.perfil }));
  mockRpc.mockResolvedValue({ data: '2026-08-30T10:00:00', error: null });
  mockSupabase.atual = { ...bancoFalso({}), rpc: mockRpc };

  const { IniciarReparo } = await import('./IniciarReparo');
  return renderizarTela(
    <IniciarReparo
      osId="os-1"
      status={opcoes.status ?? OS_ETAPAS.AGUARDANDO_ANALISE}
      reparoIniciadoEm={opcoes.iniciadoEm ?? null}
      nomeDeQuemIniciou="Joao Tecnico"
      onMudou={() => {}}
    />,
  );
}

describe('Botão "Iniciar reparo"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('o técnico vê o botão numa OS que acabou de entrar', async () => {
    await montar({ perfil: 'tecnico' });
    expect(await screen.findByRole('button', { name: /iniciar reparo/i })).toBeInTheDocument();
  });

  it('o vendedor NÃO vê — quem trabalha na bancada é quem marca', async () => {
    await montar({ perfil: 'vendedor' });
    expect(screen.queryByRole('button', { name: /iniciar reparo/i })).not.toBeInTheDocument();
  });

  it('clicar chama o banco, que é onde a permissão é conferida de verdade', async () => {
    await montar({ perfil: 'tecnico' });

    fireEvent.click(screen.getByRole('button', { name: /iniciar reparo/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('iniciar_reparo_os', { _os_id: 'os-1' });
    });
  });

  it('desistir da confirmação não grava nada', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await montar({ perfil: 'tecnico' });

    fireEvent.click(screen.getByRole('button', { name: /iniciar reparo/i }));

    expect(mockRpc).not.toHaveBeenCalled();
  });

  describe('depois que o reparo já começou', () => {
    it('o botão dá lugar ao registro de quando e quem', async () => {
      await montar({ perfil: 'tecnico', iniciadoEm: '2026-08-30T09:30:00' });

      expect(screen.queryByRole('button', { name: /iniciar reparo/i })).not.toBeInTheDocument();
      expect(await screen.findByText(/reparo iniciado em/i)).toBeInTheDocument();
      expect(screen.getByText('Joao Tecnico')).toBeInTheDocument();
    });

    it('o vendedor também vê o registro — ele precisa saber que está na bancada', async () => {
      await montar({ perfil: 'vendedor', iniciadoEm: '2026-08-30T09:30:00' });
      expect(await screen.findByText(/reparo iniciado em/i)).toBeInTheDocument();
    });
  });

  it('some quando a OS já passou da entrada: ali o passo do processo é outro', async () => {
    await montar({ perfil: 'tecnico', status: OS_ETAPAS.APROVADO });
    expect(screen.queryByRole('button', { name: /iniciar reparo/i })).not.toBeInTheDocument();
  });
});
