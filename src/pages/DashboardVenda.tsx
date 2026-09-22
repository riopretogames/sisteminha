import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  Receipt,
  Trophy,
  PackageSearch,
  Medal,
  Users,
  Tags,
  Clock,
  CreditCard,
  Hash,
  Info,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { resolverPeriodo, periodoAnterior, variacao, dentroDoPeriodo } from '@/lib/periodo';
import { montarSerie, melhorPonto, nomeDoGrao } from '@/lib/serie';
import { useFiltrosDashboard } from '@/lib/filtrosDashboard';
import { TabelaRanking, CardIndicador } from '@/components/dashboards/TabelaRanking';
import { FiltrosDashboard } from '@/components/dashboards/FiltrosDashboard';
import { GraficoEvolucao } from '@/components/dashboards/GraficoEvolucao';

/**
 * Dashboard de Vendas.
 *
 * Até 22/09/2026 esta tela era fixa em "hoje" e "esta semana": respondia
 * "como estamos agora" e mais nada. Não dava para ver o mês passado, comparar
 * com o ano anterior, olhar um vendedor só ou uma categoria só — e a resposta
 * para tudo isso era "vá no Relatório de Vendas", que é uma lista, não um
 * painel. Agora o período é escolhido em cima e TODOS os números da tela
 * seguem essa escolha, inclusive os rankings.
 *
 * Como os números se comportam com filtro:
 *
 * - **Sem categoria escolhida**, o valor de uma venda é o dinheiro novo que
 *   ela representou (`valor_faturamento_real`, que difere de `total` quando
 *   houve troca), com as devoluções do período abatidas.
 * - **Com uma categoria escolhida**, a tela passa a somar apenas os itens
 *   daquela categoria — senão uma venda de um console mais um jogo apareceria
 *   inteira dentro de "Jogos". Nesse modo a devolução não é abatida, porque a
 *   devolução é registrada por venda e não guarda de qual categoria era a peça
 *   devolvida; a tela avisa isso na cara, em vez de mostrar um número que
 *   parece exato e não é.
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

export default function DashboardVenda() {
  const [filtros, setFiltros, limparFiltros] = useFiltrosDashboard('venda');

  // `new Date()` é chamado uma única vez por render dos limites, e todos os
  // recortes derivam daqui — nunca chamamos `new Date()` dentro dos loops de
  // agregação abaixo (mesma disciplina de antes, agora com período variável).
  const { periodo, anterior, desdeISO } = useMemo(() => {
    const agora = new Date();
    const periodo = resolverPeriodo(filtros.periodo, agora);
    const anterior = periodoAnterior(filtros.periodo, agora);
    // Uma consulta só cobre os dois períodos: o anterior sempre termina onde
    // o atual começa (ou antes), então basta buscar desde o início dele.
    const desde = anterior.inicio < periodo.inicio ? anterior.inicio : periodo.inicio;
    return { periodo, anterior, desdeISO: desde.toISOString() };
  }, [filtros.periodo]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-venda', desdeISO, periodo.fim.toISOString()],
    queryFn: async (): Promise<{ vendas: VendaRow[]; devolucoes: DevolucaoComVendedor[] }> => {
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
          .gte('created_at', desdeISO)
          .lt('created_at', periodo.fim.toISOString())
          .neq('status', 'cancelado'),
        buscarDevolucoesComVendedorDesde(desdeISO),
      ]);
      if (resVendas.error) throw resVendas.error;
      return { vendas: (resVendas.data ?? []) as unknown as VendaRow[], devolucoes };
    },
  });

  const todasVendas = useMemo(() => data?.vendas ?? [], [data]);
  // Dinheiro devolvido ao cliente não aparece em venda nenhuma: a venda
  // original fica gravada com o valor cheio para sempre. Sem descontar, uma
  // venda devolvida seguia contando inteira no painel, com o dinheiro já fora
  // da gaveta. Régua de data igual à do Caixa (17/08): pesa no dia da
  // devolução, não no da venda original.
  const todasDevolucoes = useMemo(() => data?.devolucoes ?? [], [data]);

  const porCategoria = filtros.categoria !== '';

  /** Lista de vendedores e categorias que aparece nos campos de filtro. */
  const { vendedores, categorias } = useMemo(() => {
    const v = new Map<string, string>();
    const c = new Set<string>();
    for (const venda of todasVendas) {
      if (venda.vendedor_id && venda.vendedor?.nome) v.set(venda.vendedor_id, venda.vendedor.nome);
      for (const item of venda.itens_venda ?? []) {
        if (item.produtos?.categoria) c.add(item.produtos.categoria);
      }
    }
    return {
      vendedores: [...v.entries()]
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      categorias: [...c].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  }, [todasVendas]);

  /** Itens de uma venda que interessam ao filtro de categoria. */
  const itensQueContam = useMemo(
    () => (v: VendaRow) =>
      porCategoria
        ? (v.itens_venda ?? []).filter((i) => i.produtos?.categoria === filtros.categoria)
        : (v.itens_venda ?? []),
    [porCategoria, filtros.categoria],
  );

  /** Quanto essa venda vale para o recorte escolhido — ver nota no topo. */
  const valorDaVenda = useMemo(
    () => (v: VendaRow) =>
      porCategoria
        ? itensQueContam(v).reduce((acc, i) => acc + Number(i.total ?? 0), 0)
        : faturamentoReal(v),
    [porCategoria, itensQueContam],
  );

  /** As vendas que sobram depois dos filtros de vendedor e de categoria. */
  const aplicarFiltros = useMemo(
    () => (vendas: VendaRow[]) =>
      vendas.filter((v) => {
        if (filtros.pessoaId && v.vendedor_id !== filtros.pessoaId) return false;
        if (porCategoria && itensQueContam(v).length === 0) return false;
        return true;
      }),
    [filtros.pessoaId, porCategoria, itensQueContam],
  );

  const vendasPeriodo = useMemo(
    () => aplicarFiltros(todasVendas.filter((v) => dentroDoPeriodo(v.created_at, periodo))),
    [todasVendas, periodo, aplicarFiltros],
  );
  const vendasAnterior = useMemo(
    () => aplicarFiltros(todasVendas.filter((v) => dentroDoPeriodo(v.created_at, anterior))),
    [todasVendas, anterior, aplicarFiltros],
  );

  /**
   * Devoluções que entram na conta.
   *
   * Com categoria escolhida ficam todas de fora (ver nota no topo). Com
   * vendedor escolhido, só as devoluções de vendas que ele fez — senão o
   * painel de um vendedor levaria o desconto de venda que era de outro.
   */
  const devolucoesDe = useMemo(
    () => (p: typeof periodo) => {
      if (porCategoria) return [];
      return todasDevolucoes.filter((d) => {
        if (!dentroDoPeriodo(d.created_at, p)) return false;
        if (filtros.pessoaId && d.venda_original?.vendedor_id !== filtros.pessoaId) return false;
        return true;
      });
    },
    [todasDevolucoes, porCategoria, filtros.pessoaId],
  );

  const devolucoesPeriodo = devolucoesDe(periodo);
  const devolucoesAnterior = devolucoesDe(anterior);

  const faturamento =
    vendasPeriodo.reduce((acc, v) => acc + valorDaVenda(v), 0) - somarDevolucoes(devolucoesPeriodo);
  const faturamentoAnterior =
    vendasAnterior.reduce((acc, v) => acc + valorDaVenda(v), 0) -
    somarDevolucoes(devolucoesAnterior);

  const quantidade = vendasPeriodo.length;
  const quantidadeAnterior = vendasAnterior.length;

  const ticketMedio = quantidade > 0 ? faturamento / quantidade : null;
  const ticketMedioAnterior =
    quantidadeAnterior > 0 ? faturamentoAnterior / quantidadeAnterior : null;

  // A comparação só aparece se a chave estiver ligada. `undefined` = não pedimos
  // comparação; `null` = pedimos e não há base (ver CardIndicador).
  const comp = (atual: number, ant: number) =>
    filtros.comparar ? variacao(atual, ant) : undefined;
  const rotuloVs = `vs ${anterior.rotulo}`;

  const serie = useMemo(
    () =>
      montarSerie(
        periodo,
        vendasPeriodo,
        { data: (v) => v.created_at, valor: valorDaVenda },
        {
          itens: devolucoesPeriodo,
          extrair: {
            data: (d) => d.created_at,
            valor: (d) => Number(d.valor_devolvido_cliente ?? 0),
          },
        },
      ),
    [periodo, vendasPeriodo, valorDaVenda, devolucoesPeriodo],
  );
  const melhor = melhorPonto(serie);
  const grao = nomeDoGrao(periodo);

  const itensDoPeriodo = vendasPeriodo.flatMap(itensQueContam);

  // Produto: item órfão (produto excluído do cadastro) fica de fora — sem o
  // cadastro não há nome para mostrar.
  const topProdutos = porQuantidade(
    agrupar(itensDoPeriodo, {
      chave: (i) => (i.produtos ? i.produto_id : null),
      nome: (i) => i.produtos?.nome,
      quantidade: (i) => i.quantidade,
      valor: (i) => Number(i.total ?? 0),
    }),
  );

  const topCategorias = porValor(
    agrupar(itensDoPeriodo, {
      chave: (i) => i.produtos?.categoria,
      nome: (i) => i.produtos?.categoria,
      quantidade: (i) => i.quantidade,
      valor: (i) => Number(i.total ?? 0),
    }),
  );

  /**
   * Ranking de vendedores do período, JÁ COM A DEVOLUÇÃO ABATIDA.
   *
   * A devolução guarda a venda que a originou (`venda_original_id`), e a venda
   * guarda quem a fechou — então o abatimento cai na conta certa, sem rateio e
   * sem chute. Assim a soma do ranking bate com o faturamento dos cards, e
   * ninguém fica em primeiro lugar com dinheiro que já voltou pela porta.
   *
   * Alguém pode aparecer com valor negativo — vendeu antes, devolveram dentro
   * do período — e isso é a leitura correta do dinheiro que entrou agora.
   */
  const rankingVendedores = porValor(
    descontar(
      agrupar(vendasPeriodo, {
        chave: (v) => v.vendedor_id,
        nome: (v) => v.vendedor?.nome,
        valor: valorDaVenda,
      }),
      devolucoesPeriodo
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
      vendasPeriodo.flatMap((v) => v.pagamentos_venda ?? []),
      {
        chave: (p) => p.formas_pagamento?.descricao,
        nome: (p) => p.formas_pagamento?.descricao,
        valor: (p) => Number(p.valor ?? 0),
      },
    ),
  );

  // Hora em que mais se fecha venda. Serve para escala de equipe: saber que o
  // movimento é das 14h às 16h vale mais, na prática, que saber o total do dia.
  const pico = horarioDePico(vendasPeriodo.map((v) => v.created_at));

  const recorte = [
    filtros.pessoaId ? vendedores.find((v) => v.id === filtros.pessoaId)?.nome : null,
    filtros.categoria || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titulo="Dashboard de Vendas"
        hint="Escolha o período, o vendedor e a categoria — todos os números da tela, inclusive os rankings, seguem o que estiver filtrado aqui em cima."
      />

      <FiltrosDashboard
        valores={filtros}
        onChange={setFiltros}
        onLimpar={limparFiltros}
        pessoas={vendedores}
        rotuloPessoa="Vendedor"
        categorias={categorias}
        rotuloCategoria="Categoria"
      />

      {porCategoria && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Com uma categoria escolhida, os valores somam <strong>apenas os itens dessa
            categoria</strong> dentro de cada venda. Devolução não é abatida neste modo: ela é
            registrada por venda e não guarda de qual categoria era a peça devolvida.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <CardIndicador
          titulo="Faturamento"
          faixa="kpi-vendas"
          icone={<ShoppingCart className="h-4 w-4" />}
          carregando={isLoading}
          valor={moeda(faturamento)}
          detalhe={`${periodo.rotulo}${recorte ? ` · ${recorte}` : ''}`}
          variacaoPct={comp(faturamento, faturamentoAnterior)}
          rotuloComparacao={rotuloVs}
        />

        <CardIndicador
          titulo="Vendas no Período"
          faixa="kpi-os"
          icone={<Hash className="h-4 w-4" />}
          carregando={isLoading}
          valor={String(quantidade)}
          detalhe={quantidade === 1 ? 'venda fechada' : 'vendas fechadas'}
          variacaoPct={comp(quantidade, quantidadeAnterior)}
          rotuloComparacao={rotuloVs}
        />

        <CardIndicador
          titulo="Ticket Médio"
          faixa="kpi-caixa"
          icone={<Receipt className="h-4 w-4" />}
          carregando={isLoading}
          valor={ticketMedio !== null ? moeda(ticketMedio) : '—'}
          detalhe={
            ticketMedio !== null ? 'Faturamento ÷ nº de vendas' : 'Nenhuma venda no período'
          }
          variacaoPct={
            ticketMedio !== null && ticketMedioAnterior !== null
              ? comp(ticketMedio, ticketMedioAnterior)
              : undefined
          }
          rotuloComparacao={rotuloVs}
        />

        <CardIndicador
          titulo={`Melhor ${grao === 'mês' ? 'Mês' : grao === 'semana' ? 'Semana' : 'Dia'}`}
          faixa="kpi-estoque"
          icone={<Trophy className="h-4 w-4" />}
          carregando={isLoading}
          valor={melhor ? moeda(melhor.valor) : '—'}
          detalhe={melhor ? melhor.rotulo : 'Nenhuma venda no período'}
        />
      </div>

      <GraficoEvolucao
        titulo="Como o período andou"
        descricao={`Faturamento por ${grao} dentro de ${periodo.rotulo.toLowerCase()}. Devolução aparece como queda no ${grao} em que o dinheiro voltou.`}
        serie={serie}
        carregando={isLoading}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <CardIndicador
          titulo="Melhor Vendedor"
          faixa="kpi-vendas"
          icone={<Medal className="h-4 w-4" />}
          carregando={isLoading}
          valor={melhorVendedor ? moeda(melhorVendedor.valor) : '—'}
          detalhe={
            melhorVendedor
              ? `${melhorVendedor.nome} · ${melhorVendedor.quantidade} venda(s)`
              : 'Nenhuma venda com vendedor registrado no período'
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
              ? `${pico.quantidade} venda(s) fecharam nessa faixa`
              : 'Sem vendas no período'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TabelaRanking
          titulo="Ranking de Vendedores"
          descricao="Quem fechou venda no período, já descontando o que foi devolvido — a devolução é abatida de quem fez a venda original."
          linhas={rankingVendedores}
          rotuloNome="Vendedor"
          rotuloQuantidade="Vendas"
          rotuloValor="Faturamento"
          vazio="Nenhuma venda com vendedor registrado no período."
          icone={<Users className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Categorias Mais Vendidas"
          descricao="Onde o dinheiro entrou, por tipo de produto, no período escolhido."
          linhas={topCategorias}
          rotuloNome="Categoria"
          rotuloQuantidade="Peças"
          rotuloValor="Receita"
          vazio="Nenhum produto vendido no período."
          icone={<Tags className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Produtos Mais Vendidos"
          descricao="Ordenado por quantidade — o que mais saiu da prateleira no período."
          linhas={topProdutos}
          rotuloNome="Produto"
          rotuloQuantidade="Qtd. vendida"
          rotuloValor="Receita"
          vazio="Nenhum produto vendido no período."
          icone={<PackageSearch className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Como o Cliente Paga"
          descricao="Formas de pagamento usadas nas vendas do período."
          linhas={formasPagamento}
          rotuloNome="Forma"
          rotuloQuantidade="Usos"
          rotuloValor="Valor"
          vazio="Nenhum pagamento registrado no período."
          icone={<CreditCard className="h-12 w-12" />}
          carregando={isLoading}
        />
      </div>
    </div>
  );
}
