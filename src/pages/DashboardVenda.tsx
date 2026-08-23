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
  Medal,
  Users,
  Tags,
  Clock,
  CreditCard,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/PageHeader';
import { moeda } from '@/lib/format';
import {
  buscarDevolucoesComVendedorDesde,
  somarDevolucoes,
  type DevolucaoComVendedor,
} from '@/lib/faturamento';
import {
  agrupar,
  porValor,
  porQuantidade,
  descontar,
  lider,
  horarioDePico,
  faixaDeHora,
} from '@/lib/ranking';
import { TabelaRanking, CardIndicador } from '@/components/dashboards/TabelaRanking';

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
  produtos: { nome: string; categoria: string | null } | null;
}

interface VendaRow {
  id: string;
  created_at: string;
  total: number | null;
  /** NULL em toda venda comum (usa `total`). Só a venda nova de uma troca
   *  preenche — ver TrocaDevolucao.tsx e VendasHistorico.tsx. */
  valor_faturamento_real: number | null;
  /** Pode ser NULL: venda antiga importada, ou balcão sem atribuição. O
   *  ranking ignora essas em vez de inventar um vendedor "sem nome". */
  vendedor_id: string | null;
  vendedor: { nome: string } | null;
  itens_venda: ItemVendaRow[] | null;
  pagamentos_venda: { valor: number; formas_pagamento: { descricao: string } | null }[] | null;
}

/** Dinheiro novo que essa venda representou de verdade — ver
 *  RelatorioVendas.tsx, mesma lógica. */
const faturamentoReal = (v: VendaRow) => Number(v.valor_faturamento_real ?? v.total ?? 0);

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
    queryFn: async (): Promise<{ vendas: VendaRow[]; devolucoes: DevolucaoComVendedor[] }> => {
      const desde = limites.inicioBusca.toISOString();
      const [resVendas, devolucoes] = await Promise.all([
        supabase
          .from('vendas')
          // Numa linha só: o TypeScript lê este texto literalmente para saber o
          // formato do resultado. Quebrado com `+`, o retorno vira "erro
          // genérico" e engano de nome de coluna passa batido.
          //
          // `produtos:vw_produtos(...)` é a regra de custo protegido — leitura
          // de produto passa SEMPRE pela view, mesmo sem pedir custo. O apelido
          // mantém a chave `produtos` no JSON.
          .select('id, created_at, total, valor_faturamento_real, vendedor_id, vendedor:profiles(nome), itens_venda(produto_id, quantidade, total, produtos:vw_produtos(nome, categoria)), pagamentos_venda(valor, formas_pagamento(descricao))')
          .gte('created_at', desde)
          .neq('status', 'cancelado'),
        buscarDevolucoesComVendedorDesde(desde),
      ]);
      if (resVendas.error) throw resVendas.error;
      return { vendas: (resVendas.data ?? []) as unknown as VendaRow[], devolucoes };
    },
  });

  const vendas = data?.vendas ?? [];
  // Dinheiro devolvido ao cliente não aparece em venda nenhuma: a venda
  // original fica gravada com o valor cheio para sempre. Sem descontar,
  // uma venda devolvida no mesmo dia seguia contando inteira no painel,
  // com o dinheiro já fora da gaveta. Régua de data igual à do Caixa
  // (17/08): pesa no dia da devolução, não no da venda original.
  const devolucoes = data?.devolucoes ?? [];

  const vendasHoje = vendas.filter((v) => new Date(v.created_at) >= limites.inicioHoje);
  const vendasOntem = vendas.filter(
    (v) => new Date(v.created_at) >= limites.inicioOntem && new Date(v.created_at) < limites.inicioHoje
  );
  const vendasSemana = vendas.filter((v) => new Date(v.created_at) >= limites.inicioSemana);

  const devolucoesHoje = devolucoes.filter((d) => new Date(d.created_at) >= limites.inicioHoje);
  const devolucoesSemana = devolucoes.filter((d) => new Date(d.created_at) >= limites.inicioSemana);

  const caixaHoje =
    vendasHoje.reduce((acc, v) => acc + faturamentoReal(v), 0) - somarDevolucoes(devolucoesHoje);
  const caixaSemana =
    vendasSemana.reduce((acc, v) => acc + faturamentoReal(v), 0) - somarDevolucoes(devolucoesSemana);

  // Mesma lógica de "vendasTrend" do Dashboard.tsx: diferença de quantidade
  // de vendas hoje vs ontem.
  const vendasTrend = vendasHoje.length - vendasOntem.length;

  const ticketMedioHoje = vendasHoje.length > 0 ? caixaHoje / vendasHoje.length : null;

  const totalPorDia = limites.diasSemana.map(({ nome, chave }) => {
    const vendido = vendasSemana
      .filter((v) => chaveDiaLocal(new Date(v.created_at)) === chave)
      .reduce((acc, v) => acc + faturamentoReal(v), 0);
    // Desconta no mesmo dia da devolução — senão o "melhor dia da semana"
    // pode ser justamente um dia que teve tudo devolvido.
    const devolvido = somarDevolucoes(
      devolucoesSemana.filter((d) => chaveDiaLocal(new Date(d.created_at)) === chave)
    );
    return { nome, total: vendido - devolvido };
  });
  const melhorDia = totalPorDia.reduce(
    (melhor, atual) => (atual.total > melhor.total ? atual : melhor),
    totalPorDia[0]
  );

  const itensDaSemana = vendasSemana.flatMap((v) => v.itens_venda ?? []);

  // Produto: item órfão (produto excluído do cadastro) fica de fora — sem o
  // cadastro não há nome para mostrar.
  const topProdutos = porQuantidade(
    agrupar(itensDaSemana, {
      chave: (i) => (i.produtos ? i.produto_id : null),
      nome: (i) => i.produtos?.nome,
      quantidade: (i) => i.quantidade,
      valor: (i) => Number(i.total ?? 0),
    }),
  );

  const topCategorias = porValor(
    agrupar(itensDaSemana, {
      chave: (i) => i.produtos?.categoria,
      nome: (i) => i.produtos?.categoria,
      quantidade: (i) => i.quantidade,
      valor: (i) => Number(i.total ?? 0),
    }),
  );

  /**
   * Ranking de vendedores da semana, JÁ COM A DEVOLUÇÃO ABATIDA.
   *
   * A devolução guarda a venda que a originou (`venda_original_id`), e a venda
   * guarda quem a fechou — então o abatimento cai na conta certa, sem rateio e
   * sem chute. Assim a soma do ranking bate com o faturamento dos cards, e
   * ninguém fica em primeiro lugar com dinheiro que já voltou pela porta.
   *
   * Régua de data igual à do Caixa e à dos cards (17/08): a devolução pesa na
   * semana em que ACONTECEU, não na semana da venda original. Por isso alguém
   * pode aparecer com valor negativo — vendeu antes, devolveram agora — e isso
   * é a leitura correta do dinheiro que entrou nesta semana.
   *
   * Devolução sem venda de origem fica de fora daqui, mas continua pesando no
   * total da loja lá em cima: não há de quem abater.
   */
  const rankingVendedores = porValor(
    descontar(
      agrupar(vendasSemana, {
        chave: (v) => v.vendedor_id,
        nome: (v) => v.vendedor?.nome,
        valor: (v) => faturamentoReal(v),
      }),
      devolucoesSemana
        .filter((d) => d.venda_original?.vendedor_id)
        .map((d) => ({
          chave: d.venda_original!.vendedor_id!,
          nome: d.venda_original!.vendedor?.nome ?? 'Sem nome',
          valor: Number(d.valor_devolvido_cliente ?? 0),
        })),
    ),
  );
  const melhorVendedor = lider(rankingVendedores);

  const formasPagamento = porValor(
    agrupar(
      vendasSemana.flatMap((v) => v.pagamentos_venda ?? []),
      {
        chave: (p) => p.formas_pagamento?.descricao,
        nome: (p) => p.formas_pagamento?.descricao,
        valor: (p) => Number(p.valor ?? 0),
      },
    ),
  );

  // Hora em que mais se fecha venda na semana. Serve para escala de equipe:
  // saber que o movimento é das 14h às 16h vale mais, na prática, que saber
  // o total do dia.
  const pico = horarioDePico(vendasSemana.map((v) => v.created_at));

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

      {/* Segunda fileira: quem vendeu mais e quando a loja enche */}
      <div className="grid gap-4 md:grid-cols-2">
        <CardIndicador
          titulo="Melhor Vendedor da Semana"
          faixa="kpi-vendas"
          icone={<Medal className="h-4 w-4" />}
          carregando={isLoading}
          valor={melhorVendedor ? moeda(melhorVendedor.valor) : '—'}
          detalhe={
            melhorVendedor
              ? `${melhorVendedor.nome} · ${melhorVendedor.quantidade} venda(s)`
              : 'Nenhuma venda com vendedor registrado nesta semana'
          }
        />
        <CardIndicador
          titulo="Horário de Pico"
          faixa="kpi-caixa"
          icone={<Clock className="h-4 w-4" />}
          carregando={isLoading}
          valor={pico ? faixaDeHora(pico.hora) : '—'}
          detalhe={
            pico
              ? `${pico.quantidade} venda(s) fecharam nessa faixa esta semana`
              : 'Sem vendas nesta semana ainda'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TabelaRanking
          titulo="Ranking de Vendedores"
          descricao="Quem fechou venda de segunda até hoje, já descontando o que foi devolvido — a devolução é abatida de quem fez a venda original."
          linhas={rankingVendedores}
          rotuloNome="Vendedor"
          rotuloQuantidade="Vendas"
          rotuloValor="Faturamento"
          vazio="Nenhuma venda com vendedor registrado nesta semana."
          icone={<Users className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Categorias Mais Vendidas"
          descricao="Onde o dinheiro entrou, por tipo de produto, nas vendas desta semana."
          linhas={topCategorias}
          rotuloNome="Categoria"
          rotuloQuantidade="Peças"
          rotuloValor="Receita"
          vazio="Nenhum produto vendido nesta semana ainda."
          icone={<Tags className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Produtos Mais Vendidos"
          descricao="Ordenado por quantidade — o que mais sai da prateleira, de segunda até hoje."
          linhas={topProdutos}
          rotuloNome="Produto"
          rotuloQuantidade="Qtd. vendida"
          rotuloValor="Receita"
          vazio="Nenhum produto vendido nesta semana ainda."
          icone={<PackageSearch className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Como o Cliente Paga"
          descricao="Formas de pagamento usadas nas vendas desta semana."
          linhas={formasPagamento}
          rotuloNome="Forma"
          rotuloQuantidade="Usos"
          rotuloValor="Valor"
          vazio="Nenhum pagamento registrado nesta semana."
          icone={<CreditCard className="h-12 w-12" />}
          carregando={isLoading}
        />
      </div>
    </div>
  );
}
