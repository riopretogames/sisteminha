import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  MoreHorizontal,
  Package,
  Edit,
  Trash2,
  AlertTriangle,
  ArrowUpDown,
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PRODUTO_CATEGORIAS, PRODUTO_LOCALIZACOES } from '@/lib/constants';

type ProdutoCategoria = "celular" | "acessorio" | "peca" | "servico";
type ProdutoLocalizacao = "vitrine" | "deposito" | "bancada" | "sucata";

interface Produto {
  id: string;
  nome: string;
  codigo_barra: string | null;
  imei_serial: string | null;
  marca: string | null;
  modelo: string | null;
  categoria: ProdutoCategoria;
  custo: number;
  preco: number;
  margem_percent: number;
  estoque_atual: number;
  estoque_minimo: number;
  localizacao: ProdutoLocalizacao;
  ativo: boolean;
}

type StatusFiltro = 'ativos' | 'inativos' | 'todos';

export default function Estoque() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // "Ativos" é o padrão pra não mudar o que todo mundo já está acostumado a
  // ver. "Aguardando revisão" existe pra achar produto que entrou inativo de
  // propósito (ex.: recebido em troca no PDV) e precisa de preço antes de
  // aparecer pra venda.
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('ativos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);
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
    ativo: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProdutos();
  }, []);

  const fetchProdutos = async () => {
    try {
      // Busca ativos e inativos numa chamada só — quem decide o que mostrar
      // é o filtro de status na tela (mesmo padrão do CampoCatalogo com
      // itens desativados: não esconder de quem precisa achar).
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

  const handleOpenDialog = (produto?: Produto) => {
    if (produto) {
      setEditingProduto(produto);
      setFormData({
        nome: produto.nome,
        codigo_barra: produto.codigo_barra || '',
        imei_serial: produto.imei_serial || '',
        marca: produto.marca || '',
        modelo: produto.modelo || '',
        categoria: produto.categoria,
        custo: String(produto.custo),
        preco: String(produto.preco),
        estoque_atual: String(produto.estoque_atual),
        estoque_minimo: String(produto.estoque_minimo),
        localizacao: produto.localizacao,
        ativo: produto.ativo,
      });
    } else {
      setEditingProduto(null);
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
        ativo: true,
      });
    }
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

      const produtoData = {
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
      };

      if (editingProduto) {
        // estoque_atual sai do UPDATE genérico e vai pela função
        // `ajustar_estoque_produto`, que grava a auditoria em
        // movimentos_estoque (motivo "Ajuste manual") — sem isso, mudar a
        // quantidade aqui não deixava nenhum rastro.
        const { error } = await supabase
          .from('produtos')
          .update({
            nome: produtoData.nome,
            codigo_barra: produtoData.codigo_barra,
            imei_serial: produtoData.imei_serial,
            marca: produtoData.marca,
            modelo: produtoData.modelo,
            categoria: produtoData.categoria,
            custo: produtoData.custo,
            preco: produtoData.preco,
            estoque_minimo: produtoData.estoque_minimo,
            localizacao: produtoData.localizacao,
            ativo: formData.ativo,
          })
          .eq('id', editingProduto.id);

        if (error) throw error;

        if (produtoData.estoque_atual !== editingProduto.estoque_atual) {
          const { error: ajusteError } = await supabase.rpc('ajustar_estoque_produto', {
            _produto_id: editingProduto.id,
            _nova_quantidade: produtoData.estoque_atual,
          });

          if (ajusteError) throw ajusteError;
        }

        toast({
          title: 'Produto atualizado!',
          description: 'Os dados foram salvos com sucesso.',
        });
      } else {
        const { error } = await supabase
          .from('produtos')
          .insert(produtoData);

        if (error) throw error;

        toast({
          title: 'Produto cadastrado!',
          description: 'O produto foi adicionado com sucesso.',
        });
      }

      setDialogOpen(false);
      fetchProdutos();
    } catch (error: any) {
      console.error('Error saving produto:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message || 'Tente novamente.',
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
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
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

  const filteredProdutos = produtos.filter(produto => {
    if (statusFiltro === 'ativos' && !produto.ativo) return false;
    if (statusFiltro === 'inativos' && produto.ativo) return false;

    const searchLower = search.toLowerCase();
    return (
      produto.nome.toLowerCase().includes(searchLower) ||
      produto.codigo_barra?.toLowerCase().includes(searchLower) ||
      produto.imei_serial?.toLowerCase().includes(searchLower) ||
      produto.marca?.toLowerCase().includes(searchLower) ||
      produto.modelo?.toLowerCase().includes(searchLower)
    );
  });

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
        <Button onClick={() => handleOpenDialog()}>
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
      {aguardandoRevisao > 0 && statusFiltro !== 'inativos' && (
        <Card
          className="border-primary/40 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
          onClick={() => setStatusFiltro('inativos')}
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

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código, IMEI..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFiltro} onValueChange={value => setStatusFiltro(value as StatusFiltro)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativos">Ativos (disponíveis pra venda)</SelectItem>
            <SelectItem value="inativos">Inativos (excluídos ou aguardando revisão)</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
              <p className="text-muted-foreground">
                {search ? 'Tente outra busca' : 'Cadastre seu primeiro produto'}
              </p>
              {!search && (
                <Button className="mt-4" onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar Produto
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-center">Estoque</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProdutos.map(produto => {
                  const isLowStock = produto.estoque_atual <= produto.estoque_minimo;
                  return (
                    <TableRow key={produto.id}>
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
                      <TableCell className="text-right">
                        {formatCurrency(produto.custo)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(produto.preco)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={produto.margem_percent > 0 ? 'text-success' : 'text-destructive'}>
                          {produto.margem_percent.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={isLowStock ? 'destructive' : 'secondary'}>
                          {isLowStock && <AlertTriangle className="mr-1 h-3 w-3" />}
                          {produto.estoque_atual}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {PRODUTO_LOCALIZACOES[produto.localizacao]?.label || produto.localizacao}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenDialog(produto)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
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

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingProduto ? 'Editar Produto' : 'Novo Produto'}
            </DialogTitle>
            <DialogDescription>
              {editingProduto
                ? 'Atualize os dados do produto'
                : 'Preencha os dados para cadastrar um novo produto'}
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
            {/* Só aparece editando — produto novo cadastrado aqui já nasce
                ativo. Existe pra reativar produto que entrou inativo de
                propósito (ex.: recebido em troca no PDV) depois de revisado
                e precificado. */}
            {editingProduto && !editingProduto.ativo && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="ativo">Disponível pra venda</Label>
                  <p className="text-sm text-muted-foreground">
                    Desligado = não aparece no PDV nem na lista padrão do Estoque.
                  </p>
                </div>
                <Switch
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={checked => setFormData({ ...formData, ativo: checked })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingProduto ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
