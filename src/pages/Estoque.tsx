import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  MoreHorizontal,
  Package,
  Eye,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
import { PRODUTO_CATEGORIAS, PRODUTO_LOCALIZACOES } from '@/lib/constants';
import { FiltrosProdutos } from '@/components/produtos/FiltrosProdutos';
import { FILTROS_PRODUTOS_VAZIO, aplicarFiltrosProdutos, type FiltrosProdutosValores } from '@/lib/filtrosProdutos';

type ProdutoCategoria = "celular" | "acessorio" | "peca" | "servico";
type ProdutoLocalizacao = "vitrine" | "deposito" | "bancada" | "sucata";

interface Produto {
  id: string;
  nome: string;
  codigo_barra: string | null;
  imei_serial: string | null;
  marca: string | null;
  modelo: string | null;
  grupo_produto_id: string | null;
  marca_id: string | null;
  modelo_id: string | null;
  cor_id: string | null;
  condicao_id: string | null;
  memoria_id: string | null;
  categoria: ProdutoCategoria;
  // vw_produtos devolve estas duas como null pra quem não tem
  // inventory.cost.view (Opção B) — nunca assumir preenchido.
  custo: number | null;
  preco: number;
  margem_percent: number | null;
  estoque_atual: number;
  estoque_minimo: number;
  localizacao: ProdutoLocalizacao;
  ativo: boolean;
  created_at: string;
}

/**
 * Lista de produtos. Editar (todas as informações, catálogo, movimentações)
 * mora em `/estoque/:id` (`EstoqueDetalhe.tsx`) desde 10/08 — pedido do
 * Felipe, com o sistema antigo como referência: "editar produto" precisa de
 * uma tela própria, não um Dialog pequeno. O Dialog aqui só cadastra produto
 * novo do zero (corte de escopo deliberado — a reclamação era sobre editar).
 */
export default function Estoque() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, can } = useAuth();
  // Vendedor e Técnico têm inventory.view mas não inventory.cost.view —
  // as colunas de custo/margem precisam sumir da tela pra eles, não só
  // vir vazias (a view já devolve null; a tela decide o resto).
  const vecusto = can(PERMISSIONS.INVENTORY_COST_VIEW);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  // Padrão continua "Apto à Venda: Sim" — não muda o que todo mundo já está
  // acostumado a ver ao abrir a tela. FILTROS_PRODUTOS_VAZIO (o que "Limpar
  // filtros" restaura) fica com 'todos' de propósito: limpar filtro tem que
  // mostrar TUDO, senão "limpar" continuaria sendo um filtro escondido.
  const [filtros, setFiltros] = useState<FiltrosProdutosValores>({
    ...FILTROS_PRODUTOS_VAZIO,
    aptoVenda: 'sim',
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    codigo_barra: '',
    imei_serial: '',
    marca: '',
    modelo: '',
    categoria: 'acessorio' as ProdutoCategoria,
    custo: '',
    preco: '',
    estoque_atual: '',
    estoque_minimo: '1',
    localizacao: 'deposito' as ProdutoLocalizacao,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProdutos();
  }, []);

  const fetchProdutos = async () => {
    try {
      // Busca ativos e inativos numa chamada só — quem decide o que mostrar
      // é o filtro "Apto à Venda" no painel (mesmo padrão do CampoCatalogo
      // com itens desativados: não esconder de quem precisa achar).
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('*')
        .order('nome');

      if (error) throw error;
      setProdutos(data || []);
    } catch (error) {
      console.error('Error fetching produtos:', error);
      toast({
        title: 'Erro ao carregar produtos',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setFormData({
      nome: '',
      codigo_barra: '',
      imei_serial: '',
      marca: '',
      modelo: '',
      categoria: 'acessorio',
      custo: '',
      preco: '',
      estoque_atual: '',
      estoque_minimo: '1',
      localizacao: 'deposito',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do produto.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      // Perfil vem de useAuth() — não refaz consulta em `profiles` sem
      // filtrar por usuário (isso quebrava com "Tenant não encontrado"
      // assim que a loja tivesse 2+ usuários, ver PDV.tsx pro mesmo fix).
      const tenantId = user?.profile?.tenant_id ?? null;

      if (!tenantId) {
        throw new Error('Tenant não encontrado');
      }

      const { error } = await supabase.from('produtos').insert({
        nome: formData.nome.trim(),
        codigo_barra: formData.codigo_barra.trim() || null,
        imei_serial: formData.imei_serial.trim() || null,
        marca: formData.marca.trim() || null,
        modelo: formData.modelo.trim() || null,
        categoria: formData.categoria,
        custo: parseFloat(formData.custo) || 0,
        preco: parseFloat(formData.preco) || 0,
        estoque_atual: parseInt(formData.estoque_atual) || 0,
        estoque_minimo: parseInt(formData.estoque_minimo) || 1,
        localizacao: formData.localizacao,
        tenant_id: tenantId,
      });

      if (error) throw error;

      toast({
        title: 'Produto cadastrado!',
        description: 'O produto foi adicionado com sucesso. Marca, modelo e demais catálogos podem ser completados na ficha do produto.',
      });

      setDialogOpen(false);
      fetchProdutos();
    } catch (error) {
      console.error('Error saving produto:', error);
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
      const { error } = await supabase
        .from('produtos')
        .update({ ativo: false })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Produto excluído',
        description: 'O produto foi removido.',
      });

      fetchProdutos();
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const filteredProdutos = aplicarFiltrosProdutos(produtos, filtros);

  const criticalStock = produtos.filter(p => p.ativo && p.estoque_atual <= p.estoque_minimo).length;
  // Inativo + sem preço é a marca de quem entrou por troca no PDV e ainda não
  // foi revisado. Inativo sozinho não basta: "Excluir" também zera `ativo`,
  // e produto excluído de propósito não devia contar como "esperando alguém".
  const aguardandoRevisao = produtos.filter(p => !p.ativo && p.preco === 0).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Estoque</h1>
          <p className="text-muted-foreground">
            Gerencie seus produtos e peças
          </p>
        </div>
        <Button onClick={handleOpenDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Produto
        </Button>
      </div>

      {/* Alert for critical stock */}
      {criticalStock > 0 && (
        <Card className="border-warning bg-warning/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <div>
              <p className="font-medium text-warning">Estoque Crítico</p>
              <p className="text-sm text-muted-foreground">
                {criticalStock} produto(s) abaixo do estoque mínimo
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Produto que entrou inativo (ex.: recebido em troca no PDV) e ainda
          não foi revisado/precificado — some da lista padrão de propósito,
          então precisa de um aviso que leve direto pra ele, senão fica
          "perdido" no banco sem ninguém saber onde procurar. */}
      {aguardandoRevisao > 0 && filtros.aptoVenda !== 'nao' && (
        <Card
          className="border-primary/40 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
          onClick={() => setFiltros({ ...filtros, aptoVenda: 'nao' })}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <Package className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-primary">Aguardando revisão</p>
              <p className="text-sm text-muted-foreground">
                {aguardandoRevisao} produto(s) inativo(s) — provavelmente recebido(s) em troca no PDV. Clique pra ver e definir o preço.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <FiltrosProdutos valores={filtros} onChange={setFiltros} resultados={filteredProdutos.length} />

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredProdutos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="rounded-full bg-muted p-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="mt-4 text-lg font-medium">Nenhum produto encontrado</p>
              <p className="text-muted-foreground">Tente ajustar os filtros</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  {vecusto && <TableHead className="text-right">Custo</TableHead>}
                  <TableHead className="text-right">Preço</TableHead>
                  {vecusto && <TableHead className="text-right">Margem</TableHead>}
                  <TableHead className="text-center">Estoque</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProdutos.map(produto => {
                  const isLowStock = produto.estoque_atual <= produto.estoque_minimo;
                  return (
                    <TableRow
                      key={produto.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/estoque/${produto.id}`)}
                    >
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{produto.nome}</p>
                            {!produto.ativo && produto.preco === 0 && (
                              <Badge variant="outline" className="text-[10px] text-primary border-primary/40">
                                Aguardando revisão
                              </Badge>
                            )}
                            {!produto.ativo && produto.preco > 0 && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Inativo
                              </Badge>
                            )}
                          </div>
                          {(produto.marca || produto.modelo) && (
                            <p className="text-sm text-muted-foreground">
                              {[produto.marca, produto.modelo].filter(Boolean).join(' ')}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PRODUTO_CATEGORIAS[produto.categoria]?.label || produto.categoria}
                        </Badge>
                      </TableCell>
                      {vecusto && (
                        <TableCell className="text-right">
                          {produto.custo != null ? formatCurrency(produto.custo) : '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium">
                        {formatCurrency(produto.preco)}
                      </TableCell>
                      {vecusto && (
                        <TableCell className="text-right">
                          {produto.margem_percent != null ? (
                            <span className={produto.margem_percent > 0 ? 'text-success' : 'text-destructive'}>
                              {produto.margem_percent.toFixed(1)}%
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        <Badge variant={isLowStock ? 'destructive' : 'secondary'}>
                          {isLowStock && <AlertTriangle className="mr-1 h-3 w-3" />}
                          {produto.estoque_atual}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {PRODUTO_LOCALIZACOES[produto.localizacao]?.label || produto.localizacao}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/estoque/${produto.id}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Ver ficha completa
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(produto.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog — só cadastro do zero. Editar (catálogo, apto à venda,
          observações, movimentações) é a ficha em /estoque/:id. */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Novo Produto</DialogTitle>
            <DialogDescription>
              Preencha os dados para cadastrar um novo produto. Marca, modelo, cor, condição e memória do catálogo podem ser completados depois, na ficha do produto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={e => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Nome do produto"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marca">Marca</Label>
                <Input
                  id="marca"
                  value={formData.marca}
                  onChange={e => setFormData({ ...formData, marca: e.target.value })}
                  placeholder="Apple, Samsung..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modelo">Modelo</Label>
                <Input
                  id="modelo"
                  value={formData.modelo}
                  onChange={e => setFormData({ ...formData, modelo: e.target.value })}
                  placeholder="iPhone 14, Galaxy S23..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="codigo_barra">Código de Barras</Label>
                <Input
                  id="codigo_barra"
                  value={formData.codigo_barra}
                  onChange={e => setFormData({ ...formData, codigo_barra: e.target.value })}
                  placeholder="EAN/UPC"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imei_serial">IMEI/Serial</Label>
                <Input
                  id="imei_serial"
                  value={formData.imei_serial}
                  onChange={e => setFormData({ ...formData, imei_serial: e.target.value })}
                  placeholder="IMEI ou número de série"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria</Label>
                <Select
                  value={formData.categoria}
                  onValueChange={value => setFormData({ ...formData, categoria: value as ProdutoCategoria })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRODUTO_CATEGORIAS).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="localizacao">Localização</Label>
                <Select
                  value={formData.localizacao}
                  onValueChange={value => setFormData({ ...formData, localizacao: value as ProdutoLocalizacao })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRODUTO_LOCALIZACOES).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="custo">Custo (R$)</Label>
                <Input
                  id="custo"
                  type="number"
                  step="0.01"
                  value={formData.custo}
                  onChange={e => setFormData({ ...formData, custo: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preco">Preço (R$)</Label>
                <Input
                  id="preco"
                  type="number"
                  step="0.01"
                  value={formData.preco}
                  onChange={e => setFormData({ ...formData, preco: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Margem</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted px-3">
                  {(() => {
                    const custo = parseFloat(formData.custo) || 0;
                    const preco = parseFloat(formData.preco) || 0;
                    const margem = custo > 0 ? ((preco - custo) / custo * 100) : 0;
                    return (
                      <span className={margem > 0 ? 'text-success' : 'text-destructive'}>
                        {margem.toFixed(1)}%
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="estoque_atual">Estoque Atual</Label>
                <Input
                  id="estoque_atual"
                  type="number"
                  value={formData.estoque_atual}
                  onChange={e => setFormData({ ...formData, estoque_atual: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estoque_minimo">Estoque Mínimo</Label>
                <Input
                  id="estoque_minimo"
                  type="number"
                  value={formData.estoque_minimo}
                  onChange={e => setFormData({ ...formData, estoque_minimo: e.target.value })}
                  placeholder="1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
