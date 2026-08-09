import { NavLink, useLocation } from 'react-router-dom';
import { MENU, type MenuLink, type MenuNode } from '@/config/menu';
import { getIcon } from '@/config/icons';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/**
 * Barra de botões da seção em que a pessoa está.
 *
 * Pedido do Felipe em 09/08: entrar em Cadastros tem que abrir uma camada
 * própria, com todas as páginas da área em botões — "visão geral, clientes,
 * importação, e todas as outras".
 *
 * O que isso resolve na prática: para ir de Clientes para Importação de
 * Clientes, hoje é preciso voltar ao menu lateral, achar a seção de novo e
 * abrir o grupo. Com a barra, quem está trabalhando em cadastro fica dentro do
 * cadastro — os caminhos irmãos ficam sempre à mão.
 *
 * A lista sai de `config/menu.ts`, então página nova aparece aqui sozinha e
 * nunca diverge do menu. Permissão é respeitada igual: quem não pode ver
 * Usuários não vê o botão.
 */

/** Achata os links de uma seção, entrando nos grupos. */
function linksDaSecao(nos: MenuNode[]): MenuLink[] {
  return nos.flatMap((no) => {
    if (no.kind === 'link') return no.hidden ? [] : [no];
    if (no.kind === 'group') return linksDaSecao(no.children);
    return [];
  });
}

interface Props {
  /** Id da seção em `config/menu.ts`. Ex.: 'cadastros'. */
  secaoId: string;
}

export function AbasDaSecao({ secaoId }: Props) {
  const { pathname } = useLocation();
  const { can } = useAuth();

  const secao = MENU.find((n) => n.kind === 'section' && n.id === secaoId);
  if (!secao || secao.kind !== 'section') return null;

  const links = linksDaSecao(secao.children).filter(
    (l) => !l.permission || can(l.permission)
  );

  if (links.length <= 1) return null;

  return (
    <nav
      aria-label={`Páginas de ${secao.label}`}
      className="mb-6 flex flex-wrap gap-2 border-b pb-4"
    >
      {links.map((link) => {
        const Icone = getIcon(link.icon ?? 'file');
        // `end` só na raiz da seção: sem isso, "Visão Geral" (/cadastros)
        // ficaria marcada junto com todas as filhas.
        const ehRaiz = link.path === `/${secaoId}`;
        const ativo = ehRaiz ? pathname === link.path : pathname.startsWith(link.path);

        return (
          <NavLink
            key={link.id}
            to={link.path}
            title={link.hint}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              ativo
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icone className="h-4 w-4 shrink-0" />
            {link.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
