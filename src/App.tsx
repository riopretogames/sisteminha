import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { flattenLinks } from '@/config/menu';
import { resolvePage } from '@/routes/registry';

import Login from './pages/Login';
import NotFound from './pages/NotFound';

/**
 * As rotas protegidas NÃO são escritas à mão — são derivadas de
 * `config/menu.ts`. Antes existiam 7 rotas para ~30 itens de menu, e a maioria
 * dos cliques caía em 404. Agora é impossível o menu e o roteador
 * discordarem: item no menu é rota, por construção.
 */

const queryClient = new QueryClient();

function CarregandoPagina() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Tudo abaixo exige sessão (AppLayout redireciona se não houver). */}
            <Route element={<AppLayout />}>
              {flattenLinks().map((link) => {
                const Page = resolvePage(link.element);
                return (
                  <Route
                    key={link.id}
                    path={link.path}
                    element={
                      <RequirePermission permission={link.permission}>
                        <Suspense fallback={<CarregandoPagina />}>
                          <Page />
                        </Suspense>
                      </RequirePermission>
                    }
                  />
                );
              })}
            </Route>

            {/* Caminhos antigos, mantidos para não quebrar link já salvo
                por alguém da equipe. Podem sair depois da transição. */}
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/dashboard" element={<Navigate to="/home" replace />} />
            <Route path="/clientes" element={<Navigate to="/cadastros/clientes" replace />} />
            <Route path="/clientes/novo" element={<Navigate to="/cadastros/clientes" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
