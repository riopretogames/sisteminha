import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LockOpen, Lock, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
import { mensagemCrua } from '@/lib/mensagemDoErro';

/**
 * Caixa — abertura, movimentação e fechamento.
 *
 * O ponto da tela é o FECHAMENTO CEGO: quem fecha digita o que contou na
 * gaveta ANTES de ver o que o sistema calculou. Se o valor esperado aparecer
 * primeiro, a conferência deixa de ser conferência — vira transcrição, e
 * qualquer diferença passa batida.
 *
 * Por isso, desde a revisão de 24/09/2026:
 * - o "Saldo esperado" NÃO aparece enquanto o caixa está aberto (antes ficava
 *   num cartão da tela o tempo todo, e bastava ler antes de abrir a janela);
 * - quem CALCULA o esperado é o banco, na hora de fechar, com o que está
 *   gravado naquele instante (migration 20260924165000). Antes a conta era
 *   feita aqui, com a lista carregada quando a tela abriu — venda feita em
 *   outro computador depois disso ficava fora do esperado, e o fechamento
 *   saía com sobra falsa para sempre;
 * - o resultado (esperado, contado, diferença) aparece DEPOIS de fechar, em
 *   "Fechamentos anteriores", que é onde o dono confere a semana.
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

/** Uma sessão já fechada, como o banco gravou (esperado calculado lá). */
interface Fechamento {
  id: string;
  aberto_em: string;
  fechado_em: string | null;
  aberto_por: string;
  fechado_por: string | null;
  valor_abertura: number;
  valor_informado: number | null;
  valor_calculado: number | null;
  diferenca: number | null;
  observacoes: string | null;
}

/**
 * O fechamento não mudou nenhuma linha: o caixa já tinha sido fechado por
 * outra pessoa (ou em outra aba) entre abrir a tela e clicar. Antes a tela
 * dizia "Caixa fechado — Sobrou R$ X" mesmo sem ter gravado nada.
 */
class CaixaJaFechado extends Error {
  constructor() {
    super('Este caixa já tinha sido fechado.');
  }
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
 * cada forma de pagamento desde o fechamento do caixa anterior. Não entra na
 * conferência cega da gaveta (essa é feita pelo banco, só com os movimentos
 * do caixa) — é só uma visão geral do expediente.
 */
interface ResumoForma {
  sessao_id: string;
  forma_pagamento_id: string;
  forma_descricao: string;
  entra_no_caixa: boolean;
  total: number;
}

/**
 * Os tipos de movimento que ESTA TELA deixa lançar à mão.
 *
 * O banco aceita sete (`venda`, `recebimento`, `pagamento`, `sangria`,
 * `suprimento`, `ajuste`, `devolucao`), mas três deles — venda, devolução e
 * ajuste — são gravados por gatilho, nunca por pessoa. Digitar um desses aqui
 * criaria um lançamento que parece automático e não é.
 *
 * Tipado assim de propósito: enquanto o estado era `string` solto, o
 * TypeScript não tinha como reclamar de um valor inválido — e não reclamava
 * mesmo, porque esta tela usava a ponte sem checagem de tipo (`untyped.ts`,
 * removida em 21/08). Foi o único erro real que a remoção da ponte revelou.
 */
const TIPOS_MANUAIS = ['sangria', 'suprimento', 'pagamento', 'recebimento'] as const;
type TipoMovimentoManual = (typeof TIPOS_MANUAIS)[number];

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

/** "Sobrou R$ 20,00 na gaveta." / "Faltou..." / "Conferência exata." */
function textoDaDiferenca(diferenca: number): string {
  if (diferenca === 0) return 'Conferência exata.';
  return diferenca > 0
    ? `Sobrou ${moeda(diferenca)} na gaveta.`
    : `Faltou ${moeda(Math.abs(diferenca))} na gaveta.`;
}

/**
 * Os últimos fechamentos: esperado (o que o banco calculou), contado (o que a
 * pessoa digitou) e a diferença. Aparece com o caixa aberto e fechado — é o
 * único lugar em que o dono vê, dias depois, que na terça faltou dinheiro.
 */
function FechamentosAnteriores({
  fechamentos,
  nomeDe,
}: {
  fechamentos: Fechamento[] | undefined;
  nomeDe: (id: string | null) => string;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Fechamentos anteriores
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        O esperado é calculado pelo sistema na hora do fechamento, com tudo que
        estava lançado no caixa naquele instante. Contado é o que a pessoa
        digitou depois de contar a gaveta.
      </p>
      {(fechamentos?.length ?? 0) === 0 ? (
        <Vazio titulo="Nenhum caixa fechado ainda" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fechado em</TableHead>
                <TableHead>Quem abriu / fechou</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead>Observações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(fechamentos ?? []).map((f) => {
                const diferenca = Number(f.diferenca ?? 0);
                return (
                  <TableRow key={f.id}>
                    <TableCell className="tabular-nums">{dataHora(f.fechado_em)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {nomeDe(f.aberto_por)} / {nomeDe(f.fechado_por)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {moeda(Number(f.valor_calculado ?? 0))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {moeda(Number(f.valor_informado ?? 0))}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        diferenca === 0
                          ? 'text-emerald-600'
                          : diferenca > 0
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
                      {diferenca === 0
                        ? 'Exato'
                        : diferenca > 0
                          ? `Sobrou ${moeda(diferenca)}`
                          : `Faltou ${moeda(Math.abs(diferenca))}`}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">
                      {f.observacoes?.startsWith('Aberto automaticamente')
                        ? 'Aberto pelo sistema'
                        : (f.observacoes ?? '—')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

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
  const [mov, setMov] = useState<{ tipo: TipoMovimentoManual; descricao: string; valor: string }>(
    { tipo: 'sangria', descricao: '', valor: '' }
  );

  const { data: sessao, isLoading } = useQuery({
    queryKey: ['caixa-sessao'],
    queryFn: async (): Promise<Sessao | null> => {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
      const { data, error } = await supabase
        .from('vw_caixa_resumo_formas')
        .select('*')
        .eq('sessao_id', sessao!.id);
      if (error) throw error;
      return (data ?? []) as ResumoForma[];
    },
  });

  // Os últimos fechamentos, com o que o BANCO calculou. É aqui que o
  // resultado da conferência fica visível depois — antes ele só aparecia num
  // aviso que some em segundos, e ninguém conseguia ver que na terça faltou
  // R$ 40.
  const { data: fechamentos } = useQuery({
    queryKey: ['caixa-fechamentos'],
    queryFn: async (): Promise<Fechamento[]> => {
      const { data, error } = await supabase
        .from('caixa_sessoes')
        .select('id, aberto_em, fechado_em, aberto_por, fechado_por, valor_abertura, valor_informado, valor_calculado, diferenca, observacoes')
        .eq('status', 'fechado')
        .order('fechado_em', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Fechamento[];
    },
  });

  // Nome de quem abriu e de quem fechou. Todo mundo que já passou pela loja,
  // inclusive quem saiu: o fechamento antigo continua sendo dele.
  const { data: nomes } = useQuery({
    queryKey: ['caixa-nomes'],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from('profiles').select('id, nome');
      if (error) throw error;
      return new Map(((data ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]));
    },
  });
  const nomeDe = (id: string | null) => (id ? (nomes?.get(id) ?? '—') : '—');

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
    const msg = mensagemCrua(error) || 'Erro desconhecido';
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
      const { error } = await supabase.from('caixa_sessoes').insert({
        tenant_id: tenantId,
        aberto_por: user?.id,
        valor_abertura: valor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setValorAbertura('');
      queryClient.invalidateQueries({ queryKey: ['caixa-sessao'] });
      toast({ title: 'Caixa aberto', variant: 'success' });
    },
    onError: (error: unknown) => {
      const msg = mensagemCrua(error);
      // Caixa já aberto não é erro de quem clicou: desde 21/08 a primeira
      // venda do dia abre o caixa sozinha. Quem estava com esta tela aberta
      // antes disso continua vendo o formulário de abertura, que a partir
      // dali nunca mais funciona — e cada clique repete o mesmo aviso.
      //
      // Recarregar a sessão tira a pessoa desse beco: a tela troca sozinha
      // para o caixa que existe, em vez de insistir num formulário morto.
      if (/idx_caixa_um_aberto|duplicate key/i.test(msg)) {
        queryClient.invalidateQueries({ queryKey: ['caixa-sessao'] });
        toast({
          title: 'O caixa já estava aberto',
          description:
            'Alguém abriu, ou a primeira venda do dia abriu sozinha — o sistema faz isso para a venda nunca ficar de fora do caixa. Atualizei a tela para mostrar o caixa aberto.',
        });
        return;
      }
      aoFalhar(error);
    },
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

      const { error } = await supabase.from('caixa_movimentos').insert({
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
    onError: (error: unknown) => {
      // Alguém fechou este caixa enquanto a janela estava aberta: o banco
      // recusa lançar dentro de um caixa já conferido. Recarrega a tela para
      // a pessoa ver o caixa como ele está agora.
      const msg = mensagemCrua(error);
      if (/acabou de ser fechado/i.test(msg)) {
        setMovAberto(false);
        queryClient.invalidateQueries({ queryKey: ['caixa-sessao'] });
        queryClient.invalidateQueries({ queryKey: ['caixa-fechamentos'] });
      }
      aoFalhar(error);
    },
  });

  const fechar = useMutation({
    mutationFn: async (): Promise<Fechamento> => {
      const informado = paraNumero(valorContado);
      // Mesmo cuidado do `abrir`: "-50,00" digitado por engano não é NaN,
      // mas dinheiro contado na gaveta nunca é negativo.
      if (Number.isNaN(informado) || informado < 0) {
        throw new Error('Valor contado inválido — confira o que foi digitado.');
      }

      // Manda SÓ o que a pessoa contou. O esperado, a diferença, quem fechou
      // e quando são preenchidos pelo banco na hora de gravar — o que viesse
      // daqui seria ignorado de qualquer jeito.
      //
      // `.eq('status', 'aberto')` + `.select()`: se outra pessoa fechou este
      // caixa um segundo antes, nenhuma linha muda — e a tela precisa saber
      // disso em vez de anunciar um resultado que não foi gravado.
      const { data, error } = await supabase
        .from('caixa_sessoes')
        .update({
          status: 'fechado',
          valor_informado: informado,
          observacoes: obsFechamento.trim() || null,
        })
        .eq('id', sessao!.id)
        .eq('status', 'aberto')
        .select('id, aberto_em, fechado_em, aberto_por, fechado_por, valor_abertura, valor_informado, valor_calculado, diferenca, observacoes');
      if (error) throw error;

      const gravado = (data ?? [])[0] as Fechamento | undefined;
      if (!gravado) throw new CaixaJaFechado();
      return gravado;
    },
    onSuccess: (gravado) => {
      setFecharAberto(false);
      setValorContado('');
      setObsFechamento('');
      queryClient.invalidateQueries({ queryKey: ['caixa-sessao'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-fechamentos'] });
      const diferenca = Number(gravado.diferenca ?? 0);
      toast({
        title: 'Caixa fechado',
        description: `Esperado ${moeda(Number(gravado.valor_calculado ?? 0))}, contado ${moeda(Number(gravado.valor_informado ?? 0))}. ${textoDaDiferenca(diferenca)}`,
        variant: diferenca === 0 ? 'success' : 'destructive',
      });
    },
    onError: (error: unknown) => {
      if (error instanceof CaixaJaFechado) {
        setFecharAberto(false);
        queryClient.invalidateQueries({ queryKey: ['caixa-sessao'] });
        queryClient.invalidateQueries({ queryKey: ['caixa-fechamentos'] });
        toast({
          title: 'Este caixa já tinha sido fechado',
          description:
            'Outra pessoa (ou outra aba) fechou este caixa antes. Nada foi gravado agora — atualizei a tela. O resultado está em "Fechamentos anteriores".',
          variant: 'destructive',
        });
        return;
      }
      aoFalhar(error);
    },
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
      <div className="mx-auto max-w-5xl">
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
        <FechamentosAnteriores fechamentos={fechamentos} nomeDe={nomeDe} />
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
                      {TIPOS_MANUAIS.map((t) => (
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
                  <Button variant="sucesso" onClick={() => lancar.mutate()} disabled={lancar.isPending}>
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
        {/* Fechamento às cegas: o esperado NÃO aparece com o caixa aberto.
            Até 24/09 ele ficava aqui o tempo todo, e bastava copiar este
            número na janela de fechamento para a conferência "bater" sem
            ninguém contar a gaveta. Ele aparece depois, em "Fechamentos
            anteriores", já calculado pelo banco. */}
        <Indicador
          rotulo="Saldo esperado"
          valor="No fechamento"
          detalhe="Conte a gaveta primeiro — o sistema mostra depois"
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
        Resumo por forma de pagamento
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Visão informativa de tudo que entrou desde o fechamento do caixa
        anterior, em todas as formas de pagamento (PIX, cartão etc.), das vendas
        e das OS entregues. Isso não faz parte da conferência da gaveta. O
        total em dinheiro físico só aparece no fechamento — é ele que a
        contagem da gaveta confere.
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
                <TableHead className="text-right">Total</TableHead>
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
                    {/* O total em dinheiro é, na prática, o esperado da
                        gaveta — mostrá-lo aqui desfaria o fechamento às
                        cegas. */}
                    {f.entra_no_caixa ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        Conferido no fechamento
                      </span>
                    ) : (
                      moeda(Number(f.total))
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <FechamentosAnteriores fechamentos={fechamentos} nomeDe={nomeDe} />
    </div>
  );
}
