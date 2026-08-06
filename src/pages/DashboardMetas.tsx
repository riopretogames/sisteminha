import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Trophy, TrendingUp, Users, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/PageHeader';
import { moeda } from '@/lib/format';
import type { Database } from '@/integrations/supabase/types';

/**
 * Dashboard de Metas — progresso do faturamento do mês contra as 4 faixas de
 * premiação (Bronze/Prata/Ouro/Diamante) já cadastradas em
 * `metas_faturamento`.
 *
 * Importante — escopo desta tela:
 * - É SÓ VISUALIZAÇÃO de progresso. Não calcula comissão, não sabe de
 *   penalidade de Trello e não substitui o processo de premiação oficial
 *   (que roda fora do Sisteminha, numa pasta separada da empresa).
 * - A estimativa "por vendedor" é exatamente isso — uma estimativa client-side
 *   dividindo a meta entre quem vendeu algo no mês. Nunca é o valor oficial de
 *   comissão ou prêmio; está rotulada como tal na tela.
 *
 * A permissão (PERMISSIONS.DASHBOARDS_GOALS_VIEW) já gate a rota em
 * config/menu.ts, então não repetimos `can()` aqui — é tela só de leitura.
 */

type Faixa = Database['public']['Enums']['faixa_premiacao'];

const FAIXA_LABEL: Record<Faixa, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  diamante: 'Diamante',
};

const FAIXA_EMOJI: Record<Faixa, string> = {
  bronze: '🥉',
  prata: '🥈',
  ouro: '🥇',
  diamante: '💎',
};

interface MetaFaixaRow {
  id: string;
  faixa: Faixa;
  valor_meta: number;
}

interface VendaMesRow {
  total: number | null;
  vendedor_id: string | null;
}

interface ProfileRow {
  id: string;
  nome: string;
}

interface DashboardMetasData {
  metas: MetaFaixaRow[];
  vendas: VendaMesRow[];
  profiles: ProfileRow[];
}

export default function DashboardMetas() {
  // `new Date()` chamado uma única vez, no mount — todos os limites de data
  // (mês/ano corrente, início/fim do mês, dias já passados) derivam daqui.
  // Mesmo cuidado documentado em DashboardVenda.tsx.
  const limites = useMemo(() => {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = agora.getMonth() + 1; // metas_faturamento.mes é 1–12
    const inicioMes = new Date(ano, agora.getMonth(), 1);
    const inicioProximoMes = new Date(ano, agora.getMonth() + 1, 1);
    const diaAtual = agora.getDate();
    const diasNoMes = new Date(ano, agora.getMonth() + 1, 0).getDate();
    const nomeMesAno = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(inicioMes);
    return { ano, mes, inicioMes, inicioProximoMes, diaAtual, diasNoMes, nomeMesAno };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metas', limites.ano, limites.mes],
    queryFn: async (): Promise<DashboardMetasData> => {
      const [metasRes, vendasRes, profilesRes] = await Promise.all([
        supabase
          .from('metas_faturamento')
          .select('id, faixa, valor_meta')
          .eq('ano', limites.ano)
          .eq('mes', limites.mes),
        supabase
          .from('vendas')
          .select('total, vendedor_id')
          .gte('created_at', limites.inicioMes.toISOString())
          .lt('created_at', limites.inicioProximoMes.toISOString())
          .neq('status', 'cancelado'),
        // Não existe FK declarada entre vendas.vendedor_id e profiles — busca
        // à parte e junta no client por id (mesmo padrão de itens órfãos já
        // usado em DashboardVenda.tsx).
        supabase.from('profiles').select('id, nome'),
      ]);
      if (metasRes.error) throw metasRes.error;
      if (vendasRes.error) throw vendasRes.error;
      if (profilesRes.error) throw profilesRes.error;

      return {
        metas: (metasRes.data ?? []) as MetaFaixaRow[],
        vendas: (vendasRes.data ?? []) as VendaMesRow[],
        profiles: (profilesRes.data ?? []) as ProfileRow[],
      };
    },
  });

  const metas = data?.metas ?? [];
  const vendas = data?.vendas ?? [];
  const profiles = data?.profiles ?? [];

  const semMetaCadastrada = !isLoading && metas.length === 0;

  const realizado = vendas.reduce((acc, v) => acc + Number(v.total ?? 0), 0);

  // Ordenado por valor_meta crescente — não assume a ordem do enum
  // (bronze/prata/ouro/diamante é o esperado, mas quem manda é o valor).
  const faixas = [...metas]
    .sort((a, b) => a.valor_meta - b.valor_meta)
    .map((m) => {
      const atingida = realizado >= m.valor_meta;
      const falta = Math.max(0, m.valor_meta - realizado);
      const percentual = m.valor_meta > 0 ? Math.min(100, (realizado / m.valor_meta) * 100) : 0;
      return { ...m, atingida, falta, percentual };
    });

  // Maior faixa já atingida agora (percorre de trás pra frente, já que
  // `faixas` está em ordem crescente de valor).
  const nivelAtual = [...faixas].reverse().find((f) => f.atingida) ?? null;
  const proximaFaixa = faixas.find((f) => !f.atingida) ?? null;

  // Projeção de fim de mês: realizado ÷ dias já passados × dias totais do mês.
  const projecao = limites.diaAtual > 0 ? (realizado / limites.diaAtual) * limites.diasNoMes : realizado;
  const projecaoBateProximaFaixa = proximaFaixa ? projecao >= proximaFaixa.valor_meta : null;

  // Agregação por vendedor — soma vendas.total por vendedor_id e junta o nome
  // vindo de profiles.
  const nomesPorId = new Map(profiles.map((p) => [p.id, p.nome]));
  const totalPorVendedor = new Map<string, number>();
  for (const v of vendas) {
    if (!v.vendedor_id) continue;
    totalPorVendedor.set(v.vendedor_id, (totalPorVendedor.get(v.vendedor_id) ?? 0) + Number(v.total ?? 0));
  }
  const porVendedor = Array.from(totalPorVendedor.entries())
    .map(([vendedorId, totalVendido]) => ({
      vendedorId,
      nome: nomesPorId.get(vendedorId) ?? 'Vendedor não identificado',
      totalVendido,
    }))
    .sort((a, b) => b.totalVendido - a.totalVendido);

  // Estimativa de meta individual: meta da faixa "em jogo" agora (a maior já
  // atingida ou, se nenhuma ainda, a primeira faixa) ÷ quem vendeu algo no mês.
  // NUNCA é o valor oficial de comissão/prêmio — só um recorte pra referência.
  const faixaReferencia = nivelAtual ?? faixas[0] ?? null;
  const metaIndividualEstimada =
    faixaReferencia && porVendedor.length > 0 ? faixaReferencia.valor_meta / porVendedor.length : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titulo="Dashboard de Metas"
        hint={`Progresso do faturamento de ${limites.nomeMesAno} contra as faixas de premiação já cadastradas. Tela só de leitura — não calcula comissão nem substitui o processo oficial de premiação.`}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : semMetaCadastrada ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground/50" />
            <p className="font-medium">Meta deste mês ainda não foi cadastrada</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Não há faixas de premiação (Bronze/Prata/Ouro/Diamante) registradas para{' '}
              {limites.nomeMesAno}. Assim que forem cadastradas, o progresso aparece aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs principais */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="overflow-hidden">
              <div className="kpi-caixa p-1" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Faturado no Mês</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{moeda(realizado)}</div>
                <p className="text-xs text-muted-foreground">
                  Vendas não canceladas, {limites.diaAtual} de {limites.diasNoMes} dias do mês
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="kpi-vendas p-1" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Nível Atual</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {nivelAtual ? (
                  <Badge className="text-sm">
                    Nível atual: {FAIXA_LABEL[nivelAtual.faixa]} {FAIXA_EMOJI[nivelAtual.faixa]}
                  </Badge>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma faixa atingida ainda</p>
                )}
                {proximaFaixa && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Faltam {moeda(proximaFaixa.falta)} para {FAIXA_LABEL[proximaFaixa.faixa]}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="kpi-os p-1" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Projeção Fim do Mês</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{moeda(projecao)}</div>
                <p className="text-xs text-muted-foreground">
                  {proximaFaixa
                    ? projecaoBateProximaFaixa
                      ? `No ritmo atual, bate a meta ${FAIXA_LABEL[proximaFaixa.faixa]}`
                      : `No ritmo atual, fica abaixo da meta ${FAIXA_LABEL[proximaFaixa.faixa]}`
                    : 'Todas as faixas já foram atingidas este mês'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Progresso por faixa */}
          <Card>
            <CardHeader>
              <CardTitle>Progresso por Faixa</CardTitle>
              <CardDescription>
                Quanto falta para cada faixa de premiação, com base no faturamento realizado até agora.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {faixas.map((f) => (
                <div key={f.id}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium">
                      {FAIXA_EMOJI[f.faixa]} {FAIXA_LABEL[f.faixa]}{' '}
                      <span className="font-normal text-muted-foreground">— meta {moeda(f.valor_meta)}</span>
                    </span>
                    <span className={f.atingida ? 'font-medium text-green-600' : 'text-muted-foreground'}>
                      {f.atingida ? 'Atingida! 🎉' : `Faltam ${moeda(f.falta)}`}
                    </span>
                  </div>
                  <Progress value={f.percentual} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Por vendedor (estimativa, não oficial) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Faturamento por Vendedor
              </CardTitle>
              <CardDescription>
                Total vendido por cada vendedor este mês, agrupado a partir das vendas registradas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {metaIndividualEstimada !== null && faixaReferencia && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Meta individual estimada — não é o valor oficial</AlertTitle>
                  <AlertDescription>
                    Dividindo a meta de {FAIXA_LABEL[faixaReferencia.faixa]} ({moeda(faixaReferencia.valor_meta)})
                    entre os {porVendedor.length} vendedor(es) que venderam algo este mês, a meta individual
                    estimada seria de <strong>{moeda(metaIndividualEstimada)}</strong> por pessoa. Confirme com o
                    processo de premiação se esse número de vendedores está certo — este dashboard não calcula
                    comissão nem substitui o processo oficial.
                  </AlertDescription>
                </Alert>
              )}

              {porVendedor.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">Nenhuma venda com vendedor identificado este mês.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Vendido este mês</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porVendedor.map((v) => (
                      <TableRow key={v.vendedorId}>
                        <TableCell className="font-medium">{v.nome}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {moeda(v.totalVendido)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
