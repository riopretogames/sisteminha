import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Quanto a loja cobra pela análise quando o cliente NÃO aprova o orçamento.
 *
 * Uma pergunta só, num lugar só: o número aparece em três telas — a que o
 * configura, a que avisa o vendedor na abertura da OS, e a que registra a
 * recusa. Cada uma perguntando por conta própria é como uma delas acaba
 * mostrando R$ 80 depois de a loja ter mudado para R$ 100.
 *
 * **O que este número NÃO faz**, e vale escrito porque o contrário parece
 * natural: ele não entra na conta do serviço aprovado. Regra do Felipe
 * (31/08, confirmada em 01/09): *"o laudo eletrônico só é cobrado quando o
 * cliente recusa o serviço. Quando aprova, é cobrado o valor que está no
 * laudo — a limpeza de R$ 180 vai ser cobrada R$ 180"*. A loja diz ao cliente
 * que "abate os R$ 80" — e isso é conversa de venda, não conta: o valor do
 * laudo já é o valor final. Se algum dia aparecer código subtraindo a taxa de
 * um orçamento aprovado, é bug, não regra.
 *
 * Zero é resposta válida: significa "esta loja não cobra análise".
 */
export function useTaxaDeAnalise(opcoes: { habilitado?: boolean } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: ['taxa-analise-da-loja'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from('tenants').select('taxa_analise').maybeSingle();
      if (error) throw error;
      return Number(data?.taxa_analise ?? 0);
    },
    enabled: opcoes.habilitado ?? true,
    staleTime: 5 * 60 * 1000,
  });

  return { taxa: data ?? 0, carregando: isLoading };
}
