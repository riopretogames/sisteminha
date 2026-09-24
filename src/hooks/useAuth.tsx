import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Permission, Role } from '@/config/permissions';
import { lerEntrouComo, limparEntrouComo } from '@/lib/entrarComo';

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
 *
 * 4. Conta DESATIVADA não fica logada (achado 82 da revisão de 24/09). O banco
 *    já não entregava nada a ela, mas a pessoa entrava e caía numa tela que
 *    dizia "sua conta não tem perfil" — e o Felipe via o perfil preenchido e
 *    não entendia. Agora ela sai na hora e a tela de entrada diz o motivo
 *    certo. O caso comum é o "Trazer de volta" de Usuários, que devolve a
 *    pessoa à lista INATIVA de propósito.
 *
 * 5. A marca do "Entrar como" (lib/entrarComo.ts) é limpa aqui quando a conta
 *    sai, ou quando entra uma conta que não é a da marca — senão a faixa
 *    amarela sobraria para a próxima pessoa que entrasse naquele navegador.
 */

/** O aviso que a tela de entrada mostra quando a conta está desativada. */
export const AVISO_CONTA_DESATIVADA =
  'Sua conta está desativada. Fale com o administrador da loja para liberar o seu acesso.';

interface Profile {
  id: string;
  nome: string;
  email: string | null;
  tenant_id: string | null;
  avatar_url: string | null;
  ativo?: boolean | null;
  arquivado_em?: string | null;
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
  /**
   * Por que a pessoa foi posta para fora (ex.: conta desativada). A tela de
   * entrada mostra; `null` quando não há nada a dizer.
   */
  avisoDeEntrada: string | null;
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
  const [avisoDeEntrada, setAvisoDeEntrada] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let ativo = true;

    const aplicar = async (currentSession: Session | null) => {
      if (!ativo) return;
      setSession(currentSession);

      if (!currentSession?.user) {
        // Saiu (por aqui ou por outra aba): a faixa de "Entrar como" morre junto.
        limparEntrouComo();
        // E tudo o que a tela guardou da pessoa que saiu vai embora junto
        // (achado 21 da revisão de 24/09): no balcão o Pedro sai e o Gabriel
        // entra na mesma aba, e nenhuma lista do Pedro pode aparecer para o
        // Gabriel, nem por um instante, enquanto a do Gabriel carrega.
        queryClient.clear();
        setUser(null);
        setLoading(false);
        return;
      }

      // Entrou uma conta que não é a da marca de "Entrar como": a marca é de
      // outra história e não pode acender faixa nesta.
      const marca = lerEntrouComo();
      if (marca && marca.alvoId !== currentSession.user.id) limparEntrouComo();

      const { profile, roles, permissions } = await fetchAuthorization(currentSession.user.id);
      if (!ativo) return;

      // Conta desativada (ou arquivada, que desativa junto): sai na hora, com
      // o motivo certo. Só com o cadastro LIDO e dizendo "inativo" — se a
      // leitura falhou (sem internet), não se põe ninguém para fora por isso.
      if (profile && profile.ativo === false) {
        setAvisoDeEntrada(AVISO_CONTA_DESATIVADA);
        setUser(null);
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

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
    // O queryClient é o mesmo a vida inteira do app (App.tsx); entrar nas
    // dependências só serve para o linter, não refaz a inscrição.
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    // Tentativa nova, aviso velho some. Se a conta continuar desativada, o
    // aviso volta assim que o cadastro for lido.
    setAvisoDeEntrada(null);
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
      value={{ user, session, loading, signIn, signOut, can, canAny, hasRole, avisoDeEntrada }}
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
