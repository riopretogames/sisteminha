import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
// `role_permissions` ainda não está em types.ts — ver untyped.ts.
import { db } from '@/integrations/supabase/untyped';
import type { User, Session } from '@supabase/supabase-js';
import type { Permission, Role } from '@/config/permissions';

/**
 * Autenticação e autorização do RPG System.IO.
 *
 * MUDANÇAS IMPORTANTES em relação à versão anterior:
 *
 * 1. Não existe mais `signUp` no client. Criar usuário é ato administrativo,
 *    de quem tem `users.manage`. O provisionamento de profile e papel acontece
 *    no banco, no trigger `handle_new_user` — o client não tem voz nisso.
 *    Antes, o client tentava se autoatribuir 'admin', a policy barrava, o erro
 *    não era checado e o usuário terminava sem papel nenhum.
 *
 * 2. Autorização é por PERMISSÃO (`can`), não por papel. `hasRole` continua
 *    disponível para quando a pergunta for genuinamente sobre o papel, mas
 *    telas e menus usam `can()`. Papel é COMO a permissão é atribuída — não é
 *    a pergunta que a interface deve fazer.
 *
 * 3. Ausência de papel NÃO é privilégio. Usuário sem papel enxerga o mínimo,
 *    nunca o máximo. É o oposto exato do comportamento anterior.
 */

interface Profile {
  id: string;
  nome: string;
  email: string | null;
  tenant_id: string | null;
  avatar_url: string | null;
}

interface AuthUser extends User {
  profile?: Profile;
  roles: Role[];
  permissions: Permission[];
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /** Verificação de permissão. É esta que a interface deve usar. */
  can: (permission: Permission) => boolean;
  /** Verdadeiro se o usuário tiver QUALQUER uma das permissões. */
  canAny: (permissions: Permission[]) => boolean;
  /** Use só quando a pergunta for genuinamente sobre o papel. */
  hasRole: (role: Role) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchAuthorization(userId: string): Promise<{
  profile?: Profile;
  roles: Role[];
  permissions: Permission[];
}> {
  try {
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ]);

    const roles = (roleRows?.map((r) => r.role) ?? []) as Role[];

    // As permissões vêm RESOLVIDAS do banco, pela mesma função que o RLS usa.
    // Ler `role_permissions` aqui daria resposta errada: ignoraria as exceções
    // por usuário e não respeitaria conta desativada. Com a RPC, front e banco
    // não têm como divergir.
    const { data: permRows } = await supabase.rpc('minhas_permissoes');

    const permissions = ((permRows ?? []) as string[]) as Permission[];

    return { profile: (profile as Profile) ?? undefined, roles, permissions };
  } catch (error) {
    // Falha ao carregar autorização = usuário sem poder nenhum. Falhar fechado.
    console.error('Falha ao carregar autorização do usuário:', error);
    return { profile: undefined, roles: [], permissions: [] };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;

    const aplicar = async (currentSession: Session | null) => {
      if (!ativo) return;
      setSession(currentSession);

      if (!currentSession?.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      const { profile, roles, permissions } = await fetchAuthorization(currentSession.user.id);
      if (!ativo) return;

      setUser({ ...currentSession.user, profile, roles, permissions });
      setLoading(false);
    };

    // Listener primeiro, para não perder o evento inicial de sessão.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      // Adiado: não bloquear o callback do Supabase com I/O.
      setTimeout(() => void aplicar(currentSession), 0);
    });

    void supabase.auth.getSession().then(({ data }) => aplicar(data.session));

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const can = useCallback(
    (permission: Permission) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const canAny = useCallback(
    (permissions: Permission[]) => permissions.some((p) => user?.permissions.includes(p)),
    [user],
  );

  const hasRole = useCallback((role: Role) => user?.roles.includes(role) ?? false, [user]);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, signOut, can, canAny, hasRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth precisa estar dentro de um AuthProvider');
  }
  return context;
}
