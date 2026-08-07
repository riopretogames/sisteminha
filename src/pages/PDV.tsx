import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  UserPlus,
  CreditCard,
  Banknote,
  QrCode,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { moeda as formatCurrency } from '@/lib/format';

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

/**
 * Cadastro rápido de cliente — só o que o balcão consegue perguntar com
 * a fila andando. O cadastro completo (CPF, e-mail, origem, endereço)
 * continua sendo o de Cadastros > Clientes; aqui a prioridade é não
 * fazer o vendedor abandonar a venda pra registrar um nome novo.
 */
interface NovoClienteFormData {
  nome: string;
  telefone: string;
}

const NOVO_CLIENTE_VAZIO: NovoClienteFormData = { nome: '', telefone: '' };

/** Mensagem de RLS é críptica; traduz pro que de fato aconteceu. */
function traduzirErro(error: unknown): string {
  const msg = error instanceof Error ? error.message : 'Tente novamente.';
  return /row-level security|policy/i.test(msg)
    ? 'Seu perfil de acesso não permite fazer isso.'
    : msg;
}

/**
 * Forma de pagamento cadastrada em Cadastros > Formas de Pagamento (Passo
 * 5) — parcelamento e taxa configuráveis por loja. `forma_enum` é a
 * categoria ampla (pix/dinheiro/cartao_credito/...) que essa forma
 * representa, só pra continuar preenchendo `pagamentos_venda.forma` e não
 * quebrar relatório nenhum que já agrupa por esse enum.
 */
interface FormaPagamentoCadastro {
  id: string;
  descricao: string;
  forma_enum: FormaPagamento;
  max_parcelas: number;
  contem_taxa: boolean;
  taxa_percent: number;
}

interface Pagamento {
  formaPagamentoId: string;
  descricao: string;
  forma: FormaPagamento;
  parcelas: number;
  valor: number;
}

export default function PDV() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, can } = useAuth();
  const podeDarDesconto = can(PERMISSIONS.SALES_DISCOUNT);
  // Mesma chave que protege a tela de Cadastros > Clientes e a policy de
  // INSERT em `clientes` — se o front usasse outra, o botão apareceria e o
  // banco recusaria na hora de salvar.
  const podeCadastrarCliente = can(PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoCadastro[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [search, setSearch] = useState('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [desconto, setDesconto] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showClienteDialog, setShowClienteDialog] = useState(false);
  const [showNovoClienteDialog, setShowNovoClienteDialog] = useState(false);
  const [novoCliente, setNovoCliente] = useState<NovoClienteFormData>(NOVO_CLIENTE_VAZIO);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [novoPagamento, setNovoPagamento] = useState<{ formaPagamentoId: string; parcelas: string; valor: string }>({
    formaPagamentoId: '',
    parcelas: '1',
    valor: '',
  });

  useEffect(() => {
    fetchProdutos();
    fetchClientes();
    fetchFormasPagamento();
  }, []);

  // Uma vez que as formas de pagamento carregam, pré-seleciona a primeira
  // (por ordem) em vez de deixar o Select vazio.
  useEffect(() => {
    if (formasPagamento.length > 0 && !novoPagamento.formaPagamentoId) {
      setNovoPagamento((f) => ({ ...f, formaPagamentoId: formasPagamento[0].id }));
    }
  }, [formasPagamento, novoPagamento.formaPagamentoId]);

  const fetchProdutos = async () => {
    const { data } = await supabase
      .from('vw_produtos')
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

  const fetchFormasPagamento = async () => {
    const { data } = await supabase
      .from('formas_pagamento')
      .select('id, descricao, forma_enum, max_parcelas, contem_taxa, taxa_percent')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .order('descricao', { ascending: true });
    setFormasPagamento((data ?? []) as FormaPagamentoCadastro[]);
  };

  const abrirNovoClienteDialog = () => {
    // Aproveita o que já foi digitado na busca: quem procurou "Marcos" e não
    // achou quase sempre quer cadastrar exatamente esse nome.
    setNovoCliente({ ...NOVO_CLIENTE_VAZIO, nome: clienteSearch.trim() });
    setShowNovoClienteDialog(true);
  };

  /**
   * Cadastro rápido: grava o cliente e já o deixa vinculado à venda em
   * andamento. Nada aqui toca em `cart`, `pagamentos` ou `desconto` — o
   * ponto da tela é justamente não perder a venda pra cadastrar alguém.
   */
  const salvarNovoCliente = async () => {
    const nome = novoCliente.nome.trim();
    if (!nome) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do cliente.',
        variant: 'destructive',
      });
      return;
    }

    // Perfil vem de useAuth() (mesmo caminho do checkout). Sem tenant o RLS
    // recusaria o INSERT com mensagem de policy — melhor avisar antes.
    const tenantId = user?.profile?.tenant_id ?? null;
    if (!tenantId) {
      toast({
        title: 'Usuário sem loja vinculada',
        description: 'Peça ao administrador para vincular seu usuário à loja.',
        variant: 'destructive',
      });
      return;
    }

    setSalvandoCliente(true);

    try {
      const telefone = novoCliente.telefone.trim();
      // `telefones` é TEXT[] no banco, alimentado por um campo só — mesmo
      // corte que Cadastros > Clientes já faz. Os demais campos ficam no
      // DEFAULT (origem 'loja', ativo true), que é o certo pra balcão.
      const { data, error } = await supabase
        .from('clientes')
        .insert({
          tenant_id: tenantId,
          nome,
          telefones: telefone ? [telefone] : [],
        })
        .select('id, nome')
        .single();

      if (error) throw error;

      // Insere na lista em memória em vez de refazer fetchClientes(): o
      // vendedor não pode esperar uma segunda ida ao banco, e a lista é
      // ordenada por nome — respeita essa ordem pra não parecer bagunçada.
      const criado: Cliente = data;
      setClientes((atuais) =>
        [...atuais, criado].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      );
      setSelectedCliente(criado);
      setClienteSearch('');

      toast({
        title: 'Cliente cadastrado!',
        description: `${criado.nome} já está vinculado a esta venda.`,
      });

      setShowNovoClienteDialog(false);
    } catch (error) {
      console.error('Error saving cliente:', error);
      toast({
        title: 'Erro ao cadastrar cliente',
        description: traduzirErro(error),
        variant: 'destructive',
      });
    } finally {
      setSalvandoCliente(false);
    }
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

  const subtotalBruto = cart.reduce(
    (acc, item) => acc + item.produto.preco * item.quantidade,
    0
  );

  // Desconto é sempre em R$ (mesma unidade da coluna vendas.descontos), e
  // travado entre 0 e o subtotal — nunca deixa o total ficar negativo.
  // Quem não tem `sales.discount` nem vê o campo (a UI já esconde), então
  // o valor digitado é sempre 0 pra esse perfil.
  const descontoValor = podeDarDesconto
    ? Math.min(subtotalBruto, Math.max(0, parseFloat(desconto) || 0))
    : 0;
  const total = subtotalBruto - descontoValor;

  const totalPago = pagamentos.reduce((acc, p) => acc + p.valor, 0);
  const troco = totalPago - total;

  const selecionarFormaPagamento = (formaPagamentoId: string) => {
    const forma = formasPagamento.find((f) => f.id === formaPagamentoId);
    setNovoPagamento((f) => ({
      ...f,
      formaPagamentoId,
      // Se a forma nova não permitir tantas parcelas quanto a anterior,
      // volta pra 1 em vez de mandar um valor de parcela inválido.
      parcelas: forma && Number(f.parcelas) > forma.max_parcelas ? '1' : f.parcelas,
    }));
  };

  const addPagamento = () => {
    const valor = parseFloat(novoPagamento.valor);
    if (!valor || valor <= 0) return;

    const forma = formasPagamento.find((f) => f.id === novoPagamento.formaPagamentoId);
    if (!forma) {
      toast({ title: 'Escolha uma forma de pagamento', variant: 'destructive' });
      return;
    }

    const parcelas = Math.max(1, Math.min(forma.max_parcelas, parseInt(novoPagamento.parcelas, 10) || 1));

    setPagamentos([
      ...pagamentos,
      { formaPagamentoId: forma.id, descricao: forma.descricao, forma: forma.forma_enum, parcelas, valor },
    ]);
    setNovoPagamento({ formaPagamentoId: forma.id, parcelas: '1', valor: '' });
  };

  /** Botões de atalho: acha a forma cadastrada pelo nome. Se a loja
   * renomeou ou excluiu essa forma específica, o botão correspondente
   * simplesmente não aparece (ver render) em vez de quebrar com uma forma
   * inexistente. */
  const acharFormaPorNome = (nome: string) =>
    formasPagamento.find((f) => f.descricao.toLowerCase() === nome.toLowerCase());

  const pagarComForma = (nome: string) => {
    const forma = acharFormaPorNome(nome);
    if (!forma) return;
    setPagamentos([
      { formaPagamentoId: forma.id, descricao: forma.descricao, forma: forma.forma_enum, parcelas: 1, valor: total },
    ]);
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
      // Perfil vem de useAuth() (já carregado no login, do usuário certo) —
      // não refaz consulta em `profiles`. A consulta antiga (`.select().single()`
      // sem filtrar por usuário) trazia QUALQUER perfil do tenant e quebrava
      // com "Tenant não encontrado" assim que a loja tivesse 2+ usuários,
      // porque `.single()` falha se vier mais de uma linha.
      const tenantId = user?.profile?.tenant_id ?? null;
      const vendedorId = user?.id ?? null;
      if (!tenantId || !vendedorId) throw new Error('Tenant não encontrado');

      // Create sale
      const { data: venda, error: vendaError } = await supabase
        .from('vendas')
        .insert({
          tenant_id: tenantId,
          cliente_id: selectedCliente?.id || null,
          vendedor_id: vendedorId,
          status: 'pago',
          subtotal: subtotalBruto,
          descontos: descontoValor,
          total,
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
          forma_pagamento_id: p.formaPagamentoId,
          parcelas: p.parcelas,
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
      setDesconto('');
      setSelectedCliente(null);
      setClienteSearch('');
      setShowCheckout(false);
      fetchProdutos();
    } catch (error) {
      console.error('Error:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao finalizar venda',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
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
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Carrinho</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="max-w-[11rem]"
                onClick={() => setShowClienteDialog(true)}
              >
                <User className="mr-2 h-4 w-4" />
                {/* Nome comprido não pode empurrar o botão de cadastrar
                    pra fora do cabeçalho do carrinho. */}
                <span className="truncate">{selectedCliente?.nome || 'Cliente'}</span>
              </Button>
              {podeCadastrarCliente && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  title="Cadastrar cliente novo"
                  aria-label="Cadastrar cliente novo"
                  onClick={abrirNovoClienteDialog}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              )}
            </div>
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
          {podeDarDesconto && (
            <div className="flex items-center justify-between gap-2 mb-3">
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
                onChange={e => setDesconto(e.target.value)}
                className="w-28 h-8 text-right"
              />
            </div>
          )}
          {descontoValor > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-1">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotalBruto)}</span>
            </div>
          )}
          {descontoValor > 0 && (
            <div className="flex items-center justify-between text-sm text-destructive mb-1">
              <span>Desconto</span>
              <span>-{formatCurrency(descontoValor)}</span>
            </div>
          )}
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
                  setClienteSearch('');
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
                    // Busca resolvida: zera o filtro pra não sobrar texto
                    // velho na próxima abertura nem no cadastro rápido,
                    // que aproveita o que foi digitado aqui.
                    setClienteSearch('');
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

      {/* Dialog de cadastro rápido de cliente */}
      <Dialog open={showNovoClienteDialog} onOpenChange={setShowNovoClienteDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Cadastro rápido de cliente</DialogTitle>
            <DialogDescription>
              Só o essencial pra não travar a fila. O cadastro completo fica em
              Cadastros &gt; Clientes e pode ser preenchido depois.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="novo-cliente-nome">Nome *</Label>
              <Input
                id="novo-cliente-nome"
                value={novoCliente.nome}
                onChange={e => setNovoCliente({ ...novoCliente, nome: e.target.value })}
                placeholder="Nome do cliente"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="novo-cliente-telefone">Telefone (opcional)</Label>
              <Input
                id="novo-cliente-telefone"
                value={novoCliente.telefone}
                onChange={e => setNovoCliente({ ...novoCliente, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovoClienteDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarNovoCliente} disabled={salvandoCliente}>
              {salvandoCliente ? 'Salvando...' : 'Cadastrar e usar na venda'}
            </Button>
          </DialogFooter>
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
            {/* Payment methods — vem do cadastro de Formas de Pagamento
                (Cadastros > Formas de Pagamento), não de uma lista fixa. */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Adicionar Pagamento</label>
              <div className="flex gap-2">
                <Select
                  value={novoPagamento.formaPagamentoId}
                  onValueChange={selecionarFormaPagamento}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Forma" />
                  </SelectTrigger>
                  <SelectContent>
                    {formasPagamento.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.descricao}
                        {f.contem_taxa ? ` (taxa ${f.taxa_percent}%)` : ''}
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
              {(() => {
                const formaSelecionada = formasPagamento.find((f) => f.id === novoPagamento.formaPagamentoId);
                if (!formaSelecionada || formaSelecionada.max_parcelas <= 1) return null;
                return (
                  <div className="flex items-center gap-2">
                    <label htmlFor="parcelas" className="text-sm text-muted-foreground">
                      Parcelas
                    </label>
                    <Input
                      id="parcelas"
                      type="number"
                      min={1}
                      max={formaSelecionada.max_parcelas}
                      value={novoPagamento.parcelas}
                      onChange={e => setNovoPagamento({ ...novoPagamento, parcelas: e.target.value })}
                      className="w-20 h-8"
                    />
                    <span className="text-xs text-muted-foreground">
                      até {formaSelecionada.max_parcelas}x
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Quick payment buttons — atalho pras 3 formas mais comuns,
                achadas pelo nome no cadastro. Some sozinho se a loja
                renomeou/excluiu a forma correspondente. */}
            <div className="flex gap-2">
              {acharFormaPorNome('PIX') && (
                <Button variant="outline" className="flex-1" onClick={() => pagarComForma('PIX')}>
                  <QrCode className="mr-2 h-4 w-4" />
                  PIX Total
                </Button>
              )}
              {acharFormaPorNome('Dinheiro') && (
                <Button variant="outline" className="flex-1" onClick={() => pagarComForma('Dinheiro')}>
                  <Banknote className="mr-2 h-4 w-4" />
                  Dinheiro
                </Button>
              )}
              {acharFormaPorNome('Cartão Crédito') && (
                <Button variant="outline" className="flex-1" onClick={() => pagarComForma('Cartão Crédito')}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Cartão
                </Button>
              )}
            </div>

            {/* Payment list */}
            {pagamentos.length > 0 && (
              <div className="space-y-2">
                {pagamentos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-muted">
                    <span>
                      {p.descricao}
                      {p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}
                    </span>
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
