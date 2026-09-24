import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  DollarSign,
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpRight,
  PackageMinus,
  PackagePlus,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';
import { estoqueCritico } from '@/lib/estoque';
import { moeda } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { resolverPeriodo, periodoAnterior, variacao, dentroDoPeriodo } from '@/lib/periodo';
import { montarSerie, nomeDoGrao } from '@/lib/serie';
import { useFiltrosDashboard, useCorrigirFiltroOrfao } from '@/lib/filtrosDashboard';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import { gruposDeProduto, useListaDoSistema, SEM_GRUPO } from '@/lib/listasDeFiltro';
import { CardIndicador } from '@/components/dashboards/TabelaRanking';
import { FiltrosDashboard } from '@/components/dashboards/FiltrosDashboard';
import { GraficoEvolucao } from '@/components/dashboards/GraficoEvolucao';

/**
 * Dashboard de Estoque.
 *
 * Esta tela mistura duas naturezas diferentes, e a diferença precisa ficar
 * clara para quem lê:
 *
 * - **O que está na prateleira agora** (produtos ativos, valor parado, estoque
 *   crítico) é uma FOTO DO MOMENTO. Não existe "valor parado do mês passado" —
 *   o sistema guarda o saldo de hoje, não o de cada dia. Por isso esses
 *   números NÃO seguem o filtro de período; seguem só o de categoria.
 * - **O que entrou e saiu** (movimentações) é movimento, e aí sim o período
 *   manda: dá para ver o que se mexeu ontem, no mês passado ou no ano
 *   inteiro, com comparação.
 *
 * A tela diz isso na cara, em vez de deixar alguém achar que o valor em
 * estoque mudou porque escolheu outro período.
 *
 * O corte crítico (estoque_atual <= estoque_minimo) é sempre calculado no
 * cliente — o PostgREST não compara duas colunas da mesma linha direto no
 * filtro, mesma limitação já corrigida em Dashboard.tsx e EstoqueCritico.tsx.
 */

interface ProdutoEstoque {
  id: string;
  nome: string;
  ativo: boolean;
  categoria: string;
  /** Grupo de Produto — a lista editável que manda nos filtros desde 23/09. */
  grupo_produto_id: string | null;
  estoque_atual: number;
  estoque_minimo: number;
  custo: number;
  preco: number;
}

interface MovimentoRow {
  created_at: string | null;
  produto_id: string | null;
  quantidade: number | null;
  tipo: string | null;
  valor_total: number | null;
}

export default function DashboardEstoque() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);

  const [filtros, setFiltros, limparFiltros] = useFiltrosDashboard('estoque');

  const { periodo, anterior, desdeISO } = useMemo(() => {
    const agora = new Date();
    const periodo = resolverPeriodo(filtros.periodo, agora);
    const anterior = periodoAnterior(filtros.periodo, agora);
    const desde = anterior.inicio < periodo.inicio ? anterior.inicio : periodo.inicio;
    return { periodo, anterior, desdeISO: desde.toISOString() };
  }, [filtros.periodo]);

  const { data, isLoading, isSuccess } = useQuery({
    queryKey: ['dashboard-estoque', desdeISO, periodo.fim.toISOString()],
    queryFn: async (): Promise<{ produtos: ProdutoEstoque[]; movimentos: MovimentoRow[] }> => {
      // Produto e movimento passam pelas views `vw_*` — regra de custo
      // protegido: quem não pode ver custo recebe a coluna vazia, sem erro.
      //
      // TODOS os produtos, inclusive os desativados: o movimento de um produto
      // que saiu de linha continua dentro do período, e sem ele o filtro por
      // grupo sumia com essas entradas e saídas (achado da revisão de 23/09).
      // As contas da prateleira (ativos, valor parado, crítico) usam só os
      // ativos, logo abaixo.
      //
      // Em páginas: loja com mais de 1.000 produtos, ou "Este ano" com mais de
      // 1.000 movimentos, era cortada calada (lib/buscarEmPaginas.ts).
      const [produtos, movimentos] = await Promise.all([
        buscarEmPaginas<ProdutoEstoque>(() =>
          supabase
            .from('vw_produtos')
            .select('id, nome, ativo, categoria, grupo_produto_id, estoque_atual, estoque_minimo, custo, preco')
            .order('id'),
        ),
        buscarEmPaginas<MovimentoRow>(() =>
          supabase
            .from('vw_movimentos_estoque')
            .select('id, created_at, produto_id, quantidade, tipo, valor_total')
            .gte('created_at', desdeISO)
            .lt('created_at', periodo.fim.toISOString())
            .order('created_at')
            .order('id'),
        ),
      ]);
      return { produtos, movimentos };
    },
  });

  // `catalogoInteiro` inclui os desativados (para achar o grupo do movimento);
  // `todosProdutos` é a prateleira de hoje: só os ativos.
  const catalogoInteiro = useMemo(() => data?.produtos ?? [], [data]);
  const todosProdutos = useMemo(() => catalogoInteiro.filter((p) => p.ativo), [catalogoInteiro]);
  const todosMovimentos = useMemo(() => data?.movimentos ?? [], [data]);

  // A lista vem do CADASTRO (Cadastros > Listas do Sistema), não dos produtos
  // carregados: grupo sem produto nenhum hoje continua no filtro — é a
  // pergunta "por que não temos nada nesse grupo?". Ver lib/listasDeFiltro.ts.
  const { data: gruposCadastrados } = useListaDoSistema('grupo_produto');

  const produtosSemGrupo = useMemo(
    () => todosProdutos.filter((p) => !p.grupo_produto_id).length,
    [todosProdutos],
  );

  const categorias = useMemo(
    () => gruposDeProduto(gruposCadastrados ?? [], produtosSemGrupo > 0),
    [gruposCadastrados, produtosSemGrupo],
  );

  // isSuccess: com a consulta em erro, o filtro não pode ser apagado à toa.
  useCorrigirFiltroOrfao(filtros, setFiltros, { categorias }, isSuccess && gruposCadastrados !== undefined);

  const produtos = useMemo(() => {
    if (!filtros.categoria) return todosProdutos;
    if (filtros.categoria === SEM_GRUPO) return todosProdutos.filter((p) => !p.grupo_produto_id);
    return todosProdutos.filter((p) => p.grupo_produto_id === filtros.categoria);
  }, [todosProdutos, filtros.categoria]);

  /**
   * Movimento pertence ao grupo filtrado? Decide pelo produto que ele moveu —
   * procurado no catálogo INTEIRO, inclusive produto desativado.
   */
  const movimentos = useMemo(() => {
    if (!filtros.categoria) return todosMovimentos;
    const doGrupo = new Set(
      catalogoInteiro
        .filter((p) =>
          filtros.categoria === SEM_GRUPO ? !p.grupo_produto_id : p.grupo_produto_id === filtros.categoria,
        )
        .map((p) => p.id),
    );
    return todosMovimentos.filter((m) => m.produto_id && doGrupo.has(m.produto_id));
  }, [todosMovimentos, catalogoInteiro, filtros.categoria]);

  const movimentosPeriodo = useMemo(
    () => movimentos.filter((m) => m.created_at && dentroDoPeriodo(m.created_at, periodo)),
    [movimentos, periodo],
  );
  const movimentosAnterior = useMemo(
    () => movimentos.filter((m) => m.created_at && dentroDoPeriodo(m.created_at, anterior)),
    [movimentos, anterior],
  );

  // Entrada e saída são contadas em PEÇAS, não em reais: a pergunta aqui é
  // "quanta mercadoria girou", e o valor de custo nem sempre está preenchido.
  const pecasPorTipo = (lista: MovimentoRow[], tipo: 'entrada' | 'saida') =>
    lista
      .filter((m) => m.tipo === tipo)
      .reduce((soma, m) => soma + Math.abs(Number(m.quantidade ?? 0)), 0);

  const entradas = pecasPorTipo(movimentosPeriodo, 'entrada');
  const saidas = pecasPorTipo(movimentosPeriodo, 'saida');
  const entradasAnterior = pecasPorTipo(movimentosAnterior, 'entrada');
  const saidasAnterior = pecasPorTipo(movimentosAnterior, 'saida');

  const produtosCriticos = produtos.filter(estoqueCritico).length;
  const valorTotalEstoque = produtos.reduce((acc, p) => acc + p.estoque_atual * (p.custo || 0), 0);

  const comp = (atual: number, ant: number) => (filtros.comparar ? variacao(atual, ant) : undefined);
  const rotuloVs = `vs ${anterior.rotulo}`;

  // O gráfico conta PEÇAS movimentadas, então o valor de cada ponto é a
  // quantidade — por isso o rótulo do gráfico não é dinheiro.
  const serie = useMemo(
    () =>
      montarSerie(periodo, movimentosPeriodo, {
        data: (m) => m.created_at!,
        valor: (m) => Math.abs(Number(m.quantidade ?? 0)),
      }),
    [periodo, movimentosPeriodo],
  );
  const grao = nomeDoGrao(periodo);

  // Com permissão de custo: quem mais tem capital parado. Sem permissão:
  // só a lista de quem tem menos unidades (sem expor custo/valor).
  const top5 = veCusto
    ? [...produtos]
        .sort((a, b) => b.estoque_atual * (b.custo || 0) - a.estoque_atual * (a.custo || 0))
        .slice(0, 5)
    : [...produtos].sort((a, b) => a.estoque_atual - b.estoque_atual).slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titulo="Dashboard de Estoque"
        hint="O que está na prateleira agora e o que entrou e saiu no período escolhido. Escolha o grupo de produto para olhar só uma parte do estoque."
      />

      <FiltrosDashboard
        valores={filtros}
        onChange={setFiltros}
        onLimpar={limparFiltros}
        categorias={categorias}
        rotuloCategoria="Grupo de produto"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Produtos ativos, valor parado e estoque crítico mostram <strong>a prateleira de
          hoje</strong> — o sistema guarda o saldo de agora, não o de cada dia passado. Quem
          obedece ao período são as entradas e saídas.
        </AlertDescription>
      </Alert>

      {produtosSemGrupo > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>{produtosSemGrupo} produto(s) ativos ainda não têm Grupo de Produto</strong> —
            eles só aparecem escolhendo "Sem grupo definido" no filtro. Para arrumar, edite o
            produto em Estoque e escolha o grupo; a lista de grupos é editada em Cadastros &gt;
            Listas do Sistema.
          </AlertDescription>
        </Alert>
      )}

      <div className={`grid gap-4 md:grid-cols-2 ${veCusto ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <CardIndicador
          titulo="Produtos Ativos"
          faixa="kpi-estoque"
          icone={<Boxes className="h-4 w-4" />}
          carregando={isLoading}
          valor={String(produtos.length)}
          detalhe={
            filtros.categoria
              ? `Em ${categorias.find((c) => c.id === filtros.categoria)?.nome ?? filtros.categoria}`
              : 'Cadastrados e ativos'
          }
        />

        {veCusto && (
          <CardIndicador
            titulo="Valor em Estoque"
            faixa="kpi-estoque"
            icone={<DollarSign className="h-4 w-4" />}
            carregando={isLoading}
            valor={moeda(valorTotalEstoque)}
            detalhe="Estoque atual × custo, hoje"
          />
        )}

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
            <div className="text-2xl font-bold">{isLoading ? '—' : produtosCriticos}</div>
            {produtosCriticos > 0 ? (
              <div className="flex items-center text-xs text-amber-600">
                <ArrowUpRight className="mr-1 h-4 w-4" />
                Ver lista completa
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Tudo em ordem!</p>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
          onClick={() => navigate('/estoque/movimentacoes')}
        >
          <div className="kpi-estoque p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Movimentações</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '—' : movimentosPeriodo.length}
            </div>
            <p className="text-xs text-muted-foreground">{periodo.rotulo}</p>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="mr-1 h-4 w-4" />
              Ver movimentações
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CardIndicador
          titulo="Entrou no Período"
          faixa="kpi-vendas"
          icone={<PackagePlus className="h-4 w-4" />}
          carregando={isLoading}
          valor={`${entradas} peça(s)`}
          detalhe={`Mercadoria que chegou · ${periodo.rotulo}`}
          variacaoPct={comp(entradas, entradasAnterior)}
          rotuloComparacao={rotuloVs}
        />
        <CardIndicador
          titulo="Saiu no Período"
          faixa="kpi-os"
          icone={<PackageMinus className="h-4 w-4" />}
          carregando={isLoading}
          valor={`${saidas} peça(s)`}
          detalhe="Vendas, uso em OS e ajustes de baixa"
          variacaoPct={comp(saidas, saidasAnterior)}
          rotuloComparacao={rotuloVs}
        />
      </div>

      <GraficoEvolucao
        titulo="Movimento da prateleira"
        descricao={`Peças que entraram ou saíram por ${grao}, dentro de ${periodo.rotulo.toLowerCase()}.`}
        serie={serie}
        carregando={isLoading}
        rotuloValor="Peças movimentadas"
        formatarValor={(v) => `${v} peça(s)`}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {veCusto ? 'Top 5 — Valor Parado em Estoque' : 'Top 5 — Menor Estoque'}
          </CardTitle>
          <CardDescription>
            {veCusto
              ? 'Produtos com mais capital parado (estoque atual × custo), na prateleira de hoje.'
              : 'Produtos com menos unidades disponíveis no momento.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : top5.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Boxes className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                {filtros.categoria
                  ? `Nenhum produto ativo em ${categorias.find((c) => c.id === filtros.categoria)?.nome ?? filtros.categoria}`
                  : 'Nenhum produto ativo cadastrado ainda'}
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
