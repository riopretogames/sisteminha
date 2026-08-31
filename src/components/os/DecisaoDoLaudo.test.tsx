import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';
import { OS_ETAPAS } from '@/config/osStatus';

/**
 * A resposta do cliente ao laudo.
 *
 * O caso que estes testes protegem é o da recusa sem motivo: é ela que faz a
 * loja perder orçamento sem nunca saber por quê. Preço alto e "vou comprar
 * outro" pedem reações completamente diferentes do dono, e sem o motivo os
 * dois viram a mesma linha no relatório.
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
  perfil?: 'vendedor' | 'tecnico' | 'administrador';
  status?: string;
  tipo?: 'paga' | 'garantia' | 'cortesia';
} = {}) {
  mockCan.mockImplementation(montarCan({ perfil: opcoes.perfil ?? 'vendedor' }));
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockSupabase.atual = {
    ...bancoFalso({ tenants: [{ id: 'loja-1', taxa_analise: 80 }] }),
    rpc: mockRpc,
  };

  const { DecisaoDoLaudo } = await import('./DecisaoDoLaudo');
  return renderizarTela(
    <DecisaoDoLaudo
      osId="os-1"
      status={opcoes.status ?? OS_ETAPAS.AGUARDANDO_APROVACAO}
      tipo={opcoes.tipo ?? 'paga'}
      totalOrcamento={450}
      onMudou={() => {}}
    />,
  );
}

describe('A resposta do cliente ao laudo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('o vendedor vê os dois caminhos: aprovou e não aprovou', async () => {
    // É ele quem fala com o cliente — organograma do Felipe.
    await montar({ perfil: 'vendedor' });

    expect(await screen.findByRole('button', { name: /laudo aprovado/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cliente não aprovou/i })).toBeInTheDocument();
  });

  it('aprovar confirma com o valor do orçamento à vista', async () => {
    await montar();

    fireEvent.click(screen.getByRole('button', { name: /laudo aprovado/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('450'));
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('registrar_decisao_do_laudo', {
        _os_id: 'os-1',
        _aprovado: true,
        _motivo: null,
      });
    });
  });

  it('desistir da confirmação não grava nada', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await montar();

    fireEvent.click(screen.getByRole('button', { name: /laudo aprovado/i }));

    expect(mockRpc).not.toHaveBeenCalled();
  });

  describe('a recusa', () => {
    it('pede o motivo, e não deixa registrar sem ele', async () => {
      await montar();

      fireEvent.click(screen.getByRole('button', { name: /cliente não aprovou/i }));

      const registrar = await screen.findByRole('button', { name: /registrar recusa/i });
      expect(registrar).toBeDisabled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('com o motivo escrito, registra e encerra', async () => {
      await montar();

      fireEvent.click(screen.getByRole('button', { name: /cliente não aprovou/i }));
      fireEvent.change(await screen.findByLabelText(/por que ele não aprovou/i), {
        target: { value: 'Achou o valor alto' },
      });
      fireEvent.click(screen.getByRole('button', { name: /registrar recusa/i }));

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('registrar_decisao_do_laudo', {
          _os_id: 'os-1',
          _aprovado: false,
          _motivo: 'Achou o valor alto',
        });
      });
    });

    it('só espaço não conta como motivo', async () => {
      await montar();

      fireEvent.click(screen.getByRole('button', { name: /cliente não aprovou/i }));
      fireEvent.change(await screen.findByLabelText(/por que ele não aprovou/i), {
        target: { value: '   ' },
      });

      expect(screen.getByRole('button', { name: /registrar recusa/i })).toBeDisabled();
    });
  });

  describe('quem não decide orçamento', () => {
    it('não vê os botões, mas fica sabendo de quem é a vez', async () => {
      // O técnico tem orders.edit, não orders.approve.
      await montar({ perfil: 'tecnico' });

      expect(screen.queryByRole('button', { name: /laudo aprovado/i })).not.toBeInTheDocument();
      expect(await screen.findByText(/quem registra é quem aprova orçamento/i))
        .toBeInTheDocument();
    });
  });


  it('o diálogo da recusa avisa quanto será cobrado na retirada', async () => {
    // O vendedor precisa dizer isso ao cliente na hora, não descobrir depois.
    await montar();

    fireEvent.click(screen.getByRole('button', { name: /cliente não aprovou/i }));

    expect(await screen.findByText(/taxa de análise/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /registrar recusa e cobrar/i }))
      .toBeInTheDocument();
  });

  it('conta o caminho de verdade: a OS volta para a bancada, não para a prateleira', async () => {
    // Decisão do Felipe (01/09): recusou, a OS vai para "Aprovado / Executar",
    // o técnico remonta o aparelho e marca Reparo concluído — só então ele
    // fica pronto para retirada. Antes disso o diálogo dizia que o aparelho já
    // ficava pronto, e o vendedor podia combinar a retirada com o cliente para
    // o dia seguinte, com o aparelho ainda aberto na bancada.
    await montar();

    fireEvent.click(screen.getByRole('button', { name: /cliente não aprovou/i }));

    // "Volta para a bancada" aparece duas vezes: no texto do dinheiro e no
    // bloco do que acontece em seguida. As duas frases importam.
    expect(await screen.findAllByText(/volta para a bancada/i)).toHaveLength(2);
    expect(await screen.findByText(/remontar o aparelho/i)).toBeInTheDocument();
    expect(await screen.findAllByText(/reparo concluído/i)).not.toHaveLength(0);
    expect(await screen.findByText(/voltam sozinhas para o estoque/i)).toBeInTheDocument();
  });

  it('em OS de garantia, não promete cobrança nenhuma', async () => {
    // Garantia não passa pelo caixa na entrega. Prometer os R$ 80 aqui seria
    // o vendedor cobrar do cliente um valor que o sistema nunca vai pedir.
    await montar({ tipo: 'garantia' });

    fireEvent.click(screen.getByRole('button', { name: /cliente não aprovou/i }));

    expect(await screen.findByText(/sem valor/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^registrar recusa$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cobrar/i })).not.toBeInTheDocument();
  });

  it('em qualquer outra etapa não aparece nada', async () => {
    await montar({ status: OS_ETAPAS.APROVADO });

    expect(screen.queryByRole('button', { name: /laudo aprovado/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/quem aprova orçamento/i)).not.toBeInTheDocument();
  });
});
