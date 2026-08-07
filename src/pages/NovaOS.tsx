import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { OS_PRIORITY } from '@/lib/constants';
import { useEffect } from 'react';

interface Cliente {
  id: string;
  nome: string;
  telefones: string[];
}

type OsPrioridade = "baixa" | "normal" | "alta" | "urgente";
type OsTipo = "paga" | "garantia" | "cortesia";

export default function NovaOS() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    numero_serie: '',
    marca: '',
    modelo: '',
    cor: '',
    memoria: '',
    condicao_entrada: '',
    senha_aparelho: '',
    defeito_cliente: '',
    observacoes: '',
    prioridade: 'normal' as OsPrioridade,
    tipo: 'paga' as OsTipo,
  });

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    const { data } = await supabase
      .from('clientes')
      .select('id, nome, telefones')
      .eq('ativo', true)
      .order('nome');
    setClientes(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCliente) {
      toast({
        title: 'Cliente obrigatório',
        description: 'Selecione um cliente para a OS.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.defeito_cliente.trim()) {
      toast({
        title: 'Defeito obrigatório',
        description: 'Descreva o defeito relatado pelo cliente.',
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
      if (!tenantId) throw new Error('Tenant não encontrado');

      const { data: os, error } = await supabase
        .from('service_orders')
        .insert([{
          tenant_id: tenantId,
          numero_os: '', // Trigger will generate
          cliente_id: selectedCliente.id,
          numero_serie: formData.numero_serie.trim() || null,
          marca: formData.marca.trim() || null,
          modelo: formData.modelo.trim() || null,
          cor: formData.cor.trim() || null,
          memoria: formData.memoria.trim() || null,
          condicao_entrada: formData.condicao_entrada.trim() || null,
          senha_aparelho: formData.senha_aparelho.trim() || null,
          defeito_cliente: formData.defeito_cliente.trim(),
          observacoes: formData.observacoes.trim() || null,
          prioridade: formData.prioridade,
          tipo: formData.tipo,
          status: 'recebido' as const,
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'OS criada!',
        description: `Ordem de serviço ${os.numero_os} criada com sucesso.`,
      });

      navigate('/os');
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Erro ao criar OS',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Nova Ordem de Serviço</h1>
        <p className="text-muted-foreground">
          Cadastre uma nova OS de reparo
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cliente */}
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <Popover open={clienteOpen} onOpenChange={setClienteOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {selectedCliente?.nome || 'Selecionar cliente...'}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandList>
                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    <CommandGroup>
                      {clientes.map(cliente => (
                        <CommandItem
                          key={cliente.id}
                          onSelect={() => {
                            setSelectedCliente(cliente);
                            setClienteOpen(false);
                          }}
                        >
                          <div>
                            <p className="font-medium">{cliente.nome}</p>
                            {cliente.telefones?.[0] && (
                              <p className="text-sm text-muted-foreground">
                                {cliente.telefones[0]}
                              </p>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        {/* Aparelho */}
        <Card>
          <CardHeader>
            <CardTitle>Aparelho</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cor">Cor</Label>
                <Input
                  id="cor"
                  value={formData.cor}
                  onChange={e => setFormData({ ...formData, cor: e.target.value })}
                  placeholder="Preto, Branco..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memoria">Memória</Label>
                <Input
                  id="memoria"
                  value={formData.memoria}
                  onChange={e => setFormData({ ...formData, memoria: e.target.value })}
                  placeholder="128GB, 256GB..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero_serie">Nº de Série / IMEI</Label>
                <Input
                  id="numero_serie"
                  value={formData.numero_serie}
                  onChange={e => setFormData({ ...formData, numero_serie: e.target.value })}
                  placeholder="Serial do console, IMEI do celular..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="condicao">Condição de Entrada</Label>
                <Input
                  id="condicao"
                  value={formData.condicao_entrada}
                  onChange={e => setFormData({ ...formData, condicao_entrada: e.target.value })}
                  placeholder="Riscos, trincas..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha do Aparelho</Label>
                <Input
                  id="senha"
                  value={formData.senha_aparelho}
                  onChange={e => setFormData({ ...formData, senha_aparelho: e.target.value })}
                  placeholder="Senha de desbloqueio"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Serviço */}
        <Card>
          <CardHeader>
            <CardTitle>Serviço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="defeito">Defeito Relatado *</Label>
              <Textarea
                id="defeito"
                value={formData.defeito_cliente}
                onChange={e => setFormData({ ...formData, defeito_cliente: e.target.value })}
                placeholder="Descreva o problema relatado pelo cliente..."
                rows={3}
              />
              {/* Nível 1 do laudo: o relato do cliente, nas palavras dele.
                  Suspeita e constatação técnica são registradas depois, na
                  bancada — nunca aqui. */}
              <p className="text-xs text-muted-foreground">
                Escreva o que o cliente falou, com as palavras dele. O
                diagnóstico técnico entra depois, na bancada.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Riscos combinados, recomendações, o que foi avisado ao cliente..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prioridade">Prioridade</Label>
                <Select
                  value={formData.prioridade}
                  onValueChange={value => setFormData({ ...formData, prioridade: value as OsPrioridade })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OS_PRIORITY).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={value => setFormData({ ...formData, tipo: value as OsTipo })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paga">Paga</SelectItem>
                    <SelectItem value="garantia">Garantia</SelectItem>
                    <SelectItem value="cortesia">Cortesia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/os')}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Criar OS'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
