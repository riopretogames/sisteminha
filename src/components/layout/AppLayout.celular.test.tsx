import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';
import { gravarEntrouComo } from '@/lib/entrarComo';

/**
 * O sistema no celular (24/09).
 *
 * Até aqui o menu lateral ficava fixo com 240 px em qualquer tela: num
 * celular de 390 px sobravam uns 150 px para a tela de verdade. Agora, abaixo
 * de 1024 px, o menu some e mora numa gaveta aberta pelo botão de menu do
 * cabeçalho.
 *
 * O que estes testes seguram:
 * - o botão de menu existe e abre o menu, com os destinos de verdade;
 * - tocar num destino leva à tela E fecha a gaveta (senão ela ficava por
 *   cima da tela nova); abrir uma seção não fecha, a pessoa ainda está
 *   procurando;
 * - a gaveta obedece às MESMAS permissões do menu do computador — o miolo é
 *   um só, e este teste é o que avisa se alguém um dia duplicar a regra;
 * - no computador continua tudo como antes.
 *
 * O navegador de mentira (jsdom) não mede largura de tela nem lê o CSS: para
 * ele, o menu fixo e o botão aparecem sempre, juntos. Por isso o "cada um no
 * seu tamanho de tela" é conferido pelas classes que ligam e desligam cada
 * um — é o que dá para provar sem um navegador de verdade.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-richard', profile: { nome: 'Richard Sanches' }, roles: ['vendedor'], permissions: [] },
    session: {},
    loading: false,
    can: (p: string) => mockCan(p),
    canAny: () => true,
    hasRole: () => false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    avisoDeEntrada: null,
  }),
}));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

async function abrirSistema(perfil: 'administrador' | 'vendedor') {
  mockCan.mockImplementation(montarCan({ perfil }));
  // O sino de avisos do cabeçalho pergunta ao banco; tudo vazio = loja em dia.
  mockSupabase.atual = bancoFalso({
    vw_produtos: [],
    service_orders: [],
    titulos_financeiros: [],
    caixa_sessoes: [],
  });
  const { AppLayout } = await import('./AppLayout');
  return renderizarTela(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<p>Tela inicial</p>} />
        <Route path="/tarefas/minhas" element={<p>Tela de Minhas Tarefas</p>} />
      </Route>
    </Routes>,
  );
}

const botaoDoMenu = () => screen.getByRole('button', { name: 'Abrir o menu' });

async function abrirGaveta() {
  fireEvent.click(botaoDoMenu());
  return screen.findByRole('dialog', { name: 'Menu do sistema' });
}

describe('Sistema no celular: menu na gaveta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    silenciarConsole();
  });

  it('o botão de menu existe e abre o menu com os destinos', async () => {
    await abrirSistema('vendedor');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const gaveta = await abrirGaveta();

    expect(within(gaveta).getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(within(gaveta).getByRole('button', { name: /^Tarefas$/ })).toBeInTheDocument();
    expect(within(gaveta).getByRole('button', { name: /^Venda$/ })).toBeInTheDocument();
    // O rodapé com a pessoa logada vem junto: é por ele que se sai do sistema.
    expect(within(gaveta).getByText('Richard Sanches')).toBeInTheDocument();
  });

  it('abrir uma seção NÃO fecha a gaveta; tocar num destino leva à tela e fecha', async () => {
    await abrirSistema('vendedor');
    const gaveta = await abrirGaveta();

    const tarefas = within(gaveta).getByRole('button', { name: /^Tarefas$/ });
    fireEvent.click(tarefas);
    expect(tarefas).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Menu do sistema' })).toBeInTheDocument();

    fireEvent.click(within(gaveta).getByRole('link', { name: 'Minhas Tarefas' }));

    expect(await screen.findByText('Tela de Minhas Tarefas')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a gaveta esconde o que o perfil não pode abrir — a mesma regra do menu do computador', async () => {
    const { unmount } = await abrirSistema('vendedor');
    let gaveta = await abrirGaveta();
    expect(within(gaveta).queryByText(/^Financeiro$/)).not.toBeInTheDocument();
    expect(within(gaveta).queryByText(/^Configurações$/)).not.toBeInTheDocument();
    expect(within(gaveta).queryByText(/^Conferência$/)).not.toBeInTheDocument();

    unmount();
    vi.resetModules();
    await abrirSistema('administrador');
    gaveta = await abrirGaveta();
    expect(within(gaveta).getByText(/^Financeiro$/)).toBeInTheDocument();
    expect(within(gaveta).getByText(/^Configurações$/)).toBeInTheDocument();
  });

  it('a faixa do "Entrar como" continua aparecendo junto com o botão de menu', async () => {
    gravarEntrouComo({
      alvoId: 'u-richard',
      nome: 'Richard Sanches',
      por: 'Felipe Bottaro',
      quando: '2026-09-24T15:00:00Z',
    });
    await abrirSistema('vendedor');

    expect(screen.getByText(/Você está vendo o sistema como/)).toHaveTextContent('Richard Sanches');
    expect(botaoDoMenu()).toBeInTheDocument();
  });

  it('no computador fica como antes: menu fixo de 240 px, espaço dele no conteúdo, e o botão some', async () => {
    await abrirSistema('administrador');

    // Menu fixo: escondido no celular, de volta a partir de 1024 px (lg).
    const menuFixo = screen.getByRole('complementary');
    expect(menuFixo).toHaveClass('hidden', 'lg:flex', 'w-60', 'print:hidden');
    // O botão da gaveta é só do celular.
    expect(botaoDoMenu()).toHaveClass('lg:hidden');
    // O conteúdo só reserva os 240 px do menu no computador; no celular ocupa
    // a largura toda e a margem é menor.
    const principal = screen.getByRole('main');
    expect(principal.parentElement).toHaveClass('lg:pl-60', 'print:pl-0');
    expect(principal.parentElement).not.toHaveClass('pl-60');
    expect(principal).toHaveClass('p-4', 'lg:p-6', 'print:p-0');
  });
});
