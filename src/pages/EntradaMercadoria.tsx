import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Loader2, PackagePlus, AlertTriangle, Search, ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAtalhosDeDialogo } from '@/hooks/useAtalhosDeDialogo';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as formatarData, hojeISO, paraNumero } from '@/lib/format';

/**
 * Entrada de Mercadoria do Fornecedor.
 *
 * Desenhada em cima de como a loja recebe de verdade (respostas do Felipe em
 * 23/08), e cada escolha aqui vem de uma delas:
 *
 *   • A NOTA FISCAL É OPCIONAL. "Somente produto" chega na caixa — a nota vem
 *     dias depois. Exigir o número travaria quem está com a mercadoria na
 *     frente, esperando um papel que ainda não existe.
 *   • DIVERGÊNCIA NÃO BLOQUEIA. Quando vem a menos, trocado ou quebrado, quem
 *     recebe marca e o registro sinaliza para o setor de compras apurar. A
 *     mercadoria já está fisicamente na loja: segurar a entrada só faria o
 *     sistema mentir sobre o que tem na prateleira.
 *   • O CUSTO VIRA MÉDIA, não o último preço pago. A tela mostra o custo atual
 *     e o que ele vai virar, antes de salvar — porque isso muda a margem de
 *     tudo que já estava na prateleira, não só do que chegou.
 */

interface ProdutoBusca {
  id: string;
  nome: string;
  codigo_barra: string | null;
  estoque_atual: number | null;
  custo: number | null;
}

interface ItemRascunho {
  chave: string;
  produto: ProdutoBusca;
  quantidade: string;
  custoUnitario: string;
  divergencia: string;
}

/** Custo médio ponderado — a mesma conta que o banco faz ao salvar. */
function custoMedio(
  estoqueAtual: number,
  custoAtual: number,
  quantidade: number,
  custoNovo: number,
): number {
  if (estoqueAtual <= 0) return custoNovo;
  return (
    Math.round(
      ((estoqueAtual * custoAtual + quantidade * custoNovo) /
        (estoqueAtual + quantidade)) *
        100,
    ) / 100
  );
}

export default function EntradaMercadoria() {
  const { can } = useAuth();
  const podeLancar = can(PERMISSIONS.INVENTORY_ADJUST);
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);
  const [abrindo, setAbrindo] = useState(false);

  const entradas = useQuery({
    queryKey: ['entradas-mercadoria'],
    enabled: podeLancar && veCusto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entradas_mercadoria')
        // Em uma linha só de propósito: o TypeScript descobre o formato do
        // resultado lendo este texto literalmente. Partido com `+`, ele desiste
        // e o retorno vira "erro genérico" — que compila mal e esconde engano
        // de nome de coluna.
        .select('id, numero, numero_nota, data_entrada, total, tem_divergencia, fornecedores(nome), entradas_mercadoria_itens(id)')
        .order('data_entrada', { ascending: false })
        .order('numero', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // A regra da tela e a regra do banco são a MESMA: dar entrada exige lançar
  // movimentação E ver custo, porque o preço de compra é digitado aqui. Dizer
  // isso em voz alta evita o modo de falha que já mordeu quatro telas deste
  // sistema — a tela abre, a lista vem vazia, e parece "não tem nada".
  if (!podeLancar || !veCusto) {
    const falta = !podeLancar
      ? 'lançar movimentação de estoque'
      : 'ver custo e margem dos produtos';
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titulo="Entrada de Mercadoria"
          hint="Recebimento de produto do fornecedor."
        />
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex gap-3 py-5">
            <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-medium">Esta tela não está liberada para o seu perfil.</p>
              <p className="mt-1 text-muted-foreground">
                Falta a permissão de <strong>{falta}</strong>. Dar entrada mexe no
                preço de compra dos produtos, então o sistema exige as duas
                permissões juntas — não adianta liberar uma só.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Entrada de Mercadoria"
        hint="Chegou produto do fornecedor? Dá entrada aqui: soma o estoque, atualiza o custo e lança a compra no financeiro."
        acoes={
          <Button onClick={() => setAbrindo(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova entrada
          </Button>
        }
      />

      {entradas.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (entradas.data ?? []).length === 0 ? (
        <Vazio titulo="Nenhuma entrada registrada ainda" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Nota fiscal</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(entradas.data ?? []).map((e) => {
                  const fornecedor = e.fornecedores as { nome: string } | null;
                  const itens = (e.entradas_mercadoria_itens ?? []) as { id: string }[];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-sm">
                        {e.numero}
                        {e.tem_divergencia && (
                          <Badge
                            variant="secondary"
                            className="ml-2 bg-amber-500/10 text-amber-700"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            divergência
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatarData(e.data_entrada)}</TableCell>
                      <TableCell>{fornecedor?.nome ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.numero_nota ?? 'ainda não chegou'}
                      </TableCell>
                      <TableCell className="text-right">{itens.length}</TableCell>
                      <TableCell className="text-right font-medium">
                        {moeda(Number(e.total))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {abrindo && <DialogNovaEntrada onFechar={() => setAbrindo(false)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DialogNovaEntrada({ onFechar }: { onFechar: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fornecedorId, setFornecedorId] = useState('');
  const [dataEntrada, setDataEntrada] = useState(hojeISO());
  const [numeroNota, setNumeroNota] = useState('');
  const [observacao, setObservacao] = useState('');
  const [itens, setItens] = useState<ItemRascunho[]>([]);
  const [busca, setBusca] = useState('');

  const fornecedores = useQuery({
    queryKey: ['fornecedores-ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Leitura de produto passa SEMPRE por `vw_produtos` — regra de custo
  // protegido. A view devolve custo de verdade para quem tem permissão, e NULL
  // para quem não tem; aqui só chega quem tem, mas a regra é uma só.
  const produtos = useQuery({
    queryKey: ['produtos-para-entrada', busca],
    enabled: busca.trim().length >= 2,
    queryFn: async (): Promise<ProdutoBusca[]> => {
      const termo = busca.trim();
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('id, nome, codigo_barra, estoque_atual, custo')
        .or(`nome.ilike.%${termo}%,codigo_barra.ilike.%${termo}%`)
        .eq('ativo', true)
        .order('nome')
        .limit(8);
      if (error) throw error;
      return (data ?? []) as ProdutoBusca[];
    },
  });

  const total = useMemo(
    () =>
      itens.reduce(
        (soma, i) => soma + paraNumero(i.quantidade) * paraNumero(i.custoUnitario),
        0,
      ),
    [itens],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('registrar_entrada_mercadoria', {
        _fornecedor_id: fornecedorId,
        _itens: itens.map((i) => ({
          produto_id: i.produto.id,
          quantidade: paraNumero(i.quantidade),
          custo_unitario: paraNumero(i.custoUnitario),
          divergencia: i.divergencia.trim() || null,
        })),
        _data_entrada: dataEntrada,
        _numero_nota: numeroNota.trim() || null,
        _observacao: observacao.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entradas-mercadoria'] });
      // O estoque e o custo mudaram: as telas que mostram produto precisam
      // reler, senão o saldo na tela fica mentindo até alguém apertar F5.
      queryClient.invalidateQueries({ queryKey: ['produtos'] });
      queryClient.invalidateQueries({ queryKey: ['estoque'] });
      const comDivergencia = itens.filter((i) => i.divergencia.trim()).length;
      toast({
        title: 'Entrada registrada',
        description: comDivergencia
          ? `Estoque somado e compra lançada no financeiro. ${comDivergencia} item(ns) com divergência para o setor de compras apurar.`
          : 'Estoque somado, custo atualizado e compra lançada no financeiro como paga.',
        variant: 'success',
      });
      onFechar();
    },
    onError: (error: unknown) => {
      toast({
        title: 'Não foi possível registrar a entrada',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  function adicionar(p: ProdutoBusca) {
    setItens((atual) => [
      ...atual,
      {
        chave: `${p.id}-${atual.length}`,
        produto: p,
        quantidade: '1',
        // Sugere o custo que o produto já tem; quase sempre é o mesmo preço, e
        // quando o fornecedor muda, quem recebe corrige em cima.
        custoUnitario: String(p.custo ?? 0),
        divergencia: '',
      },
    ]);
    setBusca('');
  }

  function alterar(chave: string, campo: keyof ItemRascunho, valor: string) {
    setItens((atual) =>
      atual.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)),
    );
  }

  const podeSalvar =
    Boolean(fornecedorId) &&
    itens.length > 0 &&
    itens.every(
      (i) => paraNumero(i.quantidade) > 0 && paraNumero(i.custoUnitario) >= 0,
    ) &&
    !salvar.isPending;

  // A busca de produto abre uma lista de sugestoes; o hook ja recusa o Enter
  // enquanto ela estiver aberta, entao escolher um produto nao salva a entrada.
  const refAtalhos = useAtalhosDeDialogo({
    podeConfirmar: podeSalvar,
    onConfirmar: () => salvar.mutate(),
  });

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        ref={refAtalhos}
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>Nova entrada de mercadoria</DialogTitle>
          <DialogDescription>
            Registre o que chegou de verdade na caixa — não o que era esperado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Fornecedor</Label>
              <Select value={fornecedorId} onValueChange={setFornecedorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Quem mandou a mercadoria" />
                </SelectTrigger>
                <SelectContent>
                  {(fornecedores.data ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-data">Data da entrada</Label>
              <Input
                id="e-data"
                type="date"
                value={dataEntrada}
                onChange={(e) => setDataEntrada(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-nota">Nota fiscal (opcional)</Label>
            <Input
              id="e-nota"
              value={numeroNota}
              onChange={(e) => setNumeroNota(e.target.value)}
              placeholder="Deixe em branco se ainda não chegou"
            />
            <p className="text-xs text-muted-foreground">
              A mercadoria chega antes da nota. Dê entrada agora e preencha o número
              quando o papel chegar — o lançamento no financeiro já avisa que a nota
              está pendente.
            </p>
          </div>

          {/* ── Produtos ────────────────────────────────────────────────── */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="e-busca">O que chegou</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="e-busca"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Procure o produto por nome ou código de barras..."
                className="pl-9"
              />
            </div>

            {busca.trim().length >= 2 && (
              <div className="rounded-md border">
                {produtos.isLoading ? (
                  <p className="p-3 text-sm text-muted-foreground">Procurando...</p>
                ) : (produtos.data ?? []).length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    Nenhum produto ativo com esse nome ou código.
                  </p>
                ) : (
                  (produtos.data ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => adicionar(p)}
                      className="flex w-full items-center justify-between gap-3 border-b p-2.5 text-left text-sm last:border-b-0 hover:bg-muted"
                    >
                      <span className="min-w-0 truncate">
                        <PackagePlus className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
                        {p.nome}
                      </span>
                      <span className="flex-shrink-0 text-xs text-muted-foreground">
                        tem {p.estoque_atual ?? 0} · custo {moeda(p.custo ?? 0)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {itens.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                Nenhum produto adicionado ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {itens.map((i) => {
                  const qtd = paraNumero(i.quantidade);
                  const custoNovo = paraNumero(i.custoUnitario);
                  const estoque = i.produto.estoque_atual ?? 0;
                  const custoAtual = i.produto.custo ?? 0;
                  const medio = custoMedio(estoque, custoAtual, qtd, custoNovo);
                  const mudouCusto = qtd > 0 && medio !== custoAtual;

                  return (
                    <div key={i.chave} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                          {i.produto.nome}
                        </p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 flex-shrink-0"
                          onClick={() =>
                            setItens((a) => a.filter((x) => x.chave !== i.chave))
                          }
                          aria-label="Tirar da lista"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Quantidade</Label>
                          <Input
                            type="number"
                            min="1"
                            value={i.quantidade}
                            onChange={(e) => alterar(i.chave, 'quantidade', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Preço de compra (unidade)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={i.custoUnitario}
                            onChange={(e) =>
                              alterar(i.chave, 'custoUnitario', e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Total da linha</Label>
                          <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                            {moeda(qtd * custoNovo)}
                          </div>
                        </div>
                      </div>

                      {mudouCusto && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Custo deste produto passa de <strong>{moeda(custoAtual)}</strong>{' '}
                          para <strong>{moeda(medio)}</strong> — média entre as {estoque}{' '}
                          unidade(s) que já estavam na prateleira e as {qtd} que estão
                          chegando. Isso muda a margem de todas elas.
                        </p>
                      )}

                      <div className="mt-2 space-y-1">
                        <Label className="text-xs">
                          Veio diferente do pedido? (opcional)
                        </Label>
                        <Input
                          value={i.divergencia}
                          onChange={(e) => alterar(i.chave, 'divergencia', e.target.value)}
                          placeholder="Ex.: vieram 2 a menos, 1 veio com a caixa amassada"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-obs">Observação (opcional)</Label>
            <Textarea
              id="e-obs"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Algo que valha registrar sobre este recebimento."
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
            <span className="text-sm text-muted-foreground">
              Total da compra — vai para o financeiro como <strong>paga</strong> em{' '}
              {formatarData(dataEntrada)}
            </span>
            <span className="text-lg font-semibold">{moeda(total)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onFechar} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button disabled={!podeSalvar} onClick={() => salvar.mutate()}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Dar entrada
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
