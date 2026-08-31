import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Indicador } from '@/components/PageHeader';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { RelatorioShell, usePeriodo, type Coluna } from './RelatorioShell';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { OS_ETAPAS, OS_CANCELADO, osEmAndamento, osOrcamentoAprovado } from '@/config/osStatus';

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
  /** FALSE = o cliente recusou o orçamento. Ver osOrcamentoAprovado. */
  laudo_aprovado: boolean | null;
  clientes: { nome: string } | null;
}

/**
 * As colunas viraram função por causa do status: até 18/08 esta tela
 * mostrava a chave crua do banco com um `.replace('_', ' ')` — "em reparo"
 * em vez de "Em Reparo" — ignorando o rótulo e a cor que a loja cadastra em
 * Gerenciar Status. Se a loja renomeasse uma etapa, o relatório continuava
 * exibindo o nome técnico. Para ler o rótulo de verdade é preciso do hook
 * `useOsStatuses`, e hook só funciona dentro do componente.
 */
const criarColunas = (
  getStatusConfig: (key: string) => { label: string; color: string }
): Coluna<LinhaOS>[] => [
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
    render: (o) => {
      const cfg = getStatusConfig(o.status);
      return <Badge className={`${cfg.color} border-0`}>{cfg.label}</Badge>;
    },
    // O CSV leva o mesmo rótulo da tela — quem abre a planilha não deve
    // precisar traduzir "aguardando_aprovacao" de cabeça.
    texto: (o) => getStatusConfig(o.status).label,
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
  const navigate = useNavigate();
  // O relatório abre com `reports.view`, mas a ficha da OS exige
  // `orders.view`. Sem esta conferência, quem só tem relatório clicaria e
  // cairia na tela cinza de sem acesso — que parece defeito do sistema.
  const { can } = useAuth();
  const podeAbrirOS = can(PERMISSIONS.ORDERS_VIEW);
  const { getStatusConfig } = useOsStatuses();
  const colunas = useMemo(() => criarColunas(getStatusConfig), [getStatusConfig]);

  const { data, isLoading } = useQuery({
    queryKey: ['rel-os', periodo],
    queryFn: async (): Promise<LinhaOS[]> => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(
          'id, numero_os, created_at, data_finalizacao, status, marca, modelo, total_orcamento, valor_final_pago, laudo_aprovado, clientes(nome)',
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
  // Só conta o que o cliente JÁ APROVOU. Antes somava toda OS não entregue,
  // inclusive as que nem tinham laudo, e chamava isso de "Aprovado, ainda não
  // recebido" — superestimava o caixa futuro com dinheiro que ainda dependia
  // de o cliente dizer sim.
  // O `laudo_aprovado` junto não é detalhe: desde 01/09 a OS recusada anda
  // pelas mesmas etapas da aprovada (ela volta para a bancada para ser
  // remontada), então a etapa sozinha diria que o cliente aprovou.
  const orcadoEmAberto = linhas
    .filter((o) => osOrcamentoAprovado(o.status, o.laudo_aprovado))
    .reduce((acc, o) => acc + Number(o.total_orcamento ?? 0), 0);
  const qtdAprovadas = linhas.filter(
    (o) => osOrcamentoAprovado(o.status, o.laudo_aprovado),
  ).length;

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
      colunas={colunas}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      aoClicarLinha={podeAbrirOS ? (os) => navigate(`/os/${os.id}`) : undefined}
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
            detalhe={`${qtdAprovadas} OS aprovada${qtdAprovadas === 1 ? '' : 's'}, ainda não recebida${qtdAprovadas === 1 ? '' : 's'}`}
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
