import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LockOpen, Lock, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { db } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { moeda, dataHora, paraNumero } from '@/lib/format';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Caixa — abertura, movimentação e fechamento.
 *
 * O ponto da tela é o FECHAMENTO CEGO: quem fecha digita o que contou na
 * gaveta ANTES de ver o que o sistema calculou. Se o valor esperado aparecer
 * primeiro, a conferência deixa de ser conferência — vira transcrição, e
 * qualquer diferença passa batida.
 *
 * O banco garante um único caixa aberto por loja (índice único parcial em
 * `caixa_sessoes`). Dois caixas abertos ao mesmo tempo tornariam impossível
 * saber em qual a venda deveria ter entrado.
 */

interface Sessao {
  id: string;
  status: 'aberto' | 'fechado';
  aberto_em: string;
  valor_abertura: number;
  fechado_em: string | null;
  valor_informado: number | null;
  valor_calculado: number | null;
  diferenca: number | null;
  observacoes: string | null;
}

interface Movimento {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  created_at: string;
}

/**
 * Linha de `vw_caixa_resumo_formas` — resumo INFORMATIVO de quanto entrou em
 * cada forma de pagamento desde a abertura do caixa. Não entra na conferência
 * cega da gaveta (isso continua vindo só de `caixa_movimentos`, via
 * `saldoCalculado` acima) — é só uma visão geral do dia.
 */
interface ResumoForma {
  sessao_id: string;
  forma_pagamento_id: string;
  forma_descricao: string;
  entra_no_caixa: boolean;
  total: number;
}

const TIPO_LABEL: Record<string, string> = {
  venda: 'Venda',
  recebimento: 'Recebimento',
  pagamento: 'Pagamento',
  sangria: 'Sangria',
  suprimento: 'Suprimento',
  ajuste: 'Ajuste',
  // Lançado sozinho pelo gatilho `registrar_devolucao_no_caixa` quando uma
  // troca/devolução devolve dinheiro ao cliente — não aparece nos botões de
  // "Lançar movimento" (esse é sempre manual, este é sempre automático).
  devolucao: 'Devolução',
};

export default function FinanceiroCaixa() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;

  const [valorAbertura, setValorAbertura] = useState('');
  const [valorContado, setValorContado] = useState('');
  const [obsFechamento, setObsFechamento] = useState('');
  const [fecharAberto, setFecharAberto] = useState(false);
  const [movAberto, setMovAberto] = useState(false);
  const [mov, setMov] = useState({ tipo: 'sangria', descricao: '', valor: '' });

  const { data: sessao, isLoading } = useQuery({
    queryKey: ['caixa-sessao'],
    queryFn: async (): Promise<Sessao | null> => {
      const { data, error } = await db
        .from('caixa_sessoes')
        .select('*')
        .eq('status', 'aberto')
        .maybeSingle();
      if (error) throw error;
      return (data as Sessao) ?? null;
    },
  });

  const { data: movimentos } = useQuery({
    queryKey: ['caixa-movimentos', sessao?.id],
    enabled: Boolean(sessao?.id),
    queryFn: async (): Promise<Movimento[]> => {
      const { data, error } = await db
        .from('caixa_movimentos')
        .select('id, tipo, descricao, valor, created_at')
        .eq('sessao_id', sessao!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Movimento[];
    },
  });

  const { data: resumoFormas } = useQuery({
    queryKey: ['caixa-resumo-formas', sessao?.id],
    enabled: Boolean(sessao?.id),
    queryFn: async (): Promise<ResumoForma[]> => {
      const { data, error } = await db
        .from('vw_caixa_resumo_formas')
        .select('*')
        .eq('sessao_id', sessao!.id);
      if (error) throw error;
      return (data ?? []) as ResumoForma[];
    },
  });

  const saldoCalculado = useMemo(() => {
    const abertura = Number(sessao?.valor_abertura ?? 0);
    const soma = (movimentos ?? []).reduce((acc, m) => acc + Number(m.valor), 0);
    return abertura + soma;
  }, [sessao, movimentos]);

  // Esconde formas sem nenhum movimento no dia — deixa a lista limpa, mostra
  // só o que de fato entrou. Maior total primeiro.
  const formasComMovimento = useMemo(
    () =>
      (resumoFormas ?? [])
        .filter((f) => Number(f.total) !== 0)
        .sort((a, b) => Number(b.total) - Number(a.total)),
    [resumoFormas],
  );

  const aoFalhar = (error: unknown) => {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    toast({
      title: 'Não foi possível concluir',
      description: /row-level security|policy/i.test(msg)
        ? 'Seu perfil de acesso não permite operar o caixa.'
        : /idx_caixa_um_aberto/i.test(msg)
          ? 'Já existe um caixa aberto. Feche o atual antes de abrir outro.'
          : msg,
      variant: 'destructive',
    });
  };

  const abrir = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Usuário sem loja vinculada.');
      // Campo vazio = 0 de propósito (troco zerado é um caso real). Mas se
      // a pessoa digitou algo e não deu pra entender, avisa em vez de abrir
      // o caixa com um valor errado em silêncio — era exatamente esse o
      // bug: "1.500,00" virava R$0,00 sem nenhum aviso.
      const valor = valorAbertura.trim() ? paraNumero(valorAbertura) : 0;
      // `paraNumero` interpreta "-150,00" normalmente (não é NaN), mas troco
      // negativo não existe na vida real — sem essa checagem, o caixa abria
      // com um valor_abertura negativo em silêncio.
      if (Number.isNaN(valor) || valor < 0) {
        throw new Error('Valor de abertura inválido — confira o que foi digitado.');
      }
      const { error } = await db.from('caixa_sessoes').insert({
        tenant_id: tenantId,
        aberto_por: user?.id,
        valor_abertura: valor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setValorAbertura('');
      queryClient.invalidateQueries({ queryKey: ['caixa-sessao'] });
      toast({ title: 'Caixa aberto' });
    },
    onError: aoFalhar,
  });

  const lancar = useMutation({
    mutationFn: async () => {
      if (!mov.descricao.trim()) throw new Error('Preencha a descrição.');
      const bruto = paraNumero(mov.valor);
      if (!bruto || Number.isNaN(bruto)) {
        throw new Error('Informe um valor válido, maior que zero.');
      }

      // Sangria e pagamento saem do caixa: gravados como negativo.
      const sai = mov.tipo === 'sangria' || mov.tipo === 'pagamento';

      const { error } = await db.from('caixa_movimentos').insert({
        sessao_id: sessao!.id,
        tipo: mov.tipo,
        descricao: mov.descricao.trim(),
        valor: sai ? -Math.abs(bruto) : Math.abs(bruto),
        usuario_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMov({ tipo: 'sangria', descricao: '', valor: '' });
      setMovAberto(false);
      queryClient.invalidateQueries({ queryKey: ['caixa-movimentos'] });
    },
    onError: aoFalhar,
  });

  const fechar = useMutation({
    mutationFn: async () => {
      const informado = paraNumero(valorContado);
      // Mesmo cuidado do `abrir`: "-50,00" digitado por engano não é NaN,
      // mas dinheiro contado na gaveta nunca é negativo.
      if (Number.isNaN(informado) || informado < 0) {
        throw new Error('Valor contado inválido — confira o que foi digitado.');
      }

      const { error } = await db
        .from('caixa_sessoes')
        .update({
          status: 'fechado',
          fechado_por: user?.id,
          fechado_em: new Date().toISOString(),
          valor_informado: informado,
          valor_calculado: saldoCalculado,
          diferenca: informado - saldoCalculado,
          observacoes: obsFechamento.trim() || null,
        })
        .eq('id', sessao!.id);
      if (error) throw error;

      return informado - saldoCalculado;
    },
    onSuccess: (diferenca) => {
      setFecharAberto(false);
      setValorContado('');
      setObsFechamento('');
      queryClient.invalidateQueries({ queryKey: ['caixa-sessao'] });
      toast({
        title: 'Caixa fechado',
        description:
          diferenca === 0
            ? 'Conferência exata.'
            : diferenca > 0
              ? `Sobrou ${moeda(diferenca)} na gaveta.`
              : `Faltou ${moeda(Math.abs(diferenca))} na gaveta.`,
        variant: diferenca === 0 ? undefined : 'destructive',
      });
    },
    onError: aoFalhar,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* ── Caixa fechado: oferecer abertura ─────────────────────────────────── */
  if (!sessao) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader
          titulo="Caixa"
          hint="Nenhum caixa aberto no momento. Abra o caixa no começo do expediente para registrar as movimentações do dia."
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LockOpen className="h-5 w-5" />
              Abrir caixa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="abertura">Valor inicial na gaveta</Label>
              <Input
                id="abertura"
                inputMode="decimal"
                value={valorAbertura}
                onChange={(e) => setValorAbertura(e.target.value)}
                placeholder="0,00"
              />
              <p className="text-xs text-muted-foreground">
                É o troco que já está na gaveta antes da primeira venda.
              </p>
            </div>
            <Button className="w-full" onClick={() => abrir.mutate()} disabled={abrir.isPending}>
              {abrir.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Abrir caixa
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── Caixa aberto ─────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Caixa"
        hint={`Aberto em ${dataHora(sessao.aberto_em)}.`}
        acoes={
          <>
            <Dialog open={movAberto} onOpenChange={setMovAberto}>
              <DialogTrigger asChild>
                <Button variant="outline">Lançar movimento</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Lançar movimento no caixa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['sangria', 'suprimento', 'pagamento', 'recebimento'] as const).map((t) => (
                        <Button
                          key={t}
                          type="button"
                          variant={mov.tipo === t ? 'default' : 'outline'}
                          onClick={() => setMov({ ...mov, tipo: t })}
                        >
                          {TIPO_LABEL[t]}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sangria e pagamento tiram dinheiro do caixa. Suprimento e
                      recebimento colocam.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mov-desc">Descrição *</Label>
                    <Input
                      id="mov-desc"
                      value={mov.descricao}
                      onChange={(e) => setMov({ ...mov, descricao: e.target.value })}
                      placeholder="Retirada para depósito bancário"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mov-valor">Valor *</Label>
                    <Input
                      id="mov-valor"
                      inputMode="decimal"
                      value={mov.valor}
                      onChange={(e) => setMov({ ...mov, valor: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setMovAberto(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => lancar.mutate()} disabled={lancar.isPending}>
                    {lancar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Lançar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={fecharAberto} onOpenChange={setFecharAberto}>
              <DialogTrigger asChild>
                <Button>
                  <Lock className="mr-2 h-4 w-4" />
                  Fechar caixa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Fechar caixa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contado">Quanto tem na gaveta agora? *</Label>
                    <Input
                      id="contado"
                      inputMode="decimal"
                      autoFocus
                      value={valorContado}
                      onChange={(e) => setValorContado(e.target.value)}
                      placeholder="0,00"
                    />
                    {/* Fechamento cego: o valor esperado NÃO aparece aqui. */}
                    <p className="text-xs text-muted-foreground">
                      Conte o dinheiro e digite o que encontrou. O sistema só
                      mostra o valor esperado depois — é assim que a conferência
                      tem valor.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="obs-fech">Observações</Label>
                    <Textarea
                      id="obs-fech"
                      rows={2}
                      value={obsFechamento}
                      onChange={(e) => setObsFechamento(e.target.value)}
                      placeholder="Algo fora do comum no expediente?"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFecharAberto(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => fechar.mutate()}
                    disabled={fechar.isPending || !valorContado}
                  >
                    {fechar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Conferir e fechar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {/*
        Sessão que o próprio sistema abriu na primeira venda do dia (decisão
        do Felipe em 21/08, depois do teste que mostrou R$ 22 mil vendidos
        sem nenhum lançamento no Caixa). Quem vai FECHAR precisa saber disso:
        a abertura ficou em R$ 0,00 porque ninguém contou a gaveta, então um
        fundo de troco que já estava lá vai aparecer como sobra na
        conferência — e não é erro de ninguém.
      */}
      {sessao.observacoes?.startsWith('Aberto automaticamente') && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-800">
            Este caixa foi aberto pelo sistema, não por uma pessoa.
          </p>
          <p className="mt-1 text-sm text-amber-700">
            Abriu sozinho na primeira venda do dia, para o dinheiro não ficar
            de fora da conferência. Como ninguém contou a gaveta na abertura,
            o valor inicial ficou em <strong>R$ 0,00</strong> — se havia troco
            guardado, ele vai aparecer como sobra no fechamento.
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador
          rotulo="Abertura"
          valor={moeda(Number(sessao.valor_abertura))}
          detalhe={
            sessao.observacoes?.startsWith('Aberto automaticamente')
              ? 'Automática — gaveta não contada'
              : undefined
          }
        />
        <Indicador
          rotulo="Movimentos"
          valor={String(movimentos?.length ?? 0)}
          detalhe="Lançamentos no expediente"
        />
        <Indicador
          rotulo="Saldo esperado"
          valor={moeda(saldoCalculado)}
          detalhe="Abertura + entradas − saídas"
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Movimentos do expediente
      </h2>

      {(movimentos?.length ?? 0) === 0 ? (
        <Vazio
          titulo="Nenhum movimento ainda"
          descricao="Sangrias, suprimentos e pagamentos feitos pelo caixa aparecem aqui."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]" />
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(movimentos ?? []).map((m) => {
                const entra = Number(m.valor) >= 0;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      {entra ? (
                        <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 text-red-600" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{m.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {TIPO_LABEL[m.tipo] ?? m.tipo}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {dataHora(m.created_at)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${entra ? 'text-emerald-600' : 'text-red-600'}`}
                    >
                      {moeda(Number(m.valor))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-1 mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Resumo do dia por forma de pagamento
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Visão informativa de tudo que entrou hoje, em todas as formas de
        pagamento (dinheiro, PIX, cartão etc.). Isso não faz parte da
        conferência da gaveta — só o dinheiro físico (destacado abaixo) entra
        no fechamento de caixa.
      </p>

      {formasComMovimento.length === 0 ? (
        <Vazio
          titulo="Nenhuma venda registrada ainda no expediente"
          descricao="Assim que houver vendas no PDV ou OS entregues e pagas, elas aparecem aqui por forma de pagamento."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Forma de pagamento</TableHead>
                <TableHead>Conferência da gaveta</TableHead>
                <TableHead className="text-right">Total do dia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formasComMovimento.map((f) => (
                <TableRow key={f.forma_pagamento_id}>
                  <TableCell className="font-medium">{f.forma_descricao}</TableCell>
                  <TableCell>
                    {f.entra_no_caixa ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                        Dinheiro físico
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Não entra</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {moeda(Number(f.total))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
