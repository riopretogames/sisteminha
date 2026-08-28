import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * A abertura de OS na tela, não só a regra.
 *
 * Os 19 testes de `lib/osObrigatorios` provam que a REGRA está certa. Estes
 * provam que a TELA usa a regra — que é onde esse tipo de coisa costuma se
 * perder: a função existe, está testada, e ninguém a chamou.
 *
 * Também cobrem duas decisões do Felipe (27/08) que só existem na tela:
 * a pergunta da senha esconder os campos até ser respondida, e "quem recebeu"
 * nascer com quem está logado.
 */

const mockToast = vi.fn();
const mockCan = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'pessoa-felipe', tenant_id: 'loja-1' } },
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

async function abrirTela() {
  mockCan.mockImplementation(montarCan({ perfil: 'admin' }));
  mockSupabase.atual = bancoFalso({
    clientes: [{ id: 'c1', nome: 'Adriana Prado', telefones: ['17910000001'] }],
    // Duas coisas de propósito aqui:
    //   • `ativo: true` — a tela busca pessoas com .eq('ativo', true);
    //   • quem está logado NÃO é o primeiro da lista. Um campo de escolha
    //     sem valor cai sozinho na primeira opção, então com o Felipe em
    //     primeiro o teste passaria mesmo com o preenchimento automático
    //     desligado — foi o que aconteceu na primeira versão deste teste.
    profiles: [
      { id: 'pessoa-outra', nome: 'Ana do Balcão', ativo: true },
      { id: 'pessoa-felipe', nome: 'Felipe Bottaro', ativo: true },
    ],
    catalogos: [],
  });
  const { default: NovaOS } = await import('./NovaOS');
  return renderizarTela(<NovaOS />);
}

describe('Abertura de OS: o que a tela exige', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('formulário vazio não abre OS — e o aviso diz o que falta primeiro', async () => {
    await abrirTela();
    const botao = await screen.findByRole('button', { name: /abrir (a )?ordem|abrir os|salvar/i });

    fireEvent.click(botao);

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const aviso = mockToast.mock.calls[0][0] as { title: string; variant?: string };
    expect(aviso.variant).toBe('destructive');
    // Cliente é o primeiro campo da tela, então é o primeiro a ser cobrado.
    expect(aviso.title).toMatch(/cliente/i);
  });

  it('a pergunta da senha aparece, e os campos de senha ficam escondidos até responder', async () => {
    await abrirTela();

    expect(await screen.findByText(/o aparelho tem senha\?/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/senha digitada/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^sim$/i }));

    expect(await screen.findByLabelText(/senha digitada/i)).toBeInTheDocument();
  });

  it('responder "não tem senha" não pede senha nenhuma', async () => {
    await abrirTela();

    fireEvent.click(await screen.findByRole('button', { name: /não tem senha/i }));

    expect(screen.queryByLabelText(/senha digitada/i)).not.toBeInTheDocument();
  });

  it('"quem recebeu" já vem com quem está logado', async () => {
    await abrirTela();

    // O texto escolhido do Select não é desenhado fora do navegador de
    // verdade, mas o campo escondido que ele mantém para formulários é — e é
    // esse valor que vai para o banco. "Quem recebeu" é o primeiro Select da
    // tela (os anteriores, cliente e catálogos, são outro componente).
    await waitFor(() => {
      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      expect(selects[0].value).toBe('pessoa-felipe');
    });
  });

  it('o técnico continua opcional — "Definir depois" segue na tela', async () => {
    await abrirTela();
    await waitFor(() => {
      expect(document.getElementById('tecnico')).toHaveTextContent(/definir depois/i);
    });
  });
});
