import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ROLES, ROLE_LABELS, type Role } from '@/config/permissions';
import { PageHeader } from '@/components/PageHeader';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Perfis e Permissões.
 *
 * Edita `role_permissions` — a MESMA tabela que o RLS do banco consulta em
 * `has_permission()`. Marcar uma caixa aqui muda de verdade o que a pessoa
 * consegue fazer, inclusive se ela chamar a API por fora do sistema. Não é uma
 * tela que só esconde menu.
 *
 * O Administrador não é editável de propósito: se fosse possível remover
 * `roles.manage` do único administrador, ninguém conseguiria devolver a
 * permissão depois — o sistema ficaria trancado sem saída.
 */

interface PermissaoCatalogo {
  key: string;
  modulo: string;
  descricao: string;
}

const PAPEIS_EDITAVEIS: Role[] = [
  ROLES.GERENTE,
  ROLES.GERENTE_TECNICO,
  ROLES.VENDEDOR,
  ROLES.TECNICO,
];

export default function ConfigPerfis() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [papel, setPapel] = useState<Role>(ROLES.GERENTE);

  const { data: permissoes, isLoading: carregandoPerms } = useQuery({
    queryKey: ['permissions-catalogo'],
    queryFn: async (): Promise<PermissaoCatalogo[]> => {
      const { data, error } = await supabase.from('permissions').select('key, modulo, descricao');
      if (error) throw error;
      return (data ?? []) as PermissaoCatalogo[];
    },
  });

  const { data: mapa, isLoading: carregandoMapa } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: async (): Promise<Array<{ role: string; permission_key: string }>> => {
      const { data, error } = await supabase.from('role_permissions').select('role, permission_key');
      if (error) throw error;
      return data ?? [];
    },
  });

  const concedidas = useMemo(() => {
    const set = new Set<string>();
    for (const r of mapa ?? []) {
      if (r.role === papel) set.add(r.permission_key);
    }
    return set;
  }, [mapa, papel]);

  const porModulo = useMemo(() => {
    const grupos = new Map<string, PermissaoCatalogo[]>();
    for (const p of permissoes ?? []) {
      const lista = grupos.get(p.modulo) ?? [];
      lista.push(p);
      grupos.set(p.modulo, lista);
    }
    return [...grupos.entries()];
  }, [permissoes]);

  const alternar = useMutation({
    mutationFn: async ({ chave, conceder }: { chave: string; conceder: boolean }) => {
      if (conceder) {
        const { error } = await supabase
          .from('role_permissions')
          .insert({ role: papel, permission_key: chave });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role', papel)
          .eq('permission_key', chave);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['role-permissions'] }),
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Não foi possível alterar',
        description: /row-level security|policy/i.test(msg)
          ? 'Só quem tem a permissão "Alterar perfis e permissões" pode mexer aqui.'
          : msg,
        variant: 'destructive',
      });
    },
  });

  const carregando = carregandoPerms || carregandoMapa;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Perfis e Permissões"
        hint="Define o que cada perfil pode fazer. A mudança vale imediatamente e também no banco de dados — não é só o menu que muda."
      />

      <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 py-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium">O perfil Administrador não aparece aqui.</p>
            <p className="mt-0.5 text-muted-foreground">
              Ele tem todas as permissões, sempre. Se fosse editável, dava para
              remover a permissão de gerenciar perfis do único administrador — e
              aí ninguém conseguiria devolver, deixando o sistema trancado.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 flex flex-wrap gap-2">
        {PAPEIS_EDITAVEIS.map((p) => (
          <button
            key={p}
            onClick={() => setPapel(p)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors',
              papel === p
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            {ROLE_LABELS[p]}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{ROLE_LABELS[papel]}</span> tem{' '}
            <Badge variant="secondary">{concedidas.size}</Badge> de {permissoes?.length ?? 0}{' '}
            permissões.
          </p>

          {porModulo.map(([modulo, itens]) => (
            <section key={modulo}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {modulo}
              </h2>
              <div className="divide-y rounded-lg border">
                {itens.map((p) => {
                  const tem = concedidas.has(p.key);
                  return (
                    <label
                      key={p.key}
                      className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={tem}
                        disabled={alternar.isPending}
                        onCheckedChange={(v) =>
                          alternar.mutate({ chave: p.key, conceder: Boolean(v) })
                        }
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-none">{p.descricao}</p>
                        <code className="mt-1 block text-[11px] text-muted-foreground">
                          {p.key}
                        </code>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
