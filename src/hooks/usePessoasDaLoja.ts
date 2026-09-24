import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Pessoa } from '@/types/tarefas';

/**
 * Quem trabalha na loja hoje: contas ativas e não arquivadas, em ordem de nome.
 *
 * É a lista dos seletores de pessoa e do filtro "pessoa" dos quadros. Vem do
 * CADASTRO, nunca "de quem aparece nas tarefas carregadas" — lição da Luana:
 * ela sumia do filtro de vendas só porque ainda não tinha vendido, e a
 * gerente achava que o cadastro dela estava quebrado. Aqui seria igual: quem
 * ainda não tem tarefa nenhuma não poderia receber a primeira.
 */
export function usePessoasDaLoja() {
  return useQuery({
    queryKey: ['pessoas-da-loja'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Pessoa[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, avatar_url')
        .eq('ativo', true)
        // `is` e não `eq`: em SQL, comparar com nulo nunca dá verdadeiro.
        .is('arquivado_em', null)
        .order('nome');
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
  });
}
