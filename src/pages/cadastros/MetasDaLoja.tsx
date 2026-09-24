import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Info,
  Target,
  Users,
  Megaphone,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/PageHeader';
import { moeda, dataHora } from '@/lib/format';
import {
  FAIXAS,
  ROTULO_FAIXA,
  EMOJI_FAIXA,
  ROTULO_APURACAO,
  metaIndividual,
  type Faixa,
  type Apuracao,
} from '@/lib/metas';
import { useListaDoSistema } from '@/lib/listasDeFiltro';

/**
 * Cadastros > Metas — o espelho da planilha "Metas RPG".
 *
 * Pedido do Felipe em 23/09/2026: uma aba de metas em Cadastros, com as metas
 * da loja e as de acessórios, copiadas da planilha — *"se alterar os dados da
 * planilha, alterar os dados aí no sistema"*.
 *
 * Por isso esta tela NÃO edita nada. A planilha é a fonte; um robô dentro dela
 * manda os números a cada edição (integracoes/planilha-de-metas/). Se a tela
 * também deixasse editar, existiriam dois lugares dizendo qual é a meta, e o
 * próximo envio da planilha apagaria a mudança feita aqui sem aviso — o pior
 * dos mundos para quem conta com o número para receber prêmio.
 *
 * O que a tela faz, além de mostrar: diz QUANDO a planilha chegou pela última
 * vez e, se a última tentativa falhou, POR QUÊ — em português, com o mês e a
 * faixa com problema.
 *
 * Quem vê: administrador e gerente (dashboards.goals.manage). O vendedor vê a
 * própria meta no Dashboard de Metas.
 */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface MesRow {
  ano: number;
  mes: number;
  vendedores: number;
  apuracao: Apuracao;
  faturamento_ano_passado: number | null;
}

interface FaixaRow {
  ano: number;
  mes: number;
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

interface SincronizacaoRow {
  recebido_em: string;
  sucesso: boolean;
  erro: string | null;
  planilha_nome: string | null;
  planilha_url: string | null;
  enviado_por: string | null;
  resumo: { campanhas_sem_grupo?: string[] } | null;
}

/** Link seguro para a planilha: só endereços do Google Docs viram link. */
function linkDaPlanilha(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'docs.google.com' ? u.toString() : null;
  } catch {
    return null;
  }
}

export default function MetasDaLoja() {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const { data, isLoading, error } = useQuery({
    queryKey: ['cadastro-metas'],
    queryFn: async () => {
      const [mesesRes, faixasRes, campanhasRes, syncRes] = await Promise.all([
        // Pela view: o faturamento do ano passado só chega para quem cadastra
        // meta (regra da migration 20260923140000).
        supabase
          .from('vw_metas_mes')
          .select('ano, mes, vendedores, apuracao, faturamento_ano_passado')
          .order('ano')
          .order('mes'),
        supabase.from('metas_faturamento').select('ano, mes, faixa, valor_meta'),
        supabase
          .from('metas_campanha')
          .select('chave, nome, grupo_produto_id, periodicidade, faixa, meta, premio')
          .order('chave'),
        supabase
          .from('metas_sincronizacoes')
          .select('recebido_em, sucesso, erro, planilha_nome, planilha_url, enviado_por, resumo')
          .order('recebido_em', { ascending: false })
          .limit(20),
      ]);
      if (mesesRes.error) throw mesesRes.error;
      if (faixasRes.error) throw faixasRes.error;
      if (campanhasRes.error) throw campanhasRes.error;
      if (syncRes.error) throw syncRes.error;
      return {
        meses: (mesesRes.data ?? []) as unknown as MesRow[],
        faixas: (faixasRes.data ?? []) as unknown as FaixaRow[],
        campanhas: (campanhasRes.data ?? []) as unknown as CampanhaRow[],
        sincronizacoes: (syncRes.data ?? []) as unknown as SincronizacaoRow[],
      };
    },
  });

  const { data: grupos } = useListaDoSistema('grupo_produto');
  const nomeDoGrupo = useMemo(() => new Map((grupos ?? []).map((g) => [g.id, g.nome])), [grupos]);

  const anos = useMemo(() => {
    const lista = [...new Set((data?.meses ?? []).map((m) => m.ano))].sort((a, b) => b - a);
    return lista.length ? lista : [anoAtual];
  }, [data, anoAtual]);

  const [anoEscolhido, setAnoEscolhido] = useState<number | null>(null);
  const ano = anoEscolhido ?? (anos.includes(anoAtual) ? anoAtual : anos[0]);

  const mesesDoAno = useMemo(
    () => (data?.meses ?? []).filter((m) => m.ano === ano).sort((a, b) => a.mes - b.mes),
    [data, ano],
  );

  /** faixa → valor, por mês, só do ano escolhido. */
  const faixasPorMes = useMemo(() => {
    const mapa = new Map<number, Partial<Record<Faixa, number>>>();
    for (const f of data?.faixas ?? []) {
      if (f.ano !== ano) continue;
      const linha = mapa.get(f.mes) ?? {};
      linha[f.faixa] = Number(f.valor_meta);
      mapa.set(f.mes, linha);
    }
    return mapa;
  }, [data, ano]);

  const totais = useMemo(() => {
    const t: Partial<Record<Faixa, number>> = {};
    for (const [, linha] of faixasPorMes) {
      for (const f of FAIXAS) if (linha[f] != null) t[f] = (t[f] ?? 0) + (linha[f] as number);
    }
    return t;
  }, [faixasPorMes]);

  const campanhas = useMemo(() => {
    const porChave = new Map<string, { nome: string; grupo: string | null; periodicidade: string; faixas: CampanhaRow[] }>();
    for (const c of data?.campanhas ?? []) {
      const atual = porChave.get(c.chave) ?? {
        nome: c.nome,
        grupo: c.grupo_produto_id,
        periodicidade: c.periodicidade,
        faixas: [],
      };
      atual.faixas.push(c);
      porChave.set(c.chave, atual);
    }
    for (const c of porChave.values()) c.faixas.sort((a, b) => Number(a.meta) - Number(b.meta));
    return [...porChave.values()];
  }, [data]);

  const ultimaTentativa = data?.sincronizacoes[0] ?? null;
  const ultimoSucesso = data?.sincronizacoes.find((s) => s.sucesso) ?? null;
  const urlPlanilha = linkDaPlanilha(ultimoSucesso?.planilha_url ?? ultimaTentativa?.planilha_url);
  const verAnoPassado = mesesDoAno.some((m) => m.faturamento_ano_passado != null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titulo="Metas"
        hint="As metas da loja, a meta de cada vendedor e as campanhas — copiadas da planilha Metas RPG. Para mudar uma meta, altere a planilha: o sistema copia sozinho."
      />

      {/* De onde vêm os números, e quando chegaram */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 px-4 py-3 text-white dark:bg-slate-700">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FileSpreadsheet className="h-4 w-4" />
            Fonte: planilha {ultimoSucesso?.planilha_nome ?? 'Metas RPG'}
          </p>
          {urlPlanilha && (
            <a
              href={urlPlanilha}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Abrir a planilha
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        <CardContent className="space-y-3 p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !ultimaTentativa ? (
            <p className="text-sm text-muted-foreground">
              A planilha ainda não enviou nada para o sistema. Assim que o robô dela for
              instalado (Extensões &gt; Apps Script, na própria planilha), as metas aparecem aqui.
            </p>
          ) : (
            <>
              {ultimoSucesso && (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>
                    Última atualização da planilha: <strong>{dataHora(ultimoSucesso.recebido_em)}</strong>
                  </span>
                  {ultimoSucesso.enviado_por && (
                    <span className="text-muted-foreground">· por {ultimoSucesso.enviado_por}</span>
                  )}
                </p>
              )}
              {!ultimaTentativa.sucesso && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>A última tentativa de atualização falhou ({dataHora(ultimaTentativa.recebido_em)})</AlertTitle>
                  <AlertDescription>
                    {ultimaTentativa.erro ?? 'Motivo não informado.'} As metas abaixo continuam as da
                    última atualização que deu certo — nada foi gravado pela metade. Corrija na planilha
                    e o robô envia de novo sozinho.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Esta tela só mostra. Mudar uma meta aqui não teria efeito: a próxima atualização da
            planilha sobrescreveria. A planilha é o único lugar onde a meta muda.
          </p>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar as metas</AlertTitle>
          <AlertDescription>
            {/row-level security|permission/i.test(String((error as Error).message))
              ? 'Seu usuário não tem permissão para ver o cadastro de metas.'
              : String((error as Error).message)}
          </AlertDescription>
        </Alert>
      )}

      {anos.length > 1 && (
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="metas-ano" className="text-xs">
              Ano
            </Label>
            <Select value={String(ano)} onValueChange={(v) => setAnoEscolhido(Number(v))}>
              <SelectTrigger id="metas-ano" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Metas da loja — espelho da aba METAS DA LOJA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-muted-foreground" />
            Metas da loja — {ano}
          </CardTitle>
          <CardDescription>
            Faturamento da loja inteira que cada faixa exige no mês. "Vendedores" é quantas pessoas
            dividem a meta; "Apuração" diz se o mês foi apurado por quinzena ou em 4 períodos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mesesDoAno.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma meta de {ano} chegou da planilha ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    {FAIXAS.map((f) => (
                      <TableHead key={f} className="text-right">
                        {EMOJI_FAIXA[f]} {ROTULO_FAIXA[f]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Vendedores</TableHead>
                    <TableHead>Apuração</TableHead>
                    {verAnoPassado && <TableHead className="text-right">Ano passado</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mesesDoAno.map((m) => {
                    const faixas = faixasPorMes.get(m.mes) ?? {};
                    const corrente = m.ano === anoAtual && m.mes === mesAtual;
                    return (
                      <TableRow key={m.mes} className={corrente ? 'bg-primary/5' : undefined}>
                        <TableCell className="font-medium">
                          {MESES[m.mes - 1]}
                          {corrente && (
                            <Badge variant="outline" className="ml-2">
                              mês atual
                            </Badge>
                          )}
                        </TableCell>
                        {FAIXAS.map((f) => (
                          <TableCell key={f} className="text-right tabular-nums">
                            {faixas[f] != null ? moeda(faixas[f]) : '—'}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">{m.vendedores}</TableCell>
                        <TableCell>{ROTULO_APURACAO[m.apuracao]}</TableCell>
                        {verAnoPassado && (
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {m.faturamento_ano_passado != null ? moeda(m.faturamento_ano_passado) : '—'}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-semibold">
                    <TableCell>Total do ano</TableCell>
                    {FAIXAS.map((f) => (
                      <TableCell key={f} className="text-right tabular-nums">
                        {totais[f] != null ? moeda(totais[f]) : '—'}
                      </TableCell>
                    ))}
                    <TableCell />
                    <TableCell />
                    {verAnoPassado && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {moeda(mesesDoAno.reduce((s, m) => s + Number(m.faturamento_ano_passado ?? 0), 0))}
                      </TableCell>
                    )}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meta por vendedor — espelho da aba META POR VENDEDOR (que é toda conta) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Meta de cada vendedor — {ano}
          </CardTitle>
          <CardDescription>
            Não se cadastra: é a meta da loja dividida pelo número de vendedores do mês. A da
            quinzena é a do mês dividida por 2 — e só vale nos meses apurados por quinzena.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mesesDoAno.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem metas de {ano}.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="align-bottom">Mês</TableHead>
                    <TableHead colSpan={4} className="border-b text-center">No mês</TableHead>
                    <TableHead colSpan={4} className="border-b text-center">Na quinzena</TableHead>
                  </TableRow>
                  <TableRow>
                    {FAIXAS.map((f) => (
                      <TableHead key={`m-${f}`} className="text-right">{ROTULO_FAIXA[f]}</TableHead>
                    ))}
                    {FAIXAS.map((f) => (
                      <TableHead key={`q-${f}`} className="text-right">{ROTULO_FAIXA[f]}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mesesDoAno.map((m) => {
                    const faixas = faixasPorMes.get(m.mes) ?? {};
                    const quinzenal = m.apuracao === 'quinzenal';
                    return (
                      <TableRow key={m.mes}>
                        <TableCell className="font-medium">
                          {MESES[m.mes - 1]}
                          <span className="ml-1 text-xs text-muted-foreground">÷ {m.vendedores}</span>
                        </TableCell>
                        {FAIXAS.map((f) => {
                          const v = faixas[f] != null ? metaIndividual(faixas[f] as number, m.vendedores, 'mes') : null;
                          return (
                            <TableCell key={`m-${f}`} className="text-right tabular-nums">
                              {v != null ? moeda(v) : '—'}
                            </TableCell>
                          );
                        })}
                        {FAIXAS.map((f) => {
                          const v =
                            quinzenal && faixas[f] != null
                              ? metaIndividual(faixas[f] as number, m.vendedores, 'q1')
                              : null;
                          return (
                            <TableCell
                              key={`q-${f}`}
                              className={`text-right tabular-nums ${quinzenal ? '' : 'text-muted-foreground'}`}
                            >
                              {v != null ? moeda(v) : quinzenal ? '—' : 'não se aplica'}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {mesesDoAno.some((m) => m.apuracao === 'quatro_periodos') && (
            <p className="mt-3 text-xs text-muted-foreground">
              Nos meses de "4 períodos" a apuração era semanal (meta do período = meta do mês ÷ 4),
              por isso a coluna da quinzena aparece como "não se aplica".
            </p>
          )}
        </CardContent>
      </Card>

      {/* Campanhas — espelho da aba CAMPANHAS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
            Campanhas
          </CardTitle>
          <CardDescription>
            Metas extras por vendedor, que não mudam de mês para mês. O sistema soma as vendas pelo
            Grupo de Produto ligado a cada campanha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {campanhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma campanha chegou da planilha ainda.
            </p>
          ) : (
            campanhas.map((c) => (
              <div key={c.nome} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{c.nome}</h3>
                  <Badge variant="secondary">
                    {c.periodicidade === 'quinzenal' ? 'por quinzena' : 'por mês'} · por vendedor
                  </Badge>
                  {c.grupo ? (
                    <Badge variant="outline">Grupo de produto: {nomeDoGrupo.get(c.grupo) ?? '…'}</Badge>
                  ) : (
                    <Badge variant="destructive">sem grupo de produto ligado</Badge>
                  )}
                </div>
                {!c.grupo && (
                  <p className="text-sm text-muted-foreground">
                    Não existe um Grupo de Produto com o nome "{c.nome}" em Cadastros &gt; Listas do
                    Sistema. Enquanto não existir, o painel não consegue somar as vendas desta
                    campanha. Crie o grupo (ou renomeie o que já existe) e a próxima atualização da
                    planilha liga os dois sozinha.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Faixa</TableHead>
                        <TableHead className="text-right">
                          Meta {c.periodicidade === 'quinzenal' ? 'da quinzena' : 'do mês'}
                        </TableHead>
                        <TableHead className="text-right">Prêmio</TableHead>
                        <TableHead className="text-right">% sobre o vendido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.faixas.map((f) => (
                        <TableRow key={f.faixa}>
                          <TableCell className="font-medium">
                            {EMOJI_FAIXA[f.faixa]} {ROTULO_FAIXA[f.faixa]}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{moeda(Number(f.meta))}</TableCell>
                          <TableCell className="text-right tabular-nums">{moeda(Number(f.premio))}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {Number(f.meta) > 0
                              ? `${((Number(f.premio) / Number(f.meta)) * 100).toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}%`
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>O que a planilha tem e o sistema ainda não acompanha</AlertTitle>
            <AlertDescription>
              <strong>Película e Grip</strong> (a regra é por unidade — 6 do mesmo valor —, não por
              valor vendido), <strong>Monday</strong> (é disciplina de tarefa, não venda) e o prêmio de{' '}
              <strong>Gerente</strong> (suspenso desde 03/09/2026). Esses continuam só na planilha.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
