import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { flattenLinks } from '@/config/menu';

/**
 * Página honesta para item de menu cuja tela ainda não existe.
 *
 * Por que isto existe: o menu tem ~35 destinos e nem todos estão prontos.
 * A alternativa seria esconder o item (o usuário não saberia que o módulo é
 * previsto) ou deixar cair em 404 (o usuário acharia que quebrou). Esta tela
 * diz o que é, e que ainda não está pronto.
 */
export default function EmConstrucao() {
  const { pathname } = useLocation();
  const link = flattenLinks().find((l) => l.path === pathname);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">{link?.label ?? 'Módulo'}</h1>
      {link?.hint && <p className="mt-1 text-muted-foreground">{link.hint}</p>}

      <Card className="mt-6 border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Construction className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">Esta tela ainda não foi construída</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            O módulo já está previsto na arquitetura e no controle de permissões —
            falta a interface. Nada aqui está quebrado.
          </p>
          <code className="mt-2 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            {pathname}
          </code>
        </CardContent>
      </Card>
    </div>
  );
}
