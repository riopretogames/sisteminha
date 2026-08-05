import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Gamepad2, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
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
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  if (user) return <Navigate to="/home" replace />;

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
