import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MENU, type MenuGroup, type MenuLink } from '@/config/menu';
import { getIcon } from '@/config/icons';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Visão geral dos Cadastros.
 *
 * Um ERP costuma jogar 10 itens soltos numa lista e deixar o usuário adivinhar
 * o que é cada um. Aqui cada cadastro vem com uma frase em português leigo
 * explicando PARA QUE serve — o texto sai do campo `hint` de config/menu.ts,
 * então tela e menu nunca divergem.
 *
 * Os grupos e os itens são lidos do menu. Cadastro novo aparece aqui sozinho.
 */

const GRUPO_HINTS: Record<string, string> = {
  'cad-pessoas':
    'Gente e empresas com quem a loja se relaciona. É o que alimenta venda, OS e compra.',
  'cad-catalogo':
    'O que a loja vende e cobra. Produto, serviço e as formas de receber por eles.',
  'cad-apoio':
    'As listinhas que aparecem nos campos de seleção do sistema inteiro. Mexa aqui e muda em todo lugar.',
};

export default function CadastrosHub() {
  const { can } = useAuth();

  const secao = MENU.find((n) => n.id === 'cadastros');
  const grupos =
    secao?.kind === 'section'
      ? (secao.children.filter((c) => c.kind === 'group') as MenuGroup[])
      : [];

  const visivel = (link: MenuLink) =>
    !link.hidden && (!link.permission || can(link.permission));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Cadastros</h1>
        <p className="mt-1 text-muted-foreground">
          Tudo que precisa estar registrado antes de vender ou abrir uma OS.
          Comece por Clientes e Produtos — o resto você ajusta com o tempo.
        </p>
      </header>

      <div className="space-y-10">
        {grupos.map((grupo) => {
          const itens = grupo.children.filter(visivel);
          if (itens.length === 0) return null;

          return (
            <section key={grupo.id}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {grupo.label}
              </h2>
              {GRUPO_HINTS[grupo.id] && (
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground/80">
                  {GRUPO_HINTS[grupo.id]}
                </p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {itens.map((item) => {
                  const Icon = getIcon(item.icon ?? 'file');
                  return (
                    <Link key={item.id} to={item.path} className="group">
                      <Card className="h-full transition-all duration-200 hover:border-primary/40 hover:shadow-md">
                        <CardContent className="flex h-full flex-col gap-2 p-5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                              <Icon className="h-[18px] w-[18px] text-primary" />
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground/0 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                          </div>
                          <p className="font-medium leading-none">{item.label}</p>
                          {item.hint && (
                            <p className="text-sm leading-snug text-muted-foreground">
                              {item.hint}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
