import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Trophy, TrendingUp, Users, Info, Settings2, Target, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { CadastroDeMetas, type MetaDePessoa } from '@/components/metas/CadastroDeMetas';
import type { Database } from '@/integrations/supabase/types';

/**
 * Dashboard de Metas.
 *
 * O que mudou em 22/09, a pedido do Felipe:
 *
 * 1. **Dá para escolher o mês** — antes era sempre o mês corrente, então não
 *    havia como olhar para trás e ver se a meta de agosto foi batida.
 * 2. **Dá para ver por quinzena.** A premiação da loja é apurada de quinze em
 *    quinze dias desde agosto/2026, e o painel falava só em mês. A meta da
 *    quinzena é a do mês dividida por dois — é assim que a apuração de verdade
 *    funciona, e o cadastro continua sendo um só, mensal, para não existirem
 *    dois lugares dizendo a mesma coisa.
 * 3. **A meta individual existe de verdade.** Antes o painel dividia a meta da
 *    loja pelo número de gente que tinha vendido no mês e chamava de
 *    "estimativa" — um número que mudava sozinho quando alguém entrava de
 *    férias. Agora administrador e gerente cadastram a meta de cada pessoa, e
 *    cada um vê a sua.
 *
 * Esta tela continua NÃO calculando comissão nem substituindo o processo de
 * premiação, que roda fora do Sisteminha.
 */

type Faixa = Database['public']['Enums']['faixa_premiacao'];

const FAIXA_LABEL: Record<Faixa, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  diamante: 'Diamante',
};

const FAIXA_EMOJI: Record<Faixa, string> = {
  bronze: '🥉',
  prata: '🥈',
  ouro: '🥇',
  diamante: '💎',
};

type Recorte = 'mes' | 'q1' | 'q2';

const ROTULO_RECORTE: Record<Recorte, string> = {
  mes: 'Mês inteiro',
  q1: '1ª quinzena (dias 1 a 15)',
  q2: '2ª quinzena (dia 16 ao fim)',
};

interface MetaFaixaRow {
  id: string;
  faixa: Faixa;
  valor_meta: number;
}

interface MetaVendedorRow {
  user_id: string;
  valor_meta: number;
}

interface VendaMesRow {
  id: string;
  created_at: string;
  total: number | null;
  valor_faturamento_real: number | null;
  vendedor_id: string | null;
}

interface DevolucaoMesRow {
  created_at: string;
  valor_devolvido_cliente: number | null;
  venda_original_id: string;
}

interface ProfileRow {
  id: string;
  nome: string;
  tenant_id: string;
  ativo: boolean | null;
}

/** Os últimos 24 meses, do mais recente para trás — é o que a loja consulta. */
function mesesDisponiveis(hoje: Date): { valor: string; rotulo: string; ano: number; mes: number }[] {
  const lista = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const ano = d.getFullYear();
    const mes = d.getMonth() + 1;
    lista.push({
      valor: `${ano}-${String(mes).padStart(2, '0')}`,
      rotulo: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d),
      ano,
      mes,
    });
  }
  return lista;
}

export default function DashboardMetas() {
  const { user, can } = useAuth();
  const podeCadastrar = can(PERMISSIONS.DASHBOARDS_GOALS_MANAGE);

  const hoje = useMemo(() => new Date(), []);
  const meses = useMemo(() => mesesDisponiveis(hoje), [hoje]);

  const [mesEscolhido, setMesEscolhido] = useState(meses[0].valor);
  const [recorte, setRecorte] = useState<Recorte>('mes');
  const [cadastroAberto, setCadastroAberto] = useState(false);

  const { ano, mes, nomeDoMes } = useMemo(() => {
    const m = meses.find((x) => x.valor === mesEscolhido) ?? meses[0];
    return { ano: m.ano, mes: m.mes, nomeDoMes: m.rotulo };
  }, [meses, mesEscolhido]);

  /** O recorte escolhido vira o intervalo de datas que manda em tudo na tela. */
  const periodo = useMemo(() => {
    if (recorte === 'q1') return periodoDaQuinzena(ano, mes, 1);
    if (recorte === 'q2') return periodoDaQuinzena(ano, mes, 2);
    return periodoDoMes(ano, mes);
  }, [ano, mes, recorte]);

  // Na quinzena, a meta vale metade — é assim que a loja apura a premiação
  // desde agosto/2026 (a meta mensal dividida por dois).
  const proporcaoDaMeta = recorte === 'mes' ? 1 : 0.5;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metas', ano, mes],
    queryFn: async () => {
      const mesInteiro = periodoDoMes(ano, mes);
      const de = mesInteiro.inicio.toISOString();
      const ate = mesInteiro.fim.toISOString();

      const [metasRes, metasPessoaRes, vendasRes, devolucoesRes, profilesRes] = await Promise.all([
        supabase
          .from('metas_faturamento')
          .select('id, faixa, valor_meta')
          .eq('ano', ano)
          .eq('mes', mes),
        supabase.from('metas_vendedor').select('user_id, valor_meta').eq('ano', ano).eq('mes', mes),
        supabase
          .from('vendas')
          .select('id, created_at, total, valor_faturamento_real, vendedor_id')
          .gte('created_at', de)
          .lt('created_at', ate)
          .neq('status', 'cancelado'),
        // Devoluções do mês: dinheiro que saiu da gaveta e não está em venda
        // nenhuma. Sem isto, uma venda devolvida contava inteira na meta e na
        // premiação. `venda_original_id` serve para devolver o desconto ao
        // vendedor certo.
        supabase
          .from('devolucoes')
          .select('created_at, valor_devolvido_cliente, venda_original_id')
          .gte('created_at', de)
          .lt('created_at', ate),
        // Não existe FK declarada entre vendas.vendedor_id e profiles — busca
        // à parte e junta no client por id.
        // Quem foi arquivado saiu da loja: não entra em meta de equipe.
        supabase.from('profiles').select('id, nome, tenant_id, ativo').is('arquivado_em', null),
      ]);
      if (metasRes.error) throw metasRes.error;
      if (metasPessoaRes.error) throw metasPessoaRes.error;
      if (vendasRes.error) throw vendasRes.error;
      if (devolucoesRes.error) throw devolucoesRes.error;
      if (profilesRes.error) throw profilesRes.error;

      return {
        metas: (metasRes.data ?? []) as MetaFaixaRow[],
        metasPessoa: (metasPessoaRes.data ?? []) as MetaVendedorRow[],
        vendas: (vendasRes.data ?? []) as VendaMesRow[],
        devolucoes: (devolucoesRes.data ?? []) as DevolucaoMesRow[],
        profiles: (profilesRes.data ?? []) as ProfileRow[],
      };
    },
  });

  const metas = useMemo(() => data?.metas ?? [], [data]);
  const metasPessoa = useMemo(() => data?.metasPessoa ?? [], [data]);
  const profiles = useMemo(() => data?.profiles ?? [], [data]);

  // Só o que caiu dentro do recorte (mês inteiro ou uma das quinzenas).
  const vendas = useMemo(
    () => (data?.vendas ?? []).filter((v) => dentroDoPeriodo(v.created_at, periodo)),
    [data, periodo],
  );
  const devolucoes = useMemo(
    () => (data?.devolucoes ?? []).filter((d) => dentroDoPeriodo(d.created_at, periodo)),
    [data, periodo],
  );

  const semMetaCadastrada = !isLoading && metas.length === 0;

  // COALESCE, não `total` sozinho: a venda de uma troca grava o preço cheio do
  // produto em `total` (para não perder a contagem por produto), mas só
  // `valor_faturamento_real` reflete o dinheiro novo de verdade — mesma regra
  // de Dashboard.tsx e DashboardVenda.tsx.
  const faturamentoDa = (v: VendaMesRow) => Number(v.valor_faturamento_real ?? v.total ?? 0);

  const devolvido = devolucoes.reduce((acc, d) => acc + Number(d.valor_devolvido_cliente ?? 0), 0);
  const realizado = vendas.reduce((acc, v) => acc + faturamentoDa(v), 0) - devolvido;

  // Ordenado por valor_meta crescente — não assume a ordem do enum
  // (bronze/prata/ouro/diamante é o esperado, mas quem manda é o valor).
  const faixas = [...metas]
    .sort((a, b) => a.valor_meta - b.valor_meta)
    .map((m) => {
      const alvo = m.valor_meta * proporcaoDaMeta;
      const atingida = realizado >= alvo;
      const falta = Math.max(0, alvo - realizado);
      const percentual = alvo > 0 ? Math.min(100, (realizado / alvo) * 100) : 0;
      return { ...m, alvo, atingida, falta, percentual };
    });

  const nivelAtual = [...faixas].reverse().find((f) => f.atingida) ?? null;
  const proximaFaixa = faixas.find((f) => !f.atingida) ?? null;

  /**
   * Projeção do fim do período.
   *
   * Vale só enquanto o período está em curso: projetar um mês que já acabou
   * devolveria o próprio realizado com cara de previsão.
   */
  const periodoEmCurso = hoje >= periodo.inicio && hoje < periodo.fim;
  const diasDoPeriodo = diasCorridos(periodo);
  const diasPassados = periodoEmCurso
    ? Math.max(1, Math.ceil((hoje.getTime() - periodo.inicio.getTime()) / 86_400_000))
    : diasDoPeriodo;
  const projecao = periodoEmCurso ? (realizado / diasPassados) * diasDoPeriodo : realizado;
  const projecaoBateProximaFaixa = proximaFaixa ? projecao >= proximaFaixa.alvo : null;

  // ── Por pessoa ──────────────────────────────────────────────────────────
  const nomesPorId = new Map(profiles.map((p) => [p.id, p.nome]));
  const metaPorId = new Map(metasPessoa.map((m) => [m.user_id, Number(m.valor_meta)]));

  const vendidoPorPessoa = new Map<string, number>();
  for (const v of vendas) {
    if (!v.vendedor_id) continue;
    vendidoPorPessoa.set(
      v.vendedor_id,
      (vendidoPorPessoa.get(v.vendedor_id) ?? 0) + faturamentoDa(v),
    );
  }
  // A devolução volta para quem fez a venda ORIGINAL, não para quem atendeu a
  // devolução no balcão — senão o desconto cairia na pessoa errada.
  const vendedorPorVendaId = new Map(vendas.map((v) => [v.id, v.vendedor_id]));
  for (const d of devolucoes) {
    const vendedorId = vendedorPorVendaId.get(d.venda_original_id);
    if (!vendedorId) continue;
    vendidoPorPessoa.set(
      vendedorId,
      (vendidoPorPessoa.get(vendedorId) ?? 0) - Number(d.valor_devolvido_cliente ?? 0),
    );
  }

  /**
   * A lista de pessoas do painel.
   *
   * Entra **toda a equipe ativa**, mesmo quem não tem meta nem venda — o zero
   * de alguém é justamente a informação que se procura aqui. Antes a tabela
   * só listava quem tinha meta ou tinha vendido, e a pessoa que passou o mês
   * sem vender simplesmente não existia no painel (foi o que o Felipe achou em
   * 23/09, com a Luana sumida do filtro de vendedor).
   *
   * Quem saiu da equipe mas tem venda ou meta no período continua aparecendo:
   * senão o total da loja não fecharia com a soma das pessoas.
   */
  const porPessoa = useMemo(() => {
    const ids = new Set<string>([
      ...profiles.filter((p) => p.ativo !== false).map((p) => p.id),
      ...metaPorId.keys(),
      ...vendidoPorPessoa.keys(),
    ]);
    return [...ids]
      .map((id) => {
        const meta = (metaPorId.get(id) ?? null) as number | null;
        const alvo = meta !== null ? meta * proporcaoDaMeta : null;
        const vendido = vendidoPorPessoa.get(id) ?? 0;
        return {
          id,
          nome: nomesPorId.get(id) ?? 'Vendedor não identificado',
          alvo,
          vendido,
          percentual: alvo && alvo > 0 ? Math.min(100, (vendido / alvo) * 100) : null,
          falta: alvo !== null ? Math.max(0, alvo - vendido) : null,
        };
      })
      .sort((a, b) => b.vendido - a.vendido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, periodo, proporcaoDaMeta]);

  const minhaLinha = porPessoa.find((p) => p.id === user?.id) ?? null;

  /** Pessoas que aparecem no formulário de cadastro, com a meta atual. */
  const pessoasParaCadastro: MetaDePessoa[] = useMemo(
    () =>
      profiles
        .filter((p) => p.ativo !== false)
        .map((p) => ({
          user_id: p.id,
          nome: p.nome,
          valor_meta: metaPorId.get(p.id) ?? null,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, metasPessoa],
  );

  const tenantId = profiles[0]?.tenant_id ?? null;
  const rotuloPeriodo = recorte === 'mes' ? nomeDoMes : `${ROTULO_RECORTE[recorte]} de ${nomeDoMes}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titulo="Dashboard de Metas"
        hint="Escolha o mês e veja o andamento do mês inteiro ou de cada quinzena. Tela de acompanhamento — não calcula comissão nem substitui o processo oficial de premiação."
      />

      {/* Barra de escolha: mês, recorte e (para quem pode) o cadastro */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-800 px-4 py-2.5 text-white dark:bg-slate-700">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4" />
            Período da meta
          </p>
          {podeCadastrar && (
            <Button variant="secondary" size="sm" onClick={() => setCadastroAberto(true)}>
              <Settings2 className="mr-2 h-4 w-4" />
              Cadastrar metas
            </Button>
          )}
        </div>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="meta-mes" className="text-xs">
                Mês
              </Label>
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
              <Label htmlFor="meta-recorte" className="text-xs">
                Apuração
              </Label>
              <Select value={recorte} onValueChange={(v) => setRecorte(v as Recorte)}>
                <SelectTrigger id="meta-recorte">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROTULO_RECORTE) as Recorte[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROTULO_RECORTE[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {recorte !== 'mes' && (
            <p className="mt-3 text-xs text-muted-foreground">
              Na quinzena, a meta considerada é <strong>metade</strong> da meta cadastrada para o
              mês — do mesmo jeito que a premiação da loja é apurada.
            </p>
          )}
        </CardContent>
      </Card>

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
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-2xl font-bold">{moeda(minhaLinha.vendido)}</span>
              <span className="text-sm text-muted-foreground">
                {minhaLinha.alvo !== null
                  ? `de ${moeda(minhaLinha.alvo)}`
                  : 'Sem meta cadastrada para você neste mês'}
              </span>
            </div>
            {minhaLinha.percentual !== null && (
              <>
                <Progress value={minhaLinha.percentual} />
                <p className="text-xs text-muted-foreground">
                  {minhaLinha.falta && minhaLinha.falta > 0
                    ? `Faltam ${moeda(minhaLinha.falta)} para bater a sua meta.`
                    : 'Meta batida! 🎉'}
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
            <p className="font-medium">Meta de {nomeDoMes} ainda não foi cadastrada</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {podeCadastrar
                ? 'Clique em "Cadastrar metas" aqui em cima para definir as faixas da loja e a meta de cada pessoa.'
                : 'Assim que um administrador ou gerente cadastrar as faixas, o progresso aparece aqui.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="overflow-hidden">
              <div className="kpi-caixa p-1" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Faturado no Período</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{moeda(realizado)}</div>
                <p className="text-xs text-muted-foreground">
                  {rotuloPeriodo}
                  {periodoEmCurso ? ` · ${diasPassados} de ${diasDoPeriodo} dias` : ' · já fechado'}
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="kpi-vendas p-1" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Nível Atual</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {nivelAtual ? (
                  <Badge className="text-sm">
                    Nível atual: {FAIXA_LABEL[nivelAtual.faixa]} {FAIXA_EMOJI[nivelAtual.faixa]}
                  </Badge>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma faixa atingida ainda</p>
                )}
                {proximaFaixa && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Faltam {moeda(proximaFaixa.falta)} para {FAIXA_LABEL[proximaFaixa.faixa]}
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
                    : proximaFaixa
                      ? projecaoBateProximaFaixa
                        ? `No ritmo atual, bate a meta ${FAIXA_LABEL[proximaFaixa.faixa]}`
                        : `No ritmo atual, fica abaixo da meta ${FAIXA_LABEL[proximaFaixa.faixa]}`
                      : 'Todas as faixas já foram atingidas'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Progresso por Faixa</CardTitle>
              <CardDescription>
                Quanto falta para cada faixa de premiação em {rotuloPeriodo.toLowerCase()}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {faixas.map((f) => (
                <div key={f.id}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium">
                      {FAIXA_EMOJI[f.faixa]} {FAIXA_LABEL[f.faixa]}{' '}
                      <span className="font-normal text-muted-foreground">
                        — meta {moeda(f.alvo)}
                        {proporcaoDaMeta !== 1 && ` (metade de ${moeda(f.valor_meta)})`}
                      </span>
                    </span>
                    <span className={f.atingida ? 'font-medium text-green-600' : 'text-muted-foreground'}>
                      {f.atingida ? 'Atingida! 🎉' : `Faltam ${moeda(f.falta)}`}
                    </span>
                  </div>
                  <Progress value={f.percentual} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Meta por Pessoa
              </CardTitle>
              <CardDescription>
                Quanto cada um vendeu em {rotuloPeriodo.toLowerCase()} e o quanto falta para a meta
                cadastrada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {porPessoa.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nenhuma pessoa ativa cadastrada na loja.
                  </p>
                </div>
              ) : (
                <>
                  {porPessoa.every((p) => p.alvo === null) && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Ninguém tem meta individual cadastrada</AlertTitle>
                      <AlertDescription>
                        {podeCadastrar
                          ? 'Use "Cadastrar metas" aqui em cima para definir a meta de cada pessoa — assim cada um passa a ver a própria régua, em vez de um número dividido por igual.'
                          : 'Enquanto não houver meta individual, a tabela mostra só o que cada um vendeu.'}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pessoa</TableHead>
                        <TableHead className="text-right">Vendido</TableHead>
                        <TableHead className="text-right">Meta</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Andamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {porPessoa.map((p) => (
                        <TableRow key={p.id} className={p.id === user?.id ? 'bg-muted/40' : undefined}>
                          <TableCell className="font-medium">
                            {p.nome}
                            {p.id === user?.id && (
                              <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {moeda(p.vendido)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {p.alvo !== null ? moeda(p.alvo) : '—'}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {p.percentual !== null ? (
                              <div className="flex items-center justify-end gap-2">
                                <div className="h-1.5 w-full max-w-[90px] overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full rounded-full ${p.percentual >= 100 ? 'bg-green-500' : 'bg-primary'}`}
                                    style={{ width: `${Math.max(0, p.percentual)}%` }}
                                  />
                                </div>
                                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                                  {p.percentual.toFixed(0)}%
                                </span>
                              </div>
                            ) : (
                              <span className="block text-right text-xs text-muted-foreground">
                                sem meta
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {podeCadastrar && (
        <CadastroDeMetas
          open={cadastroAberto}
          onOpenChange={setCadastroAberto}
          ano={ano}
          mes={mes}
          nomeDoMes={nomeDoMes}
          tenantId={tenantId}
          metasDaLoja={metas.map((m) => ({ faixa: m.faixa, valor_meta: Number(m.valor_meta) }))}
          pessoas={pessoasParaCadastro}
        />
      )}
    </div>
  );
}
