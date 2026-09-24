import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { situacaoDoTitulo, SITUACAO_META, type Titulo } from '@/hooks/useTitulos';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import { buscarVendasDoBalcao, type VendasDoBalcao } from '@/lib/vendasDoBalcao';
import { Badge } from '@/components/ui/badge';
import { RelatorioShell, usePeriodo, type Coluna } from './RelatorioShell';

type LinhaFin = Titulo & { situacao: ReturnType<typeof situacaoDoTitulo> };

const COLUNAS: Coluna<LinhaFin>[] = [
  {
    chave: 'natureza',
    titulo: 'Tipo',
    render: (t) => (
      <span className={t.natureza === 'receber' ? 'text-emerald-600' : 'text-red-600'}>
        {t.natureza === 'receber' ? 'Receber' : 'Pagar'}
      </span>
    ),
    texto: (t) => (t.natureza === 'receber' ? 'Receber' : 'Pagar'),
  },
  {
    chave: 'descricao',
    titulo: 'Descrição',
    render: (t) => <span className="font-medium">{t.descricao}</span>,
    texto: (t) => t.descricao,
  },
  {
    chave: 'categoria',
    titulo: 'Categoria',
    render: (t) => t.categorias_financeiras?.nome ?? '—',
    texto: (t) => t.categorias_financeiras?.nome ?? '',
  },
  {
    chave: 'vencimento',
    titulo: 'Vencimento',
    render: (t) => fmtData(t.vencimento),
    texto: (t) => fmtData(t.vencimento),
  },
  {
    chave: 'situacao',
    titulo: 'Situação',
    render: (t) => (
      <Badge variant="secondary" className={SITUACAO_META[t.situacao].classe}>
        {SITUACAO_META[t.situacao].label}
      </Badge>
    ),
    texto: (t) => SITUACAO_META[t.situacao].label,
  },
  {
    chave: 'valor',
    titulo: 'Valor',
    alinhar: 'direita',
    render: (t) => moeda(Number(t.valor)),
    texto: (t) => Number(t.valor).toFixed(2).replace('.', ','),
    // O total soma o SALDO (receber positivo, pagar negativo) — somar tudo
    // como positivo daria um número que não significa nada.
    //
    // Título CANCELADO entra como zero: até 18/08 o rodapé somava a coluna
    // inteira enquanto os indicadores logo acima já ignoravam cancelados,
    // e a mesma tela mostrava dois resultados diferentes do mês.
    somar: (t) =>
      t.status === 'cancelado'
        ? 0
        : t.natureza === 'receber'
          ? Number(t.valor)
          : -Number(t.valor),
    formatarTotal: moeda,
  },
];

export default function RelatorioFinanceiro() {
  const [periodo, setPeriodo] = usePeriodo();

  /**
   * Três leituras, com recortes de data DIFERENTES de propósito — a mesma
   * correção que o Fluxo de Caixa ganhou em 21/08 e este relatório não tinha
   * (achado 58, revisão de 24/09/2026):
   *
   *   Lista e previsto = o que VENCE no período   → filtra por `vencimento`
   *   Já pago/recebido = o que foi PAGO no período → filtra por `pago_em`
   *   Vendas do balcão = as vendas do PDV do período (achado 57)
   *
   * Antes, "Já pago" e "Resultado realizado" eram o pedaço pago de quem
   * VENCIA no período. Em setembro de 2026: o título de R$ 10.000 venceu em
   * 14/08 e foi pago em 14/09 — este relatório dizia "Já pago R$ 0,00" em
   * setembro, e o Fluxo de Caixa, "Saiu R$ 11.111". Duas telas respondendo a
   * mesma pergunta com números opostos.
   */
  const { data, isLoading } = useQuery({
    queryKey: ['rel-financeiro', periodo],
    queryFn: async (): Promise<{
      linhas: LinhaFin[];
      pagosNoPeriodo: Titulo[];
      vendas: VendasDoBalcao;
    }> => {
      // Em páginas: o Supabase corta calado em 1.000 linhas por pedido.
      const [previstos, pagosNoPeriodo, vendas] = await Promise.all([
        buscarEmPaginas<Titulo>(() =>
          supabase
            .from('titulos_financeiros')
            .select('*, categorias_financeiras(nome)')
            .gte('vencimento', periodo.de)
            .lte('vencimento', periodo.ate)
            .order('vencimento')
            .order('id'),
        ),
        buscarEmPaginas<Titulo>(() =>
          supabase
            .from('titulos_financeiros')
            .select('id, natureza, valor, status, pago_em')
            .eq('status', 'pago')
            .gte('pago_em', periodo.de)
            .lte('pago_em', periodo.ate)
            .order('pago_em')
            .order('id'),
        ),
        buscarVendasDoBalcao(periodo.de, periodo.ate),
      ]);
      return {
        linhas: previstos.map((t) => ({ ...t, situacao: situacaoDoTitulo(t) })),
        pagosNoPeriodo,
        vendas,
      };
    },
  });

  const linhas = data?.linhas ?? [];
  const pagosNoPeriodo = data?.pagosNoPeriodo ?? [];
  const vendas = data?.vendas.liquido ?? 0;
  const ativos = linhas.filter((t) => t.status !== 'cancelado');
  const soma = (lista: LinhaFin[]) => lista.reduce((a, t) => a + Number(t.valor), 0);

  const aReceber = ativos.filter((t) => t.natureza === 'receber');
  const aPagar = ativos.filter((t) => t.natureza === 'pagar');
  const receber = soma(aReceber);
  const pagar = soma(aPagar);

  /**
   * Separa o que JÁ ACONTECEU do que ainda vai acontecer.
   *
   * A tela somava tudo num número só, misturando título pago com título que
   * vence daqui a 20 dias. São coisas diferentes: um é dinheiro que entrou, o
   * outro é promessa. Quem olha o resultado do mês precisa dos dois separados
   * para saber se o mês foi bom ou se só ainda não venceu nada.
   *
   * O que JÁ ACONTECEU vem da lista filtrada pela DATA DO PAGAMENTO — é o mês
   * em que o dinheiro se moveu, não o mês em que a conta vencia.
   */
  const somaPagos = (natureza: 'pagar' | 'receber') =>
    pagosNoPeriodo
      .filter((t) => t.natureza === natureza)
      .reduce((a, t) => a + Number(t.valor), 0);
  const recebido = somaPagos('receber');
  const pago = somaPagos('pagar');

  const vencidosReceber = aReceber.filter((t) => t.situacao === 'vencido');
  const vencidosPagar = aPagar.filter((t) => t.situacao === 'vencido');
  const vencidos = vencidosReceber.length + vencidosPagar.length;

  const venceHoje = ativos.filter((t) => t.situacao === 'vence_hoje');
  const aVencer = ativos.filter((t) => t.situacao === 'a_vencer');

  return (
    <RelatorioShell
      titulo="Relatório Financeiro"
      hint="A lista traz os títulos que VENCEM no período — a pagar e a receber juntos. Os indicadores de 'Já pago', 'Já recebido' e 'Resultado realizado' olham outra data: a do PAGAMENTO, que é quando o dinheiro se moveu (os mesmos números do Fluxo de Caixa). As vendas do balcão entram nos resultados, já sem o que foi devolvido a cliente. Título cancelado aparece na lista mas fica fora do total."
      arquivo="relatorio_financeiro"
      colunas={COLUNAS}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      rotuloTotal="Saldo (sem cancelados)"
      vazio="Nenhum título vence neste período."
      indicadores={
        <>
          <Indicador
            rotulo="A receber"
            valor={moeda(receber)}
            detalhe={`${aReceber.length} título(s)`}
            tom="positivo"
          />
          <Indicador
            rotulo="A pagar"
            valor={moeda(pagar)}
            detalhe={`${aPagar.length} título(s)`}
            tom="negativo"
          />
          <Indicador
            rotulo="Resultado previsto"
            valor={moeda(receber + vendas - pagar)}
            detalhe="Contas do período + vendas do balcão, se tudo for pago e recebido"
            tom={receber + vendas - pagar >= 0 ? 'positivo' : 'negativo'}
          />
          <Indicador
            rotulo="Resultado realizado"
            valor={moeda(recebido + vendas - pago)}
            detalhe="Só o que já entrou e saiu de verdade no período, com as vendas do balcão"
            tom={recebido + vendas - pago >= 0 ? 'positivo' : 'negativo'}
          />

          {/* A venda do PDV não vira título: sem esta linha o resultado do
              mês só enxergava gastos e OS (achado 57). */}
          <Indicador
            rotulo="Vendas do balcão"
            valor={moeda(vendas)}
            detalhe={
              data?.vendas
                ? `${data.vendas.quantidade} venda(s), já sem ${moeda(data.vendas.devolvido)} devolvidos`
                : undefined
            }
            tom="positivo"
          />
          <Indicador
            rotulo="Já recebido"
            valor={moeda(recebido)}
            detalhe="Contas a receber pagas no período (pela data do pagamento)"
          />
          <Indicador
            rotulo="Já pago"
            valor={moeda(pago)}
            detalhe="Contas pagas no período (pela data do pagamento)"
          />
          {/* Vencido separado por natureza: cliente que não pagou e conta que a
              loja atrasou exigem ações opostas, e somados viram um número que
              não diz o que fazer. */}
          <Indicador
            rotulo="Vencido a receber"
            valor={moeda(soma(vencidosReceber))}
            detalhe={
              vencidosReceber.length > 0
                ? `${vencidosReceber.length} cliente(s) em atraso`
                : 'Ninguém devendo'
            }
            tom={vencidosReceber.length > 0 ? 'negativo' : 'positivo'}
          />
          <Indicador
            rotulo="Vencido a pagar"
            valor={moeda(soma(vencidosPagar))}
            detalhe={
              vencidosPagar.length > 0
                ? `${vencidosPagar.length} conta(s) atrasada(s)`
                : 'Nada atrasado'
            }
            tom={vencidosPagar.length > 0 ? 'negativo' : 'positivo'}
          />
          <Indicador
            rotulo="Vence hoje"
            valor={moeda(soma(venceHoje))}
            detalhe={`${venceHoje.length} título(s)`}
            tom={venceHoje.length > 0 ? 'alerta' : 'neutro'}
          />
          <Indicador
            rotulo="Ainda a vencer"
            valor={moeda(soma(aVencer))}
            detalhe={`${aVencer.length} título(s), ${vencidos} vencido(s)`}
          />
        </>
      }
    />
  );
}
