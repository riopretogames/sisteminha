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

async function abrirTela(opcoes: { taxa?: number } = {}) {
  mockCan.mockImplementation(montarCan({ perfil: 'admin' }));
  mockSupabase.atual = bancoFalso({
    // A taxa que ESTA loja cobra. 137 em vez de 80 de propósito: com 80, o
    // teste passaria igual se a tela voltasse a ter o valor escrito no código.
    tenants: [{ id: 'loja-1', taxa_analise: opcoes.taxa ?? 137 }],
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

/**
 * Tempo maior que o padrão (5s), e não é preguiça.
 *
 * A Nova OS é a tela mais pesada do sistema — cliente, seis catálogos, três
 * checklists, pessoas, taxa da loja — e cada teste aqui monta ela do zero
 * (`vi.resetModules()` obriga a reimportar o módulo inteiro). Sozinha ela leva
 * ~2,7s; com a bateria toda rodando em paralelo nesta máquina, passava dos 5s
 * e o arquivo falhava POR TEMPO, sem defeito nenhum.
 *
 * Suíte que fica vermelha ao acaso é suíte que a gente aprende a ignorar — e
 * aí o dia em que a falha for de verdade ninguém olha. O teto largo não
 * esconde nada: teste que trava de verdade estoura os 30s do mesmo jeito.
 */
describe('Abertura de OS: o que a tela exige', { timeout: 30_000 }, () => {
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

  describe('a pergunta do laudo eletrônico', () => {
    it('nasce ligada — o caminho cuidadoso é combinar a análise com o cliente', async () => {
      await abrirTela();

      const chave = await screen.findByLabelText(/vai ter laudo eletrônico/i);
      expect(chave).toBeChecked();
    });

    it('ligada, lembra o vendedor da taxa da LOJA, do prazo e do que cobrar', async () => {
      await abrirTela();

      // O lembrete é o roteiro do que dizer AGORA: depois que o cliente vai
      // embora, essa conversa fica cara.
      expect(await screen.findByText(/combine com o cliente antes de fechar a OS/i))
        .toBeInTheDocument();
      // O valor vem da configuração da loja. Estava escrito "R$ 80,00" na
      // tela: a loja que cobrasse outro valor tinha o vendedor prometendo 80.
      //
      // Aparece duas vezes de propósito — quanto é a taxa, e quanto o cliente
      // paga se recusar. São as duas frases que o vendedor fala.
      expect(await screen.findAllByText(/137,00/)).toHaveLength(2);
      expect(screen.getByText(/1 a 3 dias úteis/i)).toBeInTheDocument();
    });

    it('não promete desconto: aprovou, paga só o serviço', async () => {
      // Regra do Felipe (31/08, reforçada em 01/09): o laudo eletrônico só é
      // cobrado quando o cliente RECUSA. Aprovou, paga o valor do laudo e mais
      // nada — limpeza de R$ 180 é R$ 180. O "abate os R$ 80" que a loja fala
      // ao cliente é conversa de venda, e o sistema não faz conta nenhuma.
      //
      // O texto antigo dizia "a taxa é abatida do valor", que faz parecer
      // subtração. Este teste existe para o texto não voltar.
      await abrirTela();

      expect(await screen.findByText(/só o valor do serviço/i)).toBeInTheDocument();
      expect(screen.queryByText(/é abatida do valor/i)).not.toBeInTheDocument();
    });

    it('desligada, o lembrete vira o do serviço tabelado', async () => {
      await abrirTela();

      fireEvent.click(await screen.findByLabelText(/vai ter laudo eletrônico/i));

      // "Serviço tabelado" aparece duas vezes: no título do lembrete e na
      // explicação da chavinha. É o texto do lembrete que interessa aqui.
      expect(await screen.findByText(/serviço tabelado — informe agora/i)).toBeInTheDocument();
      expect(screen.getByText(/preço da tabela/i)).toBeInTheDocument();
      // E some o roteiro da análise: os dois nunca aparecem juntos.
      expect(screen.queryByText(/taxa de análise é de/i)).not.toBeInTheDocument();
    });
  });
});
