import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { sidebarMenu, type MenuItem, type MenuChild } from '@/lib/sidebar-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/* -------------------------------------------------- */
/*  Render children with optional group headers       */
/* -------------------------------------------------- */

function renderGroupedChildren(children: MenuChild[], pathname: string) {
  const hasGroups = children.some((c) => c.group);

  if (!hasGroups) {
    return (
      <ul className="space-y-0.5">
        {children.map((child) => {
          const isActive =
            pathname === child.path || pathname.startsWith(child.path + '/');
          return (
            <li key={child.path}>
              <NavLink
                to={child.path}
                className={cn(
                  'block rounded-md px-3 py-2 text-[13px] transition-colors duration-150',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40'
                )}
              >
                {child.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    );
  }

  // Group children by their group label, preserving order
  const groups: { group: string; items: MenuChild[] }[] = [];
  children.forEach((child) => {
    const groupName = child.group || '';
    const existing = groups.find((g) => g.group === groupName);
    if (existing) {
      existing.items.push(child);
    } else {
      groups.push({ group: groupName, items: [child] });
    }
  });

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.group}>
          {g.group && (
            <span className="block px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              {g.group}
            </span>
          )}
          <ul className="space-y-0.5">
            {g.items.map((child) => {
              const isActive =
                pathname === child.path || pathname.startsWith(child.path + '/');
              return (
                <li key={child.path}>
                  <NavLink
                    to={child.path}
                    className={cn(
                      'block rounded-md px-3 py-2 text-[13px] transition-colors duration-150',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                        : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40'
                    )}
                  >
                    {child.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------- */
/*  Single menu item (with or without submenu)        */
/* -------------------------------------------------- */

function SidebarItem({
  item,
  openId,
  onToggle,
}: {
  item: MenuItem;
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  const location = useLocation();
  const hasChildren = !!item.children?.length;
  const isOpen = openId === item.id;

  // Check if this item or any child is active
  const isChildActive = item.children?.some(
    (c) =>
      location.pathname === c.path ||
      location.pathname.startsWith(c.path + '/')
  );
  const isSelfActive =
    !hasChildren &&
    item.path &&
    (location.pathname === item.path ||
      location.pathname.startsWith(item.path + '/'));

  const Icon = item.icon;

  /* ---------- direct link ---------- */
  if (!hasChildren && item.path) {
    return (
      <NavLink
        to={item.path}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
          isSelfActive
            ? 'bg-sidebar-accent text-sidebar-primary'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        )}
      >
        {isSelfActive && (
          <span className="absolute left-0 h-6 w-[3px] rounded-r-full bg-sidebar-primary" />
        )}
        <Icon
          className={cn(
            'h-[18px] w-[18px] flex-shrink-0',
            isSelfActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80'
          )}
        />
        <span className="truncate">{item.label}</span>
      </NavLink>
    );
  }

  /* ---------- collapsible group ---------- */
  return (
    <div>
      <button
        onClick={() => onToggle(item.id)}
        className={cn(
          'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
          isChildActive || isOpen
            ? 'text-sidebar-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        )}
      >
        <Icon
          className={cn(
            'h-[18px] w-[18px] flex-shrink-0',
            isChildActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80'
          )}
        />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 text-sidebar-foreground/40 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* submenu */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="ml-[22px] mt-1 border-l border-sidebar-border pl-3">
          {renderGroupedChildren(item.children!, location.pathname)}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/*  Sidebar                                           */
/* -------------------------------------------------- */

export function AppSidebar() {
  const { user, signOut, hasRole } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);

  // Only one submenu open at a time
  const handleToggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  // RBAC filter
  const isAdmin = hasRole('admin') || (user?.roles?.length === 0);
  const canSee = (roles?: string[]) => {
    if (!roles) return true;
    if (isAdmin) return true;
    return roles.some((r) => hasRole(r));
  };

  const visibleMenu = sidebarMenu
    .filter((item) => canSee(item.roles))
    .map((item) => {
      if (!item.children) return item;
      const visibleChildren = item.children.filter((c) => canSee(c.roles));
      if (visibleChildren.length === 0) return null;
      return { ...item, children: visibleChildren };
    })
    .filter(Boolean) as typeof sidebarMenu;

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col bg-sidebar border-r border-sidebar-border">
      {/* ---- Logo ---- */}
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <Smartphone className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="text-base font-bold tracking-tight text-sidebar-foreground">
          Sisteminha
        </span>
      </div>

      {/* ---- Navigation ---- */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="relative space-y-1">
          {visibleMenu.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              openId={openId}
              onToggle={handleToggle}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* ---- User ---- */}
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-sidebar-accent/50">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                  {getInitials(user?.profile?.nome || 'U')}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate text-sidebar-foreground">
                  {user?.profile?.nome || 'Usuário'}
                </span>
                <span className="text-[11px] text-sidebar-foreground/50 capitalize">
                  {user?.roles?.[0] || 'Admin'}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 bg-popover">
            <DropdownMenuItem
              onClick={signOut}
              className="text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
