import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData } from '@/lib/format';
import { totalDevolvidoNoPeriodo } from '@/lib/faturamento';
import { Indicador } from '@/components/PageHeader';
import { RelatorioShell, usePeriodo, type Coluna } from './RelatorioShell';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { FichaDaVenda } from '@/components/vendas/FichaDaVenda';

interface LinhaVenda {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
  subtotal: number;
  descontos: number;
  total: number;
  /** NULL em toda venda comum. Só a venda nova de uma troca preenche — ver
   *  TrocaDevolucao.tsx e VendasHistorico.tsx. */
  valor_faturamento_real: number | null;
  clientes: { nome: string } | null;
}

/** Dinheiro novo que essa venda representou de verdade. Igual a `total` pra
 *  qualquer venda comum; só a venda nova de uma troca diverge (grava o
 *  preço cheio em `total`, mas só a diferença cobrada é faturamento real).
 *  Usada nos indicadores agregados (Faturamento, Maior venda, Cancelamento
 *  perdido) — a coluna "Total" da tabela linha a linha continua mostrando
 *  `total` puro, porque ali o que interessa é "o que essa venda registrou",
 *  não "quanto entrou de novo". */
const faturamentoReal = (v: LinhaVenda) => Number(v.valor_faturamento_real ?? v.total);

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
    // Cancelada não entra no rodapé: até 18/08 o total somava a coluna
    // inteira enquanto o indicador "Faturamento" logo acima excluía
    // cancelados — dois números diferentes na mesma tela.
    somar: (v) => (v.status === 'cancelado' ? 0 : Number(v.descontos)),
    formatarTotal: moeda,
  },
  {
    chave: 'total',
    titulo: 'Total',
    alinhar: 'direita',
    render: (v) => <span className="font-medium">{moeda(Number(v.total))}</span>,
    texto: (v) => Number(v.total).toFixed(2).replace('.', ','),
    somar: (v) => (v.status === 'cancelado' ? 0 : faturamentoReal(v)),
    formatarTotal: moeda,
  },
];

export default function RelatorioVendas() {
  const [periodo, setPeriodo] = usePeriodo();
  // Clicar numa linha abre a MESMA ficha do Histórico de Vendas. Antes a
  // linha era morta: o relatório dizia quanto, e para saber o que o
  // cliente levou era preciso ir a outra tela e procurar de novo.
  const [vendaAberta, setVendaAberta] = useState<string | null>(null);

  /**
   * O relatório abre com `reports.view`; a ficha é conteúdo do módulo Venda e
   * exige `sales.view`. Sem esta conferência, o Gerente Técnico — que tem
   * relatórios e NÃO tem venda — passaria a ver produtos, IMEI, descontos,
   * formas de pagamento e a linha do tempo de cada venda só clicando na
   * linha. O banco não segura isso: a policy de leitura de `vendas` filtra
   * por loja, não por permissão.
   */
  const { can } = useAuth();
  const podeVerVenda = can(PERMISSIONS.SALES_VIEW);

  const { data, isLoading } = useQuery({
    queryKey: ['rel-vendas', periodo],
    queryFn: async (): Promise<{ linhas: LinhaVenda[]; devolvido: number }> => {
      const [res, devolvido] = await Promise.all([
        supabase
          .from('vendas')
          .select('id, numero_venda, created_at, status, subtotal, descontos, total, valor_faturamento_real, clientes(nome)')
          .gte('created_at', periodo.de)
          // O `ate` é uma data pura; sem o T23:59:59 o último dia ficaria de fora.
          .lte('created_at', `${periodo.ate}T23:59:59`)
          .order('created_at', { ascending: false }),
        // Dinheiro devolvido no mesmo período: sai da gaveta e não está em
        // venda nenhuma — a venda original fica gravada com o valor cheio.
        totalDevolvidoNoPeriodo(periodo.de, `${periodo.ate}T23:59:59`),
      ]);
      if (res.error) throw res.error;
      return { linhas: (res.data ?? []) as unknown as LinhaVenda[], devolvido };
    },
  });

  const linhas = data?.linhas ?? [];
  const devolvidoNoPeriodo = data?.devolvido ?? 0;
  const vendasValidas = linhas.filter((v) => v.status !== 'cancelado');
  const canceladas = linhas.filter((v) => v.status === 'cancelado');

  // Desconta o que voltou pro cliente no período: sem isto, uma venda
  // devolvida seguia inteira no faturamento do relatório.
  const faturamento =
    vendasValidas.reduce((acc, v) => acc + faturamentoReal(v), 0) - devolvidoNoPeriodo;
  const validas = vendasValidas.length;
  const descontoTotal = vendasValidas.reduce((acc, v) => acc + Number(v.descontos ?? 0), 0);
  const brutoTotal = vendasValidas.reduce((acc, v) => acc + Number(v.subtotal ?? 0), 0);
  const perdidoEmCancelamento = canceladas.reduce((acc, v) => acc + faturamentoReal(v), 0);

  // Dias do PERÍODO, não dias com venda: dividir só pelos dias que venderam
  // esconde justamente os dias parados, que é o que a média deveria revelar.
  const diasNoPeriodo = Math.max(
    1,
    Math.round(
      (new Date(periodo.ate).getTime() - new Date(periodo.de).getTime()) / 86_400_000
    ) + 1
  );
  const diasComVenda = new Set(vendasValidas.map((v) => v.created_at.slice(0, 10))).size;

  const maiorVenda = vendasValidas.reduce((maior, v) => Math.max(maior, faturamentoReal(v)), 0);

  return (
    <>
    <RelatorioShell
      titulo="Relatório de Vendas"
      hint="Todas as vendas do período, com desconto e total. Venda cancelada aparece na lista mas fica fora das somas. O indicador Faturamento vai um passo além do rodapé: ele também desconta o dinheiro devolvido a cliente no período, que não é linha desta tabela."
      arquivo="relatorio_vendas"
      colunas={COLUNAS}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      rotuloTotal="Total (sem canceladas)"
      aoClicarLinha={podeVerVenda ? (v) => setVendaAberta(v.id) : undefined}
      indicadores={
        <>
          <Indicador rotulo="Faturamento" valor={moeda(faturamento)} tom="positivo" />
          <Indicador rotulo="Vendas" valor={String(validas)} detalhe="Sem contar canceladas" />
          <Indicador
            rotulo="Ticket médio"
            valor={moeda(validas ? faturamento / validas : 0)}
          />
          <Indicador
            rotulo="Média por dia"
            valor={moeda(faturamento / diasNoPeriodo)}
            detalhe={`${diasComVenda} de ${diasNoPeriodo} dias com venda`}
          />
          <Indicador
            rotulo="Maior venda"
            valor={moeda(maiorVenda)}
            detalhe="A maior do período"
          />
          {/* Desconto dado é dinheiro que saiu do bolso da loja sem virar
              produto. Sem esta linha, ele nunca aparece em lugar nenhum. */}
          <Indicador
            rotulo="Desconto concedido"
            valor={moeda(descontoTotal)}
            detalhe={
              brutoTotal > 0
                ? `${((descontoTotal / brutoTotal) * 100).toFixed(1)}% do valor cheio`
                : undefined
            }
            tom={descontoTotal > 0 ? 'alerta' : 'neutro'}
          />
          <Indicador
            rotulo="Canceladas"
            valor={String(canceladas.length)}
            detalhe={
              canceladas.length > 0 ? `${moeda(perdidoEmCancelamento)} que não entraram` : undefined
            }
            tom={canceladas.length > 0 ? 'negativo' : 'neutro'}
          />
        </>
      }
    />
    <FichaDaVenda vendaId={vendaAberta} aoFechar={() => setVendaAberta(null)} />
    </>
  );
}
