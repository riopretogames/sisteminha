import { supabase } from '@/integrations/supabase/client';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import { somarFaturamento } from '@/lib/faturamento';

/**
 * O dinheiro das vendas do balcão (PDV) num período, para as telas do
 * Financeiro.
 *
 * Por que existe (achado 57 da revisão de 24/09/2026): o Fluxo de Caixa e o
 * Relatório Financeiro liam só `titulos_financeiros`. A entrega de OS e a
 * entrada de mercadoria criam título sozinhas; a venda do balcão, não. Em
 * agosto a loja vendeu R$ 36.871,20 e o Fluxo mostrou "Entrou R$ 150,00" —
 * só a OS. A venda, que é a maior entrada da loja, não aparecia nunca.
 *
 * O caminho escolhido não mexe no banco: as duas telas somam as vendas do
 * período numa linha própria, "Vendas do balcão", com a MESMA régua do
 * Relatório de Vendas — faturamento real das vendas não canceladas, menos o
 * dinheiro devolvido a cliente no período. Assim o Fluxo e o Relatório de
 * Vendas contam a mesma história. (A outra saída seria o banco criar um título
 * por venda; fica anotada como alternativa para o Felipe decidir.)
 *
 * As datas seguem a mesma convenção do Relatório de Vendas (`de` e `ate` são
 * datas puras; o último dia vai até 23:59:59), justamente para os números
 * baterem entre as duas telas.
 */

export interface VendasDoBalcao {
  /** Faturamento real das vendas não canceladas do período. */
  faturamento: number;
  /** Dinheiro devolvido a cliente no período (sai do faturamento). */
  devolvido: number;
  /** O que entra na conta: faturamento − devolvido. */
  liquido: number;
  /** Quantas vendas (não canceladas) o período teve. */
  quantidade: number;
}

export async function buscarVendasDoBalcao(de: string, ate: string): Promise<VendasDoBalcao> {
  const ateFim = `${ate}T23:59:59`;

  // Em páginas: um período de ano inteiro passa das 1.000 linhas em que o
  // Supabase corta calado (lib/buscarEmPaginas.ts).
  const [vendas, devolucoes] = await Promise.all([
    buscarEmPaginas<{ total: number | null; valor_faturamento_real: number | null }>(() =>
      supabase
        .from('vendas')
        .select('id, total, valor_faturamento_real')
        .gte('created_at', de)
        .lte('created_at', ateFim)
        .neq('status', 'cancelado')
        .order('created_at')
        .order('id'),
    ),
    buscarEmPaginas<{ valor_devolvido_cliente: number | null }>(() =>
      supabase
        .from('devolucoes')
        .select('id, valor_devolvido_cliente')
        .gte('created_at', de)
        .lte('created_at', ateFim)
        .order('created_at')
        .order('id'),
    ),
  ]);

  const faturamento = somarFaturamento(vendas);
  const devolvido = devolucoes.reduce((s, d) => s + Number(d.valor_devolvido_cliente ?? 0), 0);
  return { faturamento, devolvido, liquido: faturamento - devolvido, quantidade: vendas.length };
}
