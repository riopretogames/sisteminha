import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Trophy, TrendingUp, Users, Info, Target, User, Megaphone, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { PageHeader } from '@/components/PageHeader';
import { moeda } from '@/lib/format';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import { fatorDaVenda } from '@/lib/dinheiroDaVenda';
import { periodoDoMes, periodoDaQuinzena, dentroDoPeriodo, diasCorridos } from '@/lib/periodo';
import {
  ROTULO_FAIXA,
  EMOJI_FAIXA,
  ROTULO_RECORTE,
  ROTULO_APURACAO,
  recortesDoMes,
  metaIndividual,
  metaDaLojaNoRecorte,
  situacaoNasFaixas,
  percentualDaFaixa,
  type Faixa,
  type Apuracao,
  type Recorte,
  type MetaDeFaixa,
} from '@/lib/metas';

/**
 * Dashboard de Metas.
 *
 * As metas vêm da planilha "Metas RPG" (a fonte desde 23/09/2026 — ver
 * Cadastros > Metas). Esta tela só acompanha: quanto a loja e cada vendedor já
 * fizeram contra a régua que a planilha manda.
 *
 * As regras, todas da própria planilha:
 *
 * - META DA LOJA: as quatro faixas do mês.
 * - META DE CADA VENDEDOR: a da loja dividida pelo número de vendedores do mês.
 *   Não é digitada por pessoa — a versão de 22/09 deixava digitar, e isso não
 *   é regra da loja.
 * - QUINZENA: meta do mês ÷ 2, e SÓ nos meses apurados por quinzena (agosto/
 *   2026 em diante). Janeiro a julho foram em 4 períodos: o painel mostra só o
 *   mês inteiro, em vez de inventar uma quinzena que ninguém usou.
 * - QUEM ENTRA NA APURAÇÃO: quem tem o perfil Vendedor. O gerente não entra,
 *   mas as vendas dele contam no faturamento da loja — ele aparece na tabela
 *   marcado "fora da apuração", para a soma fechar.
 * - DEVOLUÇÃO: pesa no período em que aconteceu e sai de quem fez a venda
 *   ORIGINAL, mesmo que a venda seja de outro mês (revisão de 23/09: antes, a
 *   devolução de venda do mês anterior não saía de ninguém e o vendedor ficava
 *   com resultado maior do que o real).
 * - CAMPANHAS (Acessórios, Jogos): por vendedor, somando as vendas do Grupo de
 *   Produto ligado a cada campanha — com o desconto da venda rateado entre os
 *   itens e a devolução descontada, para a campanha falar a mesma língua da
 *   meta individual.
 *
 * Esta tela NÃO calcula prêmio. A planilha também não: ela guarda as metas, e
 * o prêmio é apurado no processo de premiação, fora do sistema.
 */

const MESES_NOME = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

interface MetaFaixaRow {
  faixa: Faixa;
  valor_meta: number;
}

interface CampanhaRow {
  chave: string;
  nome: string;
  grupo_produto_id: string | null;
  periodicidade: 'quinzenal' | 'mensal';
  faixa: Faixa;
  meta: number;
  premio: number;
}

interface ItemDaVenda {
  total: number | null;
  produtos: { grupo_produto_id: string | null } | null;
}

interface VendaRow {
  id: string;
  created_at: string;
  total: number | null;
  valor_faturamento_real: number | null;
  vendedor_id: string | null;
  itens_venda: ItemDaVenda[] | null;
}

interface DevolucaoRow {
  created_at: string;
  valor_devolvido_cliente: number | null;
  /** A venda que foi devolvida — pode ser de outro mês. É dela que sai o vendedor. */
  venda_original: {
    vendedor_id: string | null;
    total: number | null;
    itens_venda: { total: number | null }[] | null;
  } | null;
  devolucao_itens: {
    quantidade: number | null;
    preco_unitario: number | null;
    produtos: { grupo_produto_id: string | null } | null;
  }[] | null;
}

interface PessoaDaApuracao {
  id: string;
  nome: string;
  ativo: boolean;
}

/** Os últimos 24 meses, do mais recente para trás. */
function mesesDisponiveis(hoje: Date) {
  const lista: { valor: string; rotulo: string; ano: number; mes: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    lista.push({
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d),
      ano: d.getFullYear(),
      mes: d.getMonth() + 1,
    });
  }
  return lista;
}

/**
 * Dinheiro novo de cada venda. COALESCE, não `total` sozinho: a venda de uma
 * troca grava o preço cheio em `total`, mas só `valor_faturamento_real` é o
 * dinheiro que entrou — mesma regra do resto do sistema.
 */
const faturamentoDa = (v: { total: number | null; valor_faturamento_real: number | null }) =>
  Number(v.valor_faturamento_real ?? v.total ?? 0);

// `fatorDaVenda` (o desconto da venda rateado entre os itens) mora em
// lib/dinheiroDaVenda.ts desde 24/09/2026: o IE Comercial e o painel de
// Vendas por grupo precisavam da MESMA conta, e cada um somava o preço cheio.
// Sem este rateio, a campanha creditava R$ 2.000 numa venda que a loja
// recebeu R$ 1.500 (revisão de 23/09, venda VD-202608-0003).

export default function DashboardMetas() {
  const { user, can } = useAuth();
  const podeVerCadastro = can(PERMISSIONS.DASHBOARDS_GOALS_MANAGE);

  const hoje = useMemo(() => new Date(), []);
  const meses = useMemo(() => mesesDisponiveis(hoje), [hoje]);
  const [mesEscolhido, setMesEscolhido] = useState(meses[0].valor);
  const [recorteEscolhido, setRecorteEscolhido] = useState<Recorte>('mes');

  const { ano, mes, nomeDoMes } = useMemo(() => {
    const m = meses.find((x) => x.valor === mesEscolhido) ?? meses[0];
    return { ano: m.ano, mes: m.mes, nomeDoMes: m.rotulo };
  }, [meses, mesEscolhido]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-metas', ano, mes],
    queryFn: async () => {
      const mesInteiro = periodoDoMes(ano, mes);
      const de = mesInteiro.inicio.toISOString();
      const ate = mesInteiro.fim.toISOString();

      const [configRes, faixasRes, campanhasRes, apuracaoRes, pessoasRes, vendas, devolucoes] =
        await Promise.all([
          supabase.from('vw_metas_mes').select('vendedores, apuracao').eq('ano', ano).eq('mes', mes).maybeSingle(),
          supabase.from('metas_faturamento').select('faixa, valor_meta').eq('ano', ano).eq('mes', mes),
          supabase.from('metas_campanha').select('chave, nome, grupo_produto_id, periodicidade, faixa, meta, premio'),
          // Quem tem o perfil Vendedor — os ativos de hoje e também quem já
          // saiu mas vendeu neste mês (o desligado no dia 17 ainda recebe a 1ª
          // quinzena). É função porque ler o perfil dos outros exige permissão
          // de gerenciar usuários.
          supabase.rpc('pessoas_da_apuracao', { p_de: de, p_ate: ate }),
          // Nomes de todo mundo, para quem vendeu sem estar na apuração
          // (gerente, administrador) aparecer com nome.
          supabase.from('profiles').select('id, nome'),
          // Em páginas: um mês cheio de loja movimentada passa das 1.000 linhas
          // em que o Supabase corta calado (lib/buscarEmPaginas.ts).
          buscarEmPaginas<VendaRow>(() =>
            supabase
              .from('vendas')
              // `produtos:vw_produtos(...)`: leitura de produto passa SEMPRE
              // pela view (regra de custo protegido).
              .select('id, created_at, total, valor_faturamento_real, vendedor_id, itens_venda(total, produtos:vw_produtos(grupo_produto_id))')
              .gte('created_at', de)
              .lt('created_at', ate)
              .neq('status', 'cancelado')
              .order('created_at')
              .order('id'),
          ),
          // Devolução do mês, com a venda ORIGINAL junto (de qualquer mês):
          // é dela que sai o vendedor e o fator de desconto. O apelido da
          // chave estrangeira é obrigatório — `devolucoes` aponta duas vezes
          // para `vendas` (a original e a nova, na troca).
          buscarEmPaginas<DevolucaoRow>(() =>
            supabase
              .from('devolucoes')
              .select('created_at, valor_devolvido_cliente, venda_original:vendas!devolucoes_venda_original_id_fkey(vendedor_id, total, itens_venda(total)), devolucao_itens(quantidade, preco_unitario, produtos:vw_produtos(grupo_produto_id))')
              .gte('created_at', de)
              .lt('created_at', ate)
              .order('created_at')
              .order('id'),
          ),
        ]);

      for (const r of [configRes, faixasRes, campanhasRes, apuracaoRes, pessoasRes]) {
        if (r.error) throw r.error;
      }

      return {
        config: (configRes.data ?? null) as { vendedores: number; apuracao: Apuracao } | null,
        faixas: (faixasRes.data ?? []) as MetaFaixaRow[],
        campanhas: (campanhasRes.data ?? []) as unknown as CampanhaRow[],
        vendas,
        devolucoes,
        naApuracao: (apuracaoRes.data ?? []) as PessoaDaApuracao[],
        nomes: new Map(((pessoasRes.data ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome])),
      };
    },
  });

  // O recorte só pode ser quinzena em mês quinzenal. Se o mês mudou para um
  // de "4 períodos", volta sozinho para o mês inteiro.
  const recortes = recortesDoMes(data?.config?.apuracao);
  const recorte: Recorte = recortes.includes(recorteEscolhido) ? recorteEscolhido : 'mes';

  const periodo = useMemo(() => {
    if (recorte === 'q1') return periodoDaQuinzena(ano, mes, 1);
    if (recorte === 'q2') return periodoDaQuinzena(ano, mes, 2);
    return periodoDoMes(ano, mes);
  }, [ano, mes, recorte]);

  const vendas = useMemo(
    () => (data?.vendas ?? []).filter((v) => dentroDoPeriodo(v.created_at, periodo)),
    [data, periodo],
  );
  const devolucoes = useMemo(
    () => (data?.devolucoes ?? []).filter((d) => dentroDoPeriodo(d.created_at, periodo)),
    [data, periodo],
  );

  const vendedores = data?.config?.vendedores ?? 0;
  const semMetaCadastrada = !isLoading && (data?.faixas.length ?? 0) === 0;

  /**
   * Em que pé está o período: ainda não começou, em andamento ou fechado.
   * A 2ª quinzena de um mês em curso ainda não começou — antes a tela a
   * chamava de "Período encerrado / Resultado final" (revisão de 23/09).
   */
  const situacaoDoPeriodo: 'futuro' | 'em-curso' | 'encerrado' =
    hoje < periodo.inicio ? 'futuro' : hoje < periodo.fim ? 'em-curso' : 'encerrado';

  // ── A loja ────────────────────────────────────────────────────────────────
  const realizadoLoja =
    vendas.reduce((s, v) => s + faturamentoDa(v), 0) -
    devolucoes.reduce((s, d) => s + Number(d.valor_devolvido_cliente ?? 0), 0);

  const faixasDaLoja: MetaDeFaixa[] = (data?.faixas ?? []).map((f) => ({
    faixa: f.faixa,
    alvo: metaDaLojaNoRecorte(Number(f.valor_meta), recorte),
  }));
  const situacaoLoja = situacaoNasFaixas(realizadoLoja, faixasDaLoja);

  const diasDoPeriodo = diasCorridos(periodo);
  const diasPassados =
    situacaoDoPeriodo === 'em-curso'
      ? Math.max(1, Math.ceil((hoje.getTime() - periodo.inicio.getTime()) / 86_400_000))
      : situacaoDoPeriodo === 'encerrado'
        ? diasDoPeriodo
        : 0;
  const projecao =
    situacaoDoPeriodo === 'em-curso' ? (realizadoLoja / diasPassados) * diasDoPeriodo : realizadoLoja;

  // ── Cada pessoa ───────────────────────────────────────────────────────────
  const vendidoPor = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of vendas) {
      if (!v.vendedor_id) continue;
      mapa.set(v.vendedor_id, (mapa.get(v.vendedor_id) ?? 0) + faturamentoDa(v));
    }
    // A devolução sai de quem fez a venda ORIGINAL — que vem junto na busca,
    // mesmo sendo de outro mês.
    for (const d of devolucoes) {
      const dono = d.venda_original?.vendedor_id;
      if (!dono) continue;
      mapa.set(dono, (mapa.get(dono) ?? 0) - Number(d.valor_devolvido_cliente ?? 0));
    }
    return mapa;
  }, [vendas, devolucoes]);

  /** A régua de cada vendedor: a da loja ÷ vendedores, no recorte. */
  const faixasIndividuais: MetaDeFaixa[] = (data?.faixas ?? [])
    .map((f) => ({ faixa: f.faixa, alvo: metaIndividual(Number(f.valor_meta), vendedores, recorte) }))
    .filter((f): f is MetaDeFaixa => f.alvo !== null)
    .sort((a, b) => a.alvo - b.alvo);

  const naApuracao = useMemo(() => new Map((data?.naApuracao ?? []).map((p) => [p.id, p])), [data]);

  const linhas = useMemo(() => {
    const ids = new Set<string>([...naApuracao.keys(), ...vendidoPor.keys()]);
    return [...ids]
      .map((id) => {
        const vendido = vendidoPor.get(id) ?? 0;
        const pessoa = naApuracao.get(id);
        const entra = Boolean(pessoa) && faixasIndividuais.length > 0;
        return {
          id,
          nome: pessoa?.nome ?? data?.nomes.get(id) ?? 'Pessoa não identificada',
          desligado: pessoa ? !pessoa.ativo : false,
          vendido,
          naEquipe: Boolean(pessoa),
          situacao: entra ? situacaoNasFaixas(vendido, faixasIndividuais) : null,
        };
      })
      .sort((a, b) => Number(b.naEquipe) - Number(a.naEquipe) || b.vendido - a.vendido);
    // `faixasIndividuais` é recalculada a cada render; as entradas reais dela
    // (faixas, vendedores, recorte) estão na lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naApuracao, vendidoPor, data, recorte, vendedores]);

  const minhaLinha = linhas.find((l) => l.id === user?.id && l.naEquipe) ?? null;

  // ── Campanhas ─────────────────────────────────────────────────────────────
  const campanhas = useMemo(() => {
    const porChave = new Map<string, { nome: string; grupo: string | null; periodicidade: 'quinzenal' | 'mensal'; faixas: MetaDeFaixa[] }>();
    for (const c of data?.campanhas ?? []) {
      const atual = porChave.get(c.chave) ?? {
        nome: c.nome,
        grupo: c.grupo_produto_id,
        periodicidade: c.periodicidade,
        faixas: [],
      };
      atual.faixas.push({ faixa: c.faixa, alvo: Number(c.meta) });
      porChave.set(c.chave, atual);
    }
    return [...porChave.values()];
  }, [data]);

  /**
   * Quanto um vendedor fez de um Grupo de Produto no recorte: os itens do
   * grupo, com o desconto da venda rateado, MENOS o que voltou em devolução
   * de venda dele (com o mesmo rateio da venda original).
   *
   * Na troca, a peça que voltou sai pela devolução e a que foi levada entra
   * pela venda nova, cada uma pelo seu valor — e o resultado bate com a meta
   * individual (que soma o dinheiro novo e tira o dinheiro devolvido).
   */
  const vendidoDoGrupo = (grupoId: string, pessoaId: string) => {
    const vendido = vendas
      .filter((v) => v.vendedor_id === pessoaId)
      .reduce((soma, v) => {
        const fator = fatorDaVenda(v);
        return (
          soma +
          (v.itens_venda ?? [])
            .filter((i) => i.produtos?.grupo_produto_id === grupoId)
            .reduce((s, i) => s + Number(i.total ?? 0) * fator, 0)
        );
      }, 0);
    const devolvido = devolucoes
      .filter((d) => d.venda_original?.vendedor_id === pessoaId)
      .reduce((soma, d) => {
        const fator = d.venda_original ? fatorDaVenda(d.venda_original) : 1;
        return (
          soma +
          (d.devolucao_itens ?? [])
            .filter((i) => i.produtos?.grupo_produto_id === grupoId)
            .reduce((s, i) => s + Number(i.quantidade ?? 0) * Number(i.preco_unitario ?? 0) * fator, 0)
        );
      }, 0);
    return Math.round((vendido - devolvido) * 100) / 100;
  };

  /** Itens vendidos no recorte sem Grupo de Produto: ficam de fora das campanhas. */
  const itensSemGrupo = vendas
    .flatMap((v) => v.itens_venda ?? [])
    .filter((i) => i.produtos && !i.produtos.grupo_produto_id).length;

  const vendedoresDaCampanha = [...naApuracao.values()];

  /** Por que uma campanha não pode ser mostrada neste recorte (ou null se pode). */
  const motivoSemCampanha = (periodicidade: 'quinzenal' | 'mensal'): string | null => {
    if (periodicidade === 'quinzenal' && !recortes.includes('q1')) {
      return `Em ${nomeDoMes} a apuração era em 4 períodos, então as campanhas por quinzena não se aplicam a este mês.`;
    }
    if (periodicidade === 'quinzenal' && recorte === 'mes') {
      return 'Esta campanha é apurada por quinzena. Escolha a 1ª ou a 2ª quinzena em "Apuração", aqui em cima.';
    }
    if (periodicidade === 'mensal' && recorte !== 'mes') {
      return 'Esta campanha é apurada no mês inteiro. Escolha "Mês inteiro" em "Apuração", aqui em cima.';
    }
    return null;
  };

  const rotuloPeriodo =
    recorte === 'mes' ? nomeDoMes : `${ROTULO_RECORTE[recorte]} de ${MESES_NOME[mes - 1]}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titulo="Dashboard de Metas"
        hint="Quanto a loja e cada vendedor já fizeram contra a meta da planilha Metas RPG. Tela de acompanhamento — não calcula prêmio."
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-800 px-4 py-2.5 text-white dark:bg-slate-700">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4" />
            Período da meta
          </p>
          {podeVerCadastro && (
            <Link
              to="/cadastros/metas"
              className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Ver as metas cadastradas
              <ExternalLink className="h-4 w-4" />
            </Link>
          )}
        </div>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="meta-mes" className="text-xs">Mês</Label>
              <Select value={mesEscolhido} onValueChange={setMesEscolhido}>
                <SelectTrigger id="meta-mes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meses.map((m) => (
                    <SelectItem key={m.valor} value={m.valor}>
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meta-recorte" className="text-xs">Apuração</Label>
              <Select value={recorte} onValueChange={(v) => setRecorteEscolhido(v as Recorte)}>
                <SelectTrigger id="meta-recorte">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recortes.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROTULO_RECORTE[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {data?.config
              ? data.config.apuracao === 'quinzenal'
                ? `${nomeDoMes} é apurado por quinzena. Na quinzena, a meta é metade da do mês. Meta de cada vendedor = meta da loja ÷ ${vendedores}.`
                : `${nomeDoMes} foi apurado em 4 períodos (${ROTULO_APURACAO.quatro_periodos}), então só o mês inteiro é mostrado. Meta de cada vendedor = meta da loja ÷ ${vendedores}.`
              : 'A planilha de metas ainda não mandou a configuração deste mês.'}
          </p>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar as metas</AlertTitle>
          <AlertDescription>{String((error as Error).message)}</AlertDescription>
        </Alert>
      )}

      {/* A minha meta: o que o vendedor abre o painel para ver */}
      {minhaLinha && (
        <Card className="overflow-hidden border-primary/40">
          <div className="kpi-vendas p-1" />
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-muted-foreground" />
              A sua meta — {rotuloPeriodo}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!minhaLinha.situacao ? (
              // Sem meta no mês (ou zero vendedores): antes a tela escrevia
              // "Todas as faixas batidas! 🎉" para quem não tinha meta nenhuma.
              <p className="text-sm text-muted-foreground">
                Sem meta individual para {rotuloPeriodo.toLowerCase()} — a planilha ainda não trouxe a meta
                deste mês, ou o mês está com zero vendedores dividindo a meta. Você vendeu{' '}
                <strong>{moeda(minhaLinha.vendido)}</strong>.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-2xl font-bold">{moeda(minhaLinha.vendido)}</span>
                  <span className="text-sm text-muted-foreground">
                    {minhaLinha.situacao.alcancada
                      ? `Você está na faixa ${ROTULO_FAIXA[minhaLinha.situacao.alcancada.faixa]} ${EMOJI_FAIXA[minhaLinha.situacao.alcancada.faixa]}`
                      : 'Nenhuma faixa alcançada ainda'}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {faixasIndividuais.map((f) => (
                    <div key={f.faixa} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {EMOJI_FAIXA[f.faixa]} {ROTULO_FAIXA[f.faixa]}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{moeda(f.alvo)}</span>
                      </div>
                      <Progress value={percentualDaFaixa(minhaLinha.vendido, f.alvo)} />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {minhaLinha.situacao.proxima
                    ? `Faltam ${moeda(minhaLinha.situacao.falta)} para ${ROTULO_FAIXA[minhaLinha.situacao.proxima.faixa]}.`
                    : 'Todas as faixas batidas! 🎉'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : semMetaCadastrada ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground/50" />
            <p className="font-medium">A meta de {nomeDoMes} ainda não chegou da planilha</p>
            <p className="max-w-md text-sm text-muted-foreground">
              As metas vêm da planilha Metas RPG. Assim que o mês estiver preenchido lá, ele aparece
              aqui sozinho.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="overflow-hidden">
              <div className="kpi-caixa p-1" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Faturado pela Loja</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{moeda(realizadoLoja)}</div>
                <p className="text-xs text-muted-foreground">
                  {rotuloPeriodo}
                  {situacaoDoPeriodo === 'em-curso'
                    ? ` · ${diasPassados} de ${diasDoPeriodo} dias`
                    : situacaoDoPeriodo === 'futuro'
                      ? ' · ainda não começou'
                      : ' · já fechado'}
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="kpi-vendas p-1" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Faixa da Loja</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {situacaoLoja.alcancada ? (
                  <Badge className="text-sm">
                    {ROTULO_FAIXA[situacaoLoja.alcancada.faixa]} {EMOJI_FAIXA[situacaoLoja.alcancada.faixa]}
                  </Badge>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma faixa atingida ainda</p>
                )}
                {situacaoLoja.proxima && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Faltam {moeda(situacaoLoja.falta)} para {ROTULO_FAIXA[situacaoLoja.proxima.faixa]}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="kpi-os p-1" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {situacaoDoPeriodo === 'encerrado' ? 'Resultado Final' : 'Projeção do Período'}
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {situacaoDoPeriodo === 'futuro' ? '—' : moeda(projecao)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {situacaoDoPeriodo === 'futuro'
                    ? 'O período ainda não começou — não há ritmo para projetar'
                    : situacaoDoPeriodo === 'encerrado'
                      ? 'Período encerrado — este é o número fechado'
                      : situacaoLoja.proxima
                        ? projecao >= situacaoLoja.proxima.alvo
                          ? `No ritmo atual, bate ${ROTULO_FAIXA[situacaoLoja.proxima.faixa]}`
                          : `No ritmo atual, fica abaixo de ${ROTULO_FAIXA[situacaoLoja.proxima.faixa]}`
                        : 'Todas as faixas já foram atingidas'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Meta da Loja</CardTitle>
              <CardDescription>
                Quanto falta para cada faixa em {rotuloPeriodo.toLowerCase()}, somando as vendas de todo
                mundo — inclusive de quem não entra na apuração individual.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {[...faixasDaLoja].sort((a, b) => a.alvo - b.alvo).map((f) => {
                const batida = realizadoLoja >= f.alvo;
                return (
                  <div key={f.faixa}>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                      <span className="font-medium">
                        {EMOJI_FAIXA[f.faixa]} {ROTULO_FAIXA[f.faixa]}{' '}
                        <span className="font-normal text-muted-foreground">— meta {moeda(f.alvo)}</span>
                      </span>
                      <span className={batida ? 'font-medium text-green-600' : 'text-muted-foreground'}>
                        {batida ? 'Atingida! 🎉' : `Faltam ${moeda(f.alvo - realizadoLoja)}`}
                      </span>
                    </div>
                    <Progress value={percentualDaFaixa(realizadoLoja, f.alvo)} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Meta de Cada Vendedor
              </CardTitle>
              <CardDescription>
                A régua de cada um é a meta da loja ÷ {vendedores || '—'} vendedor(es)
                {recorte !== 'mes' ? ', dividida por 2 na quinzena' : ''}. Quem não tem o perfil
                Vendedor aparece no fim, fora da apuração — as vendas contam para a loja.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vendedores === 0 && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    A planilha diz que {nomeDoMes} tem zero vendedores dividindo a meta, então não há
                    meta individual para mostrar.
                  </AlertDescription>
                </Alert>
              )}
              {linhas.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Ninguém com perfil Vendedor cadastrado e nenhuma venda no período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pessoa</TableHead>
                        <TableHead className="text-right">Vendido</TableHead>
                        <TableHead>Faixa</TableHead>
                        <TableHead className="text-right">Falta para a próxima</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhas.map((l) => (
                        <TableRow key={l.id} className={l.id === user?.id ? 'bg-muted/40' : undefined}>
                          <TableCell className="font-medium">
                            {l.nome}
                            {l.id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
                            {l.desligado && <span className="ml-2 text-xs text-muted-foreground">(saiu da loja)</span>}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{moeda(l.vendido)}</TableCell>
                          <TableCell>
                            {!l.naEquipe ? (
                              <span className="text-xs text-muted-foreground">fora da apuração</span>
                            ) : l.situacao?.alcancada ? (
                              `${EMOJI_FAIXA[l.situacao.alcancada.faixa]} ${ROTULO_FAIXA[l.situacao.alcancada.faixa]}`
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {!l.situacao
                              ? ''
                              : l.situacao.proxima
                                ? `${moeda(l.situacao.falta)} p/ ${ROTULO_FAIXA[l.situacao.proxima.faixa]}`
                                : 'todas batidas 🎉'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {faixasIndividuais.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Régua individual em {rotuloPeriodo.toLowerCase()}:{' '}
                  {faixasIndividuais.map((f) => `${ROTULO_FAIXA[f.faixa]} ${moeda(f.alvo)}`).join(' · ')}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Quem entra na apuração segue o perfil de hoje no cadastro de usuários. Quem saiu da loja
                continua aparecendo nos meses em que vendeu; quem mudou de perfil (de vendedor para
                gerente, por exemplo) aparece com o perfil novo também nos meses antigos.
              </p>
            </CardContent>
          </Card>

          {campanhas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-muted-foreground" />
                  Campanhas
                </CardTitle>
                <CardDescription>
                  Metas extras por vendedor, somando as vendas do Grupo de Produto de cada campanha.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {campanhas.map((c) => {
                  const motivo = motivoSemCampanha(c.periodicidade);
                  return (
                    <div key={c.nome} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{c.nome}</h3>
                        <span className="text-xs text-muted-foreground">
                          {c.faixas
                            .slice()
                            .sort((a, b) => a.alvo - b.alvo)
                            .map((f) => `${ROTULO_FAIXA[f.faixa]} ${moeda(f.alvo)}`)
                            .join(' · ')}
                        </span>
                      </div>
                      {motivo ? (
                        <p className="text-sm text-muted-foreground">{motivo}</p>
                      ) : !c.grupo ? (
                        <p className="text-sm text-muted-foreground">
                          Esta campanha ainda não está ligada a um Grupo de Produto — veja em
                          Cadastros &gt; Metas.
                        </p>
                      ) : vendedoresDaCampanha.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Ninguém com perfil Vendedor.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Vendedor</TableHead>
                                <TableHead className="text-right">Vendido no grupo</TableHead>
                                <TableHead>Faixa</TableHead>
                                <TableHead className="text-right">Falta para a próxima</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {vendedoresDaCampanha.map((p) => {
                                const vendido = vendidoDoGrupo(c.grupo as string, p.id);
                                const s = situacaoNasFaixas(vendido, c.faixas);
                                return (
                                  <TableRow key={p.id}>
                                    <TableCell className="font-medium">{p.nome}</TableCell>
                                    <TableCell className="text-right tabular-nums">{moeda(vendido)}</TableCell>
                                    <TableCell>
                                      {s.alcancada ? `${EMOJI_FAIXA[s.alcancada.faixa]} ${ROTULO_FAIXA[s.alcancada.faixa]}` : '—'}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                      {s.proxima ? `${moeda(s.falta)} p/ ${ROTULO_FAIXA[s.proxima.faixa]}` : 'todas batidas 🎉'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}
                {itensSemGrupo > 0 && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>{itensSemGrupo} item(ns) vendido(s) em {rotuloPeriodo.toLowerCase()} estão em
                      produto sem Grupo de Produto</strong> e ficam fora de todas as campanhas. Para
                      entrarem, preencha o grupo no cadastro do produto (Estoque).
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-muted-foreground">
                  O valor de cada item já vem com o desconto da venda rateado, e a devolução sai de quem
                  fez a venda original. A régua é a atual da planilha — meses antigos podem ter sido
                  apurados com outra.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
