import { useMemo, useState } from 'react';
import { Plus, Check, Undo2, Ban, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData, hojeISO, paraNumero } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import {
  useTitulos,
  useCategoriasFinanceiras,
  situacaoDoTitulo,
  SITUACAO_META,
  type NaturezaTitulo,
  type SituacaoTitulo,
} from '@/hooks/useTitulos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/**
 * Tela de títulos financeiros.
 *
 * Serve Contas a Pagar E Contas a Receber — as duas são a mesma tabela com
 * `natureza` diferente. O que muda entre elas é rótulo e cor, não lógica.
 */

const FILTROS: Array<{ valor: SituacaoTitulo | 'todos'; label: string }> = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'vencido', label: 'Vencidos' },
  { valor: 'vence_hoje', label: 'Vencem hoje' },
  { valor: 'a_vencer', label: 'A vencer' },
  { valor: 'pago', label: 'Pagos' },
];

export function TitulosPage({ natureza }: { natureza: NaturezaTitulo }) {
  const ehPagar = natureza === 'pagar';
  const { toast } = useToast();
  const { data: titulos, isLoading, criar, baixar, reabrir, cancelar } = useTitulos(natureza);
  const { data: categorias } = useCategoriasFinanceiras(ehPagar ? 'despesa' : 'receita');

  const [filtro, setFiltro] = useState<SituacaoTitulo | 'todos'>('todos');
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({
    descricao: '',
    valor: '',
    vencimento: hojeISO(),
    categoria_id: '',
    observacoes: '',
    // De quem é a conta. A pagar vincula fornecedor, a receber vincula
    // cliente — as colunas existiam desde a criação da tabela e nunca eram
    // preenchidas, então não dava pra responder "quanto o cliente X me deve"
    // pelo Financeiro.
    vinculo_id: '',
  });

  // A lista do vínculo muda com a natureza da tela: fornecedores em Contas a
  // Pagar, clientes em Contas a Receber.
  const { data: vinculos } = useQuery({
    queryKey: ['titulo-vinculos', natureza],
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await supabase
        .from(ehPagar ? 'fornecedores' : 'clientes')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const comSituacao = useMemo(
    () => (titulos ?? []).map((t) => ({ ...t, situacao: situacaoDoTitulo(t) })),
    [titulos],
  );

  const visiveis = comSituacao.filter((t) => filtro === 'todos' || t.situacao === filtro);

  const totais = useMemo(() => {
    const emAberto = comSituacao.filter((t) => ['a_vencer', 'vence_hoje', 'vencido'].includes(t.situacao));
    const vencidos = comSituacao.filter((t) => t.situacao === 'vencido');
    const pagos = comSituacao.filter((t) => t.situacao === 'pago');
    const soma = (xs: typeof comSituacao) => xs.reduce((acc, t) => acc + Number(t.valor), 0);
    return {
      aberto: soma(emAberto),
      vencido: soma(vencidos),
      pago: soma(pagos),
      qtdVencidos: vencidos.length,
    };
  }, [comSituacao]);

  const salvar = () => {
    // Antes: `Number(form.valor.replace(',', '.'))` quebrava em silêncio pra
    // valor com separador de milhar ("1.500,00" virava NaN) e o botão
    // simplesmente não fazia nada, sem nenhum aviso — justamente pro tipo de
    // conta (aluguel, folha) que costuma passar de R$1.000. Agora avisa o
    // motivo real em vez de falhar calado.
    if (!form.descricao.trim()) {
      toast({ title: 'Descreva o título', variant: 'destructive' });
      return;
    }
    const valor = paraNumero(form.valor);
    if (!valor || Number.isNaN(valor) || valor <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor maior que zero.',
        variant: 'destructive',
      });
      return;
    }

    criar.mutate(
      {
        descricao: form.descricao.trim(),
        valor,
        vencimento: form.vencimento,
        categoria_id: form.categoria_id || null,
        observacoes: form.observacoes.trim() || null,
        fornecedor_id: ehPagar ? form.vinculo_id || null : null,
        cliente_id: ehPagar ? null : form.vinculo_id || null,
      },
      {
        onSuccess: () => {
          setAberto(false);
          setForm({
            descricao: '', valor: '', vencimento: hojeISO(),
            categoria_id: '', observacoes: '', vinculo_id: '',
          });
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        titulo={ehPagar ? 'Contas a Pagar' : 'Contas a Receber'}
        hint={
          ehPagar
            ? 'Tudo que a loja precisa pagar: fornecedor, aluguel, folha, imposto. Um título vencido aparece em vermelho.'
            : 'Tudo que a loja tem para receber: crediário, venda a prazo, serviço entregue e ainda não pago.'
        }
        acoes={
          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {ehPagar ? 'Nova conta a pagar' : 'Nova conta a receber'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{ehPagar ? 'Nova conta a pagar' : 'Nova conta a receber'}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição *</Label>
                  <Input
                    id="descricao"
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    placeholder={ehPagar ? 'Aluguel de agosto' : 'Crediário — João Silva'}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="valor">Valor *</Label>
                    <Input
                      id="valor"
                      inputMode="decimal"
                      value={form.valor}
                      onChange={(e) => setForm({ ...form, valor: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vencimento">Vencimento *</Label>
                    <Input
                      id="vencimento"
                      type="date"
                      value={form.vencimento}
                      onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{ehPagar ? 'Fornecedor' : 'Cliente'}</Label>
                  <Select
                    value={form.vinculo_id}
                    onValueChange={(v) => setForm({ ...form, vinculo_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          ehPagar ? 'De quem é esta conta?' : 'Quem deve este valor?'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(vinculos ?? []).map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Opcional, mas é o que permite consultar depois quanto{' '}
                    {ehPagar ? 'você deve a um fornecedor' : 'um cliente te deve'}.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={form.categoria_id}
                    onValueChange={(v) => setForm({ ...form, categoria_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {(categorias ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    É o que separa o Fluxo de Caixa por tipo de gasto. Sem categoria,
                    o relatório fica cego.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="obs">Observações</Label>
                  <Textarea
                    id="obs"
                    rows={2}
                    value={form.observacoes}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAberto(false)}>
                  Cancelar
                </Button>
                <Button onClick={salvar} disabled={criar.isPending}>
                  {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador
          rotulo="Em aberto"
          valor={moeda(totais.aberto)}
          detalhe={ehPagar ? 'Ainda a pagar' : 'Ainda a receber'}
        />
        <Indicador
          rotulo="Vencido"
          valor={moeda(totais.vencido)}
          detalhe={`${totais.qtdVencidos} ${totais.qtdVencidos === 1 ? 'título' : 'títulos'}`}
          tom={totais.vencido > 0 ? 'negativo' : 'neutro'}
        />
        <Indicador
          rotulo={ehPagar ? 'Já pago' : 'Já recebido'}
          valor={moeda(totais.pago)}
          tom="positivo"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.valor}
            size="sm"
            variant={filtro === f.valor ? 'default' : 'outline'}
            onClick={() => setFiltro(f.valor)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visiveis.length === 0 ? (
        <Vazio
          titulo="Nenhum título por aqui"
          descricao={
            filtro === 'todos'
              ? `Use o botão acima para lançar ${ehPagar ? 'a primeira conta a pagar' : 'a primeira conta a receber'}.`
              : 'Nenhum título nesse filtro. Experimente "Todos".'
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((t) => {
                const meta = SITUACAO_META[t.situacao];
                return (
                  <TableRow key={t.id} className={cn(t.situacao === 'cancelado' && 'opacity-50')}>
                    <TableCell className="font-medium">
                      {t.descricao}
                      {/* De quem é a conta, logo abaixo da descrição: sem
                          isso o vínculo ficaria só no banco, e a tela não
                          responderia a pergunta que motivou o campo. */}
                      {(t.fornecedores?.nome ?? t.clientes?.nome) && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t.fornecedores?.nome ?? t.clientes?.nome}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.categorias_financeiras?.nome ?? '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">{fmtData(t.vencimento)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {moeda(Number(t.valor))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={meta.classe}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {t.status === 'aberto' && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title={ehPagar ? 'Marcar como pago' : 'Marcar como recebido'}
                              onClick={() => baixar.mutate(t)}
                            >
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Cancelar título"
                              onClick={() => cancelar.mutate(t.id)}
                            >
                              <Ban className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </>
                        )}
                        {t.status === 'pago' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Reabrir"
                            onClick={() => reabrir.mutate(t.id)}
                          >
                            <Undo2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
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
