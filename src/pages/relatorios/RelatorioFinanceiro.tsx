import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { situacaoDoTitulo, SITUACAO_META, type Titulo } from '@/hooks/useTitulos';
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

  const { data, isLoading } = useQuery({
    queryKey: ['rel-financeiro', periodo],
    queryFn: async (): Promise<LinhaFin[]> => {
      const { data, error } = await supabase
        .from('titulos_financeiros')
        .select('*, categorias_financeiras(nome)')
        .gte('vencimento', periodo.de)
        .lte('vencimento', periodo.ate)
        .order('vencimento');
      if (error) throw error;
      return ((data ?? []) as Titulo[]).map((t) => ({ ...t, situacao: situacaoDoTitulo(t) }));
    },
  });

  const linhas = data ?? [];
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
   */
  const recebido = soma(aReceber.filter((t) => t.situacao === 'pago'));
  const pago = soma(aPagar.filter((t) => t.situacao === 'pago'));

  const vencidosReceber = aReceber.filter((t) => t.situacao === 'vencido');
  const vencidosPagar = aPagar.filter((t) => t.situacao === 'vencido');
  const vencidos = vencidosReceber.length + vencidosPagar.length;

  const venceHoje = ativos.filter((t) => t.situacao === 'vence_hoje');
  const aVencer = ativos.filter((t) => t.situacao === 'a_vencer');

  return (
    <RelatorioShell
      titulo="Relatório Financeiro"
      hint="Todos os títulos com vencimento no período — a pagar e a receber juntos, para ver o resultado do mês de uma vez. Título cancelado aparece na lista mas fica fora do total."
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
            valor={moeda(receber - pagar)}
            detalhe="Se tudo for pago e recebido"
            tom={receber - pagar >= 0 ? 'positivo' : 'negativo'}
          />
          <Indicador
            rotulo="Resultado realizado"
            valor={moeda(recebido - pago)}
            detalhe="Só o que já entrou e saiu de verdade"
            tom={recebido - pago >= 0 ? 'positivo' : 'negativo'}
          />

          <Indicador
            rotulo="Já recebido"
            valor={moeda(recebido)}
            detalhe={receber > 0 ? `${((recebido / receber) * 100).toFixed(0)}% do previsto` : undefined}
          />
          <Indicador
            rotulo="Já pago"
            valor={moeda(pago)}
            detalhe={pagar > 0 ? `${((pago / pagar) * 100).toFixed(0)}% do previsto` : undefined}
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
