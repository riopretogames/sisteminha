import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wrench,
  PackageCheck,
  Receipt,
  Medal,
  Timer,
  Users,
  Smartphone,
  ListChecks,
  AlarmClock,
  Clock,
  Hammer,
  Cog,
  Ban,
  Coins,
  Truck,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { tipoDoItem } from '@/lib/itensDaOS';
import { PageHeader } from '@/components/PageHeader';
import { moeda, data as formatarData } from '@/lib/format';
import {
  agrupar,
  porValor,
  porQuantidade,
  chaveDeTexto,
  lider,
  horarioDePico,
  faixaDeHora,
} from '@/lib/ranking';
import { TabelaRanking, CardIndicador } from '@/components/dashboards/TabelaRanking';
import { FiltrosDashboard } from '@/components/dashboards/FiltrosDashboard';
import { GraficoEvolucao } from '@/components/dashboards/GraficoEvolucao';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { resolverPeriodo, periodoAnterior, variacao, dentroDoPeriodo } from '@/lib/periodo';
import { montarSerie, nomeDoGrao } from '@/lib/serie';
import { useFiltrosDashboard } from '@/lib/filtrosDashboard';

/**
 * Dashboard de Assistência — "como está a bancada agora".
 *
 * Espelha o Dashboard de Vendas de propósito: mesmos indicadores, mesma
 * leitura, trocando vendedor por técnico e produto por equipamento. Quem
 * aprende um sabe ler o outro.
 *
 * Duas coisas aqui não existem no painel de vendas, porque só fazem sentido
 * na bancada:
 *
 *   • TEMPO MÉDIO DE REPARO — venda acontece num instante; conserto tem
 *     duração, e é a duração que o cliente reclama.
 *   • OS PARADAS — venda não fica parada, ordem de serviço fica. Aparelho
 *     esquecido há três semanas é prejuízo e cliente irritado, e nenhum
 *     total mensal mostra isso.
 *
 * A permissão (dashboards.service.view) já protege a rota em config/menu.ts.
 */

interface OSRow {
  id: string;
  numero_os: string | null;
  created_at: string;
  updated_at: string | null;
  data_finalizacao: string | null;
  status: string;
  reparo_inviavel: boolean | null;
  /**
   * FALSE = o cliente recusou o orçamento.
   *
   * Desde 01/09 a OS recusada anda pelas MESMAS etapas da aprovada — ela volta
   * para a bancada para ser remontada e de lá vai para "Finalizado" e
   * "Entregue". Ou seja: a etapa sozinha não distingue mais o reparo que
   * aconteceu do que o cliente não quis. Ver `osOrcamentoAprovado`.
   */
  laudo_aprovado: boolean | null;
  total_orcamento: number | null;
  valor_final_pago: number | null;
  tecnico_id: string | null;
  tecnico: { nome: string } | null;
  equipamento_id: string | null;
  equipamento: { descricao: string } | null;
  clientes: { nome: string } | null;
  itens: ItemOSRow[] | null;
}

/**
 * Um item lancado na OS.
 *
 * A diferenca entre peca e servico e so o `produto_id`: peca aponta para o
 * cadastro de produto, servico vem com ele NULO e o nome so no texto. Nao
 * existe `servico_id` -- a tela deixa puxar do catalogo, mas grava o nome
 * copiado, entao o ranking de servico agrupa por texto.
 */
interface ItemOSRow {
  descricao: string | null;
  produto_id: string | null;
  quantidade: number | null;
  preco_cobrado: number | null;
  horas_mao_obra: number | null;
}

/**
 * O que a OS rendeu.
 *
 * `valor_final_pago` é o que o cliente pagou de verdade na retirada e manda
 * quando existe: orçamento aprovado por R$ 300 que virou R$ 250 no caixa
 * rendeu 250. Sem ele, cai para o orçamento — é o melhor palpite disponível
 * numa OS que ainda não foi entregue.
 */
const rendimento = (os: OSRow) => Number(os.valor_final_pago ?? os.total_orcamento ?? 0);

/** Dias corridos entre duas datas, arredondado para baixo. */
function diasEntre(inicio: string, fim: string): number {
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Rótulo amigável das etapas de sistema. Etapa criada pela loja cai no `??`. */
const ROTULO_ETAPA: Record<string, string> = {
  aguardando_analise: 'Aguardando análise',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado / Executar',
  finalizado: 'Finalizado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const rotuloEtapa = (chave: string) =>
  ROTULO_ETAPA[chave] ?? chave.replace(/_/g, ' ');

// Numa linha so: o TypeScript le este texto literalmente para saber o formato
// do resultado. `itens:vw_os_itens(...)` obedece a regra de custo protegido --
// leitura de item de OS passa SEMPRE pela view, mesmo sem pedir custo.
const CAMPOS =
  'id, numero_os, created_at, updated_at, data_finalizacao, status, reparo_inviavel, laudo_aprovado, total_orcamento, valor_final_pago, tecnico_id, tecnico:profiles!service_orders_tecnico_id_fkey(nome), equipamento_id, equipamento:catalogos!service_orders_equipamento_id_fkey(descricao), clientes(nome), itens:vw_os_itens(descricao, produto_id, quantidade, preco_cobrado, horas_mao_obra, tipo_item)';

export default function DashboardAssistencia() {
  const [filtros, setFiltros, limparFiltros] = useFiltrosDashboard('assistencia');

  // Mesma disciplina do painel de Venda: `new Date()` uma vez só por cálculo
  // dos limites, e todo recorte de data sai daqui.
  const { periodo, anterior, desdeISO, agoraISO } = useMemo(() => {
    const agora = new Date();
    const periodo = resolverPeriodo(filtros.periodo, agora);
    const anterior = periodoAnterior(filtros.periodo, agora);
    const desde = anterior.inicio < periodo.inicio ? anterior.inicio : periodo.inicio;
    return {
      periodo,
      anterior,
      desdeISO: desde.toISOString(),
      agoraISO: agora.toISOString(),
    };
  }, [filtros.periodo]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-assistencia', desdeISO, periodo.fim.toISOString()],
    queryFn: async (): Promise<{ doPeriodo: OSRow[]; emAberto: OSRow[] }> => {
      const [resPeriodo, resAberto] = await Promise.all([
        // Entrou OU mexeu no período: uma OS aberta meses atrás e entregue
        // dentro do período conta como entrega dele, e sem o `updated_at` ela
        // ficaria de fora do faturamento.
        supabase
          .from('service_orders')
          .select(CAMPOS)
          .or(`created_at.gte.${desdeISO},updated_at.gte.${desdeISO}`),
        // A fila de verdade, sem recorte de data — inclui o aparelho parado
        // desde o mês passado, que é justamente o que precisa aparecer. Esta
        // parte da tela NÃO obedece ao filtro de período, de propósito: fila é
        // o estado de agora, não um intervalo (a tela avisa isso).
        supabase.from('service_orders').select(CAMPOS).not('status', 'in', '("entregue","cancelado")'),
      ]);
      if (resPeriodo.error) throw resPeriodo.error;
      if (resAberto.error) throw resAberto.error;
      return {
        doPeriodo: (resPeriodo.data ?? []) as unknown as OSRow[],
        emAberto: (resAberto.data ?? []) as unknown as OSRow[],
      };
    },
  });

  const todas = useMemo(() => data?.doPeriodo ?? [], [data]);
  const filaCompleta = useMemo(() => data?.emAberto ?? [], [data]);

  /** Técnicos e equipamentos que aparecem nos campos de filtro. */
  const { tecnicos, equipamentos } = useMemo(() => {
    const t = new Map<string, string>();
    const e = new Set<string>();
    for (const os of [...todas, ...filaCompleta]) {
      if (os.tecnico_id && os.tecnico?.nome) t.set(os.tecnico_id, os.tecnico.nome);
      if (os.equipamento?.descricao) e.add(os.equipamento.descricao);
    }
    return {
      tecnicos: [...t.entries()]
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      equipamentos: [...e].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  }, [todas, filaCompleta]);

  /** Filtros de técnico e de equipamento, aplicados a qualquer lista de OS. */
  const aplicarFiltros = useMemo(
    () => (lista: OSRow[]) =>
      lista.filter((o) => {
        if (filtros.pessoaId && o.tecnico_id !== filtros.pessoaId) return false;
        if (filtros.categoria && o.equipamento?.descricao !== filtros.categoria) return false;
        return true;
      }),
    [filtros.pessoaId, filtros.categoria],
  );

  const emAberto = useMemo(() => aplicarFiltros(filaCompleta), [filaCompleta, aplicarFiltros]);

  const abertasPeriodo = useMemo(
    () => aplicarFiltros(todas.filter((o) => dentroDoPeriodo(o.created_at, periodo))),
    [todas, periodo, aplicarFiltros],
  );
  const abertasAnterior = useMemo(
    () => aplicarFiltros(todas.filter((o) => dentroDoPeriodo(o.created_at, anterior))),
    [todas, anterior, aplicarFiltros],
  );

  /**
   * Quando a OS foi entregue.
   *
   * SÓ `data_finalizacao`. A versão anterior caía para `updated_at` quando ele
   * era nulo, e isso datava errado: `updated_at` muda a cada edição da OS, não
   * só na entrega. Uma OS entregue em julho, com uma observação corrigida
   * hoje, entrava no faturamento da semana corrente, no ranking do técnico e
   * no tempo médio de reparo — com uma duração de meses puxando a média.
   *
   * Entrega sem data fica de fora das contas do período, e isso é o certo: não
   * dá para afirmar quando ela aconteceu.
   */
  const entregaEm = (o: OSRow) => o.data_finalizacao;

  const entreguesEm = useMemo(
    () => (p: typeof periodo) =>
      aplicarFiltros(
        todas.filter((o) => {
          if (o.status !== 'entregue') return false;
          const quando = entregaEm(o);
          return quando !== null && dentroDoPeriodo(quando, p);
        }),
      ),
    [todas, aplicarFiltros],
  );

  const entreguesPeriodo = useMemo(() => entreguesEm(periodo), [entreguesEm, periodo]);
  const entreguesAnterior = useMemo(() => entreguesEm(anterior), [entreguesEm, anterior]);

  const faturamentoPeriodo = entreguesPeriodo.reduce((soma, o) => soma + rendimento(o), 0);
  const faturamentoAnterior = entreguesAnterior.reduce((soma, o) => soma + rendimento(o), 0);
  const ticketMedio =
    entreguesPeriodo.length > 0 ? faturamentoPeriodo / entreguesPeriodo.length : null;
  const ticketMedioAnterior =
    entreguesAnterior.length > 0 ? faturamentoAnterior / entreguesAnterior.length : null;

  // A comparação só aparece se a chave estiver ligada. `undefined` = não
  // pedimos comparação; `null` = pedimos e não há base (ver CardIndicador).
  const comp = (atual: number, ant: number) => (filtros.comparar ? variacao(atual, ant) : undefined);
  const rotuloVs = `vs ${anterior.rotulo}`;

  // Só as entregues entram na média de tempo: OS aberta ainda não terminou, e
  // incluí-la puxaria a média para baixo justamente quando a bancada atrasa.
  const mediaDeDias = (lista: OSRow[]) => {
    const tempos = lista.map((o) => diasEntre(o.created_at, entregaEm(o)!));
    return tempos.length > 0 ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
  };
  const tempoMedio = mediaDeDias(entreguesPeriodo);
  const tempoMedioAnterior = mediaDeDias(entreguesAnterior);

  const serie = useMemo(
    () =>
      montarSerie(periodo, entreguesPeriodo, {
        data: (o) => entregaEm(o)!,
        valor: (o) => rendimento(o),
      }),
    [periodo, entreguesPeriodo],
  );
  const grao = nomeDoGrao(periodo);

  const rankingTecnicos = porValor(
    agrupar(entreguesPeriodo, {
      chave: (o) => o.tecnico_id,
      nome: (o) => o.tecnico?.nome,
      valor: (o) => rendimento(o),
    }),
  );
  const melhorTecnico = lider(rankingTecnicos);

  // Equipamentos: base é tudo que ENTROU no período, não só o que saiu. A
  // pergunta aqui é "o que a loja recebe", que é decisão de compra de peça e
  // de treinamento — e o que entrou hoje ainda vai demorar para ser entregue.
  const topEquipamentos = porQuantidade(
    agrupar(abertasPeriodo, {
      chave: (o) => o.equipamento_id,
      nome: (o) => o.equipamento?.descricao,
      valor: (o) => rendimento(o),
    }),
  );

  const filaPorEtapa = porQuantidade(
    agrupar(emAberto, {
      chave: (o) => o.status,
      nome: (o) => rotuloEtapa(o.status),
      valor: (o) => rendimento(o),
    }),
  );

  // As mais antigas ainda na bancada. Ordenadas pela data de entrada, não pelo
  // valor: aparelho esquecido é problema independente de quanto rende.
  const paradas = [...emAberto]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, 6)
    .map((o) => ({ os: o, dias: diasEntre(o.created_at, agoraISO) }));

  const pico = horarioDePico(abertasPeriodo.map((o) => o.created_at));

  // ── Serviço e peça ──────────────────────────────────────────────────────
  //
  // A diferença é só o `produto_id`: preenchido = peça do estoque, vazio =
  // mão de obra. Mesmo critério que a ficha da OS usa para montar o orçamento,
  // de propósito — dois critérios diferentes dariam dois valores diferentes
  // para a mesma OS.
  //
  // ⚠️ As colunas `total_pecas` e `total_mao_obra` de `service_orders` NÃO são
  // usadas aqui: elas existem no schema mas nenhuma migration as preenche.
  // Somá-las mostraria R$ 0,00 no painel com a bancada cheia de serviço.
  //
  // ⚠️ E SÓ DAS OS QUE O CLIENTE APROVOU. Achado na revisão de 01/09: a OS
  // recusada continua com as peças e os serviços lançados na ficha (é o
  // orçamento que o cliente viu e recusou), e desde 01/09 ela passa pela
  // entrega como qualquer outra — o cliente vem buscar o aparelho e paga a
  // taxa de análise. Somando os itens dela, o painel dizia que o período teve
  // R$ 450 de peça e mão de obra, quando o que entrou no caixa foram R$ 80,
  // e "Peças Mais Usadas" listava a peça que voltou para a prateleira.
  const itensEntregues = entreguesPeriodo
    .filter((o) => o.laudo_aprovado !== false)
    .flatMap((o) => o.itens ?? []);
  const totalDoItem = (i: ItemOSRow) =>
    Number(i.preco_cobrado ?? 0) * Number(i.quantidade ?? 1);

  // Peça x mão de obra vem do TIPO gravado na linha (lib/itensDaOS), não de
  // "tem produto do estoque". A regra velha jogava em mão de obra a peça
  // comprada no fornecedor no dia e o custo repassado (frete, terceirização),
  // porque nenhum dos dois tem produto de estoque — e aí o painel mostrava a
  // mão de obra maior do que foi e as peças menores.
  const totalMaoObra = itensEntregues
    .filter((i) => tipoDoItem(i) === 'servico')
    .reduce((soma, i) => soma + totalDoItem(i), 0);
  const totalPecas = itensEntregues
    .filter((i) => tipoDoItem(i) === 'peca')
    .reduce((soma, i) => soma + totalDoItem(i), 0);
  // Custo repassado ao cliente (frete da peça, serviço terceirizado): não é
  // mão de obra da bancada nem peça de estoque, e por isso fica fora das duas
  // contas acima em vez de inflar uma delas.
  const totalComplementar = itensEntregues
    .filter((i) => tipoDoItem(i) === 'complementar')
    .reduce((soma, i) => soma + totalDoItem(i), 0);
  // O denominador das porcentagens é a conta INTEIRA. Deixar o repasse de fora
  // fazia as duas fatias somarem 100% de um bolo menor do que o real: num
  // período com R$ 200 de mão de obra, R$ 300 de peça e R$ 100 de frete, a mão
  // de obra aparecia como 40% do serviço entregue quando é 33%.
  const totalDoPeriodo = totalMaoObra + totalPecas + totalComplementar;
  const fatia = (parte: number) =>
    totalDoPeriodo > 0 ? `${((parte / totalDoPeriodo) * 100).toFixed(0)}% do serviço entregue` : null;

  // Serviço é texto livre: a tela deixa puxar do catálogo mas grava só o nome
  // copiado, sem guardar qual foi. `chaveDeTexto` junta "Troca de tela",
  // "troca de tela " e "TROCA DE TELA" numa linha só — senão o carro-chefe da
  // bancada apareceria três vezes, cada uma com um terço do movimento.
  const servicosRealizados = porQuantidade(
    agrupar(
      // Só serviço de verdade: "Frete da tela" e "Terceirização" apareciam
      // nesta lista como se fossem serviço mais feito da bancada.
      itensEntregues.filter((i) => tipoDoItem(i) === 'servico'),
      {
        chave: (i) => chaveDeTexto(i.descricao),
        nome: (i) => i.descricao,
        quantidade: (i) => Number(i.quantidade ?? 1),
        valor: (i) => totalDoItem(i),
      },
    ),
  );

  // Peça agrupa pelo cadastro, não pelo texto: aqui o vínculo existe de
  // verdade e não depende de como alguém digitou.
  const pecasUsadas = porQuantidade(
    agrupar(
      itensEntregues.filter((i) => tipoDoItem(i) === 'peca' && i.produto_id != null),
      {
        chave: (i) => i.produto_id,
        nome: (i) => i.descricao,
        quantidade: (i) => Number(i.quantidade ?? 1),
        valor: (i) => totalDoItem(i),
      },
    ),
  );

  // Reparo inviável: aparelho que não tinha conserto. Não é fracasso do
  // técnico — é diagnóstico. Mas uma taxa alta demais diz alguma coisa sobre
  // o que a loja está aceitando na bancada.
  const inviaveisPeriodo = abertasPeriodo.filter((o) => o.reparo_inviavel === true).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titulo="Dashboard de Assistência"
        hint="Escolha o período, o técnico e o tipo de aparelho — os números de entrada, entrega e faturamento seguem o filtro. A fila da bancada, mais abaixo, é sempre o estado de agora."
      />

      <FiltrosDashboard
        valores={filtros}
        onChange={setFiltros}
        onLimpar={limparFiltros}
        pessoas={tecnicos}
        rotuloPessoa="Técnico"
        categorias={equipamentos}
        rotuloCategoria="Equipamento"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <CardIndicador
          titulo="Entraram no Período"
          faixa="kpi-os"
          icone={<Wrench className="h-4 w-4" />}
          carregando={isLoading}
          valor={String(abertasPeriodo.length)}
          detalhe={`Aparelhos que deram entrada · ${periodo.rotulo}`}
          variacaoPct={comp(abertasPeriodo.length, abertasAnterior.length)}
          rotuloComparacao={rotuloVs}
        />
        <CardIndicador
          titulo="Entregues no Período"
          faixa="kpi-vendas"
          icone={<PackageCheck className="h-4 w-4" />}
          carregando={isLoading}
          valor={String(entreguesPeriodo.length)}
          detalhe={
            entreguesPeriodo.length > 0
              ? `${moeda(faturamentoPeriodo)} recebidos`
              : 'Nenhuma entrega no período'
          }
          variacaoPct={comp(faturamentoPeriodo, faturamentoAnterior)}
          rotuloComparacao={`em dinheiro, ${rotuloVs}`}
        />
        <CardIndicador
          titulo="Ticket Médio da OS"
          faixa="kpi-caixa"
          icone={<Receipt className="h-4 w-4" />}
          carregando={isLoading}
          valor={ticketMedio !== null ? moeda(ticketMedio) : '—'}
          detalhe={
            ticketMedio !== null
              ? 'Faturamento ÷ OS entregues no período'
              : 'Nenhuma OS entregue no período'
          }
          variacaoPct={
            ticketMedio !== null && ticketMedioAnterior !== null
              ? comp(ticketMedio, ticketMedioAnterior)
              : undefined
          }
          rotuloComparacao={rotuloVs}
        />
        <CardIndicador
          titulo="Na Bancada Agora"
          faixa="kpi-estoque"
          icone={<ListChecks className="h-4 w-4" />}
          carregando={isLoading}
          valor={String(emAberto.length)}
          detalhe={
            emAberto.length > 0
              ? `${moeda(emAberto.reduce((s, o) => s + rendimento(o), 0))} em serviço em aberto`
              : 'Nenhuma OS em aberto'
          }
        />
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Na Bancada Agora</strong>, a fila por etapa e os aparelhos parados mostram
          sempre a situação de hoje, sem recorte de período — fila é estado, não intervalo. O
          filtro de técnico e de equipamento vale para eles também.
        </AlertDescription>
      </Alert>

      <GraficoEvolucao
        titulo="Como o período andou"
        descricao={`Faturamento das OS entregues, por ${grao}, dentro de ${periodo.rotulo.toLowerCase()}. Conta no ${grao} da entrega, não no da abertura.`}
        serie={serie}
        carregando={isLoading}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CardIndicador
          titulo="Melhor Técnico do Período"
          faixa="kpi-vendas"
          icone={<Medal className="h-4 w-4" />}
          carregando={isLoading}
          valor={melhorTecnico ? moeda(melhorTecnico.valor) : '—'}
          detalhe={
            melhorTecnico
              ? `${melhorTecnico.nome} · ${melhorTecnico.quantidade} OS entregue(s)`
              : 'Nenhuma OS entregue com técnico registrado'
          }
        />
        <CardIndicador
          titulo="Tempo Médio de Reparo"
          faixa="kpi-os"
          icone={<Timer className="h-4 w-4" />}
          carregando={isLoading}
          valor={
            tempoMedio !== null
              ? tempoMedio < 1
                ? 'Mesmo dia'
                : `${tempoMedio.toFixed(1)} dias`
              : '—'
          }
          detalhe={
            tempoMedio !== null
              ? `Da entrada à entrega, nas ${entreguesPeriodo.length} OS do período`
              : 'Sem entrega no período para medir'
          }
          variacaoPct={
            tempoMedio !== null && tempoMedioAnterior !== null
              ? comp(tempoMedio, tempoMedioAnterior)
              : undefined
          }
          rotuloComparacao={`${rotuloVs} — quanto menor, melhor`}
        />
        <CardIndicador
          titulo="Horário de Pico"
          faixa="kpi-caixa"
          icone={<Clock className="h-4 w-4" />}
          carregando={isLoading}
          valor={pico ? faixaDeHora(pico.hora) : '—'}
          detalhe={
            pico
              ? `${pico.quantidade} aparelho(s) deram entrada nessa faixa`
              : 'Nenhuma entrada no período'
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <CardIndicador
          titulo="Mão de Obra do Período"
          faixa="kpi-vendas"
          icone={<Hammer className="h-4 w-4" />}
          carregando={isLoading}
          valor={moeda(totalMaoObra)}
          detalhe={fatia(totalMaoObra) ?? 'Nenhum serviço lançado no período'}
        />
        <CardIndicador
          titulo="Peças do Período"
          faixa="kpi-estoque"
          icone={<Coins className="h-4 w-4" />}
          carregando={isLoading}
          valor={moeda(totalPecas)}
          detalhe={fatia(totalPecas) ?? 'Nenhuma peça lançada no período'}
        />
        {/* Frete da peça, serviço terceirizado: o que a loja repassa ao cliente
            sem ser mão de obra da bancada nem peça da prateleira. A conta já
            existia no código desde 31/08 e não aparecia em lugar nenhum — os
            dois cartões ao lado somavam menos do que a OS cobrou, e a diferença
            não tinha nome na tela. */}
        <CardIndicador
          titulo="Outros Custos do Período"
          faixa="kpi-caixa"
          icone={<Truck className="h-4 w-4" />}
          carregando={isLoading}
          valor={moeda(totalComplementar)}
          detalhe={
            fatia(totalComplementar) ?? 'Nenhum frete ou terceirização no período'
          }
        />
        <CardIndicador
          titulo="Reparos Inviáveis"
          faixa="kpi-os"
          icone={<Ban className="h-4 w-4" />}
          carregando={isLoading}
          valor={String(inviaveisPeriodo)}
          detalhe={
            inviaveisPeriodo > 0
              ? 'Aparelhos sem conserto possível no período'
              : 'Nenhum aparelho sem conserto no período'
          }
        />
      </div>

      {/* OS paradas: o alerta operacional que nenhum total mensal mostra */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlarmClock className="h-5 w-5 text-amber-600" />
            Aparelhos Parados Há Mais Tempo
          </CardTitle>
          <CardDescription>
            OS que ainda não foram entregues nem canceladas, da mais antiga para a mais
            recente. Sem recorte de período — de propósito: o aparelho esquecido do mês
            passado é justamente o que precisa aparecer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : paradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <PackageCheck className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhuma OS em aberto. Bancada limpa.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Entrou em</TableHead>
                  <TableHead className="text-right">Parada há</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paradas.map(({ os, dias }) => (
                  <TableRow key={os.id}>
                    <TableCell className="font-mono text-sm">{os.numero_os ?? '—'}</TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {os.clientes?.nome ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{rotuloEtapa(os.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarData(os.created_at)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          dias >= 15
                            ? 'font-semibold text-red-600'
                            : dias >= 7
                              ? 'font-medium text-amber-600'
                              : 'text-muted-foreground'
                        }
                      >
                        {dias === 0 ? 'hoje' : `${dias} dia(s)`}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <TabelaRanking
          titulo="Ranking de Técnicos"
          descricao="Por OS entregue no período escolhido. O valor é o que o cliente pagou na retirada."
          linhas={rankingTecnicos}
          rotuloNome="Técnico"
          rotuloQuantidade="OS entregues"
          rotuloValor="Faturamento"
          vazio="Nenhuma OS entregue com técnico registrado no período."
          icone={<Users className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Equipamentos Mais Atendidos"
          descricao="O que mais entrou na bancada no período — o que a loja precisa saber consertar e ter peça."
          linhas={topEquipamentos}
          rotuloNome="Equipamento"
          rotuloQuantidade="Entradas"
          rotuloValor="Em orçamento"
          vazio="Nenhum aparelho deu entrada no período."
          icone={<Smartphone className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Serviços Mais Realizados"
          descricao="A mão de obra das OS entregues no período, tirando as que o cliente recusou — nelas o serviço não chegou a ser feito."
          linhas={servicosRealizados}
          rotuloNome="Serviço"
          rotuloQuantidade="Vezes"
          rotuloValor="Cobrado"
          vazio="Nenhum serviço lançado nas OS entregues no período."
          icone={<Cog className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Peças Mais Usadas"
          descricao="O que saiu do estoque para a bancada nas OS entregues no período. Sem as recusadas: a peça delas voltou para a prateleira."
          linhas={pecasUsadas}
          rotuloNome="Peça"
          rotuloQuantidade="Usadas"
          rotuloValor="Cobrado"
          vazio="Nenhuma peça lançada nas OS entregues no período."
          icone={<Hammer className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Fila por Etapa"
          descricao="Onde estão as OS em aberto agora. Muita coisa parada numa etapa só mostra onde o trabalho trava."
          linhas={filaPorEtapa}
          rotuloNome="Etapa"
          rotuloQuantidade="OS"
          rotuloValor="Em orçamento"
          vazio="Nenhuma OS em aberto."
          icone={<ListChecks className="h-12 w-12" />}
          carregando={isLoading}
          limite={8}
        />
      </div>
    </div>
  );
}
