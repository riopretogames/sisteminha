import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  CreditCard,
  Banknote,
  QrCode,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { FORMAS_PAGAMENTO } from '@/lib/constants';

type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;

interface Produto {
  id: string;
  nome: string;
  preco: number;
  estoque_atual: number;
}

interface CartItem {
  produto: Produto;
  quantidade: number;
}

interface Cliente {
  id: string;
  nome: string;
}

interface Pagamento {
  forma: FormaPagamento;
  valor: number;
}

export default function PDV() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [search, setSearch] = useState('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showClienteDialog, setShowClienteDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [novoPagamento, setNovoPagamento] = useState<{ forma: FormaPagamento; valor: string }>({
    forma: 'pix',
    valor: '',
  });

  useEffect(() => {
    fetchProdutos();
    fetchClientes();
  }, []);

  const fetchProdutos = async () => {
    const { data } = await supabase
      .from('produtos')
      .select('id, nome, preco, estoque_atual')
      .eq('ativo', true)
      .gt('estoque_atual', 0)
      .order('nome');
    setProdutos(data || []);
  };

  const fetchClientes = async () => {
    const { data } = await supabase
      .from('clientes')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    setClientes(data || []);
  };

  const addToCart = (produto: Produto) => {
    const existingItem = cart.find(item => item.produto.id === produto.id);
    
    if (existingItem) {
      if (existingItem.quantidade >= produto.estoque_atual) {
        toast({
          title: 'Estoque insuficiente',
          description: `Apenas ${produto.estoque_atual} unidades disponíveis`,
          variant: 'destructive',
        });
        return;
      }
      setCart(
        cart.map(item =>
          item.produto.id === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { produto, quantidade: 1 }]);
    }
  };

  const updateQuantity = (produtoId: string, delta: number) => {
    setCart(
      cart
        .map(item => {
          if (item.produto.id === produtoId) {
            const newQty = item.quantidade + delta;
            if (newQty <= 0) return null;
            if (newQty > item.produto.estoque_atual) {
              toast({
                title: 'Estoque insuficiente',
                variant: 'destructive',
              });
              return item;
            }
            return { ...item, quantidade: newQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (produtoId: string) => {
    setCart(cart.filter(item => item.produto.id !== produtoId));
  };

  const total = cart.reduce(
    (acc, item) => acc + item.produto.preco * item.quantidade,
    0
  );

  const totalPago = pagamentos.reduce((acc, p) => acc + p.valor, 0);
  const troco = totalPago - total;

  const addPagamento = () => {
    const valor = parseFloat(novoPagamento.valor);
    if (!valor || valor <= 0) return;
    
    setPagamentos([...pagamentos, { forma: novoPagamento.forma, valor }]);
    setNovoPagamento({ forma: 'pix', valor: '' });
  };

  const removePagamento = (index: number) => {
    setPagamentos(pagamentos.filter((_, i) => i !== index));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast({
        title: 'Carrinho vazio',
        description: 'Adicione produtos ao carrinho.',
        variant: 'destructive',
      });
      return;
    }

    if (totalPago < total) {
      toast({
        title: 'Pagamento insuficiente',
        description: 'O valor pago é menor que o total.',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, id')
        .single();

      if (!profile?.tenant_id) throw new Error('Tenant não encontrado');

      // Create sale
      const { data: venda, error: vendaError } = await supabase
        .from('vendas')
        .insert({
          tenant_id: profile.tenant_id,
          cliente_id: selectedCliente?.id || null,
          vendedor_id: profile.id,
          status: 'pago',
          subtotal: total,
          total: total,
        })
        .select()
        .single();

      if (vendaError) throw vendaError;

      try {
        // Create sale items — a baixa de estoque e o registro em
        // movimentos_estoque acontecem sozinhos aqui: gatilho
        // `baixar_estoque_ao_vender` no banco (ver migration
        // 20260804120000). Se o estoque for insuficiente, o INSERT abaixo
        // falha inteiro (nenhum item é gravado) e cai no catch.
        const itensVenda = cart.map(item => ({
          venda_id: venda.id,
          produto_id: item.produto.id,
          quantidade: item.quantidade,
          preco_unitario: item.produto.preco,
          total: item.produto.preco * item.quantidade,
        }));

        const { error: itensError } = await supabase
          .from('itens_venda')
          .insert(itensVenda);

        if (itensError) throw itensError;

        // Create payments
        const pagamentosVenda = pagamentos.map(p => ({
          venda_id: venda.id,
          forma: p.forma,
          valor: p.valor,
        }));

        const { error: pagamentosError } = await supabase
          .from('pagamentos_venda')
          .insert(pagamentosVenda);

        if (pagamentosError) throw pagamentosError;
      } catch (innerError) {
        // A venda já foi criada (é outra linha, outra transação). Se itens
        // ou pagamento falharem depois — por exemplo, estoque insuficiente
        // — não dá pra deixar essa venda "pago" sem item nem pagamento
        // nenhum. Marca como cancelada em vez de deixar órfã.
        await supabase
          .from('vendas')
          .update({ status: 'cancelado', observacoes: 'Cancelada automaticamente: falha ao gravar itens/pagamento.' })
          .eq('id', venda.id);
        throw innerError;
      }

      toast({
        title: 'Venda finalizada!',
        description: `Venda ${venda.numero_venda} registrada com sucesso.`,
      });

      // Reset
      setCart([]);
      setPagamentos([]);
      setSelectedCliente(null);
      setShowCheckout(false);
      fetchProdutos();
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Erro ao finalizar venda',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const filteredProdutos = produtos.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  );

  const filteredClientes = clientes.filter(c =>
    c.nome.toLowerCase().includes(clienteSearch.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-6 animate-fade-in">
      {/* Products Section */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-4 mb-4">
          <h1 className="text-2xl font-bold">PDV</h1>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar produto por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-3 gap-3">
            {filteredProdutos.map(produto => (
              <Card
                key={produto.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => addToCart(produto)}
              >
                <CardContent className="p-4">
                  <p className="font-medium line-clamp-2">{produto.nome}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-lg font-bold text-primary">
                      {formatCurrency(produto.preco)}
                    </span>
                    <Badge variant="secondary">{produto.estoque_atual}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Section */}
      <Card className="w-96 flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Carrinho</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowClienteDialog(true)}
            >
              <User className="mr-2 h-4 w-4" />
              {selectedCliente?.nome || 'Cliente'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <p>Carrinho vazio</p>
              <p className="text-sm">Clique nos produtos para adicionar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div
                  key={item.produto.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.produto.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(item.produto.preco)} x {item.quantidade}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.produto.id, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center">{item.quantidade}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.produto.id, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeFromCart(item.produto.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <div className="p-4 border-t">
          <div className="flex items-center justify-between text-lg font-bold mb-4">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
          <Button
            className="w-full"
            size="lg"
            disabled={cart.length === 0}
            onClick={() => setShowCheckout(true)}
          >
            Finalizar Venda
          </Button>
        </div>
      </Card>

      {/* Cliente Dialog */}
      <Dialog open={showClienteDialog} onOpenChange={setShowClienteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecionar Cliente</DialogTitle>
            <DialogDescription>
              Escolha um cliente ou continue sem vincular.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Buscar cliente..."
              value={clienteSearch}
              onChange={e => setClienteSearch(e.target.value)}
            />
            <div className="max-h-64 overflow-auto space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setSelectedCliente(null);
                  setShowClienteDialog(false);
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Sem cliente
              </Button>
              {filteredClientes.map(cliente => (
                <Button
                  key={cliente.id}
                  variant={selectedCliente?.id === cliente.id ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => {
                    setSelectedCliente(cliente);
                    setShowClienteDialog(false);
                  }}
                >
                  <User className="mr-2 h-4 w-4" />
                  {cliente.nome}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Checkout Dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Finalizar Venda</DialogTitle>
            <DialogDescription>
              Total: {formatCurrency(total)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Payment methods */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Adicionar Pagamento</label>
              <div className="flex gap-2">
                <Select
                  value={novoPagamento.forma}
                  onValueChange={value => setNovoPagamento({ ...novoPagamento, forma: value as FormaPagamento })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMAS_PAGAMENTO).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Valor"
                  value={novoPagamento.valor}
                  onChange={e => setNovoPagamento({ ...novoPagamento, valor: e.target.value })}
                  className="flex-1"
                />
                <Button onClick={addPagamento}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Quick payment buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPagamentos([{ forma: 'pix', valor: total }])}
              >
                <QrCode className="mr-2 h-4 w-4" />
                PIX Total
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPagamentos([{ forma: 'dinheiro', valor: total }])}
              >
                <Banknote className="mr-2 h-4 w-4" />
                Dinheiro
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPagamentos([{ forma: 'cartao_credito', valor: total }])}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Cartão
              </Button>
            </div>

            {/* Payment list */}
            {pagamentos.length > 0 && (
              <div className="space-y-2">
                {pagamentos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-muted">
                    <span>{FORMAS_PAGAMENTO[p.forma].label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatCurrency(p.valor)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removePagamento(i)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Summary */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Total da venda</span>
                <span className="font-medium">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total pago</span>
                <span className="font-medium">{formatCurrency(totalPago)}</span>
              </div>
              {troco > 0 && (
                <div className="flex justify-between text-success">
                  <span>Troco</span>
                  <span className="font-bold">{formatCurrency(troco)}</span>
                </div>
              )}
              {totalPago < total && (
                <div className="flex justify-between text-destructive">
                  <span>Falta</span>
                  <span className="font-bold">{formatCurrency(total - totalPago)}</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckout(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={processing || totalPago < total}
            >
              {processing ? (
                'Processando...'
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirmar Venda
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
