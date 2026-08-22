import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, MoreHorizontal, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCatalogo } from '@/hooks/useCatalogos';
import { PERMISSIONS } from '@/config/permissions';
import { PageHeader, Vazio } from '@/components/PageHeader';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { moeda } from '@/lib/format';

/**
 * Cadastro de Serviços.
 *
 * Espelha Fornecedores.tsx/Transportadoras.tsx: lista com busca client-side,
 * dialog único para criar/editar e exclusão lógica (ativo=false) — serviço
 * antigo pode estar referenciado em OS/orçamento histórico.
 *
 * Corte de escopo deliberado: custo estimado e margem só aparecem pra quem
 * tem `inventory.cost.view` (mesmo gate de IeComercial.tsx). Quem não tem a
 * permissão nem vê o campo no formulário — o payload de salvar simplesmente
 * omite `custo_estimado` nesse caso, então esse perfil não sobrescreve o
 * custo já cadastrado por acidente.
 */

type Servico = Database['public']['Tables']['servicos']['Row'];

interface ServicoFormData {
  nome: string;
  descricao: string;
  grupoId: string;
  precoReferencia: string;
  custoEstimado: string;
  tempoEstimadoHoras: string;
  garantiaMeses: string;
  exigeAvisoRisco: boolean;
}

const FORM_VAZIO: ServicoFormData = {
  nome: '',
  descricao: '',
  grupoId: '',
  precoReferencia: '',
  custoEstimado: '',
  tempoEstimadoHoras: '',
  garantiaMeses: '3',
  exigeAvisoRisco: false,
};

const SEM_GRUPO = '__sem_grupo__';

/** Mensagem de RLS é críptica; traduz pro que de fato aconteceu. */
function traduzirErro(error: unknown): string {
  const msg = error instanceof Error ? error.message : 'Tente novamente.';

  // Correção proativa: a tabela tem UNIQUE (tenant_id, nome) e nenhuma tela
  // irmã traduzia esse erro — o Postgres cru ("duplicate key value violates
  // unique constraint...") não diz nada pro usuário final.
  if (/duplicate key|unique/i.test(msg)) {
    return 'Já existe um serviço com esse nome.';
  }

  if (/row-level security|policy/i.test(msg)) {
    return 'Seu perfil de acesso não permite fazer isso.';
  }

  return msg;
}

export default function CadastroServicos() {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.profile?.tenant_id ?? null;
  const podeGerenciar = can(PERMISSIONS.REGISTRY_SERVICES_MANAGE);
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);

  const { data: grupos } = useCatalogo('grupo_produto');
  const gruposAtivos = useMemo(() => grupos?.filter((g) => g.ativo) ?? [], [grupos]);
  const nomeGrupo = useMemo(() => {
    const mapa = new Map((grupos ?? []).map((g) => [g.id, g.descricao]));
    return (grupoId: string | null) => (grupoId ? mapa.get(grupoId) ?? '—' : '—');
  }, [grupos]);

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServico, setEditingServico] = useState<Servico | null>(null);
  const [formData, setFormData] = useState<ServicoFormData>(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchServicos();
  }, []);

  const fetchServicos = async () => {
    try {
      const { data, error } = await supabase
        .from('vw_servicos')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setServicos(data ?? []);
    } catch (error) {
      console.error('Error fetching servicos:', error);
      toast({
        title: 'Erro ao carregar serviços',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (servico?: Servico) => {
    if (servico) {
      setEditingServico(servico);
      setFormData({
        nome: servico.nome,
        descricao: servico.descricao ?? '',
        grupoId: servico.grupo_id ?? '',
        precoReferencia: servico.preco_referencia?.toString() ?? '0',
        custoEstimado: servico.custo_estimado?.toString() ?? '0',
        tempoEstimadoHoras: servico.tempo_estimado_horas?.toString() ?? '',
        garantiaMeses: servico.garantia_meses?.toString() ?? '3',
        exigeAvisoRisco: servico.exige_aviso_risco,
      });
    } else {
      setEditingServico(null);
      setFormData(FORM_VAZIO);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do serviço.',
        variant: 'destructive',
      });
      return;
    }

    if (!tenantId) {
      toast({
        title: 'Usuário sem loja vinculada',
        description: 'Não foi possível identificar a loja do seu usuário.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      const tempoEstimado = formData.tempoEstimadoHoras.trim()
        ? Number(formData.tempoEstimadoHoras)
        : null;
      const garantiaMeses = formData.garantiaMeses.trim() ? Number(formData.garantiaMeses) : 3;

      const servicoData: Database['public']['Tables']['servicos']['Update'] = {
        nome: formData.nome.trim(),
        descricao: formData.descricao.trim() || null,
        grupo_id: formData.grupoId || null,
        preco_referencia: formData.precoReferencia.trim() ? Number(formData.precoReferencia) : 0,
        tempo_estimado_horas:
          tempoEstimado !== null && !Number.isNaN(tempoEstimado) ? tempoEstimado : null,
        garantia_meses: !Number.isNaN(garantiaMeses) ? garantiaMeses : 3,
        exige_aviso_risco: formData.exigeAvisoRisco,
      };

      // Quem não vê custo não grava custo — evita sobrescrever o valor já
      // cadastrado com um "0" vindo de um formulário que nem mostrava o campo.
      if (veCusto) {
        servicoData.custo_estimado = formData.custoEstimado.trim()
          ? Number(formData.custoEstimado)
          : 0;
      }

      if (editingServico) {
        const { error } = await supabase
          .from('servicos')
          .update(servicoData)
          .eq('id', editingServico.id);

        if (error) throw error;

        toast({
          title: 'Serviço atualizado!',
          description: 'Os dados foram salvos com sucesso.',
          variant: 'success',
        });
      } else {
        const { error } = await supabase
          .from('servicos')
          .insert({ ...servicoData, nome: formData.nome.trim(), tenant_id: tenantId });

        if (error) throw error;

        toast({
          title: 'Serviço cadastrado!',
          description: 'O serviço foi adicionado com sucesso.',
          variant: 'success',
        });
      }

      setDialogOpen(false);
      fetchServicos();
    } catch (error) {
      console.error('Error saving servico:', error);
      toast({
        title: 'Erro ao salvar',
        description: traduzirErro(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este serviço?')) return;

    try {
      const { error } = await supabase.from('servicos').update({ ativo: false }).eq('id', id);

      if (error) throw error;

      toast({
        title: 'Serviço excluído',
        description: 'O serviço foi removido.',
        variant: 'success',
      });

      fetchServicos();
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: traduzirErro(error),
        variant: 'destructive',
      });
    }
  };

  const filteredServicos = servicos.filter((servico) => {
    const searchLower = search.toLowerCase();
    return (
      servico.nome.toLowerCase().includes(searchLower) ||
      servico.descricao?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        titulo="Serviços"
        hint="Catálogo de serviços de assistência técnica, com preço de referência e garantia padrão."
        acoes={
          podeGerenciar && (
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Serviço
            </Button>
          )
        }
      />

      {/* Busca */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredServicos.length === 0 ? (
            <div className="py-4">
              <Vazio
                titulo="Nenhum serviço encontrado"
                descricao={search ? 'Tente outra busca.' : 'Cadastre seu primeiro serviço.'}
              />
              {!search && podeGerenciar && (
                <div className="flex justify-center pb-8">
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Cadastrar Serviço
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Preço de referência</TableHead>
                  {veCusto && <TableHead>Custo estimado</TableHead>}
                  {veCusto && <TableHead>Margem</TableHead>}
                  <TableHead>Garantia</TableHead>
                  <TableHead></TableHead>
                  {podeGerenciar && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServicos.map((servico) => {
                  const preco = Number(servico.preco_referencia) || 0;
                  const custo = Number(servico.custo_estimado) || 0;
                  // custo_estimado é NOT NULL DEFAULT 0 no banco (diferente de
                  // produtos.custo, que é nullable) — não existe estado "sem
                  // custo" pra distinguir de "custo zero", então a margem só
                  // fica condicionada a ter preço de referência.
                  const temMargem = veCusto && preco > 0;
                  const margem = temMargem ? ((preco - custo) / preco) * 100 : null;

                  return (
                    <TableRow key={servico.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{servico.nome}</span>
                          {servico.descricao && (
                            <span className="text-xs text-muted-foreground">
                              {servico.descricao}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {nomeGrupo(servico.grupo_id)}
                      </TableCell>
                      <TableCell>{moeda(servico.preco_referencia)}</TableCell>
                      {veCusto && (
                        <TableCell className="text-muted-foreground">
                          {moeda(servico.custo_estimado)}
                        </TableCell>
                      )}
                      {veCusto && (
                        <TableCell>
                          {margem !== null ? (
                            <span className={margem >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {margem.toFixed(1)}%
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground">
                        {servico.garantia_meses} {servico.garantia_meses === 1 ? 'mês' : 'meses'}
                      </TableCell>
                      <TableCell>
                        {servico.exige_aviso_risco && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Aviso de risco
                          </Badge>
                        )}
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
                              <DropdownMenuItem onClick={() => handleOpenDialog(servico)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDelete(servico.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
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
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingServico ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
            <DialogDescription>
              {editingServico
                ? 'Atualize os dados do serviço'
                : 'Preencha os dados para cadastrar um novo serviço'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex.: Troca de tela, Reballing GPU..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Detalhes sobre o que o serviço inclui"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="grupo">Grupo</Label>
              <Select
                value={formData.grupoId || SEM_GRUPO}
                onValueChange={(v) =>
                  setFormData({ ...formData, grupoId: v === SEM_GRUPO ? '' : v })
                }
              >
                <SelectTrigger id="grupo">
                  <SelectValue placeholder="Selecione um grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_GRUPO}>Nenhum grupo</SelectItem>
                  {gruposAtivos.map((grupo) => (
                    <SelectItem key={grupo.id} value={grupo.id}>
                      {grupo.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preco_referencia">Preço de referência</Label>
                <Input
                  id="preco_referencia"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.precoReferencia}
                  onChange={(e) => setFormData({ ...formData, precoReferencia: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              {veCusto && (
                <div className="space-y-2">
                  <Label htmlFor="custo_estimado">Custo estimado</Label>
                  <Input
                    id="custo_estimado"
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.custoEstimado}
                    onChange={(e) => setFormData({ ...formData, custoEstimado: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tempo_estimado_horas">Tempo estimado (horas)</Label>
                <Input
                  id="tempo_estimado_horas"
                  type="number"
                  min={0}
                  step={0.5}
                  value={formData.tempoEstimadoHoras}
                  onChange={(e) =>
                    setFormData({ ...formData, tempoEstimadoHoras: e.target.value })
                  }
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="garantia_meses">Garantia (meses)</Label>
                <Input
                  id="garantia_meses"
                  type="number"
                  min={0}
                  value={formData.garantiaMeses}
                  onChange={(e) => setFormData({ ...formData, garantiaMeses: e.target.value })}
                  placeholder="Padrão da casa: 3"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="exige_aviso_risco">Aviso de risco obrigatório</Label>
                <p className="text-xs text-muted-foreground">
                  Ative para reparo avançado (reballing, reflow, banho químico, oxidação) que
                  exige avisar o cliente sobre o risco antes de executar o serviço.
                </p>
              </div>
              <Switch
                id="exige_aviso_risco"
                checked={formData.exigeAvisoRisco}
                onCheckedChange={(v) => setFormData({ ...formData, exigeAvisoRisco: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingServico ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
