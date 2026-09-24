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
import { fatorDaVenda, pagamentosSemTroco } from '@/lib/dinheiroDaVenda';
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
import { useFiltrosDashboard, useCorrigirFiltroOrfao } from '@/lib/filtrosDashboard';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import {
  gruposDeProduto,
  unirOpcoes,
  usePessoasDoFiltro,
  useListaDoSistema,
  SEM_GRUPO,
  type OpcaoFiltro,
} from '@/lib/listasDeFiltro';
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
 * - **Com um grupo escolhido**, a tela passa a somar apenas os itens daquele
 *   grupo — senão uma venda de um console mais um jogo apareceria inteira
 *   dentro de "Jogos". Cada item vale o seu preço com o desconto da venda
 *   rateado (`fatorDaVenda`), e a devolução é abatida pelas PEÇAS DO GRUPO que
 *   voltaram (`devolucao_itens` guarda o produto), com o mesmo rateio da venda
 *   original — a mesma conta do painel de Metas. Até 24/09 este modo somava o
 *   preço cheio (sem o desconto) e ignorava a devolução, e a tela ainda
 *   afirmava que a devolução "não guarda de qual grupo era a peça" — não era
 *   verdade (achados 62 e 70 da revisão de 24/09/2026).
 *
 * A permissão (PERMISSIONS.DASHBOARDS_SALES_VIEW) já gate a rota em
 * config/menu.ts, então não repetimos `can()` aqui — é tela só de leitura.
 */

interface ItemVendaRow {
  produto_id: string;
  quantidade: number;
  total: number;
  produtos: {
    nome: string;
    categoria: string | null;
    /** O Grupo de Produto (Console, Jogo, Controle…) — a lista que a loja
     *  edita em Cadastros > Listas do Sistema, e que manda nos filtros desde
     *  23/09/2026. Nulo = produto que ninguém classificou ainda. */
    grupo_produto_id: string | null;
  } | null;
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
  pagamentos_venda: {
    valor: number;
    formas_pagamento: { descricao: string; entra_no_caixa: boolean } | null;
  }[] | null;
}

/**
 * Uma devolução, com o que o painel precisa para abatê-la: quem fez a venda
 * original (ranking), quanto a venda original cobrou de verdade (o rateio do
 * desconto) e as peças que voltaram, com o grupo de cada uma (modo por grupo).
 */
interface DevolucaoDoPainel {
  created_at: string;
  valor_devolvido_cliente: number | null;
  venda_original: {
    vendedor_id: string | null;
    vendedor: { nome: string } | null;
    total: number | null;
    itens_venda: { total: number | null }[] | null;
  } | null;
  devolucao_itens: Array<{
    quantidade: number;
    preco_unitario: number | null;
    produtos: { grupo_produto_id: string | null } | null;
  }> | null;
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

  const { data, isLoading, isSuccess, error } = useQuery({
    queryKey: ['dashboard-venda', desdeISO, periodo.fim.toISOString()],
    queryFn: async (): Promise<{ vendas: VendaRow[]; devolucoes: DevolucaoDoPainel[] }> => {
      // Em páginas: "Ano passado" busca dois anos de venda para comparar, e o
      // Supabase corta calado em 1.000 linhas (lib/buscarEmPaginas.ts).
      const [vendas, devolucoes] = await Promise.all([
        buscarEmPaginas<VendaRow>(() => supabase
          .from('vendas')
          // Numa linha só: o TypeScript lê este texto literalmente para saber o
          // formato do resultado. Quebrado com `+`, o retorno vira "erro
          // genérico" e engano de nome de coluna passa batido.
          //
          // `produtos:vw_produtos(...)` é a regra de custo protegido — leitura
          // de produto passa SEMPRE pela view, mesmo sem pedir custo. O apelido
          // mantém a chave `produtos` no JSON.
          .select('id, created_at, total, valor_faturamento_real, vendedor_id, vendedor:profiles(nome), itens_venda(produto_id, quantidade, total, produtos:vw_produtos(nome, categoria, grupo_produto_id)), pagamentos_venda(valor, formas_pagamento(descricao, entra_no_caixa))')
          .gte('created_at', desdeISO)
          .lt('created_at', periodo.fim.toISOString())
          .neq('status', 'cancelado')
          .order('created_at')
          .order('id')),
        // Devoluções com a venda original (vendedor e rateio do desconto) e
        // as peças que voltaram, com o grupo de cada uma. O apelido da chave
        // estrangeira é obrigatório: `devolucoes` aponta duas vezes para
        // `vendas` (a original e a nova, na troca).
        buscarEmPaginas<DevolucaoDoPainel>(() => supabase
          .from('devolucoes')
          .select('created_at, valor_devolvido_cliente, venda_original:vendas!devolucoes_venda_original_id_fkey(vendedor_id, total, vendedor:profiles(nome), itens_venda(total)), devolucao_itens(quantidade, preco_unitario, produtos:vw_produtos(grupo_produto_id))')
          .gte('created_at', desdeISO)
          .order('created_at')
          .order('id')),
      ]);
      return { vendas, devolucoes };
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

  // As listas dos filtros vêm do CADASTRO da loja, não das vendas carregadas.
  // Ver o porquê em lib/listasDeFiltro.ts: montá-las a partir do movimento
  // fazia sumir do filtro justamente quem não vendeu no período — que é quem
  // mais se quer procurar.
  const { data: pessoasCadastradas } = usePessoasDoFiltro();
  const { data: gruposCadastrados } = useListaDoSistema('grupo_produto');

  /** Vendedores e grupos de produto que aparecem nos campos de filtro. */
  const { vendedores, categorias } = useMemo(() => {
    // O movimento só ACRESCENTA: quem foi desligado e arquivado sai do
    // cadastro, mas as vendas dele continuam dentro do período — sem isso o
    // painel mostraria dinheiro que nenhum filtro alcança.
    const doMovimento: OpcaoFiltro[] = [];
    let vendeuProdutoSemGrupo = false;
    for (const venda of todasVendas) {
      if (venda.vendedor_id && venda.vendedor?.nome) {
        doMovimento.push({ id: venda.vendedor_id, nome: `${venda.vendedor.nome} (fora da equipe)` });
      }
      for (const item of venda.itens_venda ?? []) {
        if (item.produtos && !item.produtos.grupo_produto_id) vendeuProdutoSemGrupo = true;
      }
    }
    return {
      vendedores: unirOpcoes(pessoasCadastradas ?? [], doMovimento),
      categorias: gruposDeProduto(gruposCadastrados ?? [], vendeuProdutoSemGrupo),
    };
  }, [todasVendas, pessoasCadastradas, gruposCadastrados]);

  // Pessoa ou grupo guardado no filtro que não existe mais volta para "Todos"
  // — senão o painel abre zerado sem explicar por quê.
  useCorrigirFiltroOrfao(
    filtros,
    setFiltros,
    { pessoas: vendedores, categorias },
    // isSuccess, e não "!isLoading": com a consulta em ERRO o isLoading também
    // fica falso, as listas ficam sem quem vem do movimento, e o filtro de uma
    // pessoa que saiu seria apagado à toa (segunda rodada da revisão, 23/09).
    isSuccess && pessoasCadastradas !== undefined && gruposCadastrados !== undefined,
  );

  /** Itens de uma venda que interessam ao filtro de categoria. */
  const itensQueContam = useMemo(
    () => (v: VendaRow) =>
      porCategoria
        ? (v.itens_venda ?? []).filter((i) =>
            filtros.categoria === SEM_GRUPO
              ? i.produtos != null && !i.produtos.grupo_produto_id
              : i.produtos?.grupo_produto_id === filtros.categoria,
          )
        : (v.itens_venda ?? []),
    [porCategoria, filtros.categoria],
  );

  /**
   * Quanto essa venda vale para o recorte escolhido — ver nota no topo. Com
   * grupo escolhido, cada item leva o desconto da venda rateado: sem isso a
   * soma dos itens passava do que a venda cobrou.
   */
  const valorDaVenda = useMemo(
    () => (v: VendaRow) => {
      if (!porCategoria) return faturamentoReal(v);
      const fator = fatorDaVenda(v);
      return itensQueContam(v).reduce((acc, i) => acc + Number(i.total ?? 0) * fator, 0);
    },
    [porCategoria, itensQueContam],
  );

  /** A peça devolvida conta para o grupo escolhido? */
  const pecaDoGrupo = useMemo(
    () => (grupoId: string | null) =>
      filtros.categoria === SEM_GRUPO ? !grupoId : grupoId === filtros.categoria,
    [filtros.categoria],
  );

  /**
   * Quanto uma devolução tira do recorte. Sem grupo: o dinheiro devolvido ao
   * cliente. Com grupo: só as peças daquele grupo que voltaram, pelo preço
   * que o cliente pagou (o desconto da venda original rateado).
   */
  const valorDaDevolucao = useMemo(
    () => (d: DevolucaoDoPainel) => {
      if (!porCategoria) return Number(d.valor_devolvido_cliente ?? 0);
      const fator = d.venda_original ? fatorDaVenda(d.venda_original) : 1;
      return (d.devolucao_itens ?? [])
        .filter((i) => i.produtos != null && pecaDoGrupo(i.produtos.grupo_produto_id))
        .reduce((s, i) => s + Number(i.quantidade ?? 0) * Number(i.preco_unitario ?? 0) * fator, 0);
    },
    [porCategoria, pecaDoGrupo],
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
   * Com grupo escolhido, só as que devolveram alguma peça daquele grupo. Com
   * vendedor escolhido, só as devoluções de vendas que ele fez — senão o
   * painel de um vendedor levaria o desconto de venda que era de outro.
   */
  const devolucoesDe = useMemo(
    () => (p: typeof periodo) =>
      todasDevolucoes.filter((d) => {
        if (!dentroDoPeriodo(d.created_at, p)) return false;
        if (filtros.pessoaId && d.venda_original?.vendedor_id !== filtros.pessoaId) return false;
        if (porCategoria && valorDaDevolucao(d) === 0) return false;
        return true;
      }),
    [todasDevolucoes, porCategoria, filtros.pessoaId, valorDaDevolucao],
  );
  const somarDevolvido = (lista: DevolucaoDoPainel[]) =>
    lista.reduce((s, d) => s + valorDaDevolucao(d), 0);

  const devolucoesPeriodo = devolucoesDe(periodo);
  const devolucoesAnterior = devolucoesDe(anterior);

  const faturamento =
    vendasPeriodo.reduce((acc, v) => acc + valorDaVenda(v), 0) - somarDevolvido(devolucoesPeriodo);
  const faturamentoAnterior =
    vendasAnterior.reduce((acc, v) => acc + valorDaVenda(v), 0) -
    somarDevolvido(devolucoesAnterior);

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
            valor: valorDaDevolucao,
          },
        },
      ),
    [periodo, vendasPeriodo, valorDaVenda, devolucoesPeriodo, valorDaDevolucao],
  );
  const melhor = melhorPonto(serie);
  const grao = nomeDoGrao(periodo);

  // Cada item já com o desconto da venda rateado: a receita dos rankings de
  // grupo e de produto soma o que a loja cobrou, não o preço de tabela.
  const itensDoPeriodo = vendasPeriodo.flatMap((v) => {
    const fator = fatorDaVenda(v);
    return itensQueContam(v).map((i) => ({ ...i, valorCobrado: Number(i.total ?? 0) * fator }));
  });

  // Produto: item órfão (produto excluído do cadastro) fica de fora — sem o
  // cadastro não há nome para mostrar.
  const topProdutos = porQuantidade(
    agrupar(itensDoPeriodo, {
      chave: (i) => (i.produtos ? i.produto_id : null),
      nome: (i) => i.produtos?.nome,
      quantidade: (i) => i.quantidade,
      valor: (i) => i.valorCobrado,
    }),
  );

  // O ranking fala a MESMA língua do filtro, de propósito: agrupar por um
  // campo e filtrar por outro faria a tabela e o filtro discordarem.
  const nomeDoGrupo = useMemo(
    () => new Map((gruposCadastrados ?? []).map((g) => [g.id, g.nome])),
    [gruposCadastrados],
  );
  const topCategorias = porValor(
    agrupar(itensDoPeriodo, {
      chave: (i) => (i.produtos ? (i.produtos.grupo_produto_id ?? SEM_GRUPO) : null),
      nome: (i) =>
        i.produtos?.grupo_produto_id
          ? (nomeDoGrupo.get(i.produtos.grupo_produto_id) ?? 'Grupo removido do cadastro')
          : 'Sem grupo definido',
      quantidade: (i) => i.quantidade,
      valor: (i) => i.valorCobrado,
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
          valor: valorDaDevolucao(d),
        })),
    ),
  );
  const melhorVendedor = lider(rankingVendedores);

  // Sem o troco: o PDV grava o que o cliente ENTREGOU (R$ 100 numa venda de
  // R$ 80), e o dinheiro que ficou foi R$ 80 — a mesma conta do Caixa
  // (achado 63, revisão de 24/09/2026).
  const formasPagamento = porValor(
    agrupar(
      vendasPeriodo.flatMap((v) =>
        pagamentosSemTroco(
          Number(v.total ?? 0),
          v.pagamentos_venda ?? [],
          (p) => p.formas_pagamento?.entra_no_caixa === true,
        ),
      ),
      {
        chave: (x) => x.pagamento.formas_pagamento?.descricao,
        nome: (x) => x.pagamento.formas_pagamento?.descricao,
        valor: (x) => x.valor,
      },
    ),
  );

  // Hora em que mais se fecha venda. Serve para escala de equipe: saber que o
  // movimento é das 14h às 16h vale mais, na prática, que saber o total do dia.
  const pico = horarioDePico(vendasPeriodo.map((v) => v.created_at));

  const recorte = [
    filtros.pessoaId ? vendedores.find((v) => v.id === filtros.pessoaId)?.nome : null,
    filtros.categoria ? (categorias.find((c) => c.id === filtros.categoria)?.nome ?? null) : null,
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
        rotuloCategoria="Grupo de produto"
      />

      {error && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Não foi possível carregar as vendas deste período: {String((error as Error).message)}. Os
            números abaixo não valem até carregar de novo.
          </AlertDescription>
        </Alert>
      )}

      {porCategoria && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Com um grupo escolhido, os valores somam <strong>apenas os itens desse
            grupo</strong> dentro de cada venda, já com o desconto da venda dividido entre
            os itens. A devolução também é abatida por grupo: sai só a peça desse grupo
            que voltou, pelo preço que o cliente pagou.
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
          titulo="Grupos Mais Vendidos"
          descricao="Onde o dinheiro entrou, por Grupo de Produto — a lista que a loja edita em Cadastros > Listas do Sistema."
          linhas={topCategorias}
          rotuloNome="Grupo"
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
