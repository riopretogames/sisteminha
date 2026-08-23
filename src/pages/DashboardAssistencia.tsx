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
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/PageHeader';
import { moeda, data as formatarData } from '@/lib/format';
import { agrupar, porValor, porQuantidade, lider, horarioDePico, faixaDeHora } from '@/lib/ranking';
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
  total_orcamento: number | null;
  valor_final_pago: number | null;
  tecnico_id: string | null;
  tecnico: { nome: string } | null;
  equipamento_id: string | null;
  equipamento: { descricao: string } | null;
  clientes: { nome: string } | null;
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

const CAMPOS =
  'id, numero_os, created_at, updated_at, data_finalizacao, status, total_orcamento, valor_final_pago, tecnico_id, tecnico:profiles!service_orders_tecnico_id_fkey(nome), equipamento_id, equipamento:catalogos!service_orders_equipamento_id_fkey(descricao), clientes(nome)';

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

  /** Quando a OS foi entregue. `data_finalizacao` é o certo; `updated_at` é o
   *  socorro para OS antiga, gravada antes de esse campo existir. */
  const entregaEm = (o: OSRow) => o.data_finalizacao ?? o.updated_at ?? o.created_at;

  const entreguesSemana = semana.filter(
    (o) => o.status === 'entregue' && new Date(entregaEm(o)) >= limites.inicioSemana,
  );

  const faturamentoSemana = entreguesSemana.reduce((soma, o) => soma + rendimento(o), 0);
  const ticketMedio = entreguesSemana.length > 0 ? faturamentoSemana / entreguesSemana.length : null;

  // Só as entregues entram na média de tempo: OS aberta ainda não terminou, e
  // incluí-la puxaria a média para baixo justamente quando a bancada atrasa.
  const temposDeReparo = entreguesSemana.map((o) => diasEntre(o.created_at, entregaEm(o)));
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
