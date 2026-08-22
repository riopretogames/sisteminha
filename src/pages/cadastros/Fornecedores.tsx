import { useEffect, useState } from 'react';
import { Plus, Search, MoreHorizontal, Phone, Mail, User, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { mascaraCpfCnpj, mascaraTelefone, mascaraCep } from '@/lib/documento';

/**
 * Cadastro de Fornecedores.
 *
 * Espelha a tela de Clientes: lista com busca client-side, dialog único para
 * criar/editar e exclusão lógica (ativo=false) — nunca DELETE de verdade,
 * porque fornecedor antigo costuma estar referenciado em compra/entrada de
 * estoque histórica.
 *
 * Corte de escopo deliberado: só um telefone por fornecedor (grava em
 * `telefones[0]`), igual Clientes.tsx já faz. Se um dia precisar de vários
 * contatos por fornecedor, isso vira um cadastro filho, não um campo repetido
 * aqui.
 */

type Fornecedor = Database['public']['Tables']['fornecedores']['Row'];

interface FornecedorFormData {
  nome: string;
  razao_social: string;
  cpf_cnpj: string;
  inscricao_estadual: string;
  telefone: string;
  contato_nome: string;
  email: string;
  site: string;
  prazo_entrega_dias: string;
  cep: string;
  estado: string;
  municipio: string;
  bairro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  observacoes: string;
}

const FORM_VAZIO: FornecedorFormData = {
  nome: '',
  razao_social: '',
  cpf_cnpj: '',
  inscricao_estadual: '',
  telefone: '',
  contato_nome: '',
  email: '',
  site: '',
  prazo_entrega_dias: '',
  cep: '',
  estado: '',
  municipio: '',
  bairro: '',
  logradouro: '',
  numero: '',
  complemento: '',
  observacoes: '',
};

/** Mensagem de RLS é críptica; traduz pro que de fato aconteceu. */
function traduzirErro(error: unknown): string {
  const msg = error instanceof Error ? error.message : 'Tente novamente.';
  return /row-level security|policy/i.test(msg)
    ? 'Seu perfil de acesso não permite fazer isso.'
    : msg;
}

export default function Fornecedores() {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.profile?.tenant_id ?? null;
  const podeGerenciar = can(PERMISSIONS.REGISTRY_SUPPLIERS_MANAGE);

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFornecedor, setEditingFornecedor] = useState<Fornecedor | null>(null);
  const [formData, setFormData] = useState<FornecedorFormData>(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFornecedores();
  }, []);

  const fetchFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setFornecedores(data ?? []);
    } catch (error) {
      console.error('Error fetching fornecedores:', error);
      toast({
        title: 'Erro ao carregar fornecedores',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (fornecedor?: Fornecedor) => {
    if (fornecedor) {
      setEditingFornecedor(fornecedor);
      setFormData({
        nome: fornecedor.nome,
        razao_social: fornecedor.razao_social ?? '',
        cpf_cnpj: mascaraCpfCnpj(fornecedor.cpf_cnpj ?? ''),
        inscricao_estadual: fornecedor.inscricao_estadual ?? '',
        telefone: mascaraTelefone(fornecedor.telefones?.[0] ?? ''),
        contato_nome: fornecedor.contato_nome ?? '',
        email: fornecedor.email ?? '',
        site: fornecedor.site ?? '',
        prazo_entrega_dias: fornecedor.prazo_entrega_dias?.toString() ?? '',
        cep: mascaraCep(fornecedor.cep ?? ''),
        estado: fornecedor.estado ?? '',
        municipio: fornecedor.municipio ?? '',
        bairro: fornecedor.bairro ?? '',
        logradouro: fornecedor.logradouro ?? '',
        numero: fornecedor.numero ?? '',
        complemento: fornecedor.complemento ?? '',
        observacoes: fornecedor.observacoes ?? '',
      });
    } else {
      setEditingFornecedor(null);
      setFormData(FORM_VAZIO);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do fornecedor.',
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
      const prazoEntregaDias = formData.prazo_entrega_dias.trim()
        ? Number(formData.prazo_entrega_dias)
        : null;

      const fornecedorData = {
        nome: formData.nome.trim(),
        razao_social: formData.razao_social.trim() || null,
        cpf_cnpj: formData.cpf_cnpj.trim() || null,
        inscricao_estadual: formData.inscricao_estadual.trim() || null,
        telefones: formData.telefone.trim() ? [formData.telefone.trim()] : [],
        contato_nome: formData.contato_nome.trim() || null,
        email: formData.email.trim() || null,
        site: formData.site.trim() || null,
        prazo_entrega_dias:
          prazoEntregaDias !== null && !Number.isNaN(prazoEntregaDias) ? prazoEntregaDias : null,
        cep: formData.cep.trim() || null,
        estado: formData.estado.trim() || null,
        municipio: formData.municipio.trim() || null,
        bairro: formData.bairro.trim() || null,
        logradouro: formData.logradouro.trim() || null,
        numero: formData.numero.trim() || null,
        complemento: formData.complemento.trim() || null,
        observacoes: formData.observacoes.trim() || null,
      };

      if (editingFornecedor) {
        const { error } = await supabase
          .from('fornecedores')
          .update(fornecedorData)
          .eq('id', editingFornecedor.id);

        if (error) throw error;

        toast({
          title: 'Fornecedor atualizado!',
          description: 'Os dados foram salvos com sucesso.',
          variant: 'success',
        });
      } else {
        const { error } = await supabase
          .from('fornecedores')
          .insert({ ...fornecedorData, tenant_id: tenantId });

        if (error) throw error;

        toast({
          title: 'Fornecedor cadastrado!',
          description: 'O fornecedor foi adicionado com sucesso.',
          variant: 'success',
        });
      }

      setDialogOpen(false);
      fetchFornecedores();
    } catch (error) {
      console.error('Error saving fornecedor:', error);
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
    if (!confirm('Tem certeza que deseja excluir este fornecedor?')) return;

    try {
      const { error } = await supabase
        .from('fornecedores')
        .update({ ativo: false })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Fornecedor excluído',
        description: 'O fornecedor foi removido.',
        variant: 'success',
      });

      fetchFornecedores();
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: traduzirErro(error),
        variant: 'destructive',
      });
    }
  };

  const filteredFornecedores = fornecedores.filter((fornecedor) => {
    const searchLower = search.toLowerCase();
    return (
      fornecedor.nome.toLowerCase().includes(searchLower) ||
      fornecedor.cpf_cnpj?.toLowerCase().includes(searchLower) ||
      fornecedor.contato_nome?.toLowerCase().includes(searchLower) ||
      fornecedor.telefones?.some((t) => t.includes(search))
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        titulo="Fornecedores"
        hint="Quem abastece a loja. Usado nas compras e entradas de estoque."
        acoes={
          podeGerenciar && (
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Fornecedor
            </Button>
          )
        }
      />

      {/* Busca */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF/CNPJ, contato ou telefone..."
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
          ) : filteredFornecedores.length === 0 ? (
            <div className="py-4">
              <Vazio
                titulo="Nenhum fornecedor encontrado"
                descricao={search ? 'Tente outra busca.' : 'Cadastre seu primeiro fornecedor.'}
              />
              {!search && podeGerenciar && (
                <div className="flex justify-center pb-8">
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Cadastrar Fornecedor
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Prazo de entrega</TableHead>
                  {podeGerenciar && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFornecedores.map((fornecedor) => (
                  <TableRow key={fornecedor.id}>
                    <TableCell className="font-medium">{fornecedor.nome}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {fornecedor.contato_nome && (
                          <span className="flex items-center gap-1 text-sm">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {fornecedor.contato_nome}
                          </span>
                        )}
                        {fornecedor.telefones?.[0] && (
                          <span className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {fornecedor.telefones[0]}
                          </span>
                        )}
                        {fornecedor.email && (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {fornecedor.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fornecedor.cpf_cnpj || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fornecedor.prazo_entrega_dias != null
                        ? `${fornecedor.prazo_entrega_dias} dia${fornecedor.prazo_entrega_dias === 1 ? '' : 's'}`
                        : '—'}
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
                            <DropdownMenuItem onClick={() => handleOpenDialog(fornecedor)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(fornecedor.id)}
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
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}
            </DialogTitle>
            <DialogDescription>
              {editingFornecedor
                ? 'Atualize os dados do fornecedor'
                : 'Preencha os dados para cadastrar um novo fornecedor'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Nome do fornecedor"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="razao_social">Razão social</Label>
                <Input
                  id="razao_social"
                  value={formData.razao_social}
                  onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                  placeholder="Razão social"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
                <Input
                  id="cpf_cnpj"
                  value={formData.cpf_cnpj}
                  onChange={(e) => setFormData({ ...formData, cpf_cnpj: mascaraCpfCnpj(e.target.value) })}
                  placeholder="000.000.000-00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inscricao_estadual">Inscrição Estadual</Label>
                <Input
                  id="inscricao_estadual"
                  value={formData.inscricao_estadual}
                  onChange={(e) =>
                    setFormData({ ...formData, inscricao_estadual: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: mascaraTelefone(e.target.value) })}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contato_nome">Contato (quem atender)</Label>
                <Input
                  id="contato_nome"
                  value={formData.contato_nome}
                  onChange={(e) => setFormData({ ...formData, contato_nome: e.target.value })}
                  placeholder="Nome de quem atender"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="site">Site</Label>
                <Input
                  id="site"
                  value={formData.site}
                  onChange={(e) => setFormData({ ...formData, site: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prazo_entrega_dias">Prazo de entrega (dias)</Label>
                <Input
                  id="prazo_entrega_dias"
                  type="number"
                  min={0}
                  value={formData.prazo_entrega_dias}
                  onChange={(e) =>
                    setFormData({ ...formData, prazo_entrega_dias: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Endereço</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={formData.cep}
                    onChange={(e) => setFormData({ ...formData, cep: mascaraCep(e.target.value) })}
                    placeholder="00000-000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado">Estado</Label>
                  <Input
                    id="estado"
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    placeholder="SP"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="municipio">Município</Label>
                  <Input
                    id="municipio"
                    value={formData.municipio}
                    onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input
                    id="bairro"
                    value={formData.bairro}
                    onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logradouro">Logradouro</Label>
                  <Input
                    id="logradouro"
                    value={formData.logradouro}
                    onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="numero">Número</Label>
                    <Input
                      id="numero"
                      value={formData.numero}
                      onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="complemento">Complemento</Label>
                    <Input
                      id="complemento"
                      value={formData.complemento}
                      onChange={(e) =>
                        setFormData({ ...formData, complemento: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Anotações sobre este fornecedor"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingFornecedor ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
