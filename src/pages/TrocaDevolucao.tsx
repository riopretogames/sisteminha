import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Package, ShoppingCart, Plus, Minus, Trash2, ArrowLeftRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, dataHora } from '@/lib/format';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/**
 * Troca e Devolução de produto.
 *
 * Feature nova (não existia rascunho nenhum antes) — desenhada com o
 * Felipe em 08/08 (ver PLANO-DE-ACAO.md). Duas decisões de negócio
 * que moldam esta tela:
 * - Devolução é sempre em DINHEIRO de verdade — a loja não trabalha com
 *   crédito de loja nem crediário, então não existe "fica devendo" nem
 *   "vira saldo pra usar depois".
 * - Cobre os dois casos numa tela só: devolução pura (cliente só devolve,
 *   não leva nada) e troca (devolve um produto, leva outro no lugar).
 *
 * Como funciona por baixo:
 * - Itens devolvidos da venda original entram em `devolucao_itens`, que
 *   dispara um gatilho no banco devolvendo o estoque (espelha o gatilho de
 *   baixa da venda, no sentido contrário).
 * - Se teve troca, os itens novos viram uma VENDA de verdade (`vendas` +
 *   `itens_venda`) — reaproveita a baixa de estoque que já existe pra
 *   venda normal, não duplica essa lógica aqui.
 * - A diferença entre o que voltou e o que saiu de novo é acertada em
 *   dinheiro: ou devolve pro cliente, ou o cliente paga a mais — nunca os
 *   dois ao mesmo tempo (o banco tem um CHECK garantindo isso).
 *
 * Permissão: `sales.cancel` — já existia cadastrada, mas era decorativa
 * (nenhuma tela usava). Troca/devolução é exatamente o tipo de ação que
 * essa permissão deveria gatear.
 *
 * As 2 pendências abaixo (achadas na revisão adversarial de 08/08,
 * registradas no PLANO-DE-ACAO.md) foram corrigidas em 17/08:
 *
 * 1. ✅ O dinheiro devolvido agora entra na conferência de Caixa: o
 *    gatilho `registrar_devolucao_no_caixa` (migration `20260817120000`)
 *    lança `devolucoes.valor_devolvido_cliente` como saída no caixa
 *    aberto do momento. Sem caixa aberto, não lança nada (mesma limitação
 *    que venda/OS pagas ainda têm — não é regressão desta correção).
 * 2. ✅ A venda nova continua gravando o preço CHEIO do produto novo em
 *    `vendas.total` (precisa disso pra contagem de vendas por produto nos
 *    dashboards), mas agora também grava `valor_faturamento_real` — quanto
 *    entrou de dinheiro NOVO de verdade (a diferença cobrada do cliente,
 *    ou 0). Quem soma `vendas.total` pra "faturamento" (VendasHistorico,
 *    DashboardVenda, Dashboard Home, RelatorioVendas) passou a somar
 *    `COALESCE(valor_faturamento_real, total)` em vez de `total` sozinho —
 *    não conta mais o produto trocado duas vezes.
 *
 * Sem trava no banco (só client-side) contra devolver mais unidades do
 * que foi vendido em devoluções parciais simultâneas — risco baixo com
 * terminal único, mas é uma lacuna real se um dia tiver mais de um PDV
 * rodando ao mesmo tempo.
 */

interface VendaResumo {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
  clientes: { id: string; nome: string } | null;
}

interface ItemVendaOriginal {
  id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  produtos: { nome: string } | null;
}

interface ProdutoOpcao {
  id: string;
  nome: string;
  preco: number;
  estoque_atual: number;
}

interface FormaPagamentoOpcao {
  id: string;
  descricao: string;
  forma_enum: 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'crediario' | 'vale_troca';
}

interface ItemNovo {
  produto: ProdutoOpcao;
  quantidade: number;
}

export default function TrocaDevolucao() {
  const { toast } = useToast();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const podeRegistrar = can(PERMISSIONS.SALES_CANCEL);

  const [busca, setBusca] = useState('');
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaResumo | null>(null);
  const [quantidadesDevolvidas, setQuantidadesDevolvidas] = useState<Record<string, string>>({});
  const [itensNovos, setItensNovos] = useState<ItemNovo[]>([]);
  const [buscaProdutoNovo, setBuscaProdutoNovo] = useState('');
  const [formaAcertoId, setFormaAcertoId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { data: vendas, isLoading: carregandoVendas } = useQuery({
    queryKey: ['troca-devolucao-vendas'],
    queryFn: async (): Promise<VendaResumo[]> => {
      const { data, error } = await supabase
        .from('vendas')
        .select('id, numero_venda, created_at, status, clientes(id, nome)')
        .neq('status', 'cancelado')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as VendaResumo[];
    },
  });

  // Itens da venda original + quanto já foi devolvido antes (pra não
  // deixar devolver mais do que foi vendido, mesmo em devoluções
  // parciais anteriores).
  const { data: itensOriginais, isLoading: carregandoItens } = useQuery({
    queryKey: ['troca-devolucao-itens', vendaSelecionada?.id],
    queryFn: async (): Promise<ItemVendaOriginal[]> => {
      const [itensRes, devolvidosRes] = await Promise.all([
        supabase
          .from('itens_venda')
          .select('id, produto_id, quantidade, preco_unitario, produtos:vw_produtos(nome)')
          .eq('venda_id', vendaSelecionada!.id),
        supabase
          .from('devolucoes')
          .select('id, devolucao_itens(produto_id, quantidade)')
          .eq('venda_original_id', vendaSelecionada!.id),
      ]);
      if (itensRes.error) throw itensRes.error;
      if (devolvidosRes.error) throw devolvidosRes.error;

      const jaDevolvidoPorProduto = new Map<string, number>();
      for (const dev of (devolvidosRes.data ?? []) as unknown as Array<{
        devolucao_itens: Array<{ produto_id: string; quantidade: number }>;
      }>) {
        for (const item of dev.devolucao_itens ?? []) {
          jaDevolvidoPorProduto.set(
            item.produto_id,
            (jaDevolvidoPorProduto.get(item.produto_id) ?? 0) + item.quantidade
          );
        }
      }

      return ((itensRes.data ?? []) as unknown as ItemVendaOriginal[]).map((item) => ({
        ...item,
        // Desconta o que já voltou antes — o campo abaixo não é do banco,
        // é calculado aqui pra limitar o input de quantidade no render.
        quantidade: item.quantidade - (jaDevolvidoPorProduto.get(item.produto_id) ?? 0),
      }));
    },
    enabled: !!vendaSelecionada,
  });

  const { data: produtos } = useQuery({
    queryKey: ['troca-devolucao-produtos'],
    queryFn: async (): Promise<ProdutoOpcao[]> => {
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('id, nome, preco, estoque_atual')
        .eq('ativo', true)
        .gt('estoque_atual', 0)
        .order('nome');
      if (error) throw error;
      return (data ?? []) as ProdutoOpcao[];
    },
    enabled: !!vendaSelecionada,
  });

  const { data: formasPagamento } = useQuery({
    queryKey: ['troca-devolucao-formas-pagamento'],
    queryFn: async (): Promise<FormaPagamentoOpcao[]> => {
      const { data, error } = await supabase
        .from('formas_pagamento')
        .select('id, descricao, forma_enum')
        .eq('ativo', true)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FormaPagamentoOpcao[];
    },
    enabled: !!vendaSelecionada,
  });

  const buscaLower = busca.toLowerCase();
  const vendasFiltradas = (vendas ?? []).filter(
    (v) =>
      (v.numero_venda ?? '').toLowerCase().includes(buscaLower) ||
      (v.clientes?.nome ?? '').toLowerCase().includes(buscaLower)
  );

  const selecionarVenda = (venda: VendaResumo) => {
    setVendaSelecionada(venda);
    setQuantidadesDevolvidas({});
    setItensNovos([]);
    setFormaAcertoId('');
    setMotivo('');
  };

  const valorDevolvido = (itensOriginais ?? []).reduce((acc, item) => {
    const qtd = Math.min(
      item.quantidade,
      Math.max(0, parseInt(quantidadesDevolvidas[item.id] ?? '0', 10) || 0)
    );
    return acc + qtd * Number(item.preco_unitario);
  }, 0);

  const valorNovosItens = itensNovos.reduce(
    (acc, item) => acc + item.produto.preco * item.quantidade,
    0
  );

  // Positivo = devolve pro cliente. Negativo = cliente paga a diferença.
  const diferenca = valorDevolvido - valorNovosItens;
  const temDevolucaoOuTroca = (itensOriginais ?? []).some(
    (item) => (parseInt(quantidadesDevolvidas[item.id] ?? '0', 10) || 0) > 0
  );

  const produtosNovosFiltrados = (produtos ?? []).filter((p) =>
    p.nome.toLowerCase().includes(buscaProdutoNovo.toLowerCase())
  );

  const adicionarItemNovo = (produto: ProdutoOpcao) => {
    const existente = itensNovos.find((i) => i.produto.id === produto.id);
    if (existente) {
      if (existente.quantidade >= produto.estoque_atual) {
        toast({ title: 'Estoque insuficiente', variant: 'destructive' });
        return;
      }
      setItensNovos(
        itensNovos.map((i) =>
          i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
        )
      );
    } else {
      setItensNovos([...itensNovos, { produto, quantidade: 1 }]);
    }
  };

  const removerItemNovo = (produtoId: string) => {
    setItensNovos(itensNovos.filter((i) => i.produto.id !== produtoId));
  };

  const confirmar = async () => {
    if (!vendaSelecionada || !user?.profile?.tenant_id) return;

    if (!temDevolucaoOuTroca) {
      toast({ title: 'Marque ao menos um item pra devolver', variant: 'destructive' });
      return;
    }

    if (diferenca !== 0 && !formaAcertoId) {
      toast({
        title: 'Escolha a forma de pagamento',
        description: diferenca > 0 ? 'Como o dinheiro será devolvido ao cliente.' : 'Como o cliente vai pagar a diferença.',
        variant: 'destructive',
      });
      return;
    }

    const tenantId = user.profile.tenant_id;
    setSalvando(true);

    let vendaNovaId: string | null = null;

    try {
      // 1) Se teve troca (itens novos), cria uma venda de verdade primeiro
      // — reaproveita a baixa de estoque que já existe pra venda normal.
      if (itensNovos.length > 0) {
        const { data: vendaNova, error: vendaNovaError } = await supabase
          .from('vendas')
          .insert({
            tenant_id: tenantId,
            cliente_id: vendaSelecionada.clientes?.id ?? null,
            vendedor_id: user.id,
            status: 'pago',
            subtotal: valorNovosItens,
            descontos: 0,
            total: valorNovosItens,
            // Preço cheio em `total` (contagem de vendas por produto), mas
            // só a diferença cobrada do cliente conta como faturamento
            // novo de verdade — ver comentário no topo do arquivo.
            valor_faturamento_real: diferenca < 0 ? Math.abs(diferenca) : 0,
            observacoes: `Produto(s) novo(s) de troca — devolução da venda ${vendaSelecionada.numero_venda ?? vendaSelecionada.id}.`,
          })
          .select()
          .single();
        if (vendaNovaError) throw vendaNovaError;
        vendaNovaId = vendaNova.id;

        try {
          const { error: itensError } = await supabase.from('itens_venda').insert(
            itensNovos.map((i) => ({
              venda_id: vendaNovaId,
              produto_id: i.produto.id,
              quantidade: i.quantidade,
              preco_unitario: i.produto.preco,
              total: i.produto.preco * i.quantidade,
            }))
          );
          if (itensError) throw itensError;

          // Cliente paga a diferença: registra como pagamento da venda nova.
          if (diferenca < 0) {
            const forma = (formasPagamento ?? []).find((f) => f.id === formaAcertoId);
            const { error: pagamentoError } = await supabase.from('pagamentos_venda').insert({
              venda_id: vendaNovaId,
              forma: forma?.forma_enum ?? 'dinheiro',
              forma_pagamento_id: formaAcertoId,
              parcelas: 1,
              valor: Math.abs(diferenca),
            });
            if (pagamentoError) throw pagamentoError;
          }
        } catch (innerError) {
          // Mesma cautela do PDV: se itens/pagamento da venda nova
          // falharem, não deixa ela "pago" sem nada dentro — cancela (o
          // que também estorna o estoque que já tinha sido descontado,
          // via o gatilho de cancelamento que já existe).
          await supabase
            .from('vendas')
            .update({ status: 'cancelado', observacoes: 'Cancelada automaticamente: falha ao registrar troca.' })
            .eq('id', vendaNovaId);
          throw innerError;
        }
      }

      // 2) e 3) Registra a devolução em si e os itens devolvidos, num bloco
      // próprio: se qualquer um dos dois falhar DEPOIS que a venda nova (1)
      // já tinha sido criada com sucesso (itens + pagamento gravados), essa
      // venda nova não pode ficar "pago" órfã, sem devolução nenhuma
      // atrelada — senão o usuário tenta de novo e gera uma segunda venda
      // nova (cobrando/baixando estoque em dobro). Cancelar aqui é seguro:
      // o gatilho de cancelamento de venda mexe só no estoque dos itens
      // DESSA venda nova, é totalmente separado do gatilho de devolução.
      try {
        const { data: devolucao, error: devolucaoError } = await supabase
          .from('devolucoes')
          .insert({
            tenant_id: tenantId,
            venda_original_id: vendaSelecionada.id,
            venda_nova_id: vendaNovaId,
            valor_devolvido_cliente: diferenca > 0 ? diferenca : 0,
            valor_cliente_pagou_a_mais: diferenca < 0 ? Math.abs(diferenca) : 0,
            forma_pagamento_id: diferenca !== 0 ? formaAcertoId : null,
            motivo: motivo.trim() || null,
            usuario_id: user.id,
          })
          .select()
          .single();
        if (devolucaoError) throw devolucaoError;

        // Itens devolvidos — dispara o estorno de estoque automático.
        const itensParaDevolver = (itensOriginais ?? [])
          .map((item) => ({
            produto_id: item.produto_id,
            quantidade: Math.min(
              item.quantidade,
              Math.max(0, parseInt(quantidadesDevolvidas[item.id] ?? '0', 10) || 0)
            ),
            preco_unitario: item.preco_unitario,
          }))
          .filter((item) => item.quantidade > 0);

        const { error: itensDevolucaoError } = await supabase.from('devolucao_itens').insert(
          itensParaDevolver.map((item) => ({ ...item, devolucao_id: devolucao.id }))
        );
        if (itensDevolucaoError) {
          // Devolução sem item nenhum não faz sentido — desfaz o registro
          // (não tem efeito colateral próprio, só a numeração gerada).
          await supabase.from('devolucoes').delete().eq('id', devolucao.id);
          throw itensDevolucaoError;
        }

        toast({
          title: 'Devolução registrada!',
          description: `${devolucao.numero_devolucao} — ${
            diferenca > 0
              ? `devolver ${moeda(diferenca)} ao cliente.`
              : diferenca < 0
                ? `cliente pagou ${moeda(Math.abs(diferenca))} a mais.`
                : 'troca sem diferença a acertar.'
          }`,
          variant: 'success',
        });

        queryClient.invalidateQueries({ queryKey: ['troca-devolucao-vendas'] });
        setVendaSelecionada(null);
        setBusca('');
      } catch (devolucaoStepError) {
        if (vendaNovaId) {
          await supabase
            .from('vendas')
            .update({ status: 'cancelado', observacoes: 'Cancelada automaticamente: falha ao registrar devolução.' })
            .eq('id', vendaNovaId);
        }
        throw devolucaoStepError;
      }
    } catch (error) {
      toast({
        title: 'Erro ao registrar devolução',
        description:
          error instanceof Error && /row-level security|policy/i.test(error.message)
            ? 'Seu perfil de acesso não permite fazer isso.'
            : error instanceof Error
              ? error.message
              : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        titulo="Troca e Devolução"
        hint="Devolve produto de uma venda já fechada — sozinho (devolução) ou trocando por outro produto (troca). O acerto é sempre em dinheiro de verdade, a loja não trabalha com crédito de loja nem crediário."
      />

      {!podeRegistrar && (
        <Vazio
          titulo="Sem permissão"
          descricao="Seu perfil de acesso não permite registrar troca ou devolução."
        />
      )}

      {podeRegistrar && !vendaSelecionada && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Encontre a venda original</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número da venda ou cliente…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            {carregandoVendas ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : vendasFiltradas.length === 0 ? (
              <Vazio titulo="Nenhuma venda encontrada" />
            ) : (
              <div className="max-h-96 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Venda</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendasFiltradas.slice(0, 50).map((v) => (
                      <TableRow key={v.id} className="cursor-pointer" onClick={() => selecionarVenda(v)}>
                        <TableCell className="font-medium">{v.numero_venda ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{dataHora(v.created_at)}</TableCell>
                        <TableCell>{v.clientes?.nome ?? 'Consumidor final'}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon">
                            <ArrowLeftRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {podeRegistrar && vendaSelecionada && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Venda <span className="font-medium text-foreground">{vendaSelecionada.numero_venda}</span>
              {' — '}
              {vendaSelecionada.clientes?.nome ?? 'Consumidor final'}
            </p>
            <Button variant="outline" size="sm" onClick={() => setVendaSelecionada(null)}>
              Trocar de venda
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. O que está voltando?</CardTitle>
            </CardHeader>
            <CardContent>
              {carregandoItens ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
              ) : (itensOriginais ?? []).every((i) => i.quantidade <= 0) ? (
                <Vazio
                  titulo="Nada disponível pra devolver"
                  descricao="Todos os itens desta venda já foram devolvidos antes."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Vendido</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-right w-32">Devolver</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(itensOriginais ?? [])
                      .filter((item) => item.quantidade > 0)
                      .map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.produtos?.nome ?? '—'}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.quantidade}</TableCell>
                          <TableCell className="text-right">{moeda(Number(item.preco_unitario))}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={item.quantidade}
                              value={quantidadesDevolvidas[item.id] ?? ''}
                              placeholder="0"
                              onChange={(e) =>
                                setQuantidadesDevolvidas({ ...quantidadesDevolvidas, [item.id]: e.target.value })
                              }
                              className="w-20 ml-auto text-right"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                3. Vai levar produto novo no lugar? <span className="font-normal text-muted-foreground">(opcional — só em troca)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto…"
                  value={buscaProdutoNovo}
                  onChange={(e) => setBuscaProdutoNovo(e.target.value)}
                  className="pl-9"
                />
              </div>
              {buscaProdutoNovo && (
                <div className="max-h-48 overflow-auto rounded-lg border">
                  {produtosNovosFiltrados.slice(0, 20).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        adicionarItemNovo(p);
                        setBuscaProdutoNovo('');
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted"
                    >
                      <span className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        {p.nome}
                      </span>
                      <span className="text-muted-foreground">{moeda(p.preco)}</span>
                    </button>
                  ))}
                  {produtosNovosFiltrados.length === 0 && (
                    <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                  )}
                </div>
              )}
              {itensNovos.length > 0 && (
                <div className="space-y-2">
                  {itensNovos.map((item) => (
                    <div key={item.produto.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-sm font-medium">{item.produto.nome}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() =>
                            setItensNovos(
                              itensNovos
                                .map((i) => (i.produto.id === item.produto.id ? { ...i, quantidade: i.quantidade - 1 } : i))
                                .filter((i) => i.quantidade > 0)
                            )
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{item.quantidade}</span>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => adicionarItemNovo(item.produto)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="w-20 text-right text-sm font-medium">
                        {moeda(item.produto.preco * item.quantidade)}
                      </span>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => removerItemNovo(item.produto.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Acerto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor devolvido (itens que voltam)</span>
                  <span>{moeda(valorDevolvido)}</span>
                </div>
                {itensNovos.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor dos itens novos</span>
                    <span>-{moeda(valorNovosItens)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>
                    {diferenca > 0 ? 'Devolver ao cliente' : diferenca < 0 ? 'Cliente paga a mais' : 'Diferença'}
                  </span>
                  <span className={diferenca > 0 ? 'text-emerald-600' : diferenca < 0 ? 'text-destructive' : ''}>
                    {moeda(Math.abs(diferenca))}
                  </span>
                </div>
              </div>

              {diferenca !== 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Forma de pagamento {diferenca > 0 ? '(da devolução)' : '(que o cliente vai pagar)'}
                  </label>
                  <Select value={formaAcertoId} onValueChange={setFormaAcertoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a forma" />
                    </SelectTrigger>
                    <SelectContent>
                      {(formasPagamento ?? []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Motivo (opcional)</label>
                <Textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: produto com defeito, cliente não gostou, tamanho errado..."
                  rows={2}
                />
              </div>

              <Button className="w-full" size="lg" disabled={salvando || !temDevolucaoOuTroca} onClick={confirmar}>
                {salvando ? 'Registrando…' : 'Confirmar devolução'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
