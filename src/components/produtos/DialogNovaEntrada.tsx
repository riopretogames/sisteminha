import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Loader2, PackagePlus, Search, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAtalhosDeDialogo } from '@/hooks/useAtalhosDeDialogo';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as formatarData, hojeISO } from '@/lib/format';
import { numeroDoCampo, quantidadeValida, precoValido } from '@/lib/estoque';
import { mensagemDoErro } from '@/lib/mensagemDoErro';

/**
 * O formulário de "Nova entrada de mercadoria".
 *
 * Mora aqui, e não dentro da tela de Entrada de Mercadoria, porque tem duas
 * portas desde 24/09: o botão "Nova entrada" e o botão "Repor" do Estoque
 * Crítico. O Repor fazia um ajuste manual por fora — somava o número, mas não
 * pedia fornecedor nem preço, não recalculava o custo e não lançava a compra
 * no financeiro. Agora ele abre ESTE formulário já com o produto e a
 * quantidade que falta, e a reposição passa pela mesma porta que lança tudo.
 *
 * As regras de como a loja recebe (respostas do Felipe em 23/08) continuam na
 * tela `EntradaMercadoria.tsx`.
 */

export interface ProdutoDaEntrada {
  id: string;
  nome: string;
  codigo_barra: string | null;
  estoque_atual: number | null;
  custo: number | null;
}

/** Produto que já chega na lista ao abrir (ex.: o Repor do Estoque Crítico). */
export interface ItemInicialDaEntrada {
  produto: ProdutoDaEntrada;
  quantidade: number;
}

interface ItemRascunho {
  chave: string;
  produto: ProdutoDaEntrada;
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

/** Número pronto para conta de tela: o que não é número vira zero. */
function paraConta(valor: string): number {
  const n = numeroDoCampo(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Linha nova da lista.
 *
 * O preço sugerido é o custo que o produto já tem, escrito com PONTO — é o
 * formato que o campo numérico do navegador entende (ele mostra "12,5" na tela
 * e devolve "12.5"). Quase sempre o fornecedor cobra o mesmo; quando muda,
 * quem recebe corrige em cima.
 */
function novaLinha(produto: ProdutoDaEntrada, quantidade: number, posicao: number): ItemRascunho {
  return {
    chave: `${produto.id}-${posicao}`,
    produto,
    quantidade: String(quantidade),
    custoUnitario: String(produto.custo ?? 0),
    divergencia: '',
  };
}

export function DialogNovaEntrada({
  onFechar,
  itensIniciais = [],
}: {
  onFechar: () => void;
  itensIniciais?: ItemInicialDaEntrada[];
}) {
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const podeCadastrarFornecedor = can(PERMISSIONS.REGISTRY_SUPPLIERS_MANAGE);

  const [fornecedorId, setFornecedorId] = useState('');
  const [dataEntrada, setDataEntrada] = useState(hojeISO());
  const [numeroNota, setNumeroNota] = useState('');
  const [observacao, setObservacao] = useState('');
  const [itens, setItens] = useState<ItemRascunho[]>(() =>
    itensIniciais.map((i, posicao) => novaLinha(i.produto, i.quantidade, posicao)),
  );
  const [busca, setBusca] = useState('');

  const fornecedores = useQuery({
    queryKey: ['fornecedores-ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('id, nome')
        // Fornecedor desativado em Cadastros não entra na lista de escolha: a
        // chave já se chamava "fornecedores-ativos", mas a busca trazia todos.
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  const semFornecedor =
    !fornecedores.isLoading && !fornecedores.isError && (fornecedores.data ?? []).length === 0;

  // Leitura de produto passa SEMPRE por `vw_produtos` — regra de custo
  // protegido. A view devolve custo de verdade para quem tem permissão, e NULL
  // para quem não tem; aqui só chega quem tem, mas a regra é uma só.
  const produtos = useQuery({
    queryKey: ['produtos-para-entrada', busca],
    enabled: busca.trim().length >= 2,
    queryFn: async (): Promise<ProdutoDaEntrada[]> => {
      // Vírgula e parêntese têm significado dentro do `.or()` (separam e
      // agrupam os filtros): um produto chamado "Cabo HDMI, 2m" respondia
      // "nenhum produto" porque a vírgula quebrava a consulta por dentro.
      // Viram curinga: "HDMI, 2m" procura "%HDMI% 2m%" e acha do mesmo jeito.
      const termo = busca.trim().replace(/[,()]/g, '%');
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('id, nome, codigo_barra, estoque_atual, custo')
        .or(`nome.ilike.%${termo}%,codigo_barra.ilike.%${termo}%`)
        .eq('ativo', true)
        .order('nome')
        .limit(8);
      if (error) throw error;
      return (data ?? []) as ProdutoDaEntrada[];
    },
  });

  // Todas as contas de dinheiro desta tela leem os campos com `numeroDoCampo`,
  // nunca com `paraNumero`: ver o porquê em lib/estoque.ts (R$ 12,50 virava
  // R$ 125,00).
  const total = useMemo(
    () =>
      itens.reduce(
        (soma, i) => soma + paraConta(i.quantidade) * paraConta(i.custoUnitario),
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
          quantidade: numeroDoCampo(i.quantidade),
          custo_unitario: numeroDoCampo(i.custoUnitario),
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
      // O estoque e o custo mudaram: toda tela que mostra produto precisa
      // reler, senão o saldo na tela fica mentindo até alguém apertar F5.
      for (const chave of [
        'entradas-mercadoria',
        'produtos',
        'estoque',
        'estoque-critico',
        'estoque-movimentacoes',
        'produto-detalhe',
        'produto-movimentos',
      ]) {
        queryClient.invalidateQueries({ queryKey: [chave] });
      }
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
        description: mensagemDoErro(error),
        variant: 'destructive',
      });
    },
  });

  function adicionar(p: ProdutoDaEntrada) {
    setItens((atual) => [...atual, novaLinha(p, 1, atual.length)]);
    setBusca('');
  }

  function alterar(chave: string, campo: keyof ItemRascunho, valor: string) {
    setItens((atual) =>
      atual.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)),
    );
  }

  // O que ainda falta para poder salvar, em palavras. Botão cinza sem
  // explicação parece tela quebrada — foi o que aconteceu com a loja sem
  // nenhum fornecedor cadastrado.
  const falta = !fornecedorId
    ? 'Escolha o fornecedor.'
    : itens.length === 0
      ? 'Adicione pelo menos um produto.'
      : itens.some((i) => !quantidadeValida(i.quantidade))
        ? 'A quantidade tem que ser um número inteiro, maior que zero.'
        : itens.some((i) => !precoValido(i.custoUnitario))
          ? 'Preencha o preço de compra de cada produto (pode ser zero).'
          : null;

  const podeSalvar = falta === null && !salvar.isPending;

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
              <Label htmlFor="e-fornecedor">Fornecedor</Label>
              <Select value={fornecedorId} onValueChange={setFornecedorId}>
                <SelectTrigger id="e-fornecedor">
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
              {fornecedores.isError && (
                <p className="text-xs text-red-600">
                  Não consegui carregar a lista de fornecedores. Feche e abra de novo.
                </p>
              )}
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

          {/* Loja sem fornecedor cadastrado: a lista acima abre vazia e o
              botão "Dar entrada" nunca libera. Sem este aviso, a primeira vez
              que alguém usa a tela parece defeito. */}
          {semFornecedor && (
            <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">Nenhum fornecedor cadastrado ainda</p>
                <p className="mt-1 text-muted-foreground">
                  Toda entrada precisa dizer de quem veio a mercadoria — é assim que a
                  compra vai para o financeiro.{' '}
                  {podeCadastrarFornecedor ? (
                    <>
                      Cadastre o fornecedor em{' '}
                      <Link
                        to="/cadastros/fornecedores"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Cadastros › Fornecedores
                      </Link>{' '}
                      e volte aqui.
                    </>
                  ) : (
                    <>Peça a quem cuida dos cadastros para incluir o fornecedor em Cadastros › Fornecedores.</>
                  )}
                </p>
              </div>
            </div>
          )}

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
                  const qtd = paraConta(i.quantidade);
                  const custoNovo = paraConta(i.custoUnitario);
                  const estoque = i.produto.estoque_atual ?? 0;
                  const custoAtual = Number(i.produto.custo ?? 0);
                  // Conta TODAS as linhas deste mesmo produto na entrada, não
                  // só esta. O banco processa as linhas em sequência, então
                  // calcular cada uma isolada prometia um custo que não
                  // acontece: duas linhas de 10 un a R$ 20 sobre 10 un a
                  // R$ 10 mostrariam R$ 15,00 nas duas, e o banco grava
                  // R$ 16,67.
                  const linhasDoProduto = itens.filter((x) => x.produto.id === i.produto.id);
                  const qtdTotal = linhasDoProduto.reduce(
                    (soma, x) => soma + paraConta(x.quantidade),
                    0,
                  );
                  const gastoTotal = linhasDoProduto.reduce(
                    (soma, x) => soma + paraConta(x.quantidade) * paraConta(x.custoUnitario),
                    0,
                  );
                  const medio =
                    qtdTotal > 0
                      ? custoMedio(estoque, custoAtual, qtdTotal, gastoTotal / qtdTotal)
                      : custoAtual;
                  const repetido = linhasDoProduto.length > 1;
                  const mudouCusto = qtd > 0 && medio !== custoAtual;
                  const qtdErrada = i.quantidade.trim() !== '' && !quantidadeValida(i.quantidade);

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
                          <Label htmlFor={`qtd-${i.chave}`} className="text-xs">
                            Quantidade
                          </Label>
                          <Input
                            id={`qtd-${i.chave}`}
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={i.quantidade}
                            onChange={(e) => alterar(i.chave, 'quantidade', e.target.value)}
                          />
                          {qtdErrada && (
                            <p className="text-xs text-red-600">Só número inteiro, maior que zero.</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`custo-${i.chave}`} className="text-xs">
                            Preço de compra (unidade)
                          </Label>
                          <Input
                            id={`custo-${i.chave}`}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={i.custoUnitario}
                            onChange={(e) =>
                              alterar(i.chave, 'custoUnitario', e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Total da linha</Label>
                          <div
                            data-testid={`total-${i.chave}`}
                            className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium"
                          >
                            {moeda(qtd * custoNovo)}
                          </div>
                        </div>
                      </div>

                      {mudouCusto && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Custo deste produto passa de <strong>{moeda(custoAtual)}</strong>{' '}
                          para <strong>{moeda(medio)}</strong> — média entre as {estoque}{' '}
                          unidade(s) que já estavam na prateleira e as {qtdTotal} que estão
                          chegando{repetido ? ' nesta entrada (somando as linhas repetidas deste produto)' : ''}.
                          Isso muda a margem de todas elas.
                        </p>
                      )}

                      <div className="mt-2 space-y-1">
                        <Label htmlFor={`div-${i.chave}`} className="text-xs">
                          Veio diferente do pedido? (opcional)
                        </Label>
                        <Input
                          id={`div-${i.chave}`}
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
            <span data-testid="total-da-compra" className="text-lg font-semibold">
              {moeda(total)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {falta && !salvar.isPending && (
            <p className="mr-auto text-xs text-muted-foreground">{falta}</p>
          )}
          <Button variant="cancelar" onClick={onFechar} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button variant="sucesso" disabled={!podeSalvar} onClick={() => salvar.mutate()}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Dar entrada
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
