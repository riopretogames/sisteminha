import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  CalendarRange,
  Receipt,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  PackageSearch,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/PageHeader';
import { moeda } from '@/lib/format';

/**
 * Dashboard de Vendas — "olha só como tá indo agora".
 *
 * Complementar ao Dashboard (Home), que já resume "Vendas Hoje"/"Caixa Hoje"
 * em um card cada, e ao Relatório de Vendas, que é histórico com filtro de
 * período e exportação CSV. Esta tela não tem filtro nem CSV de propósito —
 * é sempre "hoje" e "esta semana", agora.
 *
 * A permissão (PERMISSIONS.DASHBOARDS_SALES_VIEW) já gate a rota em
 * config/menu.ts, então não repetimos `can()` aqui — é tela só de leitura.
 */

interface ItemVendaRow {
  produto_id: string;
  quantidade: number;
  total: number;
  produtos: { nome: string } | null;
}

interface VendaRow {
  id: string;
  created_at: string;
  total: number | null;
  /** NULL em toda venda comum (usa `total`). Só a venda nova de uma troca
   *  preenche — ver TrocaDevolucao.tsx e VendasHistorico.tsx. */
  valor_faturamento_real: number | null;
  itens_venda: ItemVendaRow[] | null;
}

/** Dinheiro novo que essa venda representou de verdade — ver
 *  RelatorioVendas.tsx, mesma lógica. */
const faturamentoReal = (v: VendaRow) => Number(v.valor_faturamento_real ?? v.total ?? 0);

interface ProdutoAgregado {
  produtoId: string;
  nome: string;
  quantidade: number;
  receita: number;
}

const NOMES_DIA_SEMANA = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
];

/** Chave local 'YYYY-MM-DD' a partir de um Date — evita o desvio de fuso ao
 * agrupar por dia (mesma preocupação documentada em lib/format.ts). */
function chaveDiaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardVenda() {
  // `new Date()` é chamado uma única vez, no mount (useMemo com deps vazias).
  // Todos os limites de data (hoje, ontem, início da semana) derivam daqui —
  // nunca chamamos `new Date()` de novo dentro dos loops de agregação abaixo.
  const limites = useMemo(() => {
    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

    const inicioOntem = new Date(inicioHoje);
    inicioOntem.setDate(inicioOntem.getDate() - 1);

    // Semana = segunda a domingo da semana corrente.
    const diaSemana = inicioHoje.getDay(); // 0 = domingo … 6 = sábado
    const deltaSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
    const inicioSemana = new Date(inicioHoje);
    inicioSemana.setDate(inicioSemana.getDate() - deltaSegunda);

    // Busca desde o mais antigo entre "início da semana" e "ontem": quando
    // hoje é segunda-feira, ontem (domingo) cai fora da semana corrente.
    const inicioBusca = inicioSemana < inicioOntem ? inicioSemana : inicioOntem;

    const diasSemana = NOMES_DIA_SEMANA.map((nome, i) => {
      const dia = new Date(inicioSemana);
      dia.setDate(dia.getDate() + i);
      return { nome, chave: chaveDiaLocal(dia) };
    });

    return { inicioHoje, inicioOntem, inicioSemana, inicioBusca, diasSemana };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-venda', limites.inicioBusca.toISOString()],
    queryFn: async (): Promise<VendaRow[]> => {
      const { data, error } = await supabase
        .from('vendas')
        .select('id, created_at, total, valor_faturamento_real, itens_venda(produto_id, quantidade, total, produtos:vw_produtos(nome))')
        .gte('created_at', limites.inicioBusca.toISOString())
        .neq('status', 'cancelado');
      if (error) throw error;
      return (data ?? []) as unknown as VendaRow[];
    },
  });

  const vendas = data ?? [];

  const vendasHoje = vendas.filter((v) => new Date(v.created_at) >= limites.inicioHoje);
  const vendasOntem = vendas.filter(
    (v) => new Date(v.created_at) >= limites.inicioOntem && new Date(v.created_at) < limites.inicioHoje
  );
  const vendasSemana = vendas.filter((v) => new Date(v.created_at) >= limites.inicioSemana);

  const caixaHoje = vendasHoje.reduce((acc, v) => acc + faturamentoReal(v), 0);
  const caixaSemana = vendasSemana.reduce((acc, v) => acc + faturamentoReal(v), 0);

  // Mesma lógica de "vendasTrend" do Dashboard.tsx: diferença de quantidade
  // de vendas hoje vs ontem.
  const vendasTrend = vendasHoje.length - vendasOntem.length;

  const ticketMedioHoje = vendasHoje.length > 0 ? caixaHoje / vendasHoje.length : null;

  const totalPorDia = limites.diasSemana.map(({ nome, chave }) => {
    const total = vendasSemana
      .filter((v) => chaveDiaLocal(new Date(v.created_at)) === chave)
      .reduce((acc, v) => acc + faturamentoReal(v), 0);
    return { nome, total };
  });
  const melhorDia = totalPorDia.reduce(
    (melhor, atual) => (atual.total > melhor.total ? atual : melhor),
    totalPorDia[0]
  );

  // Agrega itens_venda das vendas da semana por produto — mesmo padrão de
  // agregação client-side usado em IeComercial.tsx.
  const topProdutos: ProdutoAgregado[] = (() => {
    const porProduto = new Map<string, ProdutoAgregado>();
    for (const venda of vendasSemana) {
      for (const item of venda.itens_venda ?? []) {
        if (!item.produtos) continue; // item órfão (produto excluído) — ignora

        const atual = porProduto.get(item.produto_id) ?? {
          produtoId: item.produto_id,
          nome: item.produtos.nome,
          quantidade: 0,
          receita: 0,
        };
        atual.quantidade += item.quantidade;
        atual.receita += Number(item.total ?? 0);
        porProduto.set(item.produto_id, atual);
      }
    }
    return Array.from(porProduto.values())
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titulo="Dashboard de Vendas"
        hint="Como está indo agora: vendas de hoje e desta semana, em tempo real. Para histórico com filtro de período e exportação, use o Relatório de Vendas."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Vendas Hoje */}
        <Card className="overflow-hidden">
          <div className="kpi-vendas p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vendas Hoje</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : moeda(caixaHoje)}</div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Carregando…' : `${vendasHoje.length} venda(s) hoje`}
            </p>
            {!isLoading && (
              <div className="mt-1 flex items-center text-xs text-muted-foreground">
                {vendasTrend >= 0 ? (
                  <ArrowUpRight className="mr-1 h-4 w-4 text-green-500" />
                ) : (
                  <ArrowDownRight className="mr-1 h-4 w-4 text-red-500" />
                )}
                <span className={vendasTrend >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {Math.abs(vendasTrend)}
                </span>
                <span className="ml-1">vs ontem</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vendas da Semana */}
        <Card className="overflow-hidden">
          <div className="kpi-os p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vendas da Semana</CardTitle>
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '—' : moeda(caixaSemana)}</div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Carregando…' : `${vendasSemana.length} venda(s) de segunda até hoje`}
            </p>
          </CardContent>
        </Card>

        {/* Ticket Médio Hoje */}
        <Card className="overflow-hidden">
          <div className="kpi-caixa p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio Hoje</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '—' : ticketMedioHoje !== null ? moeda(ticketMedioHoje) : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? 'Carregando…'
                : ticketMedioHoje !== null
                  ? 'Valor total ÷ vendas de hoje'
                  : 'Nenhuma venda hoje ainda'}
            </p>
          </CardContent>
        </Card>

        {/* Melhor Dia da Semana */}
        <Card className="overflow-hidden">
          <div className="kpi-estoque p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Melhor Dia da Semana</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '—' : melhorDia.total > 0 ? moeda(melhorDia.total) : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? 'Carregando…'
                : melhorDia.total > 0
                  ? melhorDia.nome
                  : 'Nenhuma venda nesta semana ainda'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 produtos mais vendidos esta semana */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 Produtos Mais Vendidos Esta Semana</CardTitle>
          <CardDescription>
            Quantidade e receita por produto, somando os itens das vendas de segunda até hoje.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : topProdutos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <PackageSearch className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum produto vendido nesta semana ainda.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[1%]">#</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd. vendida</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProdutos.map((p, i) => (
                  <TableRow key={p.produtoId}>
                    <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.quantidade}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {moeda(p.receita)}
                    </TableCell>
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
