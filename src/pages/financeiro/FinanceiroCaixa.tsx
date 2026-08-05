import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LockOpen, Lock, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { db } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { moeda, dataHora } from '@/lib/format';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

const TIPO_LABEL: Record<string, string> = {
  venda: 'Venda',
  recebimento: 'Recebimento',
  pagamento: 'Pagamento',
  sangria: 'Sangria',
  suprimento: 'Suprimento',
  ajuste: 'Ajuste',
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

  const saldoCalculado = useMemo(() => {
    const abertura = Number(sessao?.valor_abertura ?? 0);
    const soma = (movimentos ?? []).reduce((acc, m) => acc + Number(m.valor), 0);
    return abertura + soma;
  }, [sessao, movimentos]);

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
      const { error } = await db.from('caixa_sessoes').insert({
        tenant_id: tenantId,
        aberto_por: user?.id,
        valor_abertura: Number(valorAbertura.replace(',', '.')) || 0,
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
      const bruto = Number(mov.valor.replace(',', '.'));
      if (!bruto || !mov.descricao.trim()) throw new Error('Preencha descrição e valor.');

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
      const informado = Number(valorContado.replace(',', '.'));
      if (Number.isNaN(informado)) throw new Error('Informe o valor contado.');

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

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Abertura" valor={moeda(Number(sessao.valor_abertura))} />
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
    </div>
  );
}
