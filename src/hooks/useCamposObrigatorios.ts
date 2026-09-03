import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  CAMPOS_POR_FORMULARIO,
  exigenciasDaLoja,
  type Condicao,
  type Formulario,
} from '@/config/camposObrigatorios';

/**
 * O que esta loja exige neste formulário.
 *
 * Lê a tabela `campos_obrigatorios` (só as exceções) e junta com o padrão do
 * código. Enquanto a consulta não volta, vale o padrão — assim o formulário
 * nunca fica sem regra nenhuma por causa de internet lenta.
 *
 * ⚠️ MAS QUEM CHAMA PRECISA OLHAR O `falhou`. Cair no padrão é seguro no
 * cadastro de cliente e na OS, onde o padrão EXIGE coisas: falhar cobra
 * demais, que é chato mas visível. Na venda o padrão não exige nada, então
 * falhar cobra de MENOS — a tela fica idêntica a "a dona não configurou nada"
 * e a venda fecha sem o que ela exigiu, em silêncio. Por isso o PDV avisa.
 *
 * A leitura é livre dentro da loja de propósito (ver a migration): o vendedor
 * precisa saber o que a loja exige, senão a tela cobraria uma lista e o dono
 * teria configurado outra.
 */
export function useCamposObrigatorios(formulario: Formulario) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['campos-obrigatorios', formulario],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campos_obrigatorios')
        .select('campo, obrigatorio')
        .eq('formulario', formulario);
      if (error) throw error;
      return data ?? [];
    },
    // A configuração muda uma vez por ano; não faz sentido reconsultar a cada
    // abertura de tela.
    staleTime: 5 * 60 * 1000,
  });

  const exigencias = exigenciasDaLoja(formulario, data);

  /**
   * Este campo é obrigatório agora?
   *
   * `situacao` diz em que caso a tela está — pessoa física ou jurídica, no
   * cadastro de cliente. Campo que não aparece na tela nunca é cobrado: pedir
   * "data de nascimento" de uma empresa seria cobrar um campo invisível.
   */
  const exige = (campo: string, situacao: Condicao = 'sempre'): boolean => {
    if (!exigencias[campo]) return false;
    const definicao = CAMPOS_POR_FORMULARIO[formulario].find((c) => c.chave === campo);
    const quando = definicao?.condicao ?? 'sempre';
    if (quando === 'sempre') return true;
    return quando === situacao;
  };

  return { exige, exigencias, carregando: isLoading, falhou: isError };
}
