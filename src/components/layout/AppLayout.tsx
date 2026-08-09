import { Outlet, Navigate, useLocation } from 'react-router-dom';
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
 * Só Cadastros por enquanto (pedido do Felipe em 09/08). Acrescentar uma seção
 * é acrescentar o id aqui — a barra se monta sozinha a partir de menu.ts.
 */
const SECOES_COM_ABAS = ['cadastros'];

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
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col pl-60">
        <AppHeader />
        <main className="flex-1 p-6">
          {secaoComAbas && <AbasDaSecao secaoId={secaoComAbas} />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
