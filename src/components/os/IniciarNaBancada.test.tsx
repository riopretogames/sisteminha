import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';
import { OS_ETAPAS } from '@/config/osStatus';

/**
 * Os dois botões de começar da bancada, como o organograma do Felipe (30/08)
 * os descreve: *"só o perfil Técnico vê este botão"* e *"reparo começa aqui"*.
 *
 * O primeiro se chama "Iniciar diagnóstico" desde 31/08 — correção dele: na
 * etapa 1 o técnico investiga e monta o laudo, ninguém consertou nada ainda.
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
  execucaoEm?: string | null;
}) {
  mockCan.mockImplementation(montarCan({ perfil: opcoes.perfil }));
  mockRpc.mockResolvedValue({ data: '2026-08-30T10:00:00', error: null });
  mockSupabase.atual = { ...bancoFalso({}), rpc: mockRpc };

  const { IniciarNaBancada } = await import('./IniciarNaBancada');
  return renderizarTela(
    <IniciarNaBancada
      osId="os-1"
      status={opcoes.status ?? OS_ETAPAS.AGUARDANDO_ANALISE}
      diagnosticoIniciadoEm={opcoes.iniciadoEm ?? null}
      execucaoIniciadaEm={opcoes.execucaoEm ?? null}
      nomeDeQuemIniciouDiagnostico="Joao Tecnico"
      nomeDeQuemIniciouExecucao="Maria Tecnica"
      onMudou={() => {}}
    />,
  );
}

describe('Botões de começar na bancada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('o técnico vê o botão numa OS que acabou de entrar', async () => {
    await montar({ perfil: 'tecnico' });
    expect(await screen.findByRole('button', { name: /iniciar diagnóstico/i })).toBeInTheDocument();
  });

  it('o vendedor não tem o botão — mas fica sabendo de quem é a vez', async () => {
    // Sumir sem explicação fazia o dono procurar um botão que nunca ia achar.
    await montar({ perfil: 'vendedor' });

    expect(screen.queryByRole('button', { name: /iniciar diagnóstico/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/aguardando a bancada/i)).toBeInTheDocument();
  });

  it('clicar chama o banco, que é onde a permissão é conferida de verdade', async () => {
    await montar({ perfil: 'tecnico' });

    fireEvent.click(screen.getByRole('button', { name: /iniciar diagnóstico/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('iniciar_diagnostico_os', { _os_id: 'os-1' });
    });
  });

  it('desistir da confirmação não grava nada', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await montar({ perfil: 'tecnico' });

    fireEvent.click(screen.getByRole('button', { name: /iniciar diagnóstico/i }));

    expect(mockRpc).not.toHaveBeenCalled();
  });

  describe('depois que o diagnóstico já começou', () => {
    it('o botão dá lugar ao registro de quando e quem', async () => {
      await montar({ perfil: 'tecnico', iniciadoEm: '2026-08-30T09:30:00' });

      expect(screen.queryByRole('button', { name: /iniciar diagnóstico/i })).not.toBeInTheDocument();
      expect(await screen.findByText(/diagnóstico iniciado em/i)).toBeInTheDocument();
      expect(screen.getByText('Joao Tecnico')).toBeInTheDocument();
    });

    it('o vendedor também vê o registro — ele precisa saber que está na bancada', async () => {
      await montar({ perfil: 'vendedor', iniciadoEm: '2026-08-30T09:30:00' });
      expect(await screen.findByText(/diagnóstico iniciado em/i)).toBeInTheDocument();
    });
  });

  describe('o segundo começo: executar o que o cliente aprovou', () => {
    it('em Aprovado / Executar o botão é "Iniciar a execução"', async () => {
      await montar({ perfil: 'tecnico', status: OS_ETAPAS.APROVADO });

      expect(await screen.findByRole('button', { name: /iniciar a execução/i })).toBeInTheDocument();
      // E não o da análise: são dois momentos diferentes.
      expect(screen.queryByRole('button', { name: /^iniciar diagnóstico$/i })).not.toBeInTheDocument();
    });

    it('chama a função da execução, não a do reparo', async () => {
      await montar({ perfil: 'tecnico', status: OS_ETAPAS.APROVADO });

      fireEvent.click(screen.getByRole('button', { name: /iniciar a execução/i }));

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('iniciar_execucao_os', { _os_id: 'os-1' });
      });
    });

    it('já executando, mostra desde quando e com quem', async () => {
      await montar({
        perfil: 'tecnico',
        status: OS_ETAPAS.APROVADO,
        execucaoEm: '2026-08-30T14:00:00',
      });

      expect(await screen.findByText(/execução iniciada em/i)).toBeInTheDocument();
      expect(screen.getByText('Maria Tecnica')).toBeInTheDocument();
    });
  });

  it('em etapa onde ninguém começa nada, não aparece botão nem aviso', async () => {
    // Aguardando aprovação: o aparelho está esperando o cliente responder.
    await montar({ perfil: 'tecnico', status: OS_ETAPAS.AGUARDANDO_APROVACAO });

    expect(screen.queryByRole('button', { name: /iniciar/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/aguardando a bancada/i)).not.toBeInTheDocument();
  });

  it('depois que a OS passou da bancada, o registro sai da barra de ações', async () => {
    // Achado em 01/09: a linha "Diagnóstico iniciado em 30/08 por Fulano"
    // ficava na barra da OS entregue, meses depois. A barra é o lugar do que
    // dá para fazer agora; quando começou é assunto da linha do tempo da
    // ficha, que mostra os dois marcos.
    await montar({
      perfil: 'tecnico',
      status: OS_ETAPAS.ENTREGUE,
      iniciadoEm: '2026-08-30T13:00:00Z',
    });

    expect(screen.queryByText(/diagnóstico iniciado em/i)).not.toBeInTheDocument();
  });
});
