import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCatalogo } from '@/hooks/useCatalogos';
import { PERMISSIONS } from '@/config/permissions';
import { dataHora } from '@/lib/format';
import { quantidadeComSinal, corDaQuantidade } from '@/lib/movimentoEstoque';
import { PRODUTO_CATEGORIAS, PRODUTO_LOCALIZACOES, MOVIMENTO_TIPOS } from '@/lib/constants';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { CampoCatalogo } from '@/components/CampoCatalogo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

/**
 * Ficha completa do produto — página própria, no lugar do Dialog pequeno que
 * `Estoque.tsx` usava. Pedido do Felipe em 10/08, com o sistema antigo (OK
 * Cells) como referência: "editar produto" tem que abrir uma tela com todas
 * as informações, não uma caixinha.
 *
 * Mesmo mecanismo de rota de `OSDetalhe.tsx`/`ClienteFicha.tsx`: montada
 * direto em App.tsx, fora do registry (menu.ts não modela rota com
 * parâmetro). Diferente de `ClienteFicha` (que reabre um Dialog pra editar),
 * aqui a própria página é o formulário — sem Dialog por cima.
 *
 * "Apto à Venda" (o Switch `ativo`) fica sempre visível aqui, não só quando
 * o produto já está inativo — é exatamente o controle que ficava escondido
 * demais no Dialog antigo, e que passou a importar de verdade desde que a
 * troca do PDV começou a criar produto inativo esperando revisão.
 */

type ProdutoCategoria = keyof typeof PRODUTO_CATEGORIAS;
type ProdutoLocalizacao = keyof typeof PRODUTO_LOCALIZACOES;
type MovimentoTipo = keyof typeof MOVIMENTO_TIPOS;

interface ProdutoCompleto {
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
  custo: number | null;
  preco: number;
  margem_percent: number | null;
  estoque_atual: number;
  estoque_minimo: number;
  estoque_maximo: number;
  localizacao: ProdutoLocalizacao;
  garantia_meses: number;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
}

interface LinhaMovimento {
  id: string;
  tipo: MovimentoTipo;
  quantidade: number;
  motivo: string | null;
  origem: string | null;
  saldo_depois: number;
  created_at: string;
}

interface FormState {
  nome: string;
  codigoBarra: string;
  imeiSerial: string;
  grupoProdutoId: string;
  marcaId: string;
  modeloId: string;
  corId: string;
  condicaoId: string;
  memoriaId: string;
  categoria: ProdutoCategoria;
  custo: string;
  preco: string;
  estoqueAtual: string;
  estoqueMinimo: string;
  estoqueMaximo: string;
  localizacao: ProdutoLocalizacao;
  garantiaMeses: string;
  observacoes: string;
  ativo: boolean;
}

export default function EstoqueDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const podeEditar = can(PERMISSIONS.INVENTORY_EDIT);
  const podeExcluir = can(PERMISSIONS.INVENTORY_DELETE);
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);
  // Achado na revisão de 18/08: a migration 20260818110000 passou a exigir
  // `inventory.adjust` dentro do próprio `ajustar_estoque_produto` (antes não
  // exigia nada). Esta tela sempre liberou o campo "Estoque Atual" só com
  // `inventory.edit` — hoje todo papel com inventory.edit também tem
  // inventory.adjust (ver role_permissions), então nenhum papel quebra, mas
  // uma EXCEÇÃO por usuário (tela de Usuários) que desse inventory.edit sem
  // inventory.adjust deixaria o campo editável na tela e a gravação falharia
  // só nesse pedaço, depois do resto do formulário já ter salvo. Trava aqui
  // também, pra bater com o que o banco realmente exige.
  const podeAjustarEstoque = can(PERMISSIONS.INVENTORY_ADJUST);

  const marcas = useCatalogo('marca');
  const modelos = useCatalogo('modelo');

  const [formData, setFormData] = useState<FormState | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { data: produto, isLoading } = useQuery({
    queryKey: ['produto-detalhe', id],
    queryFn: async (): Promise<ProdutoCompleto | null> => {
      // vw_produtos, nunca a tabela — quem não tem inventory.cost.view
      // recebe null em custo/margem, é assim que a trava de custo funciona.
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ProdutoCompleto | null;
    },
    enabled: !!id,
  });

  const { data: movimentos } = useQuery({
    queryKey: ['produto-movimentos', id],
    queryFn: async (): Promise<LinhaMovimento[]> => {
      const { data, error } = await supabase
        .from('vw_movimentos_estoque')
        .select('id, tipo, quantidade, motivo, origem, saldo_depois, created_at')
        .eq('produto_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as LinhaMovimento[];
    },
    enabled: !!id,
  });

  // Só sincroniza o formulário quando o produto muda de fato (troca de id) —
  // não a cada refetch, senão uma digitação em andamento seria apagada por
  // uma invalidação de query vinda de outra aba/gatilho.
  useEffect(() => {
    if (produto) {
      setFormData({
        nome: produto.nome,
        codigoBarra: produto.codigo_barra || '',
        imeiSerial: produto.imei_serial || '',
        grupoProdutoId: produto.grupo_produto_id || '',
        marcaId: produto.marca_id || '',
        modeloId: produto.modelo_id || '',
        corId: produto.cor_id || '',
        condicaoId: produto.condicao_id || '',
        memoriaId: produto.memoria_id || '',
        categoria: produto.categoria,
        custo: String(produto.custo ?? 0),
        preco: String(produto.preco),
        estoqueAtual: String(produto.estoque_atual),
        estoqueMinimo: String(produto.estoque_minimo),
        estoqueMaximo: String(produto.estoque_maximo),
        localizacao: produto.localizacao,
        garantiaMeses: String(produto.garantia_meses),
        observacoes: produto.observacoes || '',
        ativo: produto.ativo,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto?.id]);

  const handleSave = async () => {
    if (!produto || !formData) return;

    if (!formData.nome.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }

    setSalvando(true);
    try {
      // As colunas antigas de texto (marca/modelo) continuam preenchidas a
      // partir da descrição escolhida no catálogo — mesmo tratamento que OS
      // e Cliente já usam, pra Estoque Crítico e Relatório de Estoque (os 2
      // únicos lugares que ainda leem o texto direto) não ficarem em branco.
      const marcaTexto = marcas.data?.find((m) => m.id === formData.marcaId)?.descricao ?? null;
      const modeloTexto = modelos.data?.find((m) => m.id === formData.modeloId)?.descricao ?? null;

      // Achado na revisão de 18/08: quem NÃO tem inventory.cost.view nunca vê
      // o campo Custo (fica escondido lá embaixo, `{veCusto && (...)}`), mas
      // `formData.custo` pra essa pessoa foi inicializado como "0" (o
      // `produto.custo ?? 0` de vw_produtos, que devolve null de propósito
      // pra quem não tem a permissão). Antes o UPDATE mandava `custo` sempre,
      // então salvar QUALQUER outra coisa na ficha — corrigir o nome, ajustar
      // estoque — zerava o custo real do produto no banco, sem essa pessoa
      // nunca ter tocado no campo. A tabela permite escrever custo (a trava
      // da migration 20260808140000 protege só leitura, de propósito, pra
      // não travar o cadastro inicial de quem lança produto sem ver custo
      // alheio) — então quem tem que impedir mandar um valor que a pessoa
      // nunca viu é a tela, não o banco.
      const payload: Record<string, unknown> = {
        nome: formData.nome.trim(),
        codigo_barra: formData.codigoBarra.trim() || null,
        imei_serial: formData.imeiSerial.trim() || null,
        marca: marcaTexto,
        modelo: modeloTexto,
        grupo_produto_id: formData.grupoProdutoId || null,
        marca_id: formData.marcaId || null,
        modelo_id: formData.modeloId || null,
        cor_id: formData.corId || null,
        condicao_id: formData.condicaoId || null,
        memoria_id: formData.memoriaId || null,
        categoria: formData.categoria,
        preco: parseFloat(formData.preco) || 0,
        estoque_minimo: parseInt(formData.estoqueMinimo, 10) || 1,
        estoque_maximo: parseInt(formData.estoqueMaximo, 10) || 100,
        localizacao: formData.localizacao,
        garantia_meses: parseInt(formData.garantiaMeses, 10) || 0,
        observacoes: formData.observacoes.trim() || null,
        ativo: formData.ativo,
      };
      if (veCusto) {
        payload.custo = parseFloat(formData.custo) || 0;
      }

      const { error } = await supabase
        .from('produtos')
        .update(payload)
        .eq('id', produto.id);

      if (error) throw error;

      // estoque_atual sai do UPDATE genérico e vai pela função
      // ajustar_estoque_produto, que grava a auditoria em
      // movimentos_estoque (motivo "Ajuste manual") — mesma regra que
      // Estoque.tsx já seguia.
      const novoEstoque = parseInt(formData.estoqueAtual, 10) || 0;
      // O campo já vem desabilitado sem `inventory.adjust` (não deveria mudar
      // de valor), mas a trava aqui é defensiva: o banco exige a permissão de
      // qualquer forma, então nem tenta chamar a função sem ela.
      if (podeAjustarEstoque && novoEstoque !== produto.estoque_atual) {
        const { error: ajusteError } = await supabase.rpc('ajustar_estoque_produto', {
          _produto_id: produto.id,
          _nova_quantidade: novoEstoque,
        });
        if (ajusteError) throw ajusteError;
      }

      toast({ title: 'Produto atualizado!' });
      queryClient.invalidateQueries({ queryKey: ['produto-detalhe', id] });
      queryClient.invalidateQueries({ queryKey: ['produto-movimentos', id] });
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  const handleDelete = async () => {
    if (!produto) return;
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
      const { error } = await supabase
        .from('produtos')
        .update({ ativo: false })
        .eq('id', produto.id);
      if (error) throw error;

      toast({ title: 'Produto excluído' });
      navigate('/estoque');
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading || !formData) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!produto) {
    return <Vazio titulo="Produto não encontrado" descricao="Ele pode ter sido excluído." />;
  }

  const custoNum = parseFloat(formData.custo) || 0;
  const precoNum = parseFloat(formData.preco) || 0;
  const margemPreview = custoNum > 0 ? ((precoNum - custoNum) / custoNum) * 100 : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        titulo={produto.nome}
        hint={[produto.marca, produto.modelo].filter(Boolean).join(' ') || 'Sem marca/modelo informado'}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            {podeExcluir && (
              <Button variant="outline" className="text-destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/estoque')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant={formData.ativo ? 'default' : 'outline'}>
          {formData.ativo ? 'Apto à Venda' : 'Não apto à venda'}
        </Badge>
        <Badge variant="outline">{PRODUTO_CATEGORIAS[formData.categoria]?.label}</Badge>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identificação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={formData.nome}
                disabled={!podeEditar}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigo_barra">Código de Barras</Label>
              <Input
                id="codigo_barra"
                value={formData.codigoBarra}
                disabled={!podeEditar}
                onChange={(e) => setFormData({ ...formData, codigoBarra: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imei_serial">IMEI/Nº de Série</Label>
              <Input
                id="imei_serial"
                value={formData.imeiSerial}
                disabled={!podeEditar}
                onChange={(e) => setFormData({ ...formData, imeiSerial: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catálogo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CampoCatalogo
              tipo="grupo_produto"
              label="Grupo"
              valor={formData.grupoProdutoId}
              disabled={!podeEditar}
              onChange={(v) => setFormData({ ...formData, grupoProdutoId: v })}
            />
            <CampoCatalogo
              tipo="marca"
              label="Marca"
              valor={formData.marcaId}
              disabled={!podeEditar}
              onChange={(v) => setFormData({ ...formData, marcaId: v })}
            />
            <CampoCatalogo
              tipo="modelo"
              label="Modelo"
              valor={formData.modeloId}
              disabled={!podeEditar}
              onChange={(v) => setFormData({ ...formData, modeloId: v })}
            />
            <CampoCatalogo
              tipo="cor"
              label="Cor"
              valor={formData.corId}
              disabled={!podeEditar}
              onChange={(v) => setFormData({ ...formData, corId: v })}
            />
            <CampoCatalogo
              tipo="condicao"
              label="Condição"
              valor={formData.condicaoId}
              disabled={!podeEditar}
              onChange={(v) => setFormData({ ...formData, condicaoId: v })}
            />
            <CampoCatalogo
              tipo="memoria"
              label="Memória"
              valor={formData.memoriaId}
              disabled={!podeEditar}
              onChange={(v) => setFormData({ ...formData, memoriaId: v })}
            />
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria</Label>
              <Select
                value={formData.categoria}
                disabled={!podeEditar}
                onValueChange={(v) => setFormData({ ...formData, categoria: v as ProdutoCategoria })}
              >
                <SelectTrigger id="categoria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUTO_CATEGORIAS).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="localizacao">Localização</Label>
              <Select
                value={formData.localizacao}
                disabled={!podeEditar}
                onValueChange={(v) => setFormData({ ...formData, localizacao: v as ProdutoLocalizacao })}
              >
                <SelectTrigger id="localizacao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUTO_LOCALIZACOES).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preços e Estoque</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {veCusto && (
              <div className="space-y-2">
                <Label htmlFor="custo">Custo (R$)</Label>
                <Input
                  id="custo"
                  type="number"
                  step="0.01"
                  value={formData.custo}
                  disabled={!podeEditar}
                  onChange={(e) => setFormData({ ...formData, custo: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="preco">Preço (R$)</Label>
              <Input
                id="preco"
                type="number"
                step="0.01"
                value={formData.preco}
                disabled={!podeEditar}
                onChange={(e) => setFormData({ ...formData, preco: e.target.value })}
              />
            </div>
            {veCusto && (
              <div className="space-y-2">
                <Label>Margem</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted px-3">
                  <span className={margemPreview > 0 ? 'text-success' : 'text-destructive'}>
                    {margemPreview.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="estoque_atual">Estoque Atual</Label>
              <Input
                id="estoque_atual"
                type="number"
                value={formData.estoqueAtual}
                disabled={!podeEditar || !podeAjustarEstoque}
                onChange={(e) => setFormData({ ...formData, estoqueAtual: e.target.value })}
              />
              {podeEditar && !podeAjustarEstoque && (
                <p className="text-xs text-muted-foreground">
                  Seu acesso não inclui ajustar estoque — os demais campos podem ser salvos normalmente.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="estoque_minimo">Estoque Mínimo</Label>
              <Input
                id="estoque_minimo"
                type="number"
                value={formData.estoqueMinimo}
                disabled={!podeEditar}
                onChange={(e) => setFormData({ ...formData, estoqueMinimo: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estoque_maximo">Estoque Máximo</Label>
              <Input
                id="estoque_maximo"
                type="number"
                value={formData.estoqueMaximo}
                disabled={!podeEditar}
                onChange={(e) => setFormData({ ...formData, estoqueMaximo: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="garantia">Garantia (meses)</Label>
              <Input
                id="garantia"
                type="number"
                value={formData.garantiaMeses}
                disabled={!podeEditar}
                onChange={(e) => setFormData({ ...formData, garantiaMeses: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disponibilidade</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="ativo">Apto à Venda</Label>
                <p className="text-sm text-muted-foreground">
                  Desligado = não aparece no PDV nem na lista padrão do Estoque.
                </p>
              </div>
              <Switch
                id="ativo"
                checked={formData.ativo}
                disabled={!podeEditar}
                onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.observacoes}
              disabled={!podeEditar}
              placeholder="Estado, defeito conhecido, o que for relevante anotar sobre este produto..."
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
            />
          </CardContent>
        </Card>

        {podeEditar && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={salvando}>
              <Save className="mr-2 h-4 w-4" />
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Movimentações recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {!movimentos || movimentos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma movimentação registrada ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimentos.map((m) => {
                    const cfg = MOVIMENTO_TIPOS[m.tipo];
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-sm">{dataHora(m.created_at)}</TableCell>
                        <TableCell>
                          <Badge className={`${cfg?.cor ?? ''} border-0`}>{cfg?.label ?? m.tipo}</Badge>
                        </TableCell>
                        {/* Sentido pelo `tipo`, não pelo sinal: venda e peça
                            de OS gravam quantidade positiva com tipo 'saida'
                            e apareciam aqui em verde com "+". */}
                        <TableCell className={`text-right ${corDaQuantidade(m)}`}>
                          {quantidadeComSinal(m)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.motivo ?? '—'}</TableCell>
                        <TableCell className="text-right">{m.saldo_depois}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
