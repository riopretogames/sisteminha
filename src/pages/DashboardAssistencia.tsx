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
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
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
  'id, numero_os, created_at, updated_at, data_finalizacao, status, reparo_inviavel, total_orcamento, valor_final_pago, tecnico_id, tecnico:profiles!service_orders_tecnico_id_fkey(nome), equipamento_id, equipamento:catalogos!service_orders_equipamento_id_fkey(descricao), clientes(nome), itens:vw_os_itens(descricao, produto_id, quantidade, preco_cobrado, horas_mao_obra)';

export default function DashboardAssistencia() {
  // Mesma disciplina do painel de Venda: `new Date()` uma vez só, no mount.
  const limites = useMemo(() => {
    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const diaSemana = inicioHoje.getDay();
    const deltaSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
    const inicioSemana = new Date(inicioHoje);
    inicioSemana.setDate(inicioSemana.getDate() - deltaSegunda);
    return { agora, inicioHoje, inicioSemana };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-assistencia', limites.inicioSemana.toISOString()],
    queryFn: async (): Promise<{ semana: OSRow[]; emAberto: OSRow[] }> => {
      const desde = limites.inicioSemana.toISOString();
      const [resSemana, resAberto] = await Promise.all([
        // Entrou OU mexeu nesta semana: uma OS aberta mês passado e entregue
        // hoje conta como entrega da semana, e sem o `updated_at` ela ficaria
        // de fora do faturamento.
        supabase.from('service_orders').select(CAMPOS).or(`created_at.gte.${desde},updated_at.gte.${desde}`),
        // A fila de verdade, sem recorte de data — inclui o aparelho parado
        // desde o mês passado, que é justamente o que precisa aparecer.
        supabase.from('service_orders').select(CAMPOS).not('status', 'in', '("entregue","cancelado")'),
      ]);
      if (resSemana.error) throw resSemana.error;
      if (resAberto.error) throw resAberto.error;
      return {
        semana: (resSemana.data ?? []) as unknown as OSRow[],
        emAberto: (resAberto.data ?? []) as unknown as OSRow[],
      };
    },
  });

  const semana = data?.semana ?? [];
  const emAberto = data?.emAberto ?? [];

  const abertasHoje = semana.filter((o) => new Date(o.created_at) >= limites.inicioHoje);
  const abertasSemana = semana.filter((o) => new Date(o.created_at) >= limites.inicioSemana);

  /**
   * Quando a OS foi entregue.
   *
   * SÓ `data_finalizacao`. A versão anterior caía para `updated_at` quando ele
   * era nulo, e isso datava errado: `updated_at` muda a cada edição da OS, não
   * só na entrega. Uma OS entregue em julho, com uma observação corrigida
   * hoje, entrava no faturamento DESTA semana, no ranking do técnico e no
   * tempo médio de reparo — com uma duração de meses puxando a média.
   *
   * Entrega sem data fica de fora das contas da semana, e isso é o certo: não
   * dá para afirmar quando ela aconteceu.
   */
  const entregaEm = (o: OSRow) => o.data_finalizacao;

  const entreguesSemana = semana.filter((o) => {
    if (o.status !== 'entregue') return false;
    const quando = entregaEm(o);
    return quando !== null && new Date(quando) >= limites.inicioSemana;
  });

  const faturamentoSemana = entreguesSemana.reduce((soma, o) => soma + rendimento(o), 0);
  const ticketMedio = entreguesSemana.length > 0 ? faturamentoSemana / entreguesSemana.length : null;

  // Só as entregues entram na média de tempo: OS aberta ainda não terminou, e
  // incluí-la puxaria a média para baixo justamente quando a bancada atrasa.
  const temposDeReparo = entreguesSemana.map((o) => diasEntre(o.created_at, entregaEm(o)!));
  const tempoMedio =
    temposDeReparo.length > 0
      ? temposDeReparo.reduce((a, b) => a + b, 0) / temposDeReparo.length
      : null;

  const rankingTecnicos = porValor(
    agrupar(entreguesSemana, {
      chave: (o) => o.tecnico_id,
      nome: (o) => o.tecnico?.nome,
      valor: (o) => rendimento(o),
    }),
  );
  const melhorTecnico = lider(rankingTecnicos);

  // Equipamentos: base é tudo que ENTROU na semana, não só o que saiu. A
  // pergunta aqui é "o que a loja recebe", que é decisão de compra de peça e
  // de treinamento — e o que entrou hoje ainda vai demorar para ser entregue.
  const topEquipamentos = porQuantidade(
    agrupar(abertasSemana, {
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
    .map((o) => ({ os: o, dias: diasEntre(o.created_at, limites.agora.toISOString()) }));

  const pico = horarioDePico(abertasSemana.map((o) => o.created_at));

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
  const itensEntregues = entreguesSemana.flatMap((o) => o.itens ?? []);
  const totalDoItem = (i: ItemOSRow) =>
    Number(i.preco_cobrado ?? 0) * Number(i.quantidade ?? 1);

  const totalMaoObra = itensEntregues
    .filter((i) => i.produto_id == null)
    .reduce((soma, i) => soma + totalDoItem(i), 0);
  const totalPecas = itensEntregues
    .filter((i) => i.produto_id != null)
    .reduce((soma, i) => soma + totalDoItem(i), 0);

  // Serviço é texto livre: a tela deixa puxar do catálogo mas grava só o nome
  // copiado, sem guardar qual foi. `chaveDeTexto` junta "Troca de tela",
  // "troca de tela " e "TROCA DE TELA" numa linha só — senão o carro-chefe da
  // bancada apareceria três vezes, cada uma com um terço do movimento.
  const servicosRealizados = porQuantidade(
    agrupar(
      itensEntregues.filter((i) => i.produto_id == null),
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
      itensEntregues.filter((i) => i.produto_id != null),
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
  const inviaveisSemana = semana.filter((o) => o.reparo_inviavel === true).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titulo="Dashboard de Assistência"
        hint="Como está a bancada agora: o que entrou, o que saiu e o que está parado. Para histórico com filtro de período, use o Relatório de OS."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <CardIndicador
          titulo="Entraram Hoje"
          faixa="kpi-os"
          icone={<Wrench className="h-4 w-4" />}
          carregando={isLoading}
          valor={String(abertasHoje.length)}
          detalhe={`${abertasSemana.length} nesta semana`}
        />
        <CardIndicador
          titulo="Entregues na Semana"
          faixa="kpi-vendas"
          icone={<PackageCheck className="h-4 w-4" />}
          carregando={isLoading}
          valor={String(entreguesSemana.length)}
          detalhe={
            entreguesSemana.length > 0
              ? `${moeda(faturamentoSemana)} recebidos`
              : 'Nenhuma entrega nesta semana ainda'
          }
        />
        <CardIndicador
          titulo="Ticket Médio da OS"
          faixa="kpi-caixa"
          icone={<Receipt className="h-4 w-4" />}
          carregando={isLoading}
          valor={ticketMedio !== null ? moeda(ticketMedio) : '—'}
          detalhe={
            ticketMedio !== null
              ? 'Faturamento ÷ OS entregues na semana'
              : 'Nenhuma OS entregue nesta semana'
          }
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

      <div className="grid gap-4 md:grid-cols-3">
        <CardIndicador
          titulo="Melhor Técnico da Semana"
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
              ? `Da entrada à entrega, nas ${entreguesSemana.length} OS da semana`
              : 'Sem entrega nesta semana para medir'
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
              ? `${pico.quantidade} aparelho(s) deram entrada nessa faixa`
              : 'Nenhuma entrada nesta semana'
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <CardIndicador
          titulo="Mão de Obra da Semana"
          faixa="kpi-vendas"
          icone={<Hammer className="h-4 w-4" />}
          carregando={isLoading}
          valor={moeda(totalMaoObra)}
          detalhe={
            totalMaoObra + totalPecas > 0
              ? `${((totalMaoObra / (totalMaoObra + totalPecas)) * 100).toFixed(0)}% do serviço entregue`
              : 'Nenhum serviço lançado nesta semana'
          }
        />
        <CardIndicador
          titulo="Peças da Semana"
          faixa="kpi-estoque"
          icone={<Coins className="h-4 w-4" />}
          carregando={isLoading}
          valor={moeda(totalPecas)}
          detalhe={
            totalMaoObra + totalPecas > 0
              ? `${((totalPecas / (totalMaoObra + totalPecas)) * 100).toFixed(0)}% do serviço entregue`
              : 'Nenhuma peça lançada nesta semana'
          }
        />
        <CardIndicador
          titulo="Reparos Inviáveis"
          faixa="kpi-os"
          icone={<Ban className="h-4 w-4" />}
          carregando={isLoading}
          valor={String(inviaveisSemana)}
          detalhe={
            inviaveisSemana > 0
              ? 'Aparelhos sem conserto possível nesta semana'
              : 'Nenhum aparelho sem conserto nesta semana'
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
            recente. Sem recorte de semana — de propósito: o aparelho esquecido do mês
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
          descricao="Por OS entregue nesta semana. O valor é o que o cliente pagou na retirada."
          linhas={rankingTecnicos}
          rotuloNome="Técnico"
          rotuloQuantidade="OS entregues"
          rotuloValor="Faturamento"
          vazio="Nenhuma OS entregue com técnico registrado nesta semana."
          icone={<Users className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Equipamentos Mais Atendidos"
          descricao="O que mais entrou na bancada nesta semana — o que a loja precisa saber consertar e ter peça."
          linhas={topEquipamentos}
          rotuloNome="Equipamento"
          rotuloQuantidade="Entradas"
          rotuloValor="Em orçamento"
          vazio="Nenhum aparelho deu entrada nesta semana."
          icone={<Smartphone className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Serviços Mais Realizados"
          descricao="A mão de obra lançada nas OS entregues nesta semana, ordenada por quantidade."
          linhas={servicosRealizados}
          rotuloNome="Serviço"
          rotuloQuantidade="Vezes"
          rotuloValor="Cobrado"
          vazio="Nenhum serviço lançado nas OS entregues nesta semana."
          icone={<Cog className="h-12 w-12" />}
          carregando={isLoading}
        />

        <TabelaRanking
          titulo="Peças Mais Usadas"
          descricao="O que saiu do estoque para a bancada nas OS entregues nesta semana."
          linhas={pecasUsadas}
          rotuloNome="Peça"
          rotuloQuantidade="Usadas"
          rotuloValor="Cobrado"
          vazio="Nenhuma peça lançada nas OS entregues nesta semana."
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
