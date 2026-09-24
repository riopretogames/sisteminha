import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Gamepad2, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { MENU, findSectionIdByPath, type MenuLink, type MenuGroup, type MenuSection, type MenuRoot } from '@/config/menu';
import { getIcon } from '@/config/icons';
import { ROLE_LABELS, rotuloDoPapel } from '@/config/permissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Menu lateral do RPG System.IO.
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
 *
 * O menu mora em DOIS lugares (24/09), com o mesmo miolo (`MenuDoSistema`):
 * - no computador (tela de 1024 px para cima), fixo na esquerda, como sempre
 *   foi (`AppSidebar`);
 * - no celular e no tablet em pé, escondido atrás do botão de menu do
 *   cabeçalho, numa gaveta que desliza da esquerda (`MenuCelular`).
 * Antes disso o menu ficava fixo com 240 px em qualquer tela: num celular de
 * 390 px sobravam 150 px para a tela de verdade — justo a Minhas Tarefas, que
 * é a tela que o funcionário abre no celular. O miolo é um só de propósito:
 * se a regra de permissão fosse escrita duas vezes, um dia as duas versões
 * iam discordar e o celular mostraria uma porta que o computador esconde.
 */

/* -------------------------------------------------------------------------- */
/*  Item folha                                                                */
/* -------------------------------------------------------------------------- */

function SubLink({
  link,
  pathname,
  aoNavegar,
}: {
  link: MenuLink;
  pathname: string;
  aoNavegar?: () => void;
}) {
  const isActive = pathname === link.path || pathname.startsWith(link.path + '/');

  return (
    <NavLink
      to={link.path}
      onClick={aoNavegar}
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
  aoNavegar,
}: {
  section: MenuSection;
  isOpen: boolean;
  onToggle: () => void;
  pathname: string;
  aoNavegar?: () => void;
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
              <SubLink key={child.id} link={child} pathname={pathname} aoNavegar={aoNavegar} />
            ) : (
              // Grupo: rótulo puro, não clicável. Só organiza visualmente.
              <div key={child.id}>
                <span className="block px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {child.label}
                </span>
                <ul className="space-y-0.5">
                  {child.children.map((link) => (
                    <li key={link.id}>
                      <SubLink link={link} pathname={pathname} aoNavegar={aoNavegar} />
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
/*  Miolo do menu (o mesmo no computador e no celular)                        */
/* -------------------------------------------------------------------------- */

/**
 * Marca, lista de seções e o rodapé com o usuário.
 *
 * Devolve só os três blocos, sem caixa em volta: quem usa (a barra fixa do
 * computador ou a gaveta do celular) é que decide largura, altura e fundo.
 * Assim a barra do computador continua com exatamente o mesmo desenho de
 * antes de a versão de celular existir.
 *
 * `aoNavegar` é chamado quando a pessoa toca num destino (não quando só abre
 * ou fecha uma seção). A gaveta do celular usa isso para se fechar sozinha:
 * sem isso, a pessoa tocava em "Minhas Tarefas", a tela trocava por baixo e o
 * menu continuava cobrindo tudo.
 */
export function MenuDoSistema({ aoNavegar }: { aoNavegar?: () => void }) {
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
    <>
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
                onClick={aoNavegar}
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
                aoNavegar={aoNavegar}
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
                  {rotuloDoPapel(papelPrincipal)}
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
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Computador: barra fixa na esquerda                                        */
/* -------------------------------------------------------------------------- */

/**
 * Some abaixo de 1024 px (`hidden lg:flex`); dali para cima é a mesma barra de
 * sempre. O `print:hidden` continua valendo em qualquer largura de papel: no
 * CSS que o Tailwind gera, a regra de impressão vem DEPOIS da regra de tela
 * larga e ganha dela (conferido em 24/09) — senão o menu voltaria a sair no
 * comprovante impresso em folha deitada.
 */
export function AppSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex print:hidden">
      <MenuDoSistema />
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Celular: botão no cabeçalho + gaveta                                      */
/* -------------------------------------------------------------------------- */

/**
 * O botão de menu (os três risquinhos) que o cabeçalho mostra abaixo de
 * 1024 px, e a gaveta que ele abre com o mesmo menu do computador.
 *
 * A gaveta fecha sozinha quando a pessoa escolhe uma tela (ver `aoNavegar` em
 * `MenuDoSistema`). Abrir e fechar uma seção não fecha a gaveta, porque a
 * pessoa ainda está procurando para onde ir.
 */
export function MenuCelular() {
  const [aberto, setAberto] = useState(false);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Abrir o menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      {/* `text-sidebar-foreground`: o X de fechar herda a cor do texto, e sem
          isto ele sairia escuro sobre o fundo escuro do menu, invisível. */}
      <SheetContent
        side="left"
        className="flex w-72 max-w-[85vw] flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
      >
        {/* Título e descrição só para leitor de tela: a janela precisa dizer o
            que ela é para quem não enxerga a tela. */}
        <SheetTitle className="sr-only">Menu do sistema</SheetTitle>
        <SheetDescription className="sr-only">Escolha a tela que quer abrir.</SheetDescription>
        <MenuDoSistema aoNavegar={() => setAberto(false)} />
      </SheetContent>
    </Sheet>
  );
}
