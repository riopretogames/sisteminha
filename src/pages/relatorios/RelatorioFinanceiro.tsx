import { useQuery } from '@tanstack/react-query';
import { db } from '@/integrations/supabase/untyped';
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
    somar: (t) => (t.natureza === 'receber' ? Number(t.valor) : -Number(t.valor)),
    formatarTotal: moeda,
  },
];

export default function RelatorioFinanceiro() {
  const [periodo, setPeriodo] = usePeriodo();

  const { data, isLoading } = useQuery({
    queryKey: ['rel-financeiro', periodo],
    queryFn: async (): Promise<LinhaFin[]> => {
      const { data, error } = await db
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
  const receber = ativos.filter((t) => t.natureza === 'receber').reduce((a, t) => a + Number(t.valor), 0);
  const pagar = ativos.filter((t) => t.natureza === 'pagar').reduce((a, t) => a + Number(t.valor), 0);
  const vencidos = ativos.filter((t) => t.situacao === 'vencido').length;

  return (
    <RelatorioShell
      titulo="Relatório Financeiro"
      hint="Todos os títulos com vencimento no período — a pagar e a receber juntos, para ver o resultado do mês de uma vez."
      arquivo="relatorio_financeiro"
      colunas={COLUNAS}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      vazio="Nenhum título vence neste período."
      indicadores={
        <>
          <Indicador rotulo="A receber" valor={moeda(receber)} tom="positivo" />
          <Indicador rotulo="A pagar" valor={moeda(pagar)} tom="negativo" />
          <Indicador
            rotulo="Resultado"
            valor={moeda(receber - pagar)}
            detalhe={vencidos ? `${vencidos} título(s) vencido(s)` : 'Nenhum vencido'}
            tom={receber - pagar >= 0 ? 'positivo' : 'negativo'}
          />
        </>
      }
    />
  );
}
