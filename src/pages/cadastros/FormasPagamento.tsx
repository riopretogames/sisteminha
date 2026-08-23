import { useState, useEffect } from 'react';
import { Plus, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { useAtalhosDeDialogo } from '@/hooks/useAtalhosDeDialogo';

/**
 * Formas de Pagamento.
 *
 * Cadastro das formas de pagamento aceitas na loja (Dinheiro, PIX, Cartão de
 * Crédito em N vezes, formas "fora do caixa" como Folha de Pagamento ou
 * Produtos para a Assistência Técnica etc.). Alimenta o PDV e o fechamento
 * de caixa — é o `entra_no_caixa` que decide se uma forma soma na conferência
 * cega da gaveta (hoje, só Dinheiro). As demais formas continuam aparecendo
 * no resumo informativo do dia, só não entram nessa conferência específica.
 *
 * Limitação assumida: a taxa por parcela individual (tabela
 * `formas_pagamento_parcelas` — ex.: 3x com uma taxa, 12x com outra) NÃO é
 * editável por esta tela. Aqui só existe a taxa "flat" (`taxa_percent`),
 * aplicada do mesmo jeito para qualquer parcelamento dentro do
 * `max_parcelas`. Editor de taxa por parcela fica para uma v2, se a operação
 * precisar dessa granularidade.
 */

type TipoJuros = 'sem_juros' | 'simples' | 'composto';

const JUROS_LABELS: Record<TipoJuros, string> = {
  sem_juros: 'Sem juros',
  simples: 'Juros simples',
  composto: 'Juros composto',
};

interface FormaPagamento {
  id: string;
  descricao: string;
  grupo: string | null;
  max_parcelas: number;
  contem_taxa: boolean;
  taxa_percent: number;
  juros: TipoJuros;
  juros_percent: number;
  entra_no_caixa: boolean;
  ordem: number;
}

function formatarPercentual(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * `taxa_percent` e `juros_percent` são `DECIMAL(5,2)` no banco (máx. 999,99).
 * Sem esse clamp, digitar um valor maior estoura o INSERT com "numeric field
 * overflow" cru do Postgres — foi exatamente o que aconteceu com
 * `produtos.margem_percent` (corrigido em 20260805180000_corrige_overflow_margem.sql).
 */
function clampPercent(valor: string): number {
  const numero = Number(valor) || 0;
  return Math.min(999.99, Math.max(0, numero));
}

const formDataVazio = () => ({
  descricao: '',
  grupo: '',
  maxParcelas: '1',
  contemTaxa: false,
  taxaPercent: '0',
  juros: 'sem_juros' as TipoJuros,
  jurosPercent: '0',
  entraNoCaixa: true,
  ordem: '0',
});

export default function FormasPagamento() {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.profile?.tenant_id ?? null;
  const podeGerenciar = can(PERMISSIONS.REGISTRY_PRODUCTS_MANAGE);

  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<FormaPagamento | null>(null);
  const [formData, setFormData] = useState(formDataVazio());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFormas();
  }, []);

  const fetchFormas = async () => {
    try {
      const { data, error } = await supabase
        .from('formas_pagamento')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('descricao', { ascending: true });

      if (error) throw error;
      setFormas(data || []);
    } catch (error) {
      console.error('Error fetching formas de pagamento:', error);
      toast({
        title: 'Erro ao carregar formas de pagamento',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  /** Mensagem de RLS é críptica; traduz pro que de fato aconteceu. */
  const mensagemErro = (error: unknown): string => {
    const msg = error instanceof Error ? error.message : 'Tente novamente.';
    return /row-level security|policy/i.test(msg)
      ? 'Seu perfil de acesso não permite fazer isso.'
      : msg;
  };

  const handleOpenDialog = (forma?: FormaPagamento) => {
    if (forma) {
      setEditando(forma);
      setFormData({
        descricao: forma.descricao,
        grupo: forma.grupo ?? '',
        maxParcelas: String(forma.max_parcelas),
        contemTaxa: forma.contem_taxa,
        taxaPercent: String(forma.taxa_percent),
        juros: forma.juros,
        jurosPercent: String(forma.juros_percent),
        entraNoCaixa: forma.entra_no_caixa,
        ordem: String(forma.ordem),
      });
    } else {
      setEditando(null);
      setFormData(formDataVazio());
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.descricao.trim()) {
      toast({
        title: 'Descrição obrigatória',
        description: 'Informe o nome da forma de pagamento.',
        variant: 'destructive',
      });
      return;
    }

    if (!tenantId) {
      toast({
        title: 'Usuário sem loja vinculada',
        description: 'Não é possível salvar sem uma loja associada ao seu usuário.',
        variant: 'destructive',
      });
      return;
    }

    const maxParcelas = Math.min(24, Math.max(1, parseInt(formData.maxParcelas, 10) || 1));
    const taxaPercent = formData.contemTaxa ? clampPercent(formData.taxaPercent) : 0;
    const jurosPercent = formData.juros !== 'sem_juros' ? clampPercent(formData.jurosPercent) : 0;
    const ordem = parseInt(formData.ordem, 10) || 0;

    setSaving(true);

    try {
      const payload = {
        descricao: formData.descricao.trim(),
        grupo: formData.grupo.trim() || null,
        max_parcelas: maxParcelas,
        contem_taxa: formData.contemTaxa,
        taxa_percent: taxaPercent,
        juros: formData.juros,
        juros_percent: jurosPercent,
        entra_no_caixa: formData.entraNoCaixa,
        ordem,
      };

      if (editando) {
        const { error } = await supabase
          .from('formas_pagamento')
          .update(payload)
          .eq('id', editando.id);

        if (error) throw error;

        toast({
          title: 'Forma de pagamento atualizada!',
          description: 'Os dados foram salvos com sucesso.',
          variant: 'success',
        });
      } else {
        const { error } = await supabase
          .from('formas_pagamento')
          .insert({ ...payload, tenant_id: tenantId });

        if (error) throw error;

        toast({
          title: 'Forma de pagamento cadastrada!',
          description: 'A forma de pagamento foi adicionada com sucesso.',
          variant: 'success',
        });
      }

      setDialogOpen(false);
      fetchFormas();
    } catch (error) {
      console.error('Error saving forma de pagamento:', error);
      toast({
        title: 'Erro ao salvar',
        description: mensagemErro(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta forma de pagamento?')) return;

    try {
      const { error } = await supabase
        .from('formas_pagamento')
        .update({ ativo: false })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Forma de pagamento excluída',
        description: 'A forma de pagamento foi removida.',
        variant: 'success',
      });

      fetchFormas();
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: mensagemErro(error),
        variant: 'destructive',
      });
    }
  };

  // Enter confirma o cadastro, com a MESMA condicao do botao -- o atalho nao
  // pode passar por cima de uma validacao que o clique respeita.
  const refAtalhos = useAtalhosDeDialogo({
    podeConfirmar: !saving,
    onConfirmar: handleSave,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        titulo="Formas de Pagamento"
        hint="Cadastre as formas aceitas na loja — dinheiro, PIX, cartão em N vezes e afins. Controla o parcelamento no PDV e o que entra no fechamento de caixa."
        acoes={
          podeGerenciar && (
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Forma
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : formas.length === 0 ? (
            <div className="py-12">
              <Vazio
                titulo="Nenhuma forma de pagamento cadastrada"
                descricao={
                  podeGerenciar ? 'Cadastre a primeira para liberar no PDV.' : undefined
                }
              />
              {podeGerenciar && (
                <div className="mt-4 flex justify-center">
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Cadastrar Forma
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Parcelamento</TableHead>
                  <TableHead>Taxa</TableHead>
                  <TableHead>Juros</TableHead>
                  <TableHead>Entra no caixa</TableHead>
                  {podeGerenciar && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {formas.map(forma => (
                  <TableRow key={forma.id}>
                    <TableCell className="font-medium">{forma.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {forma.grupo || '—'}
                    </TableCell>
                    <TableCell>
                      {forma.max_parcelas <= 1 ? (
                        <span className="text-sm text-muted-foreground">À vista</span>
                      ) : (
                        <Badge variant="outline">até {forma.max_parcelas}x</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {forma.contem_taxa
                        ? `${formatarPercentual(forma.taxa_percent)}%`
                        : 'sem taxa'}
                    </TableCell>
                    <TableCell>
                      <span>{JUROS_LABELS[forma.juros]}</span>
                      {forma.juros !== 'sem_juros' && (
                        <span className="ml-1 text-sm text-muted-foreground">
                          ({formatarPercentual(forma.juros_percent)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          forma.entra_no_caixa
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-muted text-muted-foreground'
                        }
                      >
                        {forma.entra_no_caixa ? 'Sim' : 'Não'}
                      </Badge>
                    </TableCell>
                    {podeGerenciar && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenDialog(forma)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(forma.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent ref={refAtalhos} className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {editando ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}
            </DialogTitle>
            <DialogDescription>
              {editando
                ? 'Atualize os dados da forma de pagamento'
                : 'Preencha os dados para cadastrar uma nova forma de pagamento'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição *</Label>
              <Input
                id="descricao"
                value={formData.descricao}
                onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Ex.: Cartão de Crédito, PIX, Dinheiro..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="grupo">Grupo</Label>
              <Input
                id="grupo"
                value={formData.grupo}
                onChange={e => setFormData({ ...formData, grupo: e.target.value })}
                placeholder="Opcional — ex.: Assistência Técnica"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxParcelas">Máx. parcelas</Label>
                <Input
                  id="maxParcelas"
                  type="number"
                  min={1}
                  max={24}
                  value={formData.maxParcelas}
                  onChange={e => setFormData({ ...formData, maxParcelas: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ordem">Ordem de exibição</Label>
                <Input
                  id="ordem"
                  type="number"
                  value={formData.ordem}
                  onChange={e => setFormData({ ...formData, ordem: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Contém taxa</p>
                <p className="text-xs text-muted-foreground">
                  Ative se essa forma cobra uma taxa (ex.: taxa da maquininha).
                </p>
              </div>
              <Switch
                checked={formData.contemTaxa}
                onCheckedChange={v => setFormData({ ...formData, contemTaxa: v })}
              />
            </div>

            {formData.contemTaxa && (
              <div className="space-y-2">
                <Label htmlFor="taxaPercent">Taxa (%)</Label>
                <Input
                  id="taxaPercent"
                  type="number"
                  step="0.01"
                  min={0}
                  max={999.99}
                  value={formData.taxaPercent}
                  onChange={e => setFormData({ ...formData, taxaPercent: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="juros">Juros</Label>
              <Select
                value={formData.juros}
                onValueChange={value =>
                  setFormData({ ...formData, juros: value as TipoJuros })
                }
              >
                <SelectTrigger id="juros">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(JUROS_LABELS) as [TipoJuros, string][]).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            {formData.juros !== 'sem_juros' && (
              <div className="space-y-2">
                <Label htmlFor="jurosPercent">Juros (%)</Label>
                <Input
                  id="jurosPercent"
                  type="number"
                  step="0.01"
                  min={0}
                  max={999.99}
                  value={formData.jurosPercent}
                  onChange={e => setFormData({ ...formData, jurosPercent: e.target.value })}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Entra no caixa (dinheiro físico da gaveta)</p>
                <p className="text-xs text-muted-foreground">
                  Esse pagamento afeta o dinheiro físico da gaveta? Só marque
                  como Sim se for dinheiro em espécie — PIX, cartão e demais
                  formas eletrônicas normalmente não. Isso decide o que entra
                  na conferência cega do fechamento de caixa (comparar com o
                  que foi contado na gaveta); as outras formas continuam
                  aparecendo no resumo do dia, só não entram nessa conferência.
                </p>
              </div>
              <Switch
                checked={formData.entraNoCaixa}
                onCheckedChange={v => setFormData({ ...formData, entraNoCaixa: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editando ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
