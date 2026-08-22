import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  UserPlus,
  Ban,
  CreditCard,
  Banknote,
  QrCode,
  Check,
  X,
  Repeat,
  AlertTriangle,
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
import { ToastAction } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';
import { ClienteFormDialog } from '@/components/clientes/ClienteFormDialog';
import { CampoCatalogo } from '@/components/CampoCatalogo';
import { useCatalogo } from '@/hooks/useCatalogos';
import type { Cliente as ClienteCompleto } from '@/hooks/useClientes';
import { soDigitos } from '@/lib/documento';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { moeda as formatCurrency } from '@/lib/format';

type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;

interface Produto {
  id: string;
  nome: string;
  preco: number;
  estoque_atual: number;
  imei_serial: string | null;
  codigo_barra: string | null;
  // Ids de catálogo — servem só pra filtrar a busca (Categoria/Marca/Cor/
  // Condição/Memória), a mesma "ficha completa" que EstoqueDetalhe.tsx usa
  // pra cadastrar o produto.
  grupo_produto_id: string | null;
  marca_id: string | null;
  cor_id: string | null;
  condicao_id: string | null;
  memoria_id: string | null;
}

interface CartItem {
  produto: Produto;
  quantidade: number;
  /** Vendedor avisou o cliente que ESTE item tem defeito conhecido — vira a
   * coluna "Defeito?" do comprovante. Falso por padrão: a maioria dos itens
   * não tem ressalva nenhuma. */
  defeitoDeclarado: boolean;
}

interface Cliente {
  id: string;
  nome: string;
  telefones: string[] | null;
  /** Falso = a loja bloqueou este cliente. O banco recusa a venda também. */
  liberado_venda: boolean | null;
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

/**
 * Produto usado recebido como parte do pagamento (ex.: cliente dá o PS4 dele
 * na troca por um PS5 novo). Fica só em memória até o checkout de fato —
 * mesmo padrão do carrinho e dos pagamentos. No checkout, a RPC
 * `registrar_entrada_produto_troca` cria o produto (inativo, até alguém
 * revisar e precificar), grava o valor como pagamento (forma `vale_troca`) e
 * guarda o rastreio até esta venda e o cliente dela.
 */
interface EntradaProdutoTroca {
  nome: string;
  grupoProdutoId: string;
  marcaId: string;
  modeloId: string;
  corId: string;
  condicaoId: string;
  memoriaId: string;
  imeiSerial: string;
  valorEntrada: number;
}

const ENTRADA_PRODUTO_VAZIA = {
  nome: '',
  grupoProdutoId: '',
  marcaId: '',
  modeloId: '',
  corId: '',
  condicaoId: '',
  memoriaId: '',
  imeiSerial: '',
  valorEntrada: '',
};

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
  const [entradasProduto, setEntradasProduto] = useState<EntradaProdutoTroca[]>([]);
  const [novaEntrada, setNovaEntrada] = useState(ENTRADA_PRODUTO_VAZIA);
  const [showEntradaProduto, setShowEntradaProduto] = useState(false);
  const [desconto, setDesconto] = useState('');
  // De onde a venda veio (Balcão/Site/WhatsApp/...) — catálogo "origem_venda"
  // em Listas do Sistema, órfão desde que foi criado (existia cadastro, mas
  // `vendas` nunca teve coluna pra guardar). Pré-seleciona o item marcado como
  // padrão (Balcão) assim que o catálogo carrega — quem vende no balcão não
  // deveria precisar escolher nada na maioria das vezes.
  const catalogoOrigemVenda = useCatalogo('origem_venda');
  const [origemVendaId, setOrigemVendaId] = useState('');

  // Filtros de busca de produto — "Categoria" usa o catálogo grupo_produto
  // (Console/Jogo/Controle/Celular/...), que é o que a loja de verdade
  // enxerga como categoria; a coluna categoria (enum fixo) é mais genérica
  // e não aparece aqui. Pedido do Felipe (17/08), testando o PDV: achar
  // produto só pelo nome não bastava quando a vitrine cresce.
  const catalogoCategoria = useCatalogo('grupo_produto');
  const catalogoMarcaProduto = useCatalogo('marca');
  const catalogoCorProduto = useCatalogo('cor');
  const catalogoCondicaoProduto = useCatalogo('condicao');
  const catalogoMemoriaProduto = useCatalogo('memoria');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroCor, setFiltroCor] = useState('');
  const [filtroCondicao, setFiltroCondicao] = useState('');
  const [filtroMemoria, setFiltroMemoria] = useState('');
  const [precoMin, setPrecoMin] = useState('');
  const [precoMax, setPrecoMax] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showClienteDialog, setShowClienteDialog] = useState(false);
  const [showNovoClienteDialog, setShowNovoClienteDialog] = useState(false);
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

  // Idem pra Origem da Venda: pré-seleciona o item marcado como padrão
  // (Balcão) assim que o catálogo carrega.
  //
  // Só dispara UMA vez (guardado pela ref, não reage a `origemVendaId`).
  // Reagir a `origemVendaId` faria o efeito brigar com "Limpar seleção" do
  // próprio CampoCatalogo: o vendedor limpa, o campo fica vazio, o efeito vê
  // o vazio e repõe o padrão na mesma renderização — a limpeza nunca
  // aconteceria de verdade. O reset pós-venda (abaixo) já cuida de repor o
  // padrão a cada venda nova, sem depender deste efeito rodar de novo.
  const origemVendaPreSelecionada = useRef(false);
  useEffect(() => {
    if (origemVendaPreSelecionada.current) return;
    if (!catalogoOrigemVenda.data?.length) return;
    const padrao = catalogoOrigemVenda.data.find((i) => i.padrao) ?? catalogoOrigemVenda.data[0];
    if (padrao) {
      setOrigemVendaId(padrao.id);
      origemVendaPreSelecionada.current = true;
    }
  }, [catalogoOrigemVenda.data]);

  /**
   * Avisa que uma busca do PDV falhou, em vez de deixar a lista vazia.
   *
   * Achado em 11/08, resgatado em 20/08, corrigido em 21/08: as 9 consultas
   * desta tela ignoravam o erro por completo. Se o banco engasgasse por um
   * instante, `data` vinha nulo, a lista virava `[]` e a tela ficava
   * idêntica a "não tem nada cadastrado". Quem está no balcão não tem como
   * distinguir uma coisa da outra — e as duas levam a decisões opostas:
   * "não tem esse produto em estoque" faz perder a venda, "não achei o
   * cliente" faz cadastrar de novo alguém que já existe (justamente o que a
   * regra de cliente único tenta evitar).
   *
   * O aviso é um toast destrutivo, e não um texto fixo na lista, porque
   * esta tela não tem estado de "lista vazia" pra escrever em cima: o PDV
   * simplesmente não desenha nada quando não há produto. Trocar isso é
   * mudança maior de layout; o aviso já resolve o silêncio, que era o
   * problema.
   */
  const avisarFalhaDeBusca = (oQue: string, erro: unknown) => {
    console.error(`PDV: falha ao buscar ${oQue}`, erro);
    toast({
      title: `Não consegui carregar ${oQue}`,
      description:
        'A lista pode estar incompleta. Verifique a internet e atualize a página antes de continuar a venda.',
      variant: 'destructive',
    });
  };

  const fetchProdutos = async () => {
    const { data, error } = await supabase
      .from('vw_produtos')
      .select(
        'id, nome, preco, estoque_atual, imei_serial, codigo_barra, grupo_produto_id, marca_id, cor_id, condicao_id, memoria_id'
      )
      .eq('ativo', true)
      .gt('estoque_atual', 0)
      .order('nome');
    if (error) {
      avisarFalhaDeBusca('os produtos', error);
      return;
    }
    setProdutos(data || []);
  };

  const fetchClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome, telefones, liberado_venda')
      .eq('ativo', true)
      .order('nome');
    if (error) {
      avisarFalhaDeBusca('os clientes', error);
      return;
    }
    setClientes(data || []);
  };

  const fetchFormasPagamento = async () => {
    const { data, error } = await supabase
      .from('formas_pagamento')
      .select('id, descricao, forma_enum, max_parcelas, contem_taxa, taxa_percent')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .order('descricao', { ascending: true });
    if (error) {
      // Esta é a mais grave das três: sem forma de pagamento não dá pra
      // fechar venda nenhuma, e sem aviso o vendedor fica olhando uma
      // lista vazia achando que ninguém cadastrou forma de pagamento.
      avisarFalhaDeBusca('as formas de pagamento', error);
      return;
    }
    setFormasPagamento((data ?? []) as FormaPagamentoCadastro[]);
  };

  const abrirNovoClienteDialog = () => setShowNovoClienteDialog(true);

  /**
   * Vincula o cliente à venda.
   *
   * Cliente bloqueado é recusado aqui e também pelo banco (gatilho
   * `trg_venda_cliente_bloqueado`). A checagem na tela existe pra o vendedor
   * descobrir agora, e não depois de montar o carrinho inteiro.
   */
  const selecionarCliente = (cliente: Cliente) => {
    if (cliente.liberado_venda === false) {
      toast({
        title: 'Cliente bloqueado',
        description: `${cliente.nome} está bloqueado para venda. Libere na ficha dele em Cadastros > Clientes.`,
        variant: 'destructive',
      });
      return;
    }

    setSelectedCliente(cliente);
    // Busca resolvida: zera o filtro pra não sobrar texto velho na próxima
    // abertura nem no cadastro rápido, que aproveita o que foi digitado aqui.
    setClienteSearch('');
    setShowClienteDialog(false);
  };

  /**
   * Cliente recém-cadastrado no meio da venda: entra na lista em memória (na
   * ordem certa, sem nova ida ao banco) e já fica vinculado à venda.
   */
  const aoCadastrarCliente = (salvo: ClienteCompleto) => {
    const novo: Cliente = {
      id: salvo.id,
      nome: salvo.nome,
      telefones: salvo.telefones,
      liberado_venda: salvo.liberado_venda,
    };
    setClientes((atuais) =>
      [...atuais, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    );
    selecionarCliente(novo);
  };

  /**
   * O formulário achou um cadastro que já existia e o vendedor escolheu usá-lo.
   * Decisão de 08/08: um cliente, um cadastro — a venda segue com o que existe.
   */
  const aoUsarClienteExistente = async (id: string) => {
    const jaCarregado = clientes.find((c) => c.id === id);
    if (jaCarregado) {
      selecionarCliente(jaCarregado);
      return;
    }

    // Cadastrado em outro terminal depois desta tela abrir: busca a ficha
    // antes de vincular, senão não dá pra saber se está bloqueado.
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome, telefones, liberado_venda')
      .eq('id', id)
      .single();

    if (error) {
      // Sem a ficha não dá pra saber se o cliente está bloqueado pra venda.
      // Vincular assim mesmo esconderia o bloqueio até o banco recusar lá
      // na frente, com a venda montada.
      avisarFalhaDeBusca('a ficha do cliente', error);
      return;
    }

    if (data) {
      setClientes((atuais) =>
        [...atuais, data].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      );
      selecionarCliente(data);
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
      setCart([...cart, { produto, quantidade: 1, defeitoDeclarado: false }]);
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
                description: `Apenas ${item.produto.estoque_atual} unidades disponíveis`,
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

  const toggleDefeitoDeclarado = (produtoId: string) => {
    setCart(
      cart.map((item) =>
        item.produto.id === produtoId
          ? { ...item, defeitoDeclarado: !item.defeitoDeclarado }
          : item
      )
    );
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

  const totalEntradaProdutos = entradasProduto.reduce((acc, e) => acc + e.valorEntrada, 0);
  // Produto recebido em troca conta como pagamento (mesma ideia do vale_troca
  // que a venda vai gravar) — por isso soma aqui, na mesma conta de "quanto já
  // foi pago", em vez de abater do total como se fosse desconto.
  const totalPago = pagamentos.reduce((acc, p) => acc + p.valor, 0) + totalEntradaProdutos;
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
    // Achado na revisão de 18/08: antes isto fazia `setPagamentos([{ valor: total }])` —
    // trocava a lista INTEIRA por um pagamento só do valor cheio, apagando
    // qualquer pagamento que já tivesse sido lançado à mão (ex.: cliente pagou
    // metade em dinheiro e o resto no cartão — clicar no atalho "PIX Total"
    // apagava o dinheiro já lançado e registrava a venda inteira como PIX).
    // Agora soma ao que já foi pago (dinheiro lançado + produto de entrada em
    // troca) e lança só o que falta, igual o botão manual "Adicionar" já faz.
    const restante = total - totalPago;
    if (restante <= 0) return;
    setPagamentos([
      ...pagamentos,
      { formaPagamentoId: forma.id, descricao: forma.descricao, forma: forma.forma_enum, parcelas: 1, valor: restante },
    ]);
  };

  const removePagamento = (index: number) => {
    setPagamentos(pagamentos.filter((_, i) => i !== index));
  };

  const addEntradaProduto = () => {
    if (!novaEntrada.nome.trim()) {
      toast({ title: 'Descreva o produto recebido', variant: 'destructive' });
      return;
    }
    const valor = parseFloat(novaEntrada.valorEntrada);
    if (!valor || valor <= 0) {
      toast({ title: 'Informe o valor de entrada', variant: 'destructive' });
      return;
    }
    setEntradasProduto([...entradasProduto, { ...novaEntrada, nome: novaEntrada.nome.trim(), valorEntrada: valor }]);
    setNovaEntrada(ENTRADA_PRODUTO_VAZIA);
    setShowEntradaProduto(false);
  };

  const removeEntradaProduto = (index: number) => {
    setEntradasProduto(entradasProduto.filter((_, i) => i !== index));
  };

  /**
   * Fecha o diálogo de pagamento DESCARTANDO o que foi montado nele.
   *
   * Achado em 11/08, resgatado em 20/08: cancelar só escondia a janela.
   * Pagamento já lançado e produto recebido em troca continuavam guardados,
   * e reapareciam na próxima vez que alguém abrisse "Finalizar Venda" —
   * inclusive para OUTRO cliente. Uma venda podia fechar com forma de
   * pagamento ou produto de troca que não eram daquele atendimento, e o
   * produto de troca entra no estoque, então o erro não ficaria só na tela.
   *
   * Carrinho, cliente e desconto NÃO são limpos de propósito: quem cancela
   * quase sempre quer voltar e corrigir justamente o carrinho.
   */
  const cancelarCheckout = () => {
    setPagamentos([]);
    setEntradasProduto([]);
    setNovaEntrada(ENTRADA_PRODUTO_VAZIA);
    setShowEntradaProduto(false);
    setShowCheckout(false);
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
    const produtosDeTroca: string[] = [];

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
          origem_venda_id: origemVendaId || null,
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
          defeito_declarado: item.defeitoDeclarado,
        }));

        const { error: itensError } = await supabase
          .from('itens_venda')
          .insert(itensVenda);

        if (itensError) throw itensError;

        // Produto(s) recebido(s) em troca ANTES dos pagamentos normais —
        // ordem importa, não é só estilo. A RPC cria o produto (inativo),
        // grava o valor como pagamento (forma vale_troca) e o rastreio até
        // esta venda, numa chamada só. SECURITY DEFINER porque o vendedor
        // não tem `inventory.create` — um INSERT direto em `produtos` pelo
        // front seria recusado pela RLS.
        //
        // Achado na revisão de 20/08: o gatilho `lancar_pagamentos_venda_no_caixa`
        // (migration 20260818100000) calcula o troco somando TODOS os
        // `pagamentos_venda` já gravados pra esta venda no momento em que
        // cada INSERT roda — e ele reage por INSTRUÇÃO SQL, não por venda
        // inteira. Cada chamada RPC aqui é uma instrução separada do INSERT
        // em lote logo abaixo. Se o lote (dinheiro/cartão/PIX) fosse gravado
        // ANTES da entrada de troca, o gatilho calcularia o troco sem contar
        // o valor do produto trocado — subestimando o troco e, por causa
        // disso, lançando no Caixa dinheiro A MAIS do que realmente ficou na
        // gaveta (ex.: venda de R$100, cliente troca um usado de R$50 e paga
        // R$70 em dinheiro esperando R$20 de troco — o Caixa registraria
        // R$70 em vez dos R$50 líquidos). Uma trava de idempotência no
        // gatilho impede ele de se corrigir depois (só lança uma vez por
        // venda). Gravando a entrada de troca primeiro, o INSERT dos
        // pagamentos normais já enxerga o valor da troca somado e o troco
        // sai certo.
        for (const entrada of entradasProduto) {
          const { data: produtoIdCriado, error: entradaError } = await supabase.rpc('registrar_entrada_produto_troca', {
            _venda_id: venda.id,
            _nome: entrada.nome,
            // Os campos de catálogo são opcionais (o vendedor pode não saber
            // marca/modelo/cor na hora) — a função no banco já trata NULL
            // como válido (catalogo_e_do_tipo). O tipo gerado marca esses
            // parâmetros como string obrigatória só porque a RPC não tem
            // DEFAULT neles, não porque não aceitem NULL — por isso o cast
            // pontual em cada campo opcional, em vez de `any` no objeto todo.
            _grupo_produto_id: (entrada.grupoProdutoId || null) as unknown as string,
            _marca_id: (entrada.marcaId || null) as unknown as string,
            _modelo_id: (entrada.modeloId || null) as unknown as string,
            _cor_id: (entrada.corId || null) as unknown as string,
            _condicao_id: (entrada.condicaoId || null) as unknown as string,
            _memoria_id: (entrada.memoriaId || null) as unknown as string,
            _imei_serial: (entrada.imeiSerial.trim() || null) as unknown as string,
            _valor_entrada: entrada.valorEntrada,
          });

          if (entradaError) throw entradaError;
          if (produtoIdCriado) produtosDeTroca.push(produtoIdCriado as unknown as string);
        }

        // Create payments — depois da entrada de troca (ver comentário acima).
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
        variant: 'success',
        // Produto recebido em troca entra inativo, esperando alguém revisar
        // e definir o preço — sem este atalho, o único jeito de achar era
        // saber que existe o aviso "Aguardando revisão" em Estoque.
        action: produtosDeTroca.length > 0 ? (
          <ToastAction
            altText="Revisar produto recebido em troca"
            onClick={() => navigate(`/estoque/${produtosDeTroca[0]}`)}
          >
            Revisar produto
          </ToastAction>
        ) : undefined,
      });

      // Reset — origemVendaId NÃO reseta pro vazio, e sim de volta pro padrão
      // (Balcão): a próxima venda tem a mesma chance de ser balcão que esta.
      setCart([]);
      setPagamentos([]);
      setEntradasProduto([]);
      setNovaEntrada(ENTRADA_PRODUTO_VAZIA);
      setShowEntradaProduto(false);
      setDesconto('');
      setSelectedCliente(null);
      setClienteSearch('');
      setShowCheckout(false);
      const padrao = catalogoOrigemVenda.data?.find((i) => i.padrao);
      setOrigemVendaId(padrao?.id ?? '');
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

  // Busca por nome, IMEI/série ou código de barras — assim um leitor de
  // código de barras (que só "digita" no campo focado e aperta Enter)
  // encontra o produto igual a digitar o nome, sem precisar trocar de
  // campo. `soDigitos` nos dois lados: código de barras com ou sem
  // espaço/traço bate igual.
  const buscaLower = search.trim().toLowerCase();
  const buscaDigitos = soDigitos(search);
  const filteredProdutos = produtos.filter((p) => {
    const bateBusca =
      !buscaLower ||
      p.nome.toLowerCase().includes(buscaLower) ||
      (p.imei_serial ?? '').toLowerCase().includes(buscaLower) ||
      (buscaDigitos.length > 0 && soDigitos(p.codigo_barra).includes(buscaDigitos));
    if (!bateBusca) return false;

    if (filtroCategoria && p.grupo_produto_id !== filtroCategoria) return false;
    if (filtroMarca && p.marca_id !== filtroMarca) return false;
    if (filtroCor && p.cor_id !== filtroCor) return false;
    if (filtroCondicao && p.condicao_id !== filtroCondicao) return false;
    if (filtroMemoria && p.memoria_id !== filtroMemoria) return false;

    const min = parseFloat(precoMin);
    if (!Number.isNaN(min) && p.preco < min) return false;
    const max = parseFloat(precoMax);
    if (!Number.isNaN(max) && p.preco > max) return false;

    return true;
  });

  const filtrosAtivos = [
    filtroCategoria, filtroMarca, filtroCor, filtroCondicao, filtroMemoria, precoMin, precoMax,
  ].filter(Boolean).length;

  const limparFiltros = () => {
    setFiltroCategoria('');
    setFiltroMarca('');
    setFiltroCor('');
    setFiltroCondicao('');
    setFiltroMemoria('');
    setPrecoMin('');
    setPrecoMax('');
  };

  // Busca por nome OU telefone: no balcão, o que a pessoa informa primeiro
  // costuma ser o número, não o nome completo. Ignora pontuação dos dois lados.
  const filteredClientes = clientes.filter((c) => {
    const termo = clienteSearch.trim().toLowerCase();
    if (!termo) return true;
    const digitos = soDigitos(termo);
    return (
      c.nome.toLowerCase().includes(termo) ||
      (digitos.length > 0 && (c.telefones ?? []).some((t) => soDigitos(t).includes(digitos)))
    );
  });

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
            placeholder="Buscar por nome, IMEI ou código de barras..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Sempre visível — pedido do Felipe (17/08): não esconder atrás de
            botão nenhum, é pra narrowing rápido enquanto atende no balcão. */}
        <div className="mb-4 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <FiltroCatalogo
              label="Categoria"
              valor={filtroCategoria}
              onChange={setFiltroCategoria}
              opcoes={catalogoCategoria.data ?? []}
            />
            <FiltroCatalogo
              label="Marca"
              valor={filtroMarca}
              onChange={setFiltroMarca}
              opcoes={catalogoMarcaProduto.data ?? []}
            />
            <FiltroCatalogo
              label="Cor"
              valor={filtroCor}
              onChange={setFiltroCor}
              opcoes={catalogoCorProduto.data ?? []}
            />
            <FiltroCatalogo
              label="Condição"
              valor={filtroCondicao}
              onChange={setFiltroCondicao}
              opcoes={catalogoCondicaoProduto.data ?? []}
            />
            <FiltroCatalogo
              label="Memória"
              valor={filtroMemoria}
              onChange={setFiltroMemoria}
              opcoes={catalogoMemoriaProduto.data ?? []}
            />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Preço</label>
              <div className="flex items-center gap-1">
                <Input
                  type="number" min={0} step="0.01" placeholder="De"
                  value={precoMin} onChange={(e) => setPrecoMin(e.target.value)}
                  className="h-9"
                />
                <Input
                  type="number" min={0} step="0.01" placeholder="Até"
                  value={precoMax} onChange={(e) => setPrecoMax(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            disabled={filtrosAtivos === 0}
            onClick={limparFiltros}
          >
            <X className="mr-2 h-4 w-4" />
            Limpar filtros
            {filtrosAtivos > 0 && (
              <Badge variant="secondary" className="ml-2">{filtrosAtivos}</Badge>
            )}
          </Button>
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
                    {/* Vira a coluna "Defeito?" do comprovante — desligado
                        por padrão, o vendedor liga quando avisa o cliente de
                        um defeito conhecido naquele item específico. */}
                    <button
                      type="button"
                      onClick={() => toggleDefeitoDeclarado(item.produto.id)}
                      className={
                        'mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ' +
                        (item.defeitoDeclarado
                          ? 'bg-amber-100 text-amber-700'
                          : 'text-muted-foreground hover:bg-muted')
                      }
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {item.defeitoDeclarado ? 'Com defeito declarado' : 'Sem defeito'}
                    </button>
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
              placeholder="Buscar por nome ou telefone..."
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
              {filteredClientes.map(cliente => {
                const bloqueado = cliente.liberado_venda === false;
                return (
                  <Button
                    key={cliente.id}
                    variant={selectedCliente?.id === cliente.id ? 'default' : 'outline'}
                    className="w-full justify-start"
                    onClick={() => selecionarCliente(cliente)}
                  >
                    {bloqueado ? (
                      <Ban className="mr-2 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <User className="mr-2 h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate">{cliente.nome}</span>
                    {cliente.telefones?.[0] && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {cliente.telefones[0]}
                      </span>
                    )}
                    {bloqueado && (
                      <Badge variant="destructive" className="ml-auto shrink-0 text-[10px]">
                        Bloqueado
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cadastro de cliente — o MESMO formulário de Cadastros > Clientes.
          Decisão do Felipe em 08/08: "não adianta ter uma informação de um
          lado e não ter do outro". Em vez de duas telas parecidas que vão
          divergir com o tempo, o PDV abre a de verdade. Só o nome é
          obrigatório, então quem está com fila continua salvando em dois
          segundos. */}
      <ClienteFormDialog
        open={showNovoClienteDialog}
        onOpenChange={setShowNovoClienteDialog}
        nomeInicial={clienteSearch.trim()}
        onSalvo={aoCadastrarCliente}
        onUsarExistente={aoUsarClienteExistente}
      />

      {/* Checkout Dialog */}
      <Dialog open={showCheckout} onOpenChange={(aberto) => (aberto ? setShowCheckout(true) : cancelarCheckout())}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Finalizar Venda</DialogTitle>
            <DialogDescription>
              Total: {formatCurrency(total)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Origem da venda — catálogo de Listas do Sistema, pré-marcado
                em "Balcão" (a maioria dos casos). Só precisa trocar quando o
                pedido veio de fora (Site, WhatsApp, Instagram, Shopee...). */}
            <CampoCatalogo
              tipo="origem_venda"
              label="Origem da venda"
              valor={origemVendaId}
              onChange={setOrigemVendaId}
              placeholder="Balcão"
              permiteCriar={false}
            />

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

            {/* Produto recebido em troca — cliente dá um usado como parte
                do pagamento (ex.: PS4 na troca por um PS5). Fica só em
                memória até "Confirmar Venda"; a RPC no checkout cria o
                produto, o pagamento e o rastreio numa chamada só. */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Produto recebido em troca</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Fechar sem cadastrar não pode deixar rascunho pra
                    // trás — senão "Adicionar" de novo reabre com os campos
                    // da tentativa anterior ainda preenchidos.
                    if (showEntradaProduto) setNovaEntrada(ENTRADA_PRODUTO_VAZIA);
                    setShowEntradaProduto((v) => !v);
                  }}
                >
                  <Repeat className="mr-2 h-4 w-4" />
                  {showEntradaProduto ? 'Cancelar' : 'Adicionar'}
                </Button>
              </div>

              {entradasProduto.length > 0 && (
                <div className="space-y-2">
                  {entradasProduto.map((e, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-muted">
                      <span className="truncate">{e.nome}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatCurrency(e.valorEntrada)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeEntradaProduto(i)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showEntradaProduto && (
                <div className="space-y-2 p-3 rounded-lg border">
                  <Input
                    placeholder="Descrição (ex.: PlayStation 4 Slim 500GB)"
                    value={novaEntrada.nome}
                    onChange={(e) => setNovaEntrada({ ...novaEntrada, nome: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <CampoCatalogo
                      tipo="grupo_produto"
                      label="Tipo"
                      valor={novaEntrada.grupoProdutoId}
                      onChange={(v) => setNovaEntrada({ ...novaEntrada, grupoProdutoId: v })}
                    />
                    <CampoCatalogo
                      tipo="condicao"
                      label="Condição"
                      valor={novaEntrada.condicaoId}
                      onChange={(v) => setNovaEntrada({ ...novaEntrada, condicaoId: v })}
                    />
                    <CampoCatalogo
                      tipo="marca"
                      label="Marca"
                      valor={novaEntrada.marcaId}
                      onChange={(v) => setNovaEntrada({ ...novaEntrada, marcaId: v })}
                    />
                    <CampoCatalogo
                      tipo="modelo"
                      label="Modelo"
                      valor={novaEntrada.modeloId}
                      onChange={(v) => setNovaEntrada({ ...novaEntrada, modeloId: v })}
                    />
                    <CampoCatalogo
                      tipo="cor"
                      label="Cor"
                      valor={novaEntrada.corId}
                      onChange={(v) => setNovaEntrada({ ...novaEntrada, corId: v })}
                    />
                    <CampoCatalogo
                      tipo="memoria"
                      label="Memória"
                      valor={novaEntrada.memoriaId}
                      onChange={(v) => setNovaEntrada({ ...novaEntrada, memoriaId: v })}
                    />
                  </div>
                  <Input
                    placeholder="Nº de série / IMEI (opcional)"
                    value={novaEntrada.imeiSerial}
                    onChange={(e) => setNovaEntrada({ ...novaEntrada, imeiSerial: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Valor de entrada (R$)"
                      value={novaEntrada.valorEntrada}
                      onChange={(e) => setNovaEntrada({ ...novaEntrada, valorEntrada: e.target.value })}
                      className="flex-1"
                    />
                    <Button onClick={addEntradaProduto}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Entra no estoque como inativo — alguém precisa revisar e definir o preço de revenda antes dele aparecer pra venda.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Summary */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Total da venda</span>
                <span className="font-medium">{formatCurrency(total)}</span>
              </div>
              {totalEntradaProdutos > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Entrada de produto</span>
                  <span>{formatCurrency(totalEntradaProdutos)}</span>
                </div>
              )}
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
            <Button variant="outline" onClick={cancelarCheckout}>
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

/**
 * Um `<Select>` de filtro por catálogo — Categoria/Marca/Cor/Condição/
 * Memória do painel de Filtros compartilham a mesma estrutura ("Todos" +
 * lista de itens ativos do catálogo). Diferente de `CampoCatalogo`: aqui não
 * dá pra cadastrar item novo (é só pra filtrar o que já existe) e o valor
 * vazio é um estado de verdade ("Todos"), não "nada selecionado ainda".
 */
function FiltroCatalogo({
  label,
  valor,
  onChange,
  opcoes,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: { id: string; descricao: string; ativo: boolean }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select value={valor || 'todos'} onValueChange={(v) => onChange(v === 'todos' ? '' : v)}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos</SelectItem>
          {opcoes
            .filter((o) => o.ativo)
            .map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.descricao}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
