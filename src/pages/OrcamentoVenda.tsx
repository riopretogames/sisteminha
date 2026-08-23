import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Minus, Trash2, Printer, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { moeda } from '@/lib/format';

/**
 * Orçamento de Venda — simulação, não vira registro nenhum no banco.
 *
 * Pedido do Felipe em 10/08 (ver PLANO-DE-ACAO.md, Vendas/PDV):
 * antes de fechar uma venda, o vendedor às vezes só quer mostrar pro
 * cliente quanto vai dar — sem comprometer estoque, sem criar venda
 * "rascunho", sem fluxo de aprovação nenhum. Decisão do Felipe: fica só
 * calculadora. Fechar de verdade continua sendo lá no PDV.
 *
 * Por isso esta tela NÃO tem: seleção de cliente vinculado (só um campo de
 * texto solto, pra aparecer no papel impresso — não referencia
 * `clientes`), forma de pagamento, nem botão de finalizar. Só existe
 * "Nova simulação" (limpa tudo) e "Imprimir" (janela de impressão do
 * navegador, mesmo mecanismo do Comprovante de Venda).
 *
 * Produtos vêm de `vw_produtos` com o mesmo filtro do PDV (ativo, com
 * estoque) — é a mesma fonte de preço, só não baixa nada daqui.
 */

interface Produto {
  id: string;
  nome: string;
  preco: number;
  estoque_atual: number;
}

interface ItemSimulado {
  produto: Produto;
  quantidade: number;
}

export default function OrcamentoVenda() {
  const { user, can } = useAuth();
  const podeDarDesconto = can(PERMISSIONS.SALES_DISCOUNT);

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<ItemSimulado[]>([]);
  const [nomeCliente, setNomeCliente] = useState('');
  const [desconto, setDesconto] = useState('');

  const { data: produtos } = useQuery({
    queryKey: ['orcamento-produtos'],
    queryFn: async (): Promise<Produto[]> => {
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('id, nome, preco, estoque_atual')
        .eq('ativo', true)
        .gt('estoque_atual', 0)
        .order('nome');
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });

  const { data: tenant } = useQuery({
    queryKey: ['tenant-orcamento', user?.profile?.tenant_id],
    queryFn: async (): Promise<{ nome_loja: string } | null> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('nome_loja')
        .eq('id', user!.profile!.tenant_id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.profile?.tenant_id,
  });

  const addToCart = (produto: Produto) => {
    setCart((atual) => {
      const existente = atual.find((i) => i.produto.id === produto.id);
      if (existente) {
        return atual.map((i) =>
          i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
        );
      }
      return [...atual, { produto, quantidade: 1 }];
    });
  };

  const updateQuantidade = (produtoId: string, delta: number) => {
    setCart((atual) =>
      atual
        .map((i) => (i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0)
    );
  };

  const removeFromCart = (produtoId: string) => {
    setCart((atual) => atual.filter((i) => i.produto.id !== produtoId));
  };

  const novaSimulacao = () => {
    setCart([]);
    setNomeCliente('');
    setDesconto('');
    setSearch('');
  };

  const subtotal = cart.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0);
  const descontoValor = podeDarDesconto
    ? Math.min(subtotal, Math.max(0, parseFloat(desconto) || 0))
    : 0;
  const total = subtotal - descontoValor;

  const filteredProdutos = (produtos ?? []).filter((p) =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-6 animate-fade-in">
      <div className="print:hidden flex flex-1 flex-col">
        <PageHeader
          titulo="Orçamento de Venda"
          hint="Simulação — nada aqui é gravado no sistema. Pra fechar a venda de verdade, use o PDV."
        />

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar produto por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-3 gap-3">
            {filteredProdutos.map((produto) => (
              <Card
                key={produto.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => addToCart(produto)}
              >
                <CardContent className="p-4">
                  <p className="font-medium line-clamp-2">{produto.nome}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-lg font-bold text-primary">
                      {moeda(produto.preco)}
                    </span>
                    <Badge variant="secondary">{produto.estoque_atual}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Painel da simulação — é este bloco que aparece na impressão, o
          resto da tela some via `print:hidden`. */}
      <Card className="w-96 flex flex-col print:w-full print:border-0 print:shadow-none">
        <CardContent className="flex flex-1 flex-col p-4">
          <div className="print:hidden mb-3">
            <p className="text-lg font-semibold">Simulação</p>
            <Input
              placeholder="Nome do cliente (opcional, só pro papel)"
              value={nomeCliente}
              onChange={(e) => setNomeCliente(e.target.value)}
              className="mt-2"
            />
          </div>

          {/* Cabeçalho só visível na impressão — mesma ideia do Comprovante
              de Venda, mas sem numeração/data de venda nenhuma: isto nunca
              vira registro. */}
          <div className="hidden print:block mb-4 border-b-2 border-black pb-2">
            <p className="text-lg font-bold">{tenant?.nome_loja ?? 'Rio Preto Games'}</p>
            <p className="text-sm">ORÇAMENTO — SIMULAÇÃO, não é comprovante de venda</p>
            {nomeCliente.trim() && <p className="text-sm">Cliente: {nomeCliente.trim()}</p>}
          </div>

          <div className="flex-1 overflow-auto">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <p>Nenhum item ainda</p>
                <p className="text-sm">Clique nos produtos para simular</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.produto.id}
                    className="flex items-center gap-3 rounded-lg bg-muted/50 p-2 print:bg-transparent print:rounded-none print:border-b print:py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.produto.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {moeda(item.produto.preco)} x {item.quantidade} ={' '}
                        {moeda(item.produto.preco * item.quantidade)}
                      </p>
                    </div>
                    <div className="print:hidden flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => updateQuantidade(item.produto.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center">{item.quantidade}</span>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => updateQuantidade(item.produto.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => removeFromCart(item.produto.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 border-t pt-4">
            {podeDarDesconto && (
              <div className="print:hidden mb-3 flex items-center justify-between gap-2">
                <label htmlFor="desconto" className="text-sm text-muted-foreground">
                  Desconto (R$)
                </label>
                <Input
                  id="desconto"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0,00"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  className="h-8 w-28 text-right"
                />
              </div>
            )}
            {descontoValor > 0 && (
              <div className="mb-1 flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{moeda(subtotal)}</span>
              </div>
            )}
            {descontoValor > 0 && (
              <div className="mb-1 flex items-center justify-between text-sm text-destructive">
                <span>Desconto</span>
                <span>-{moeda(descontoValor)}</span>
              </div>
            )}
            <div className="mb-4 flex items-center justify-between text-lg font-bold">
              <span>Total simulado</span>
              <span className="text-primary">{moeda(total)}</span>
            </div>

            <div className="print:hidden flex gap-2">
              <Button variant="outline" className="flex-1" onClick={novaSimulacao}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Nova simulação
              </Button>
              <Button variant="neutra"
                className="flex-1"
                disabled={cart.length === 0}
                onClick={() => window.print()}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
