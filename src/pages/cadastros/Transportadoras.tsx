import { useEffect, useState } from 'react';
import { Plus, Search, MoreHorizontal, Phone, Mail, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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

/**
 * Cadastro de Transportadoras.
 *
 * Tela simples: quem leva e traz encomenda até o cliente. Segue o mesmo
 * padrão de lista + busca + dialog de Clientes, só que sem tags/origem —
 * transportadora não tem esse tipo de classificação.
 */

interface Transportadora {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefones: string[];
  email: string | null;
  site_rastreio: string | null;
  observacoes: string | null;
}

const friendlyError = (error: unknown): string => {
  const msg = error instanceof Error ? error.message : String(error);
  // Mensagem de RLS é críptica; traduz pro que de fato aconteceu.
  return /row-level security|policy/i.test(msg)
    ? 'Seu perfil de acesso não permite fazer isso.'
    : msg;
};

export default function Transportadoras() {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.profile?.tenant_id ?? null;
  const podeGerenciar = can(PERMISSIONS.REGISTRY_SUPPLIERS_MANAGE);

  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransportadora, setEditingTransportadora] = useState<Transportadora | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    cpf_cnpj: '',
    telefone: '',
    email: '',
    site_rastreio: '',
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTransportadoras();
  }, []);

  const fetchTransportadoras = async () => {
    try {
      const { data, error } = await supabase
        .from('transportadoras')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setTransportadoras(data || []);
    } catch (error) {
      console.error('Error fetching transportadoras:', error);
      toast({
        title: 'Erro ao carregar transportadoras',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (transportadora?: Transportadora) => {
    if (transportadora) {
      setEditingTransportadora(transportadora);
      setFormData({
        nome: transportadora.nome,
        cpf_cnpj: transportadora.cpf_cnpj || '',
        telefone: transportadora.telefones?.[0] || '',
        email: transportadora.email || '',
        site_rastreio: transportadora.site_rastreio || '',
        observacoes: transportadora.observacoes || '',
      });
    } else {
      setEditingTransportadora(null);
      setFormData({
        nome: '',
        cpf_cnpj: '',
        telefone: '',
        email: '',
        site_rastreio: '',
        observacoes: '',
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome da transportadora.',
        variant: 'destructive',
      });
      return;
    }

    if (!tenantId) {
      toast({
        title: 'Usuário sem loja vinculada',
        description: 'Não foi possível identificar sua loja. Faça login novamente.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      const payload = {
        nome: formData.nome.trim(),
        cpf_cnpj: formData.cpf_cnpj.trim() || null,
        telefones: formData.telefone.trim() ? [formData.telefone.trim()] : [],
        email: formData.email.trim() || null,
        site_rastreio: formData.site_rastreio.trim() || null,
        observacoes: formData.observacoes.trim() || null,
      };

      if (editingTransportadora) {
        const { error } = await supabase
          .from('transportadoras')
          .update(payload)
          .eq('id', editingTransportadora.id);

        if (error) throw error;

        toast({
          title: 'Transportadora atualizada!',
          description: 'Os dados foram salvos com sucesso.',
        });
      } else {
        const { error } = await supabase
          .from('transportadoras')
          .insert({ ...payload, tenant_id: tenantId });

        if (error) throw error;

        toast({
          title: 'Transportadora cadastrada!',
          description: 'A transportadora foi adicionada com sucesso.',
        });
      }

      setDialogOpen(false);
      fetchTransportadoras();
    } catch (error) {
      console.error('Error saving transportadora:', error);
      toast({
        title: 'Erro ao salvar',
        description: friendlyError(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta transportadora?')) return;

    try {
      const { error } = await supabase
        .from('transportadoras')
        .update({ ativo: false })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Transportadora excluída',
        description: 'A transportadora foi removida.',
      });

      fetchTransportadoras();
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: friendlyError(error),
        variant: 'destructive',
      });
    }
  };

  const filteredTransportadoras = transportadoras.filter(transportadora => {
    const searchLower = search.toLowerCase();
    return (
      transportadora.nome.toLowerCase().includes(searchLower) ||
      transportadora.cpf_cnpj?.toLowerCase().includes(searchLower) ||
      transportadora.telefones?.some(t => t.includes(search))
    );
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <PageHeader
        titulo="Transportadoras"
        hint="Quem leva e traz encomenda até o cliente."
        acoes={
          podeGerenciar ? (
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Transportadora
            </Button>
          ) : undefined
        }
      />

      {/* Busca */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
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
          ) : filteredTransportadoras.length === 0 ? (
            <div className="py-4">
              <Vazio
                titulo="Nenhuma transportadora encontrada"
                descricao={
                  search
                    ? 'Tente outra busca.'
                    : podeGerenciar
                      ? 'Cadastre a primeira transportadora.'
                      : undefined
                }
              />
              {!search && podeGerenciar && (
                <div className="flex justify-center pb-8">
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Cadastrar Transportadora
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
                  <TableHead>Rastreio</TableHead>
                  {podeGerenciar && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransportadoras.map(transportadora => (
                  <TableRow key={transportadora.id}>
                    <TableCell className="font-medium">{transportadora.nome}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {transportadora.telefones?.[0] && (
                          <span className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {transportadora.telefones[0]}
                          </span>
                        )}
                        {transportadora.email && (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {transportadora.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {transportadora.cpf_cnpj || '-'}
                    </TableCell>
                    <TableCell>
                      {transportadora.site_rastreio ? (
                        <a
                          href={transportadora.site_rastreio}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-2 hover:text-primary/80"
                        >
                          Rastrear
                        </a>
                      ) : (
                        '—'
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
                            <DropdownMenuItem onClick={() => handleOpenDialog(transportadora)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(transportadora.id)}
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingTransportadora ? 'Editar Transportadora' : 'Nova Transportadora'}
            </DialogTitle>
            <DialogDescription>
              {editingTransportadora
                ? 'Atualize os dados da transportadora'
                : 'Preencha os dados para cadastrar uma nova transportadora'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={e => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Razão social ou nome fantasia"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
                <Input
                  id="cpf_cnpj"
                  value={formData.cpf_cnpj}
                  onChange={e => setFormData({ ...formData, cpf_cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={e => setFormData({ ...formData, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="contato@transportadora.com.br"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site_rastreio">Site de rastreio</Label>
              <Input
                id="site_rastreio"
                value={formData.site_rastreio}
                onChange={e => setFormData({ ...formData, site_rastreio: e.target.value })}
                placeholder="https://rastreamento.transportadora.com.br"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Prazo médio, condições de coleta, contato preferencial..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingTransportadora ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
