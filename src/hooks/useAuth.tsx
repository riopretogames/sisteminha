import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthUser extends User {
  profile?: {
    id: string;
    nome: string;
    email: string | null;
    tenant_id: string | null;
    avatar_url: string | null;
  };
  roles?: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // Fetch roles
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      return {
        profile: profile || undefined,
        roles: roles?.map(r => r.role) || [],
      };
    } catch (error) {
      console.error('Error fetching user data:', error);
      return { profile: undefined, roles: [] };
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        
        if (currentSession?.user) {
          // Defer profile fetch to avoid blocking
          setTimeout(async () => {
            const { profile, roles } = await fetchUserProfile(currentSession.user.id);
            setUser({
              ...currentSession.user,
              profile,
              roles,
            });
            setLoading(false);
          }, 0);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      if (existingSession?.user) {
        setSession(existingSession);
        const { profile, roles } = await fetchUserProfile(existingSession.user.id);
        setUser({
          ...existingSession.user,
          profile,
          roles,
        });
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, nome: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome },
      },
    });

    if (!error && data.user) {
      // Create default tenant for new user
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({ nome_loja: `Loja de ${nome}` })
        .select()
        .single();

      if (!tenantError && tenant) {
        // Create profile
        await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            tenant_id: tenant.id,
            nome,
            email,
          });

        // Assign admin role
        await supabase
          .from('user_roles')
          .insert({
            user_id: data.user.id,
            role: 'admin',
          });
      }
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const hasRole = (role: string) => {
    return user?.roles?.includes(role) || false;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
