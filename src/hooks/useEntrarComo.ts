import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { gravarEntrouComo, mensagemDoAcesso, montarLinkDeAcesso } from '@/lib/entrarComo';

/**
 * Os dois botões de "Entrar como" da ficha do usuário (Cadastros > Usuários).
 * O porquê do recurso está em lib/entrarComo.ts.
 *
 * Moravam em useUsuarios até a revisão de 24/09. Saíram para cá porque a
 * marca da faixa passou a precisar do id da pessoa (achado 16), e o que é do
 * "Entrar como" fica todo num lugar só: marca, link, mensagens.
 */

/**
 * Fala com a função de servidor `admin-usuarios` e traz a mensagem de verdade
 * (a frase útil vem no corpo da resposta; a biblioteca a esconde dentro do
 * objeto de erro). Mesma conversa que useUsuarios faz com a mesma função.
 */
async function pedirAcesso(userId: string, modo: 'entrar' | 'link') {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', {
    // `modo` diz ao servidor o que registrar na auditoria: "Entrou como" ou só
    // "Gerou link de acesso" — o link pode nunca ser aberto (achado 23).
    body: { acao: 'entrar_como', user_id: userId, modo },
  });
  if (error) {
    let mensagem = error.message;
    const resposta = (error as { context?: Response }).context;
    if (resposta && typeof resposta.json === 'function') {
      try {
        const corpoDoErro = await resposta.json();
        if (corpoDoErro?.erro) mensagem = String(corpoDoErro.erro);
      } catch {
        // Resposta sem JSON: fica a mensagem original.
      }
    }
    throw new Error(mensagem);
  }
  const resposta = (data ?? {}) as Record<string, unknown>;
  const tokenHash = String(resposta.token_hash ?? '');
  if (!tokenHash) throw new Error('O servidor não devolveu o acesso.');
  return { tokenHash, nome: String(resposta.nome ?? '') };
}

export function useEntrarComo() {
  const { user } = useAuth();
  const { toast } = useToast();

  /**
   * Entra na conta de outra pessoa, para ver o sistema como ela vê.
   *
   * A sessão do navegador vira a da pessoa e a página recarrega inteira, de
   * propósito: tudo que está em cache (permissões, menu, listas) é da conta de
   * quem clicou, e não pode sobrar nada dela na tela do outro.
   */
  const entrarComo = useMutation({
    mutationFn: async (dados: { userId: string; nome: string }) => {
      const { tokenHash, nome } = await pedirAcesso(dados.userId, 'entrar');
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      if (error) throw error;
      gravarEntrouComo({
        alvoId: dados.userId,
        nome: nome || dados.nome,
        por: user?.profile?.nome ?? '',
        quando: new Date().toISOString(),
      });
      window.location.assign(import.meta.env.BASE_URL.replace(/\/$/, '') + '/home');
    },
    onError: (error: unknown) => {
      toast({
        title: 'Não foi possível entrar como essa pessoa',
        description: mensagemDoAcesso(error),
        variant: 'destructive',
      });
    },
  });

  /**
   * O mesmo acesso, mas como link para abrir numa janela anônima — assim o
   * administrador testa como a pessoa sem sair da própria conta.
   *
   * Se o navegador não deixar copiar sozinho, o acesso já foi gerado (e está
   * na auditoria): em vez de jogar fora e pedir outro, mostra o link numa
   * caixinha para copiar à mão.
   */
  const linkDeAcesso = useMutation({
    mutationFn: async (userId: string) => {
      const { tokenHash, nome } = await pedirAcesso(userId, 'link');
      const link = montarLinkDeAcesso(window.location.origin, import.meta.env.BASE_URL, tokenHash);
      try {
        await navigator.clipboard.writeText(link);
        return { nome, copiado: true };
      } catch {
        window.prompt('O navegador não deixou copiar sozinho. Copie o link abaixo (Ctrl+C):', link);
        return { nome, copiado: false };
      }
    },
    onSuccess: ({ nome, copiado }) => {
      toast({
        title: copiado ? 'Link copiado' : 'Link gerado',
        description:
          'Abra numa janela anônima para entrar como ' + (nome || 'essa pessoa') +
          ' sem sair da sua conta. Vale por uma hora e só uma vez.',
        variant: 'success',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Não foi possível gerar o link',
        description: mensagemDoAcesso(error),
        variant: 'destructive',
      });
    },
  });

  return { entrarComo, linkDeAcesso };
}
