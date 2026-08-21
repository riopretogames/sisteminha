import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { hojeISO, diasAte } from '@/lib/format';

/**
 * Contas a pagar e a receber.
 *
 * As duas vivem na mesma tabela (`titulos_financeiros`), separadas por
 * `natureza`. Este hook é parametrizado por ela — a tela de pagar e a de
 * receber são o mesmo componente com um parâmetro diferente.
 */

export type NaturezaTitulo = 'pagar' | 'receber';
export type StatusTitulo = 'aberto' | 'pago' | 'cancelado';
/** Status como o usuário enxerga. "vencido" é derivado, não gravado. */
export type SituacaoTitulo = 'pago' | 'vencido' | 'vence_hoje' | 'a_vencer' | 'cancelado';

export interface Titulo {
  id: string;
  tenant_id: string;
  natureza: NaturezaTitulo;
  descricao: string;
  categoria_id: string | null;
  valor: number;
  valor_pago: number;
  vencimento: string;
  competencia: string | null;
  status: StatusTitulo;
  pago_em: string | null;
  observacoes: string | null;
  /** De quem é a conta. Só um dos dois é usado, conforme a natureza:
   *  a pagar vincula fornecedor, a receber vincula cliente. As colunas
   *  existiam desde a criação da tabela e nunca eram preenchidas — sem elas
   *  não dá pra responder "quanto o cliente X me deve". */
  fornecedor_id: string | null;
  cliente_id: string | null;
  categorias_financeiras?: { nome: string } | null;
  fornecedores?: { nome: string } | null;
  clientes?: { nome: string } | null;
}

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  natureza: 'receita' | 'despesa';
  ativo: boolean;
}

/**
 * Situação real do título.
 *
 * "Vencido" é calculado na hora, e não guardado numa coluna, porque coluna de
 * status vencido exige um job diário para virar — e no dia em que o job falha,
 * o sistema mostra como "a vencer" algo que venceu há uma semana.
 */
export function situacaoDoTitulo(t: Titulo): SituacaoTitulo {
  if (t.status === 'cancelado') return 'cancelado';
  if (t.status === 'pago') return 'pago';

  const dias = diasAte(t.vencimento);
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'vence_hoje';
  return 'a_vencer';
}

export const SITUACAO_META: Record<SituacaoTitulo, { label: string; classe: string }> = {
  pago: { label: 'Pago', classe: 'bg-emerald-500/10 text-emerald-600' },
  vencido: { label: 'Vencido', classe: 'bg-red-500/10 text-red-600' },
  vence_hoje: { label: 'Vence hoje', classe: 'bg-amber-500/10 text-amber-600' },
  a_vencer: { label: 'A vencer', classe: 'bg-blue-500/10 text-blue-600' },
  cancelado: { label: 'Cancelado', classe: 'bg-muted text-muted-foreground' },
};

export function useCategoriasFinanceiras(natureza: 'receita' | 'despesa') {
  return useQuery({
    queryKey: ['categorias-financeiras', natureza],
    queryFn: async (): Promise<CategoriaFinanceira[]> => {
      const { data, error } = await db
        .from('categorias_financeiras')
        .select('id, nome, natureza, ativo')
        .eq('natureza', natureza)
        .eq('ativo', true)
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as CategoriaFinanceira[];
    },
  });
}

export function useTitulos(natureza: NaturezaTitulo) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;

  const chave = ['titulos', natureza];

  const query = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Titulo[]> => {
      const { data, error } = await db
        .from('titulos_financeiros')
        .select('*, categorias_financeiras(nome), fornecedores(nome), clientes(nome)')
        .eq('natureza', natureza)
        .order('vencimento', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Titulo[];
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: chave });
    queryClient.invalidateQueries({ queryKey: ['fluxo-caixa'] });
  };

  const aoFalhar = (error: unknown) => {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    toast({
      title: 'Não foi possível salvar',
      description: /row-level security|policy/i.test(msg)
        ? 'Seu perfil de acesso não permite alterar este título.'
        : msg,
      variant: 'destructive',
    });
  };

  const criar = useMutation({
    mutationFn: async (dados: {
      descricao: string;
      valor: number;
      vencimento: string;
      categoria_id: string | null;
      observacoes: string | null;
      fornecedor_id?: string | null;
      cliente_id?: string | null;
    }) => {
      if (!tenantId) throw new Error('Usuário sem loja vinculada.');

      const { error } = await db.from('titulos_financeiros').insert({
        tenant_id: tenantId,
        natureza,
        criado_por: user?.id,
        // Competência assume o mês do vencimento; ajustável depois.
        competencia: dados.vencimento.slice(0, 8) + '01',
        ...dados,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  const baixar = useMutation({
    mutationFn: async (titulo: Titulo) => {
      const { error } = await db
        .from('titulos_financeiros')
        .update({ status: 'pago', valor_pago: titulo.valor, pago_em: hojeISO() })
        .eq('id', titulo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast({ title: 'Título baixado' });
    },
    onError: aoFalhar,
  });

  const reabrir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from('titulos_financeiros')
        .update({ status: 'aberto', valor_pago: 0, pago_em: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  /** Cancela em vez de excluir: título apagado some do histórico financeiro. */
  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from('titulos_financeiros')
        .update({ status: 'cancelado' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  return { ...query, criar, baixar, reabrir, cancelar };
}
