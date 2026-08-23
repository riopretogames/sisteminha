import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Plus, ClipboardList, ShoppingCart, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useAvisos } from '@/hooks/useAvisos';
import { PERMISSIONS } from '@/config/permissions';
import { flattenLinks } from '@/config/menu';

export function AppHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  // Avisos de verdade, perguntados ao banco. Nao existe tabela de
  // notificacao de proposito: aviso guardado precisa de alguem que apague,
  // e o primeiro esquecimento deixa o sino avisando de problema resolvido.
  const { data: avisosData, isLoading: carregandoAvisos } = useAvisos();
  const avisos = avisosData ?? [];
  const temUrgente = avisos.some((a) => a.peso === 'urgente');
  const { can } = useAuth();

  // Keyboard shortcut for search (Ctrl+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Ação rápida aparece pela PERMISSÃO que ela exige, não por lista de papéis.
  // Assim, mudar o que um Vendedor pode fazer não exige tocar neste arquivo.
  const quickActions = [
    { label: 'Nova Venda', icon: ShoppingCart, path: '/pdv', color: 'bg-primary', permission: PERMISSIONS.SALES_CREATE },
    { label: 'Nova OS', icon: ClipboardList, path: '/os/nova', color: 'bg-secondary', permission: PERMISSIONS.ORDERS_CREATE },
    { label: 'Novo Cliente', icon: Users, path: '/cadastros/clientes', color: 'bg-success', permission: PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE },
  ];

  const filteredActions = quickActions.filter((action) => can(action.permission));

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
        {/* Search */}
        <div className="flex items-center gap-4 flex-1 max-w-xl">
          <Button
            variant="outline"
            className="relative w-full justify-start text-muted-foreground"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="mr-2 h-4 w-4" />
            <span>Buscar clientes, OS, produtos...</span>
            <kbd className="pointer-events-none absolute right-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Quick Add */}
          {filteredActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" className="rounded-full">
                  <Plus className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {filteredActions.map(action => {
                  const Icon = action.icon;
                  return (
                    <DropdownMenuItem
                      key={action.path}
                      onClick={() => navigate(action.path)}
                      className="cursor-pointer"
                    >
                      <div className={`mr-2 flex h-6 w-6 items-center justify-center rounded ${action.color}`}>
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      {action.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Avisos.
              O numero vem da contagem de verdade -- ate 23/08 era um "3"
              digitado no codigo, e o sino nao abria nada. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="Avisos">
                <Bell className="h-5 w-5" />
                {avisos.length > 0 && (
                  <Badge
                    className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-[10px] ${
                      temUrgente ? 'bg-destructive text-destructive-foreground' : ''
                    }`}
                  >
                    {avisos.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>
                {avisos.length > 0 ? 'O que precisa de atencao' : 'Avisos'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {avisos.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {carregandoAvisos ? 'Conferindo...' : 'Nada pendente. Loja em dia.'}
                </div>
              ) : (
                avisos.map((aviso) => (
                  <DropdownMenuItem
                    key={aviso.id}
                    onClick={() => navigate(aviso.caminho)}
                    className="flex flex-col items-start gap-0.5 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span
                        className={`h-2 w-2 flex-shrink-0 rounded-full ${
                          aviso.peso === 'urgente' ? 'bg-destructive' : 'bg-amber-500'
                        }`}
                      />
                      {aviso.titulo}
                    </span>
                    <span className="pl-4 text-xs text-muted-foreground">{aviso.detalhe}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Global Search Command */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Buscar clientes, OS, produtos..." />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          <CommandGroup heading="Ações Rápidas">
            {filteredActions.map(action => {
              const Icon = action.icon;
              return (
                <CommandItem
                  key={action.path}
                  onSelect={() => {
                    navigate(action.path);
                    setSearchOpen(false);
                  }}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {action.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
          {/* Navegação derivada do menu e filtrada pelas permissões do usuário —
              a busca nunca oferece um destino que a pessoa não pode abrir. */}
          <CommandGroup heading="Navegação">
            {flattenLinks()
              .filter((link) => !link.permission || can(link.permission))
              .map((link) => (
                <CommandItem
                  key={link.id}
                  value={`${link.label} ${link.hint ?? ''}`}
                  onSelect={() => {
                    navigate(link.path);
                    setSearchOpen(false);
                  }}
                >
                  {link.label}
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
