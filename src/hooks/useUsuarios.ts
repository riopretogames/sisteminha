import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Role, Permission } from '@/config/permissions';

/**
 * Gestão de usuários da loja.
 *
 * Três camadas se combinam para dizer o que uma pessoa pode fazer:
 *
 *   1. Ativo  — conta desativada não pode nada, independente do resto
 *   2. Perfil — a base (Vendedor, Técnico...)
 *   3. Exceção — ajuste fino por pessoa, sobre o perfil
 *
 * A verdade final é a função `has_permission` no banco. Este hook só monta a
 * visão para a tela — nunca decide acesso.
 */

export interface UsuarioLinha {
  id: string;
  nome: string;
  email: string | null;
  ativo: boolean;
  role: Role | null;
}

export interface ExcecaoUsuario {
  permission_key: string;
  concedida: boolean;
  motivo: string | null;
  definida_por: string | null;
}

export function useUsuarios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const aoFalhar = (error: unknown) => {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    toast({
      title: 'Não foi possível salvar',
      description: /row-level security|policy/i.test(msg)
        ? 'Seu perfil de acesso não permite gerenciar usuários.'
        : msg,
      variant: 'destructive',
    });
  };

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['usuarios'] });

  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: async (): Promise<UsuarioLinha[]> => {
      const [{ data: perfis, error: e1 }, { data: papeis, error: e2 }] = await Promise.all([
        supabase.from('profiles').select('id, nome, email, ativo').order('nome'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const papelDe = new Map((papeis ?? []).map((p) => [p.user_id, p.role as Role]));

      return (perfis ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        email: p.email,
        ativo: p.ativo ?? true,
        role: papelDe.get(p.id) ?? null,
      }));
    },
  });

  const definirPapel = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      // Um papel por pessoa: apaga o anterior antes de gravar o novo — mas os
      // dois passos rodam DENTRO do banco, na mesma transação.
      //
      // Antes eram duas chamadas soltas daqui. Se a segunda falhasse (queda de
      // rede, aba fechada), a pessoa ficava SEM PAPEL NENHUM — ou seja, sem
      // acesso ao sistema, em silêncio, sem ninguém ter pedido isso. E quem
      // estava trocando via a mensagem de erro e supunha que "não mudou nada".
      //
      // A função mantém o DELETE de propósito, em vez de virar um upsert: o
      // gatilho que impede tirar o papel do último administrador ativo é um
      // BEFORE DELETE, e sem o DELETE ele deixaria de disparar.
      const { error } = await supabase.rpc('trocar_papel_do_usuario', {
        _user_id: userId,
        _role: role,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  const definirAtivo = useMutation({
    mutationFn: async ({ userId, ativo }: { userId: string; ativo: boolean }) => {
      const { error } = await supabase.from('profiles').update({ ativo }).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast({
        title: 'Acesso atualizado',
        description:
          'Usuário desativado perde acesso a tudo imediatamente, mas o histórico do que ele fez é preservado.',
        variant: 'success',
      });
    },
    onError: aoFalhar,
  });

  const renomear = useMutation({
    mutationFn: async ({ userId, nome }: { userId: string; nome: string }) => {
      const { error } = await supabase.from('profiles').update({ nome: nome.trim() }).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  return { usuarios, definirPapel, definirAtivo, renomear };
}

/** Exceções de permissão de UMA pessoa. */
export function useExcecoes(userId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const chave = ['excecoes', userId];

  const query = useQuery({
    queryKey: chave,
    enabled: Boolean(userId),
    queryFn: async (): Promise<ExcecaoUsuario[]> => {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('permission_key, concedida, motivo, definida_por')
        .eq('user_id', userId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  /**
   * Aplica o estado desejado de uma permissão.
   *
   * Grava exceção só quando o desejado DIFERE do que o perfil concede. Se o
   * usuário volta a bater com o perfil, a exceção é apagada em vez de virar
   * "exceção que não muda nada" — senão a lista de exceções cresce com ruído e
   * ninguém consegue ver o que realmente foi customizado.
   *
   * Achado na revisão de 18/08: a tabela já tinha colunas `motivo`/
   * `definida_por` desde o início, mas esta mutation nunca as preenchia — a
   * exceção mais sensível da tela de Usuários não deixava rastro de quem
   * decidiu nem por quê. `definida_por` agora é gravado sempre (quem está
   * logado, aqui e agora); `motivo` é opcional (ver `definirMotivo` abaixo,
   * chamado à parte pela tela, sem travar o clique rápido do checkbox).
   */
  const aplicar = useMutation({
    mutationFn: async ({
      permissao,
      desejado,
      perfilConcede,
    }: {
      permissao: Permission;
      desejado: boolean;
      perfilConcede: boolean;
    }) => {
      if (!userId) throw new Error('Usuário não selecionado.');

      if (desejado === perfilConcede) {
        const { error } = await supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('permission_key', permissao);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from('user_permissions').upsert(
        {
          user_id: userId,
          permission_key: permissao,
          concedida: desejado,
          definida_por: user?.id ?? null,
        },
        { onConflict: 'user_id,permission_key' },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Não foi possível alterar',
        description: /row-level security|policy/i.test(msg)
          ? 'Só quem tem "Alterar perfis e permissões" pode criar exceções.'
          : msg,
        variant: 'destructive',
      });
    },
  });

  /** Grava (ou limpa) só o motivo de uma exceção já existente — separado de
   * `aplicar` pra editar a justificativa não exigir remarcar o checkbox. */
  const definirMotivo = useMutation({
    mutationFn: async ({ permissao, motivo }: { permissao: Permission; motivo: string }) => {
      if (!userId) throw new Error('Usuário não selecionado.');
      const { error } = await supabase
        .from('user_permissions')
        .update({ motivo: motivo.trim() || null, definida_por: user?.id ?? null })
        .eq('user_id', userId)
        .eq('permission_key', permissao);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Não foi possível salvar o motivo',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  return { ...query, aplicar, definirMotivo };
}
