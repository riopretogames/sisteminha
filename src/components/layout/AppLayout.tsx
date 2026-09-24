import { useState } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lerEntrouComo, limparEntrouComo } from '@/lib/entrarComo';
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
 * Aparece só na aba em que o administrador usou "Entrar como" (a marca vive
 * no sessionStorage, ver lib/entrarComo.ts). Sem ela, o administrador
 * esqueceria em que conta está e faria uma venda "do Richard" sem querer.
 */
function FaixaEntrouComo() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [marca] = useState(lerEntrouComo);
  if (!marca) return null;

  const sair = async () => {
    limparEntrouComo();
    await signOut();
    navigate('/login', { replace: true });
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
        Sair e voltar para a minha conta
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
    <div className="flex min-h-screen w-full bg-background print:block print:min-h-0">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col pl-60 print:pl-0">
        <FaixaEntrouComo />
        <AppHeader />
        <main className="flex-1 p-6 print:p-0">
          {secaoComAbas && <AbasDaSecao secaoId={secaoComAbas} />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
