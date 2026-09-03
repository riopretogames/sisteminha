import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';
import { OS_ETAPAS } from '@/config/osStatus';

/**
 * Qual etapa o botão de avanço sugere.
 *
 * Achado pelo Felipe em 30/08, com print: parado em "Aguardando aprovação", o
 * botão oferecia **"Avançar para Aguardando Peça"**. E fazia sentido para o
 * código — a Peça é mesmo a coluna seguinte no quadro — mas não para a loja:
 * a Peça é um DESVIO (o aparelho esperando peça chegar), não o passo seguinte
 * do processo. Depois de o cliente aprovar, vem Aprovado / Executar.
 *
 * A sugestão passou a pular as etapas extras da loja. O desvio continua
 * alcançável pelo seletor ao lado, que oferece todas.
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

/** As etapas como estão hoje no quadro do Felipe, com os desvios no meio. */
const ETAPAS = [
  { id: '1', key: OS_ETAPAS.AGUARDANDO_ANALISE, label: 'Entrada / Análise', numero: '1',
    color: 'bg-violet-500 text-white', ordem: 10, ativo: true, sistema: true },
  { id: '2', key: OS_ETAPAS.AGUARDANDO_APROVACAO, label: 'Aguardando aprovação', numero: '2a',
    color: 'bg-orange-500 text-white', ordem: 20, ativo: true, sistema: true },
  { id: '3', key: 'aguardando_peca', label: 'Aguardando Peça', numero: '2b',
    color: 'bg-amber-500 text-white', ordem: 30, ativo: true, sistema: false },
  { id: '4', key: OS_ETAPAS.APROVADO, label: 'Aprovado / Executar', numero: '3',
    color: 'bg-green-600 text-white', ordem: 40, ativo: true, sistema: true },
  { id: '5', key: 'tercerizada', label: 'Terceirizada', numero: '4',
    color: 'bg-amber-500 text-white', ordem: 50, ativo: true, sistema: false },
  { id: '6', key: OS_ETAPAS.FINALIZADO, label: 'Finalizado', numero: '5',
    color: 'bg-cyan-500 text-white', ordem: 60, ativo: true, sistema: true },
  { id: '7', key: OS_ETAPAS.ENTREGUE, label: 'Entregue', numero: '6',
    color: 'bg-emerald-500 text-white', ordem: 70, ativo: true, sistema: true },
];

async function abrir(
  statusAtual: string,
  opcoes: {
    perfil?: 'administrador' | 'tecnico';
    laudoAprovado?: boolean | null;
    execucaoIniciadaEm?: string | null;
  } = {},
) {
  mockCan.mockImplementation(montarCan({ perfil: opcoes.perfil ?? 'administrador' }));
  mockSupabase.atual = bancoFalso({ os_status_config: ETAPAS });
  const { TrocarEtapaOS } = await import('./TrocarEtapaOS');
  return renderizarTela(
    <TrocarEtapaOS
      osId="os-1"
      numeroOs="OS0001"
      statusAtual={statusAtual}
      tipo="paga"
      totalOrcamento={100}
      laudoAprovado={opcoes.laudoAprovado ?? null}
      execucaoIniciadaEm={opcoes.execucaoIniciadaEm ?? null}
      onMudou={() => {}}
    />,
  );
}

describe('A etapa que o botão de avanço sugere', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('em Aguardando aprovação NÃO há botão de avanço: quem move é a decisão do laudo', async () => {
    // Mudou em 31/08. Nesta etapa a OS só sai quando o cliente responde, e
    // quem registra a resposta é o par de botões de DecisaoDoLaudo — que grava
    // quem decidiu, quando, e o motivo quando é recusa. Deixar também o avanço
    // genérico aqui daria dois caminhos para a mesma decisão, um deles sem
    // registrar nada.
    await abrir(OS_ETAPAS.AGUARDANDO_APROVACAO);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /avançar|aprovou/i })).not.toBeInTheDocument();
    });
    // E principalmente: não oferece a Peça, que é desvio e não passo seguinte.
    expect(screen.queryByRole('button', { name: /aguardando peça/i })).not.toBeInTheDocument();
  });

  it('da Entrada, sugere enviar o laudo para aprovação', async () => {
    await abrir(OS_ETAPAS.AGUARDANDO_ANALISE);
    expect(await screen.findByRole('button', { name: /enviar laudo para aprovação/i }))
      .toBeInTheDocument();
  });

  it('estando NUM desvio, sugere a próxima etapa de verdade', async () => {
    // Peça chegou: o passo seguinte é executar, não voltar para a aprovação.
    //
    // O NOME do botão aqui é o genérico ("Avançar para..."), e é o certo: sair
    // de um desvio não é um passo do processo desenhado, então o sistema não
    // inventa nome para ele — diz para onde vai e pronto.
    await abrir('aguardando_peca');
    expect(await screen.findByRole('button', { name: /avançar para aprovado/i }))
      .toBeInTheDocument();
  });

  it('de Terceirizada, sugere finalizar: o aparelho voltou de fora', async () => {
    await abrir('tercerizada');
    expect(await screen.findByRole('button', { name: /avançar para finalizado/i }))
      .toBeInTheDocument();
  });

  it('na última etapa, não há o que sugerir', async () => {
    await abrir(OS_ETAPAS.ENTREGUE);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /avançar|entregar|concluído/i }))
        .not.toBeInTheDocument();
    });
  });

  describe('o seletor ao lado, que oferece todas as etapas', () => {
    /**
     * Abrir um seletor destes no teste exige teclado: o mouse do jsdom não tem
     * "pointer capture", que é o que o componente usa para saber que o clique
     * foi nele. Seta para baixo abre igual.
     */
    async function abrirOSeletor(rotuloDaEtapaAtual: RegExp) {
      // O gatilho aparece antes das etapas chegarem do banco. Abrir cedo mostra
      // uma lista vazia e o teste passa sem ter olhado nada — por isso a espera
      // é pelo NOME da etapa atual dentro do gatilho, que só existe depois.
      const gatilho = await screen.findByRole('combobox');
      await within(gatilho).findByText(rotuloDaEtapaAtual);
      fireEvent.keyDown(gatilho, { key: 'ArrowDown' });
      const opcoes = await screen.findAllByRole('option');
      return opcoes.map((o) => o.textContent ?? '').join(' | ');
    }

    it('em Aguardando aprovação, não oferece Aprovado nem Finalizado', async () => {
      // Era o caminho de fora da decisão do laudo: o botão de avanço sumia,
      // mas a lista ao lado continuava levando aos mesmos dois destinos sem
      // registrar quem respondeu, o motivo, nem trocar o valor pela taxa.
      await abrir(OS_ETAPAS.AGUARDANDO_APROVACAO);
      const nomes = await abrirOSeletor(/Aguardando aprovação/);

      expect(nomes).not.toMatch(/Aprovado \/ Executar|Finalizado/);
      // O desvio e a volta atrás continuam ali: um é peça que não chegou, o
      // outro é conserto de engano.
      expect(nomes).toMatch(/Aguardando Peça/);
      expect(nomes).toMatch(/Entrada \/ Análise/);
    });

    it('em outra etapa, a lista continua inteira', async () => {
      await abrir(OS_ETAPAS.APROVADO);
      const nomes = await abrirOSeletor(/Aprovado \/ Executar/);

      expect(nomes).toMatch(/Finalizado/);
    });
  });

  /**
   * Concluir um reparo que ninguém marcou como iniciado.
   *
   * Achado na revisão de 01/09: os dois marcos da bancada — "Iniciar a
   * execução" e "Reparo concluído" — não conversavam, então dava para
   * concluir sem nunca ter começado e o tempo de bancada daquela OS ficava
   * desconhecido para sempre.
   */
  describe('o aviso de reparo nunca iniciado', () => {
    const confirmar = () =>
      vi.spyOn(window, 'confirm').mockImplementation(() => true);

    it('avisa quando ninguém apertou "Iniciar a execução"', async () => {
      const perguntou = confirmar();
      await abrir(OS_ETAPAS.APROVADO, { execucaoIniciadaEm: null });

      fireEvent.click(await screen.findByRole('button', { name: /reparo concluído/i }));

      expect(perguntou).toHaveBeenCalledWith(
        expect.stringContaining('Iniciar a execução'),
      );
    });

    it('não avisa quando a execução foi iniciada', async () => {
      const perguntou = confirmar();
      await abrir(OS_ETAPAS.APROVADO, { execucaoIniciadaEm: '2026-09-01T10:00:00' });

      fireEvent.click(await screen.findByRole('button', { name: /reparo concluído/i }));

      expect(perguntou).not.toHaveBeenCalledWith(
        expect.stringContaining('Iniciar a execução'),
      );
    });

    it('não avisa na OS recusada: nela a execução nunca começa de propósito', async () => {
      // O técnico só remonta o aparelho. Perguntar aqui seria treinar a equipe
      // a apertar "sim" sem ler — e aí o aviso deixa de valer onde importa.
      const perguntou = confirmar();
      await abrir(OS_ETAPAS.APROVADO, { laudoAprovado: false, execucaoIniciadaEm: null });

      fireEvent.click(await screen.findByRole('button', { name: /reparo concluído/i }));

      expect(perguntou).not.toHaveBeenCalledWith(
        expect.stringContaining('Iniciar a execução'),
      );
    });
  });

  it('o botão usa a cor da etapa de destino', async () => {
    await abrir(OS_ETAPAS.AGUARDANDO_ANALISE);

    const botao = await screen.findByRole('button', { name: /enviar laudo para aprovação/i });
    // O destino é "Aguardando aprovação", laranja no quadro.
    expect(botao.className).toContain('bg-orange-600');
  });

  describe('o técnico saindo de um desvio (achado da revisão de 31/08)', () => {
    it('OS JÁ aprovada: o técnico consegue voltar de Aguardando Peça para a bancada', async () => {
      // O beco sem saída: é o técnico quem põe a OS em "Aguardando Peça", a
      // peça chega, e ele não tinha como devolver o aparelho para a bancada —
      // "Aprovado" sumia do botão E do seletor, porque exigia permissão de
      // aprovar orçamento. Só que numa OS já aprovada não há nada a aprovar.
      await abrir('aguardando_peca', { perfil: 'tecnico', laudoAprovado: true });

      expect(await screen.findByRole('button', { name: /avançar para aprovado/i }))
        .toBeInTheDocument();
    });

    it('OS ainda NÃO aprovada: a trava continua de pé', async () => {
      // Aqui a proteção original vale: sem ela, quem tem só orders.edit
      // pularia a decisão do cliente e aprovaria o orçamento sozinho.
      await abrir('aguardando_peca', { perfil: 'tecnico', laudoAprovado: null });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /avançar para aprovado/i }))
          .not.toBeInTheDocument();
      });
    });
  });
});
