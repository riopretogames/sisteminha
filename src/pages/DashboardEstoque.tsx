import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes,
  DollarSign,
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';
import { moeda } from '@/lib/format';

/**
 * Dashboard de Estoque — painel de KPIs em tempo real (mesmo estilo do
 * Dashboard Home: cards com ícone/título/valor, buscados no mount).
 *
 * Não duplica telas que já existem:
 * - o resumo de "Estoque Crítico" aqui é só um card clicável que leva pra
 *   /estoque/critico, onde já existe a lista completa com reposição;
 * - "Movimentações de hoje" é só a contagem, com link pra /estoque/movimentacoes.
 *
 * O corte crítico (estoque_atual <= estoque_minimo) é sempre calculado no
 * cliente — o PostgREST não compara duas colunas da mesma linha direto no
 * filtro, mesma limitação já corrigida em Dashboard.tsx e EstoqueCritico.tsx.
 */

interface ProdutoEstoque {
  id: string;
  nome: string;
  categoria: string;
  estoque_atual: number;
  estoque_minimo: number;
  custo: number;
  preco: number;
}

interface EstoqueStats {
  totalAtivos: number;
  valorTotalEstoque: number;
  produtosCriticos: number;
  movimentacoesHoje: number;
}

export default function DashboardEstoque() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);

  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [stats, setStats] = useState<EstoqueStats>({
    totalAtivos: 0,
    valorTotalEstoque: 0,
    produtosCriticos: 0,
    movimentacoesHoje: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // Produtos ativos — traz estoque_atual/estoque_minimo/custo juntos e
      // calcula tudo no cliente (crítico, valor parado, top 5).
      const { data: produtosData, error: produtosError } = await supabase
        .from('vw_produtos')
        .select('id, nome, categoria, estoque_atual, estoque_minimo, custo, preco')
        .eq('ativo', true);
      if (produtosError) throw produtosError;

      const lista = (produtosData ?? []) as ProdutoEstoque[];

      const produtosCriticos = lista.filter(
        (p) => p.estoque_atual <= p.estoque_minimo
      ).length;

      const valorTotalEstoque = lista.reduce(
        (acc, p) => acc + p.estoque_atual * (p.custo || 0),
        0
      );

      // Movimentações de hoje
      const { count: movimentacoesHoje } = await supabase
        .from('movimentos_estoque')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', hoje.toISOString());

      setProdutos(lista);
      setStats({
        totalAtivos: lista.length,
        valorTotalEstoque,
        produtosCriticos,
        movimentacoesHoje: movimentacoesHoje || 0,
      });
    } catch (error) {
      console.error('Erro ao carregar dashboard de estoque:', error);
    } finally {
      setLoading(false);
    }
  };

  // Com permissão de custo: quem mais tem capital parado. Sem permissão:
  // só a lista de quem tem menos unidades (sem expor custo/valor).
  const top5 = veCusto
    ? [...produtos].sort(
        (a, b) => b.estoque_atual * (b.custo || 0) - a.estoque_atual * (a.custo || 0)
      ).slice(0, 5)
    : [...produtos].sort((a, b) => a.estoque_atual - b.estoque_atual).slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard de Estoque</h1>
        <p className="text-muted-foreground">
          Visão em tempo real do estoque: produtos cadastrados, alertas e movimentações de hoje.
        </p>
      </div>

      {/* KPI Cards */}
      <div className={`grid gap-4 md:grid-cols-2 ${veCusto ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {/* Produtos Ativos */}
        <Card className="overflow-hidden">
          <div className="kpi-estoque p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Produtos Ativos</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '—' : stats.totalAtivos}</div>
            <p className="text-xs text-muted-foreground">Cadastrados e ativos</p>
          </CardContent>
        </Card>

        {/* Valor em Estoque — só quem vê custo */}
        {veCusto && (
          <Card className="overflow-hidden">
            <div className="kpi-estoque p-1" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Valor em Estoque</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? '—' : moeda(stats.valorTotalEstoque)}
              </div>
              <p className="text-xs text-muted-foreground">Estoque atual × custo</p>
            </CardContent>
          </Card>
        )}

        {/* Estoque Crítico — clicável, leva pra lista completa */}
        <Card
          className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
          onClick={() => navigate('/estoque/critico')}
        >
          <div className="kpi-estoque p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Estoque Crítico</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '—' : stats.produtosCriticos}</div>
            {stats.produtosCriticos > 0 ? (
              <div className="flex items-center text-xs text-amber-600">
                <ArrowUpRight className="mr-1 h-4 w-4" />
                Ver lista completa
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Tudo em ordem!</p>
            )}
          </CardContent>
        </Card>

        {/* Movimentações de Hoje — clicável, leva pro histórico */}
        <Card
          className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
          onClick={() => navigate('/estoque/movimentacoes')}
        >
          <div className="kpi-estoque p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Movimentações Hoje</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '—' : stats.movimentacoesHoje}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="mr-1 h-4 w-4" />
              Ver movimentações
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 */}
      <Card>
        <CardHeader>
          <CardTitle>
            {veCusto ? 'Top 5 — Valor Parado em Estoque' : 'Top 5 — Menor Estoque'}
          </CardTitle>
          <CardDescription>
            {veCusto
              ? 'Produtos com mais capital parado (estoque atual × custo).'
              : 'Produtos com menos unidades disponíveis no momento.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : top5.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Boxes className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum produto ativo cadastrado ainda
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Estoque atual</TableHead>
                  {veCusto && <TableHead className="text-right">Valor parado</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {top5.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.categoria}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.estoque_atual}</TableCell>
                    {veCusto && (
                      <TableCell className="text-right font-medium tabular-nums">
                        {moeda(p.estoque_atual * (p.custo || 0))}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
