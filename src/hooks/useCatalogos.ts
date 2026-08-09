import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

/**
 * Acesso aos catálogos (tabelas de apoio).
 *
 * Um hook serve TODOS os tipos — marca, cor, condição, checklist, origem... —
 * porque no banco todos vivem na mesma tabela `catalogos`, discriminados pela
 * coluna `tipo`. É o que permite ter uma tela só para doze cadastros.
 */

export interface CatalogoItem {
  id: string;
  tenant_id: string;
  tipo: string;
  descricao: string;
  cor: string | null;
  ordem: number;
  ativo: boolean;
  padrao: boolean;
}

export function useCatalogo(tipo: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;

  const chave = ['catalogos', tipo];

  const query = useQuery({
    queryKey: chave,
    enabled: Boolean(tipo),
    queryFn: async (): Promise<CatalogoItem[]> => {
      const { data, error } = await db
        .from('catalogos')
        .select('*')
        .eq('tipo', tipo)
        .order('ordem', { ascending: true })
        .order('descricao', { ascending: true });

      if (error) throw error;
      return (data ?? []) as CatalogoItem[];
    },
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: chave });

  const aoFalhar = (error: unknown) => {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    toast({
      title: 'Não foi possível salvar',
      // Mensagem de RLS é críptica; traduz pro que de fato aconteceu.
      description: /row-level security|policy/i.test(msg)
        ? 'Seu perfil de acesso não permite alterar este cadastro.'
        : msg,
      variant: 'destructive',
    });
  };

  const criar = useMutation({
    mutationFn: async (descricao: string) => {
      if (!tenantId) throw new Error('Usuário sem loja vinculada.');

      const proximaOrdem =
        Math.max(0, ...(query.data ?? []).map((i) => i.ordem)) + 10;

      // Devolve o item criado: quem cadastra no meio de um formulário (o campo
      // de lista da Nova OS, por exemplo) precisa do id para já deixá-lo
      // escolhido, sem obrigar a pessoa a procurar de novo o que acabou de
      // digitar.
      const { data, error } = await db
        .from('catalogos')
        .insert({
          tenant_id: tenantId,
          tipo,
          descricao: descricao.trim(),
          ordem: proximaOrdem,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as CatalogoItem;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  const renomear = useMutation({
    mutationFn: async ({ id, descricao }: { id: string; descricao: string }) => {
      const { error } = await db
        .from('catalogos')
        .update({ descricao: descricao.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  /**
   * Desativa em vez de excluir. Item de catálogo costuma estar referenciado por
   * venda ou OS antiga — apagar reescreveria o histórico.
   */
  const alternarAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await db.from('catalogos').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  const definirPadrao = useMutation({
    mutationFn: async (id: string) => {
      // Só pode existir um padrão por tipo (índice único parcial no banco),
      // então limpa o anterior antes de marcar o novo.
      const atual = (query.data ?? []).find((i) => i.padrao);
      if (atual && atual.id !== id) {
        const { error } = await db
          .from('catalogos')
          .update({ padrao: false })
          .eq('id', atual.id);
        if (error) throw error;
      }

      const { error } = await db.from('catalogos').update({ padrao: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  return { ...query, criar, renomear, alternarAtivo, definirPadrao };
}
