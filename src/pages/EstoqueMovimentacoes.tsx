import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, dataHora } from '@/lib/format';
import { MOVIMENTO_TIPOS } from '@/lib/constants';
import { Indicador } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { RelatorioShell, usePeriodo, type Coluna } from './relatorios/RelatorioShell';

/**
 * Movimentações de Estoque — o histórico de auditoria que os gatilhos dos
 * Passos 1 e 2 (venda, ajuste manual, entrada de cadastro, peça de OS)
 * gravam em `movimentos_estoque`. Antes desses gatilhos, mudar estoque não
 * deixava rastro nenhum; esta tela é a primeira que mostra esse rastro.
 */

type MovimentoTipo = keyof typeof MOVIMENTO_TIPOS;

interface LinhaMovimento {
  id: string;
  produto_id: string;
  tipo: MovimentoTipo;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
  motivo: string | null;
  origem: string | null;
  saldo_anterior: number;
  saldo_depois: number;
  created_at: string;
  produtos: { nome: string } | null;
}

export default function EstoqueMovimentacoes() {
  const [periodo, setPeriodo] = usePeriodo();
  const { can } = useAuth();
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);

  const { data, isLoading } = useQuery({
    queryKey: ['estoque-movimentacoes', periodo.de, periodo.ate],
    queryFn: async (): Promise<LinhaMovimento[]> => {
      const { data, error } = await supabase
        .from('movimentos_estoque')
        .select('*, produtos(nome)')
        .gte('created_at', periodo.de)
        .lte('created_at', `${periodo.ate}T23:59:59`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaMovimento[];
    },
  });

  const linhas = data ?? [];
  const entradas = linhas.filter((m) => m.tipo === 'entrada' || m.quantidade > 0).length;
  const saidas = linhas.filter((m) => m.tipo === 'saida' || (m.tipo === 'ajuste' && m.quantidade < 0)).length;

  const colunas: Coluna<LinhaMovimento>[] = [
    {
      chave: 'data',
      titulo: 'Quando',
      render: (m) => <span className="whitespace-nowrap">{dataHora(m.created_at)}</span>,
      texto: (m) => dataHora(m.created_at),
    },
    {
      chave: 'produto',
      titulo: 'Produto',
      render: (m) => <span className="font-medium">{m.produtos?.nome ?? '—'}</span>,
      texto: (m) => m.produtos?.nome ?? '',
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      render: (m) => {
        const cfg = MOVIMENTO_TIPOS[m.tipo];
        return <Badge className={`${cfg?.cor ?? ''} border-0`}>{cfg?.label ?? m.tipo}</Badge>;
      },
      texto: (m) => MOVIMENTO_TIPOS[m.tipo]?.label ?? m.tipo,
    },
    {
      chave: 'quantidade',
      titulo: 'Quantidade',
      alinhar: 'direita',
      render: (m) => (
        <span className={m.quantidade < 0 ? 'text-red-600' : 'text-emerald-600'}>
          {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
        </span>
      ),
      texto: (m) => m.quantidade,
    },
    {
      chave: 'motivo',
      titulo: 'Motivo',
      render: (m) => m.motivo ?? '—',
      texto: (m) => m.motivo ?? '',
    },
    {
      chave: 'origem',
      titulo: 'Origem',
      render: (m) => <span className="text-muted-foreground">{m.origem ?? '—'}</span>,
      texto: (m) => m.origem ?? '',
    },
    {
      chave: 'saldo',
      titulo: 'Saldo depois',
      alinhar: 'direita',
      render: (m) => m.saldo_depois,
      texto: (m) => m.saldo_depois,
    },
    ...(veCusto
      ? ([
          {
            chave: 'valor_total',
            titulo: 'Valor',
            alinhar: 'direita',
            render: (m) => moeda(Number(m.valor_total)),
            texto: (m) => Number(m.valor_total).toFixed(2).replace('.', ','),
            somar: (m) => Number(m.valor_total),
            formatarTotal: moeda,
          },
        ] as Coluna<LinhaMovimento>[])
      : []),
  ];

  return (
    <RelatorioShell
      titulo="Movimentações de Estoque"
      hint="Auditoria de tudo que mexeu no estoque no período: vendas, ajustes manuais, cadastro de produto novo e peças usadas em OS."
      arquivo="movimentacoes_estoque"
      colunas={colunas}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      vazio="Nenhuma movimentação de estoque neste período."
      indicadores={
        <>
          <Indicador rotulo="Movimentações" valor={String(linhas.length)} detalhe="No período" />
          <Indicador rotulo="Entradas" valor={String(entradas)} tom="positivo" />
          <Indicador rotulo="Saídas" valor={String(saidas)} tom="negativo" />
        </>
      }
    />
  );
}
