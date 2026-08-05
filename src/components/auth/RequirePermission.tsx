import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import type { Permission } from '@/config/permissions';

/**
 * Guarda de rota por permissão.
 *
 * Esconder o item no menu não protege nada — a rota continua acessível por URL
 * direta. Este componente fecha essa porta no front.
 *
 * IMPORTANTE: isto é conveniência de interface, não segurança. A segurança de
 * verdade está no RLS do Supabase (`has_permission` nas policies). Se estas
 * duas camadas discordarem, quem manda é o banco — e é assim que deve ser.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission?: Permission;
  children: ReactNode;
}) {
  const { can, loading } = useAuth();

  // Enquanto a autorização carrega, não decide nada — o AppLayout já mostra
  // o estado de carregamento.
  if (loading) return null;

  if (permission && !can(permission)) {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <p className="text-base font-medium">Você não tem acesso a esta tela</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Seu perfil de acesso não inclui esta permissão. Se você precisa dela
              para trabalhar, fale com um administrador.
            </p>
            <code className="mt-2 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
              {permission}
            </code>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
