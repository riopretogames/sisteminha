import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { RelatorioShell, usePeriodo, type Coluna } from './RelatorioShell';
import { OS_ETAPAS, OS_CANCELADO, osEmAndamento } from '@/config/osStatus';

interface LinhaOS {
  id: string;
  numero_os: string;
  created_at: string;
  data_finalizacao: string | null;
  status: string;
  marca: string | null;
  modelo: string | null;
  total_orcamento: number;
  valor_final_pago: number | null;
  clientes: { nome: string } | null;
}

const COLUNAS: Coluna<LinhaOS>[] = [
  {
    chave: 'os',
    titulo: 'OS',
    render: (o) => <span className="font-medium">{o.numero_os}</span>,
    texto: (o) => o.numero_os,
  },
  {
    chave: 'abertura',
    titulo: 'Abertura',
    render: (o) => fmtData(o.created_at),
    texto: (o) => fmtData(o.created_at),
  },
  {
    chave: 'cliente',
    titulo: 'Cliente',
    render: (o) => o.clientes?.nome ?? '—',
    texto: (o) => o.clientes?.nome ?? '',
  },
  {
    chave: 'aparelho',
    titulo: 'Aparelho',
    render: (o) => [o.marca, o.modelo].filter(Boolean).join(' ') || '—',
    texto: (o) => [o.marca, o.modelo].filter(Boolean).join(' '),
  },
  {
    chave: 'status',
    titulo: 'Status',
    render: (o) => (
      <span className="capitalize text-muted-foreground">{o.status.replace(/_/g, ' ')}</span>
    ),
    texto: (o) => o.status,
  },
  {
    chave: 'orcamento',
    titulo: 'Orçamento',
    alinhar: 'direita',
    render: (o) => moeda(Number(o.total_orcamento)),
    texto: (o) => Number(o.total_orcamento).toFixed(2).replace('.', ','),
    somar: (o) => Number(o.total_orcamento),
    formatarTotal: moeda,
  },
  {
    chave: 'pago',
    titulo: 'Pago',
    alinhar: 'direita',
    render: (o) =>
      o.valor_final_pago == null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="font-medium">{moeda(Number(o.valor_final_pago))}</span>
      ),
    texto: (o) => (o.valor_final_pago == null ? '' : Number(o.valor_final_pago).toFixed(2).replace('.', ',')),
    somar: (o) => Number(o.valor_final_pago ?? 0),
    formatarTotal: moeda,
  },
];

export default function RelatorioOS() {
  const [periodo, setPeriodo] = usePeriodo();

  const { data, isLoading } = useQuery({
    queryKey: ['rel-os', periodo],
    queryFn: async (): Promise<LinhaOS[]> => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(
          'id, numero_os, created_at, data_finalizacao, status, marca, modelo, total_orcamento, valor_final_pago, clientes(nome)',
        )
        .gte('created_at', periodo.de)
        .lte('created_at', `${periodo.ate}T23:59:59`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaOS[];
    },
  });

  const linhas = data ?? [];
  const entregues = linhas.filter((o) => o.status === OS_ETAPAS.ENTREGUE);
  const emAndamento = linhas.filter((o) => osEmAndamento(o.status));
  const canceladas = linhas.filter((o) => o.status === OS_CANCELADO);
  const receita = entregues.reduce((acc, o) => acc + Number(o.valor_final_pago ?? 0), 0);

  const orcado = linhas.reduce((acc, o) => acc + Number(o.total_orcamento ?? 0), 0);
  const orcadoEmAberto = emAndamento.reduce(
    (acc, o) => acc + Number(o.total_orcamento ?? 0),
    0
  );

  /**
   * Quanto tempo o conserto leva, na média — só de OS já finalizada.
   *
   * É o número que responde a pergunta mais feita no balcão ("quando fica
   * pronto?") com dado em vez de chute, e o único jeito de saber se o prazo de
   * 3 dias que a loja promete tem lastro.
   */
  const comTempo = entregues.filter((o) => o.data_finalizacao);
  const diasMedios =
    comTempo.length > 0
      ? comTempo.reduce((soma, o) => {
          const abertura = new Date(o.created_at).getTime();
          const fim = new Date(o.data_finalizacao!).getTime();
          return soma + Math.max(0, (fim - abertura) / 86_400_000);
        }, 0) / comTempo.length
      : 0;

  // Quantas viraram serviço de verdade. Sem isso, não dá para saber se o
  // problema da loja é entrar pouca OS ou perder orçamento aprovado.
  const taxaConversao = linhas.length > 0 ? (entregues.length / linhas.length) * 100 : 0;

  return (
    <RelatorioShell
      titulo="Relatório de OS"
      hint="Ordens de serviço abertas no período. O total pago só conta OS já entregues — orçamento aprovado ainda não é dinheiro em caixa."
      arquivo="relatorio_os"
      colunas={COLUNAS}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      indicadores={
        <>
          <Indicador rotulo="OS abertas" valor={String(linhas.length)} />
          <Indicador
            rotulo="Em andamento"
            valor={String(emAndamento.length)}
            detalhe="Ainda não entregues"
            tom={emAndamento.length > 0 ? 'alerta' : 'neutro'}
          />
          <Indicador
            rotulo="Receita de serviço"
            valor={moeda(receita)}
            detalhe={`${entregues.length} entregues`}
            tom="positivo"
          />
          <Indicador
            rotulo="Ticket médio da OS"
            valor={moeda(entregues.length ? receita / entregues.length : 0)}
            detalhe="Só de OS entregue"
          />
          <Indicador
            rotulo="Tempo médio de reparo"
            valor={diasMedios > 0 ? `${diasMedios.toFixed(1)} dias` : '—'}
            detalhe={comTempo.length > 0 ? `De ${comTempo.length} OS finalizadas` : 'Sem OS finalizada'}
          />
          <Indicador
            rotulo="Orçamento em aberto"
            valor={moeda(orcadoEmAberto)}
            detalhe="Aprovado, ainda não recebido"
            tom={orcadoEmAberto > 0 ? 'alerta' : 'neutro'}
          />
          <Indicador
            rotulo="Taxa de conclusão"
            valor={`${taxaConversao.toFixed(0)}%`}
            detalhe={`${entregues.length} de ${linhas.length} abertas`}
          />
          <Indicador
            rotulo="Canceladas"
            valor={String(canceladas.length)}
            detalhe={orcado > 0 ? `${moeda(orcado)} orçados no total` : undefined}
            tom={canceladas.length > 0 ? 'negativo' : 'neutro'}
          />
        </>
      }
    />
  );
}
