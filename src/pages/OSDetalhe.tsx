import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, Save, Trash2, Wrench, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, dataHora } from '@/lib/format';
import { OS_PRIORITY } from '@/lib/constants';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

/**
 * Detalhe de uma OS.
 *
 * As duas visões de OS (Kanban e tabela) já tentavam navegar pra
 * `/os/:id` — a rota simplesmente não existia (clicar num card caía em
 * "Página não encontrada"). Esta tela resolve isso e, junto, guarda o
 * "Valor do orçamento": até agora não havia NENHUM lugar pra editar esse
 * campo depois que a OS era criada, então ele sempre ficava zerado — e é
 * dele que a conta a receber (Passo 4) precisa pra existir de verdade.
 *
 * Passo 6: ganhou a seção "Peças e serviços" — o gatilho de baixa de
 * estoque por peça usada em OS (`baixar_estoque_ao_usar_em_os`, criado no
 * Passo 2) existia no banco desde 05/08 mas nenhuma tela criava esse tipo
 * de registro. Agora cria: escolher "Peça do estoque" insere com
 * `produto_id` preenchido (dispara a baixa automática e o rastro em
 * `movimentos_estoque`, motivo "Peça usada em OS"); escolher "Serviço
 * avulso" insere só com `descricao` livre (sem mexer em estoque), com
 * atalho opcional pra puxar preço/custo do catálogo de Serviços.
 *
 * Corte de escopo deliberado: item já lançado não tem edição — só
 * exclusão, e só de item SEM peça vinculada. Excluir um item de peça
 * reverteria a baixa de estoque sem deixar rastro (o gatilho só cobre
 * INSERT, não DELETE) — pra corrigir um lançamento errado de peça, o
 * caminho é o ajuste manual de estoque já existente (auditado). Mesma
 * permissão que já gateia o campo de orçamento (`orders.edit` — é a que a
 * política de segurança do banco em `service_order_items` de fato exige,
 * conferido na migration antes de escrever esta tela).
 *
 * Diagnóstico técnico, constatação e demais campos do laudo completo
 * continuam fora desta versão.
 */

interface ItemOS {
  id: string;
  produto_id: string | null;
  descricao: string | null;
  quantidade: number | null;
  preco_cobrado: number;
  custo_unitario: number | null;
  horas_mao_obra: number | null;
  garantia_item_meses: number | null;
  produtos: { nome: string } | null;
}

interface ProdutoOpcao {
  id: string;
  nome: string;
  preco: number | null;
  custo: number | null;
  estoque_atual: number;
}

interface ServicoOpcao {
  id: string;
  nome: string;
  preco_referencia: number;
  custo_estimado: number;
  tempo_estimado_horas: number | null;
}

interface OSCompleta {
  id: string;
  numero_os: string;
  status: string;
  tipo: 'paga' | 'garantia' | 'cortesia';
  prioridade: keyof typeof OS_PRIORITY;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  defeito_cliente: string;
  observacoes: string | null;
  total_orcamento: number;
  valor_final_pago: number | null;
  data_finalizacao: string | null;
  created_at: string;
  clientes: { nome: string; telefones: string[] } | null;
}

export default function OSDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const podeEditar = can(PERMISSIONS.ORDERS_EDIT);
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);
  const { getStatusConfig } = useOsStatuses();

  const [orcamento, setOrcamento] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // ── Peças e serviços ─────────────────────────────────────────────────────
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [tipoItem, setTipoItem] = useState<'peca' | 'servico'>('peca');
  const [produtos, setProdutos] = useState<ProdutoOpcao[]>([]);
  const [servicos, setServicos] = useState<ServicoOpcao[]>([]);
  const [itemForm, setItemForm] = useState({
    produtoId: '',
    servicoId: '',
    descricao: '',
    quantidade: '1',
    precoCobrado: '',
    custoUnitario: '',
    horasMaoObra: '',
    garantiaMeses: '',
  });
  const [salvandoItem, setSalvandoItem] = useState(false);

  const { data: itens, isLoading: carregandoItens } = useQuery({
    queryKey: ['os-itens', id],
    queryFn: async (): Promise<ItemOS[]> => {
      const { data, error } = await supabase
        .from('vw_os_itens')
        .select(
          'id, produto_id, descricao, quantidade, preco_cobrado, custo_unitario, horas_mao_obra, garantia_item_meses, produtos:vw_produtos(nome)'
        )
        .eq('os_id', id)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as ItemOS[];
    },
    enabled: !!id,
  });

  // Catálogos pro dialog de adicionar item — busca só quando abre, não no
  // mount da página (a tela é acessada bem mais vezes só pra ver o
  // andamento da OS do que pra lançar item).
  useEffect(() => {
    if (!itemDialogOpen) return;

    supabase
      .from('vw_produtos')
      .select('id, nome, preco, custo, estoque_atual')
      .eq('ativo', true)
      .gt('estoque_atual', 0)
      .order('nome')
      .then(({ data }) => setProdutos((data ?? []) as ProdutoOpcao[]));

    supabase
      .from('vw_servicos')
      .select('id, nome, preco_referencia, custo_estimado, tempo_estimado_horas')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setServicos((data ?? []) as ServicoOpcao[]));
  }, [itemDialogOpen]);

  const abrirDialogItem = () => {
    setTipoItem('peca');
    setItemForm({
      produtoId: '',
      servicoId: '',
      descricao: '',
      quantidade: '1',
      precoCobrado: '',
      custoUnitario: '',
      horasMaoObra: '',
      garantiaMeses: '',
    });
    setItemDialogOpen(true);
  };

  const escolherProduto = (produtoId: string) => {
    const produto = produtos.find((p) => p.id === produtoId);
    setItemForm((f) => ({
      ...f,
      produtoId,
      precoCobrado: produto?.preco != null ? String(produto.preco) : f.precoCobrado,
      custoUnitario: produto?.custo != null ? String(produto.custo) : f.custoUnitario,
    }));
  };

  const escolherServico = (servicoId: string) => {
    const servico = servicos.find((s) => s.id === servicoId);
    setItemForm((f) => ({
      ...f,
      servicoId,
      descricao: servico?.nome ?? f.descricao,
      precoCobrado: servico ? String(servico.preco_referencia) : f.precoCobrado,
      custoUnitario: servico ? String(servico.custo_estimado) : f.custoUnitario,
      horasMaoObra: servico?.tempo_estimado_horas != null ? String(servico.tempo_estimado_horas) : f.horasMaoObra,
    }));
  };

  const salvarItem = async () => {
    if (!os) return;

    const preco = parseFloat(itemForm.precoCobrado);
    if (isNaN(preco) || preco < 0) {
      toast({ title: 'Informe um preço válido', variant: 'destructive' });
      return;
    }
    if (tipoItem === 'peca' && !itemForm.produtoId) {
      toast({ title: 'Escolha uma peça do estoque', variant: 'destructive' });
      return;
    }
    if (tipoItem === 'servico' && !itemForm.descricao.trim()) {
      toast({ title: 'Descreva o serviço', variant: 'destructive' });
      return;
    }

    const quantidade = tipoItem === 'peca' ? Math.max(1, parseInt(itemForm.quantidade, 10) || 1) : 1;

    if (tipoItem === 'peca') {
      const produtoSelecionado = produtos.find((p) => p.id === itemForm.produtoId);
      if (produtoSelecionado && quantidade > produtoSelecionado.estoque_atual) {
        toast({
          title: 'Estoque insuficiente',
          description: `"${produtoSelecionado.nome}" tem só ${produtoSelecionado.estoque_atual} unidade(s) em estoque.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setSalvandoItem(true);
    try {
      const payload: {
        os_id: string;
        produto_id: string | null;
        descricao: string | null;
        quantidade: number;
        preco_cobrado: number;
        custo_unitario?: number;
        horas_mao_obra?: number;
        garantia_item_meses?: number;
      } = {
        os_id: os.id,
        produto_id: tipoItem === 'peca' ? itemForm.produtoId : null,
        descricao:
          tipoItem === 'servico'
            ? itemForm.descricao.trim()
            : produtos.find((p) => p.id === itemForm.produtoId)?.nome ?? null,
        quantidade,
        preco_cobrado: preco,
      };

      // Quem não vê custo não grava custo — mesma cautela de CadastroServicos.tsx.
      if (veCusto && itemForm.custoUnitario.trim()) {
        const custo = Number(itemForm.custoUnitario);
        if (!Number.isNaN(custo)) payload.custo_unitario = custo;
      }
      if (itemForm.horasMaoObra.trim()) {
        const horas = Number(itemForm.horasMaoObra);
        if (!Number.isNaN(horas)) payload.horas_mao_obra = horas;
      }
      if (itemForm.garantiaMeses.trim()) {
        const meses = parseInt(itemForm.garantiaMeses, 10);
        if (!Number.isNaN(meses)) payload.garantia_item_meses = meses;
      }

      const { error } = await supabase.from('service_order_items').insert(payload);
      if (error) throw error;

      toast({
        title: tipoItem === 'peca' ? 'Peça lançada!' : 'Serviço lançado!',
        description:
          tipoItem === 'peca'
            ? 'O estoque já foi descontado automaticamente.'
            : 'Item adicionado à OS.',
      });

      setItemDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['os-itens', id] });
    } catch (error) {
      toast({
        title: 'Erro ao lançar item',
        description:
          error instanceof Error && /row-level security|policy/i.test(error.message)
            ? 'Seu perfil de acesso não permite fazer isso.'
            : error instanceof Error
              ? error.message
              : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSalvandoItem(false);
    }
  };

  const excluirItem = async (item: ItemOS) => {
    if (!confirm('Excluir este item da OS?')) return;
    try {
      const { error } = await supabase.from('service_order_items').delete().eq('id', item.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['os-itens', id] });
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const somaItens = (itens ?? []).reduce(
    (acc, item) => acc + Number(item.preco_cobrado) * (item.quantidade ?? 1),
    0
  );

  const { data: os, isLoading } = useQuery({
    queryKey: ['os-detalhe', id],
    queryFn: async (): Promise<OSCompleta | null> => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(
          'id, numero_os, status, tipo, prioridade, marca, modelo, numero_serie, defeito_cliente, observacoes, total_orcamento, valor_final_pago, data_finalizacao, created_at, clientes(nome, telefones)'
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as OSCompleta | null;
    },
    enabled: !!id,
  });

  const valorAtual = orcamento ?? (os ? String(os.total_orcamento) : '');
  const mudou = os && parseFloat(valorAtual || '0') !== Number(os.total_orcamento);

  const salvarOrcamento = async () => {
    if (!os) return;
    const valor = parseFloat(valorAtual);
    if (isNaN(valor) || valor < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ total_orcamento: valor })
        .eq('id', os.id);
      if (error) throw error;

      toast({ title: 'Orçamento salvo!' });
      setOrcamento(null);
      queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] });
    } catch (error: unknown) {
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!os) {
    return <Vazio titulo="OS não encontrada" descricao="Ela pode ter sido excluída." />;
  }

  const statusCfg = getStatusConfig(os.status);
  const jaFoiEntregue = os.status === 'entregue';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        titulo={`OS ${os.numero_os}`}
        hint={`Aberta em ${dataHora(os.created_at)}`}
        acoes={
          <Button variant="outline" onClick={() => navigate('/os')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge className={statusCfg?.color ?? ''}>{statusCfg?.label ?? os.status}</Badge>
        <Badge variant="outline">{OS_PRIORITY[os.prioridade]?.label ?? os.prioridade}</Badge>
        <Badge variant="outline" className="capitalize">{os.tipo}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{os.clientes?.nome ?? '—'}</p>
            <p className="text-muted-foreground">{os.clientes?.telefones?.[0] ?? '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aparelho</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">
              {[os.marca, os.modelo].filter(Boolean).join(' ') || '—'}
            </p>
            <p className="text-muted-foreground">
              {os.numero_serie ? `Nº série/IMEI: ${os.numero_serie}` : 'Sem nº de série informado'}
            </p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Defeito relatado</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{os.defeito_cliente}</p>
            {os.observacoes && (
              <p className="mt-2 text-muted-foreground">{os.observacoes}</p>
            )}
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Valor do orçamento</CardTitle>
          </CardHeader>
          <CardContent>
            {os.tipo !== 'paga' && (
              <p className="mb-3 text-sm text-muted-foreground">
                OS do tipo <span className="font-medium capitalize">{os.tipo}</span> — não gera
                cobrança quando entregue.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="orcamento">Valor (R$)</Label>
                <Input
                  id="orcamento"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-40"
                  value={valorAtual}
                  onChange={(e) => setOrcamento(e.target.value)}
                  disabled={!podeEditar || jaFoiEntregue}
                />
              </div>
              {podeEditar && !jaFoiEntregue && (
                <Button onClick={salvarOrcamento} disabled={salvando || !mudou}>
                  <Save className="mr-2 h-4 w-4" />
                  {salvando ? 'Salvando…' : 'Salvar'}
                </Button>
              )}
              {podeEditar && !jaFoiEntregue && (itens?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setOrcamento(somaItens.toFixed(2))}
                  disabled={somaItens === Number(valorAtual || 0)}
                >
                  Usar soma dos itens ({moeda(somaItens)})
                </Button>
              )}
            </div>
            {jaFoiEntregue && (
              <p className="mt-3 text-sm text-muted-foreground">
                Esta OS já foi entregue
                {os.data_finalizacao ? ` em ${dataHora(os.data_finalizacao)}` : ''} — valor
                travado
                {os.valor_final_pago != null ? `: ${moeda(Number(os.valor_final_pago))}` : ''}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Peças e serviços</CardTitle>
            {podeEditar && !jaFoiEntregue && (
              <Button size="sm" onClick={abrirDialogItem}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar item
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {carregandoItens ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (itens?.length ?? 0) === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nenhuma peça ou serviço lançado nesta OS ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    {veCusto && <TableHead className="text-right">Custo</TableHead>}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(itens ?? []).map((item) => {
                    const ehPeca = item.produto_id != null;
                    const qtd = item.quantidade ?? 1;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            {ehPeca ? (
                              <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {item.produtos?.nome ?? item.descricao ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{qtd}</TableCell>
                        <TableCell className="text-right">{moeda(Number(item.preco_cobrado))}</TableCell>
                        {veCusto && (
                          <TableCell className="text-right text-muted-foreground">
                            {item.custo_unitario != null ? moeda(Number(item.custo_unitario)) : '—'}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-medium">
                          {moeda(Number(item.preco_cobrado) * qtd)}
                        </TableCell>
                        <TableCell>
                          {podeEditar && !jaFoiEntregue && !ehPeca && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => excluirItem(item)}
                              title="Excluir item"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Peça do estoque desconta automaticamente e não pode ser excluída por aqui — se foi
              lançada errada, corrija pelo ajuste manual de estoque. Serviço avulso pode ser
              removido normalmente.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de adicionar item */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Adicionar item à OS</DialogTitle>
            <DialogDescription>
              Peça do estoque desconta automaticamente. Serviço avulso é só um lançamento —
              não mexe em estoque.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tipoItem} onValueChange={(v) => setTipoItem(v as 'peca' | 'servico')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="peca">Peça do estoque</TabsTrigger>
              <TabsTrigger value="servico">Serviço avulso</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 py-2">
            {tipoItem === 'peca' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="produto">Produto *</Label>
                  <Select value={itemForm.produtoId} onValueChange={escolherProduto}>
                    <SelectTrigger id="produto">
                      <SelectValue placeholder="Escolha uma peça com estoque disponível" />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} (estoque: {p.estoque_atual})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantidade">Quantidade</Label>
                  <Input
                    id="quantidade"
                    type="number"
                    min={1}
                    max={produtos.find((p) => p.id === itemForm.produtoId)?.estoque_atual}
                    value={itemForm.quantidade}
                    onChange={(e) => setItemForm({ ...itemForm, quantidade: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="servico_catalogo">Puxar do catálogo (opcional)</Label>
                  <Select value={itemForm.servicoId} onValueChange={escolherServico}>
                    <SelectTrigger id="servico_catalogo">
                      <SelectValue placeholder="Ou digite livremente abaixo" />
                    </SelectTrigger>
                    <SelectContent>
                      {servicos.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descricao_servico">Descrição *</Label>
                  <Input
                    id="descricao_servico"
                    value={itemForm.descricao}
                    onChange={(e) => setItemForm({ ...itemForm, descricao: e.target.value })}
                    placeholder="Ex.: Troca de tela, mão de obra..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="horas">Horas de mão de obra (opcional)</Label>
                  <Input
                    id="horas"
                    type="number"
                    min={0}
                    step={0.5}
                    value={itemForm.horasMaoObra}
                    onChange={(e) => setItemForm({ ...itemForm, horasMaoObra: e.target.value })}
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preco_cobrado">Preço cobrado (R$) *</Label>
                <Input
                  id="preco_cobrado"
                  type="number"
                  min={0}
                  step={0.01}
                  value={itemForm.precoCobrado}
                  onChange={(e) => setItemForm({ ...itemForm, precoCobrado: e.target.value })}
                />
              </div>
              {veCusto && (
                <div className="space-y-2">
                  <Label htmlFor="custo_unitario">Custo (R$)</Label>
                  <Input
                    id="custo_unitario"
                    type="number"
                    min={0}
                    step={0.01}
                    value={itemForm.custoUnitario}
                    onChange={(e) => setItemForm({ ...itemForm, custoUnitario: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="garantia_item">Garantia deste item (meses, opcional)</Label>
              <Input
                id="garantia_item"
                type="number"
                min={0}
                value={itemForm.garantiaMeses}
                onChange={(e) => setItemForm({ ...itemForm, garantiaMeses: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarItem} disabled={salvandoItem}>
              {salvandoItem ? 'Salvando…' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
