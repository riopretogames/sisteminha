import { useEffect, useMemo, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { CHAVE_ENTROU_COMO, lerEntrouComo, limparEntrouComo, marcaValePara } from '@/lib/entrarComo';
import { AppSidebar } from '@/components/Sidebar';
import { AppHeader } from './AppHeader';
import { AbasDaSecao } from './AbasDaSecao';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

/**
 * Seções que ganham a barra de botões das próprias páginas por cima do
 * conteúdo. Entrar aqui abre uma camada: os caminhos irmãos ficam à mão sem
 * precisar voltar ao menu lateral.
 *
 * Cadastros desde 09/08 (pedido do Felipe) e Tarefas desde 23/09 (Minhas
 * Tarefas ⇄ Quadros). Acrescentar uma seção é acrescentar o id aqui — a barra
 * se monta sozinha a partir de menu.ts.
 */
const SECOES_COM_ABAS = ['cadastros', 'tarefas'];

/**
 * A faixa de "você está vendo o sistema como Fulano".
 *
 * Sem ela, o administrador esqueceria em que conta está e faria uma venda
 * "do Richard" sem querer. Por isso ela aparece em TODA aba em que quem está
 * logado é a pessoa da marca — a sessão vale para o navegador inteiro, e a
 * faixa tem que valer junto (achado 16 da revisão de 24/09; ver
 * lib/entrarComo.ts).
 *
 * A marca é lida de novo a cada troca de conta (a outra aba trocou a sessão,
 * e a biblioteca de login avisa esta) e a cada mudança no armazenamento do
 * navegador (a outra aba acabou de gravar ou apagar a marca — sem isto, a aba
 * que trocou de conta antes de a marca ser gravada ficaria sem faixa).
 *
 * Quem APAGA a marca quando a conta sai (pelo "Sair" do menu, noutra aba, ou
 * porque a sessão venceu) é o useAuth. E mesmo que sobre marca, a faixa só
 * acende para a pessoa dela: o Felipe que saiu pelo menu e entrou com a
 * própria senha não vê "você está como Richard" (achado 20).
 */
function FaixaEntrouComo() {
  const { user } = useAuth();
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === null || e.key === CHAVE_ENTROU_COMO) setVersao((v) => v + 1);
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);

  // `versao` só existe para reler a marca quando ela muda fora desta aba.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const marca = useMemo(() => marcaValePara(lerEntrouComo(), user?.id), [user?.id, versao]);
  if (!marca) return null;

  const sair = async () => {
    limparEntrouComo();
    // `local`: sai SÓ desta sessão (a que o "Entrar como" abriu). O padrão da
    // biblioteca é sair de todas as sessões da conta — derrubaria o Richard de
    // verdade no computador do balcão e no celular dele.
    await supabase.auth.signOut({ scope: 'local' });
    // Recarrega a página inteira, e não só troca de tela: o que está na
    // memória (listas, permissões, Minhas Tarefas) é da conta do Richard, e
    // não pode aparecer para o Felipe quando ele entrar de novo.
    window.location.assign(import.meta.env.BASE_URL.replace(/\/$/, '') + '/login');
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 print:hidden dark:bg-amber-900/40 dark:text-amber-100"
    >
      <span>
        Você está vendo o sistema como <strong>{marca.nome}</strong>
        {marca.por ? ' (entrou como administrador: ' + marca.por + ')' : ''}. Tudo que fizer aqui
        fica registrado no nome dessa pessoa.
      </span>
      <Button size="sm" variant="outline" onClick={() => void sair()}>
        <LogOut className="mr-1.5 h-3.5 w-3.5" />
        {/* Sem "por": entrou pelo link copiado, numa janela que não tinha
            conta nenhuma (a anônima) — não há "minha conta" para onde voltar. */}
        {marca.por ? 'Sair e voltar para a minha conta' : 'Sair desta conta'}
      </Button>
    </div>
  );
}

export function AppLayout() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const secaoComAbas = SECOES_COM_ABAS.find((id) => pathname.startsWith(`/${id}`));

  return (
    // As classes `print:` existem por causa do comprovante de venda: sem elas,
    // imprimir uma tela levava o menu lateral e o cabeçalho de busca para o
    // papel, e o `pl-60` (o espaço que o menu ocupa) empurrava o conteúdo para
    // a direita — saía uma tarja vazia de 15 cm na esquerda da folha e o
    // comprovante espremido no canto. Na térmica de 80mm não sobrava nada.
    //
    // O `min-w-0` da coluna do conteúdo é o que deixa o Kanban e a Tabela
    // rolarem para o lado DENTRO do quadro. Sem ele, item de flex nunca fica
    // mais estreito que o que tem dentro: a coluna crescia até caber todas as
    // colunas do quadro, e quem rolava para o lado era a página inteira (o
    // cabeçalho e os filtros saíam da tela junto).
    //
    // Celular (24/09): abaixo de 1024 px o menu lateral some (vira a gaveta do
    // botão de menu do cabeçalho), então o conteúdo ocupa a largura toda —
    // `pl-0`, e só `lg:pl-60` guarda o espaço do menu no computador — e a
    // margem da tela cai de 24 para 16 px, que num celular de 390 px é o que
    // separa caber a linha da tarefa ou quebrar em três. No computador nada
    // mudou. O `print:` continua ganhando do `lg:` no papel: no CSS gerado a
    // regra de impressão vem depois da de tela larga (conferido em 24/09).
    <div className="flex min-h-screen w-full bg-background print:block print:min-h-0">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60 print:pl-0">
        <FaixaEntrouComo />
        <AppHeader />
        <main className="flex-1 p-4 lg:p-6 print:p-0">
          {secaoComAbas && <AbasDaSecao secaoId={secaoComAbas} />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
