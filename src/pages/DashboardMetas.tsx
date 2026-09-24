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
import { periodoDoMes, periodoDaQuinzena, dentroDoPeriodo, diasCorridos } from '@/lib/periodo';
import {
  FAIXAS,
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
 * - CAMPANHAS (Acessórios, Jogos): por vendedor, somando as vendas do Grupo de
 *   Produto ligado a cada campanha.
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

interface VendaRow {
  id: string;
  created_at: string;
  total: number | null;
  valor_faturamento_real: number | null;
  vendedor_id: string | null;
  itens_venda: { total: number | null; produtos: { grupo_produto_id: string | null } | null }[] | null;
}

interface DevolucaoRow {
  created_at: string;
  valor_devolvido_cliente: number | null;
  venda_original_id: string;
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
const faturamentoDa = (v: VendaRow) => Number(v.valor_faturamento_real ?? v.total ?? 0);

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

      const [configRes, faixasRes, campanhasRes, vendasRes, devolucoesRes, apuracaoRes, pessoasRes] =
        await Promise.all([
          supabase.from('vw_metas_mes').select('vendedores, apuracao').eq('ano', ano).eq('mes', mes).maybeSingle(),
          supabase.from('metas_faturamento').select('faixa, valor_meta').eq('ano', ano).eq('mes', mes),
          supabase.from('metas_campanha').select('chave, nome, grupo_produto_id, periodicidade, faixa, meta, premio'),
          supabase
            .from('vendas')
            // `produtos:vw_produtos(...)`: leitura de produto passa SEMPRE pela
            // view (regra de custo protegido), mesmo sem pedir custo.
            .select('id, created_at, total, valor_faturamento_real, vendedor_id, itens_venda(total, produtos:vw_produtos(grupo_produto_id))')
            .gte('created_at', de)
            .lt('created_at', ate)
            .neq('status', 'cancelado'),
          // Devolução do mês: dinheiro que saiu da gaveta. Pesa no mês em que
          // aconteceu (régua do Caixa) e volta para quem fez a venda original.
          supabase
            .from('devolucoes')
            .select('created_at, valor_devolvido_cliente, venda_original_id')
            .gte('created_at', de)
            .lt('created_at', ate),
          // Quem tem o perfil Vendedor. É função porque ler o perfil dos outros
          // exige permissão de gerenciar usuários — sem ela, o vendedor abriria
          // o painel sem ninguém na tabela, nem ele.
          supabase.rpc('pessoas_da_apuracao'),
          // Nomes de todo mundo, para quem vendeu sem estar na apuração
          // (gerente, administrador) aparecer com nome e não como "desconhecido".
          supabase.from('profiles').select('id, nome'),
        ]);

      for (const r of [configRes, faixasRes, campanhasRes, vendasRes, devolucoesRes, apuracaoRes, pessoasRes]) {
        if (r.error) throw r.error;
      }

      return {
        config: (configRes.data ?? null) as { vendedores: number; apuracao: Apuracao } | null,
        faixas: (faixasRes.data ?? []) as MetaFaixaRow[],
        campanhas: (campanhasRes.data ?? []) as unknown as CampanhaRow[],
        vendas: (vendasRes.data ?? []) as unknown as VendaRow[],
        devolucoes: (devolucoesRes.data ?? []) as DevolucaoRow[],
        naApuracao: (apuracaoRes.data ?? []) as { id: string; nome: string }[],
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

  // ── A loja ────────────────────────────────────────────────────────────────
  const realizadoLoja =
    vendas.reduce((s, v) => s + faturamentoDa(v), 0) -
    devolucoes.reduce((s, d) => s + Number(d.valor_devolvido_cliente ?? 0), 0);

  const faixasDaLoja: MetaDeFaixa[] = (data?.faixas ?? []).map((f) => ({
    faixa: f.faixa,
    alvo: metaDaLojaNoRecorte(Number(f.valor_meta), recorte),
  }));
  const situacaoLoja = situacaoNasFaixas(realizadoLoja, faixasDaLoja);

  const periodoEmCurso = hoje >= periodo.inicio && hoje < periodo.fim;
  const diasDoPeriodo = diasCorridos(periodo);
  const diasPassados = periodoEmCurso
    ? Math.max(1, Math.ceil((hoje.getTime() - periodo.inicio.getTime()) / 86_400_000))
    : diasDoPeriodo;
  const projecao = periodoEmCurso ? (realizadoLoja / diasPassados) * diasDoPeriodo : realizadoLoja;

  // ── Cada pessoa ───────────────────────────────────────────────────────────
  const vendidoPor = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of vendas) {
      if (!v.vendedor_id) continue;
      mapa.set(v.vendedor_id, (mapa.get(v.vendedor_id) ?? 0) + faturamentoDa(v));
    }
    // A devolução volta para quem fez a venda ORIGINAL. Se a venda original é
    // de outro mês, o desconto já pesou na loja e não é atribuído a ninguém —
    // melhor do que atribuir errado.
    const donoDaVenda = new Map((data?.vendas ?? []).map((v) => [v.id, v.vendedor_id]));
    for (const d of devolucoes) {
      const dono = donoDaVenda.get(d.venda_original_id);
      if (!dono) continue;
      mapa.set(dono, (mapa.get(dono) ?? 0) - Number(d.valor_devolvido_cliente ?? 0));
    }
    return mapa;
  }, [vendas, devolucoes, data]);

  /** A régua de cada vendedor: a da loja ÷ vendedores, no recorte. */
  const faixasIndividuais: MetaDeFaixa[] = (data?.faixas ?? [])
    .map((f) => ({ faixa: f.faixa, alvo: metaIndividual(Number(f.valor_meta), vendedores, recorte) }))
    .filter((f): f is MetaDeFaixa => f.alvo !== null)
    .sort((a, b) => a.alvo - b.alvo);

  const naApuracao = useMemo(() => new Set((data?.naApuracao ?? []).map((p) => p.id)), [data]);

  const linhas = useMemo(() => {
    const ids = new Set<string>([...naApuracao, ...vendidoPor.keys()]);
    return [...ids]
      .map((id) => {
        const vendido = vendidoPor.get(id) ?? 0;
        const entra = naApuracao.has(id);
        return {
          id,
          nome:
            data?.naApuracao.find((p) => p.id === id)?.nome ??
            data?.nomes.get(id) ??
            'Pessoa não identificada',
          vendido,
          entra,
          situacao: entra ? situacaoNasFaixas(vendido, faixasIndividuais) : null,
        };
      })
      .sort((a, b) => Number(b.entra) - Number(a.entra) || b.vendido - a.vendido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naApuracao, vendidoPor, data, recorte, vendedores]);

  const minhaLinha = linhas.find((l) => l.id === user?.id && l.entra) ?? null;

  // ── Campanhas ─────────────────────────────────────────────────────────────
  const campanhas = useMemo(() => {
    const porChave = new Map<string, { nome: string; grupo: string | null; periodicidade: string; faixas: MetaDeFaixa[] }>();
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

  /** Quanto cada vendedor vendeu de um Grupo de Produto no recorte. */
  const vendidoDoGrupo = (grupoId: string, pessoaId: string) =>
    vendas
      .filter((v) => v.vendedor_id === pessoaId)
      .flatMap((v) => v.itens_venda ?? [])
      .filter((i) => i.produtos?.grupo_produto_id === grupoId)
      .reduce((s, i) => s + Number(i.total ?? 0), 0);

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
      {minhaLinha?.situacao && (
        <Card className="overflow-hidden border-primary/40">
          <div className="kpi-vendas p-1" />
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-muted-foreground" />
              A sua meta — {rotuloPeriodo}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
                  {periodoEmCurso ? ` · ${diasPassados} de ${diasDoPeriodo} dias` : ' · já fechado'}
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
                  {periodoEmCurso ? 'Projeção do Período' : 'Resultado Final'}
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{moeda(projecao)}</div>
                <p className="text-xs text-muted-foreground">
                  {!periodoEmCurso
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
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{moeda(l.vendido)}</TableCell>
                          <TableCell>
                            {!l.entra ? (
                              <span className="text-xs text-muted-foreground">fora da apuração</span>
                            ) : l.situacao?.alcancada ? (
                              `${EMOJI_FAIXA[l.situacao.alcancada.faixa]} ${ROTULO_FAIXA[l.situacao.alcancada.faixa]}`
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {!l.entra || !l.situacao
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
                {recorte === 'mes' && campanhas.some((c) => c.periodicidade === 'quinzenal') ? (
                  <p className="text-sm text-muted-foreground">
                    As campanhas são apuradas por quinzena. Escolha a 1ª ou a 2ª quinzena em
                    "Apuração", aqui em cima, para ver o andamento de cada vendedor.
                  </p>
                ) : (
                  campanhas.map((c) => (
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
                      {!c.grupo ? (
                        <p className="text-sm text-muted-foreground">
                          Esta campanha ainda não está ligada a um Grupo de Produto — veja em
                          Cadastros &gt; Metas.
                        </p>
                      ) : naApuracao.size === 0 ? (
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
                              {(data?.naApuracao ?? []).map((p) => {
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
                  ))
                )}
                <p className="text-xs text-muted-foreground">
                  A soma usa o Grupo de Produto cadastrado em cada produto: produto sem grupo não entra
                  em campanha nenhuma. Devolução não é abatida aqui, porque ela é registrada por venda e
                  não guarda de qual grupo era a peça. E a régua é a atual da planilha — meses antigos
                  podem ter sido apurados com outra.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
