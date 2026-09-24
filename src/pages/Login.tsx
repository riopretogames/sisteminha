import { useEffect, useState } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { Gamepad2, Mail, Lock, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { gravarEntrouComo } from '@/lib/entrarComo';

/**
 * Tela de entrada do RPG System.IO.
 *
 * A aba "Cadastrar" foi REMOVIDA. Este é um ERP interno: qualquer pessoa com a
 * URL publicada conseguia criar conta e, por um encadeamento de falhas (papel
 * atribuído pelo client → insert barrado pela policy → erro não checado →
 * usuário sem papel → menu tratava "sem papel" como admin), essa conta acabava
 * enxergando o menu de administrador.
 *
 * Usuário agora é criado por quem tem `users.manage`, em Cadastros → Usuários.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, user, avisoDeEntrada } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Link de "Entrar como" aberto numa janela anônima: o acesso de uso único
  // vem no endereço (?acesso=) e vira a sessão da pessoa, sem senha. Ver
  // lib/entrarComo.ts. O efeito vem ANTES do redirecionamento abaixo porque
  // hook não pode ficar depois de um return.
  //
  // Achado 75 da revisão de 24/09: o link era aplicado MESMO com alguém já
  // logado naquele navegador. Colado numa janela normal, trocava a conta do
  // administrador pela do funcionário — em todas as abas, sem faixa nenhuma.
  // Agora, com alguém logado, o link não é usado e a tela explica o porquê.
  const [searchParams] = useSearchParams();
  const acesso = searchParams.get('acesso');
  const [linkRecusado, setLinkRecusado] = useState(false);
  useEffect(() => {
    if (!acesso) return;
    let ativo = true;
    setLoading(true);
    void (async () => {
      const { data: atual } = await supabase.auth.getSession();
      if (atual?.session) {
        // Sem conferir `ativo`: a decisão de NÃO usar o link vale mesmo que a
        // tela já tenha mudado.
        setLinkRecusado(true);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({ token_hash: acesso, type: 'magiclink' });
      if (!error && data?.user) {
        // A faixa amarela também nesta janela: quem abriu o link está vendo o
        // sistema como outra pessoa, e tudo que fizer sai no nome dela.
        const meta = (data.user.user_metadata ?? {}) as { nome?: unknown };
        gravarEntrouComo({
          alvoId: data.user.id,
          nome: typeof meta.nome === 'string' && meta.nome ? meta.nome : data.user.email ?? 'outra pessoa',
          por: '',
          quando: new Date().toISOString(),
        });
      }
      if (!ativo) return;
      setLoading(false);
      if (error) {
        toast({
          title: 'Este link de acesso não vale mais',
          description: 'Ele vale por uma hora e só uma vez. Peça outro em Cadastros › Usuários.',
          variant: 'destructive',
        });
      } else {
        navigate('/home', { replace: true });
      }
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acesso]);

  if (acesso && linkRecusado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Já tem uma conta aberta neste navegador
            </CardTitle>
            <CardDescription>
              Este link de acesso não foi usado. Se fosse, a sua conta seria trocada pela da outra
              pessoa em todas as abas do sisteminha abertas aqui, e o que você fizesse sairia no nome
              dela.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Para entrar como a outra pessoa sem sair da sua conta, copie o link e abra numa{' '}
            <strong>janela anônima</strong> (Ctrl+Shift+N no Chrome).
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => navigate('/home', { replace: true })}>
              Continuar na minha conta
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (user && !acesso) return <Navigate to="/home" replace />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({
        title: 'Não foi possível entrar',
        description:
          error.message === 'Invalid login credentials'
            ? 'E-mail ou senha incorretos.'
            : error.message,
        variant: 'destructive',
      });
    } else {
      navigate('/home');
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg">
            <Gamepad2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            RPG System<span className="text-primary">.IO</span>
          </h1>
          <p className="mt-1 text-muted-foreground">Sistema de gestão da Rio Preto Games</p>
        </div>

        <Card className="shadow-xl">
          <form onSubmit={handleSignIn}>
            <CardHeader>
              <CardTitle className="text-lg">Entrar</CardTitle>
              <CardDescription>Use o e-mail cadastrado pela loja.</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {avisoDeEntrada && (
                <p
                  role="alert"
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
                >
                  {avisoDeEntrada}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-0 top-0 h-10 w-10 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>

            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Sem acesso? Peça a um administrador da loja para criar seu usuário.
        </p>
      </div>
    </div>
  );
}
