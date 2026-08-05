import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { MENU, findSectionIdByPath, type MenuLink, type MenuGroup, type MenuSection, type MenuRoot } from '@/config/menu';
import { getIcon } from '@/config/icons';
import { ROLE_LABELS } from '@/config/permissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Sidebar do RPG System.IO.
 *
 * Renderiza `config/menu.ts` e nada além disso. Não existe aqui nenhum `if`
 * para item específico — a versão anterior tinha um `item.id === 'dashboards'`
 * hardcoded que escolhia entre duas estruturas de menu concorrentes. Agora a
 * estrutura é uma só e o componente é burro de propósito: item novo no menu
 * aparece aqui sem que este arquivo mude.
 *
 * Filtragem por permissão: um `link` sem permissão do usuário some. Um `group`
 * que ficou sem filhos visíveis some. Uma `section` sem filhos visíveis some.
 * Ninguém vê porta que não pode abrir.
 */

/* -------------------------------------------------------------------------- */
/*  Item folha                                                                */
/* -------------------------------------------------------------------------- */

function SubLink({ link, pathname }: { link: MenuLink; pathname: string }) {
  const isActive = pathname === link.path || pathname.startsWith(link.path + '/');

  return (
    <NavLink
      to={link.path}
      className={cn(
        'block rounded-md px-3 py-2 text-[13px] transition-colors duration-150',
        isActive
          ? 'bg-sidebar-accent font-medium text-sidebar-primary'
          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground',
      )}
    >
      {link.label}
    </NavLink>
  );
}

/* -------------------------------------------------------------------------- */
/*  Seção expansível                                                          */
/* -------------------------------------------------------------------------- */

function SectionItem({
  section,
  isOpen,
  onToggle,
  pathname,
}: {
  section: MenuSection;
  isOpen: boolean;
  onToggle: () => void;
  pathname: string;
}) {
  const Icon = getIcon(section.icon);

  const temFilhoAtivo = useMemo(() => {
    const links: MenuLink[] = [];
    for (const child of section.children) {
      if (child.kind === 'link') links.push(child);
      else links.push(...child.children);
    }
    return links.some((l) => pathname === l.path || pathname.startsWith(l.path + '/'));
  }, [section, pathname]);

  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className={cn(
          'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
          temFilhoAtivo || isOpen
            ? 'text-sidebar-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        )}
      >
        <Icon
          className={cn(
            'h-[18px] w-[18px] flex-shrink-0',
            temFilhoAtivo
              ? 'text-sidebar-primary'
              : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80',
          )}
        />
        <span className="flex-1 truncate text-left">{section.label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 text-sidebar-foreground/40 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isOpen ? 'max-h-[900px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="ml-[22px] mt-1 space-y-3 border-l border-sidebar-border pl-3">
          {section.children.map((child) =>
            child.kind === 'link' ? (
              <SubLink key={child.id} link={child} pathname={pathname} />
            ) : (
              // Grupo: rótulo puro, não clicável. Só organiza visualmente.
              <div key={child.id}>
                <span className="block px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {child.label}
                </span>
                <ul className="space-y-0.5">
                  {child.children.map((link) => (
                    <li key={link.id}>
                      <SubLink link={link} pathname={pathname} />
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sidebar                                                                   */
/* -------------------------------------------------------------------------- */

export function AppSidebar() {
  const { user, signOut, can } = useAuth();
  const location = useLocation();
  const [openId, setOpenId] = useState<string | null>(() =>
    findSectionIdByPath(location.pathname),
  );

  // Ao navegar direto para uma rota interna, abre a seção dona dela.
  useEffect(() => {
    const secao = findSectionIdByPath(location.pathname);
    if (secao) setOpenId(secao);
  }, [location.pathname]);

  /** Menu já podado pelas permissões do usuário. */
  const menuVisivel = useMemo<MenuRoot[]>(() => {
    const podeVer = (permission?: string) =>
      !permission || can(permission as Parameters<typeof can>[0]);

    const resultado: MenuRoot[] = [];

    for (const node of MENU) {
      if (node.hidden || !podeVer(node.permission)) continue;

      if (node.kind === 'link') {
        resultado.push(node);
        continue;
      }

      const filhos: Array<MenuGroup | MenuLink> = [];

      for (const child of node.children) {
        if (child.kind === 'link') {
          if (!child.hidden && podeVer(child.permission)) filhos.push(child);
          continue;
        }

        const netos = child.children.filter((l) => !l.hidden && podeVer(l.permission));
        if (netos.length > 0) filhos.push({ ...child, children: netos });
      }

      // Seção sem nenhum destino visível não vira botão morto.
      if (filhos.length > 0) resultado.push({ ...node, children: filhos });
    }

    return resultado;
  }, [can]);

  const iniciais = (nome: string) =>
    nome
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const papelPrincipal = user?.roles?.[0];

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Marca */}
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <Gamepad2 className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="text-base font-bold tracking-tight text-sidebar-foreground">
          RPG System<span className="text-sidebar-primary">.IO</span>
        </span>
      </div>

      {/* Navegação */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="relative space-y-1">
          {menuVisivel.map((node) =>
            node.kind === 'link' ? (
              <NavLink
                key={node.id}
                to={node.path}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                  )
                }
              >
                {(() => {
                  const Icon = getIcon(node.icon);
                  return <Icon className="h-[18px] w-[18px] flex-shrink-0" />;
                })()}
                <span className="truncate">{node.label}</span>
              </NavLink>
            ) : (
              <SectionItem
                key={node.id}
                section={node}
                isOpen={openId === node.id}
                onToggle={() => setOpenId((prev) => (prev === node.id ? null : node.id))}
                pathname={location.pathname}
              />
            ),
          )}

          {menuVisivel.length === 0 && (
            <p className="px-3 py-4 text-[12px] leading-relaxed text-sidebar-foreground/50">
              Sua conta ainda não tem um perfil de acesso. Peça a um administrador
              para liberar em Cadastros → Usuários.
            </p>
          )}
        </nav>
      </ScrollArea>

      {/* Usuário */}
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-sidebar-accent/50">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-sidebar-primary text-xs text-sidebar-primary-foreground">
                  {iniciais(user?.profile?.nome || 'U')}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {user?.profile?.nome || 'Usuário'}
                </span>
                <span className="text-[11px] text-sidebar-foreground/50">
                  {papelPrincipal ? ROLE_LABELS[papelPrincipal] : 'Sem perfil'}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 bg-popover">
            <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
