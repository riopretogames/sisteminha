import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { RelatorioShell, usePeriodo, type Coluna } from './RelatorioShell';

interface LinhaVenda {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
  subtotal: number;
  descontos: number;
  total: number;
  clientes: { nome: string } | null;
}

const COLUNAS: Coluna<LinhaVenda>[] = [
  {
    chave: 'numero',
    titulo: 'Venda',
    render: (v) => <span className="font-medium">{v.numero_venda ?? '—'}</span>,
    texto: (v) => v.numero_venda ?? '',
  },
  {
    chave: 'data',
    titulo: 'Data',
    render: (v) => fmtData(v.created_at),
    texto: (v) => fmtData(v.created_at),
  },
  {
    chave: 'cliente',
    titulo: 'Cliente',
    render: (v) => v.clientes?.nome ?? 'Consumidor final',
    texto: (v) => v.clientes?.nome ?? 'Consumidor final',
  },
  {
    chave: 'status',
    titulo: 'Status',
    render: (v) => <span className="capitalize text-muted-foreground">{v.status}</span>,
    texto: (v) => v.status,
  },
  {
    chave: 'desconto',
    titulo: 'Desconto',
    alinhar: 'direita',
    render: (v) => (Number(v.descontos) ? moeda(Number(v.descontos)) : '—'),
    texto: (v) => Number(v.descontos).toFixed(2).replace('.', ','),
    somar: (v) => Number(v.descontos),
    formatarTotal: moeda,
  },
  {
    chave: 'total',
    titulo: 'Total',
    alinhar: 'direita',
    render: (v) => <span className="font-medium">{moeda(Number(v.total))}</span>,
    texto: (v) => Number(v.total).toFixed(2).replace('.', ','),
    somar: (v) => Number(v.total),
    formatarTotal: moeda,
  },
];

export default function RelatorioVendas() {
  const [periodo, setPeriodo] = usePeriodo();

  const { data, isLoading } = useQuery({
    queryKey: ['rel-vendas', periodo],
    queryFn: async (): Promise<LinhaVenda[]> => {
      const { data, error } = await supabase
        .from('vendas')
        .select('id, numero_venda, created_at, status, subtotal, descontos, total, clientes(nome)')
        .gte('created_at', periodo.de)
        // O `ate` é uma data pura; sem o T23:59:59 o último dia ficaria de fora.
        .lte('created_at', `${periodo.ate}T23:59:59`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaVenda[];
    },
  });

  const linhas = data ?? [];
  const faturamento = linhas
    .filter((v) => v.status !== 'cancelado')
    .reduce((acc, v) => acc + Number(v.total), 0);
  const validas = linhas.filter((v) => v.status !== 'cancelado').length;

  return (
    <RelatorioShell
      titulo="Relatório de Vendas"
      hint="Todas as vendas do período, com desconto e total. Vendas canceladas aparecem na lista mas ficam fora do faturamento."
      arquivo="relatorio_vendas"
      colunas={COLUNAS}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      indicadores={
        <>
          <Indicador rotulo="Faturamento" valor={moeda(faturamento)} tom="positivo" />
          <Indicador rotulo="Vendas" valor={String(validas)} detalhe="Sem contar canceladas" />
          <Indicador
            rotulo="Ticket médio"
            valor={moeda(validas ? faturamento / validas : 0)}
          />
        </>
      }
    />
  );
}
