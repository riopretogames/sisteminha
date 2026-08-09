import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronsUpDown, Loader2, UserPlus } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CampoCatalogo } from '@/components/CampoCatalogo';
import { ChecklistEntrada } from '@/components/os/ChecklistEntrada';
import { SenhaPadrao } from '@/components/os/SenhaPadrao';
import { ClienteFormDialog } from '@/components/clientes/ClienteFormDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useCatalogo } from '@/hooks/useCatalogos';
import { PERMISSIONS } from '@/config/permissions';
import { OS_PRIORITY } from '@/lib/constants';
import { soDigitos } from '@/lib/documento';
import { cn } from '@/lib/utils';

/**
 * Abertura de Ordem de Serviço — o check-in do aparelho.
 *
 * Reescrita em 09/08 depois que o Felipe comparou com o sistema que a loja usa
 * hoje: "está muito básica, muito precária. Todos os campos são selecionáveis,
 * criados na aba cadastro."
 *
 * O que mudou de fundo: marca, modelo, cor e memória eram digitação livre, e o
 * banco acabava com "Samsung", "samsung" e "SANSUNG" como coisas diferentes.
 * Agora vêm dos catálogos de Listas do Sistema — que já existiam, semeados
 * desde 01/08, sem nenhuma tela lendo. O mesmo vale para os três checklists da
 * entrada (29 sintomas, 12 pertences, 6 condições).
 *
 * O check-in não é papelada: é o que protege a loja quando o cliente volta
 * dizendo que deixou uma fonte junto, ou que a tela já estava trincada.
 */

interface Cliente {
  id: string;
  nome: string;
  telefones: string[] | null;
}

interface Pessoa {
  id: string;
  nome: string;
}

type OsPrioridade = 'baixa' | 'normal' | 'alta' | 'urgente';
type OsTipo = 'paga' | 'garantia' | 'cortesia';

const FORM_VAZIO = {
  equipamento_id: '',
  marca_id: '',
  modelo_id: '',
  cor_id: '',
  memoria_id: '',
  numero_serie: '',
  defeito_cliente: '',
  senha_aparelho: '',
  senha_padrao: '',
  anotacoes_checkin: '',
  observacoes: '',
  tecnico_id: '',
  vendedor_id: '',
  prioridade: 'normal' as OsPrioridade,
  tipo: 'paga' as OsTipo,
};

export default function NovaOS() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, can } = useAuth();
  const podeCadastrarCliente = can(PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [clienteBusca, setClienteBusca] = useState('');
  const [novoClienteAberto, setNovoClienteAberto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  // Os três blocos do check-in, cada um guardando ids do catálogo.
  const [defeitos, setDefeitos] = useState<string[]>([]);
  const [acessorios, setAcessorios] = useState<string[]>([]);
  const [condicoes, setCondicoes] = useState<string[]>([]);

  // Só para converter id → texto na hora de gravar as colunas antigas.
  const marcas = useCatalogo('os_marca');
  const modelos = useCatalogo('os_modelo');
  const cores = useCatalogo('os_cor');
  const memorias = useCatalogo('os_memoria');
  const condicoesCatalogo = useCatalogo('condicao_entrada');
  const defeitosCatalogo = useCatalogo('checklist_defeito');

  useEffect(() => {
    fetchClientes();
    fetchPessoas();
  }, []);

  const fetchClientes = async () => {
    const { data } = await supabase
      .from('clientes')
      .select('id, nome, telefones')
      .eq('ativo', true)
      .order('nome');
    setClientes(data ?? []);
  };

  /** Técnico e vendedor saem da mesma lista: quem tem acesso ao sistema. */
  const fetchPessoas = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    setPessoas(data ?? []);
  };

  const alterar = <C extends keyof typeof FORM_VAZIO>(campo: C, valor: (typeof FORM_VAZIO)[C]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const descricaoDe = (
    catalogo: ReturnType<typeof useCatalogo>,
    id: string
  ): string | null => (catalogo.data ?? []).find((i) => i.id === id)?.descricao ?? null;

  const clientesFiltrados = clientes.filter((c) => {
    const termo = clienteBusca.trim().toLowerCase();
    if (!termo) return true;
    const digitos = soDigitos(termo);
    return (
      c.nome.toLowerCase().includes(termo) ||
      (digitos.length > 0 && (c.telefones ?? []).some((t) => soDigitos(t).includes(digitos)))
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCliente) {
      toast({
        title: 'Cliente obrigatório',
        description: 'Selecione o cliente dono do aparelho.',
        variant: 'destructive',
      });
      return;
    }

    // Defeito relatado continua obrigatório: OS sem defeito é OS que ninguém
    // sabe pra que serve quando chega na bancada.
    if (!form.defeito_cliente.trim() && defeitos.length === 0) {
      toast({
        title: 'Falta o defeito',
        description: 'Marque um sintoma no checklist ou descreva o problema relatado.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      // Perfil vem de useAuth() — não refaz consulta em `profiles` sem filtrar
      // por usuário (isso quebrava com "Tenant não encontrado" assim que a loja
      // tivesse 2+ usuários; ver PDV.tsx pro mesmo fix).
      const tenantId = user?.profile?.tenant_id ?? null;
      if (!tenantId) throw new Error('Usuário sem loja vinculada.');

      // Quando o atendente não escreve nada, o texto do defeito vira a lista de
      // sintomas marcados — assim o laudo nunca sai com o campo vazio.
      const defeitoTexto =
        form.defeito_cliente.trim() ||
        defeitos
          .map((id) => descricaoDe(defeitosCatalogo, id))
          .filter(Boolean)
          .join('; ');

      const { data: os, error } = await supabase
        .from('service_orders')
        .insert([
          {
            tenant_id: tenantId,
            numero_os: '', // gerado por gatilho no banco
            cliente_id: selectedCliente.id,

            equipamento_id: form.equipamento_id || null,
            marca_id: form.marca_id || null,
            modelo_id: form.modelo_id || null,
            cor_id: form.cor_id || null,
            memoria_id: form.memoria_id || null,

            // Colunas de texto antigas seguem preenchidas a partir da escolha,
            // pra nenhum relatório existente quebrar. Mesmo tratamento que a
            // 20260807060000 deu às formas de pagamento.
            marca: descricaoDe(marcas, form.marca_id),
            modelo: descricaoDe(modelos, form.modelo_id),
            cor: descricaoDe(cores, form.cor_id),
            memoria: descricaoDe(memorias, form.memoria_id),
            condicao_entrada:
              condicoes
                .map((id) => descricaoDe(condicoesCatalogo, id))
                .filter(Boolean)
                .join('; ') || null,

            numero_serie: form.numero_serie.trim() || null,
            defeito_cliente: defeitoTexto,
            senha_aparelho: form.senha_aparelho.trim() || null,
            senha_padrao: form.senha_padrao || null,
            anotacoes_checkin: form.anotacoes_checkin.trim() || null,
            observacoes: form.observacoes.trim() || null,
            tecnico_id: form.tecnico_id || null,
            vendedor_id: form.vendedor_id || null,
            prioridade: form.prioridade,
            tipo: form.tipo,
            status: 'recebido' as const,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // O checklist vai depois da OS existir, porque depende do id dela. Se
      // esta parte falhar, a OS já está criada — melhor perder as marcações e
      // avisar do que perder a OS inteira com o cliente no balcão.
      const marcados = [...defeitos, ...acessorios, ...condicoes];
      if (marcados.length > 0) {
        const { error: erroChecklist } = await supabase.from('os_checklist').insert(
          marcados.map((catalogo_id) => ({
            os_id: os.id,
            catalogo_id,
            tenant_id: tenantId,
          }))
        );

        if (erroChecklist) {
          console.error('Erro ao gravar checklist:', erroChecklist);
          toast({
            title: 'OS criada, mas o checklist não foi salvo',
            description: 'Abra a OS e marque os itens novamente.',
            variant: 'destructive',
          });
          navigate(`/os/${os.id}`);
          return;
        }
      }

      toast({
        title: 'OS criada!',
        description: `Ordem de serviço ${os.numero_os} aberta com sucesso.`,
      });

      navigate(`/os/${os.id}`);
    } catch (error) {
      console.error('Erro ao criar OS:', error);
      const msg = error instanceof Error ? error.message : 'Tente novamente.';
      toast({
        title: 'Erro ao criar OS',
        description: /row-level security|policy/i.test(msg)
          ? 'Seu perfil de acesso não permite abrir OS.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/os')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Ordens de Serviço
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Nova Ordem de Serviço</h1>
        <p className="text-muted-foreground">
          Check-in do aparelho. O que for marcado aqui é o que protege a loja na hora da
          devolução.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Cliente ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1 space-y-2">
              <Label>Dono do aparelho *</Label>
              <Popover open={clienteOpen} onOpenChange={setClienteOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    <span className={cn('truncate', !selectedCliente && 'text-muted-foreground')}>
                      {selectedCliente ? selectedCliente.nome : 'Buscar por nome ou telefone...'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Nome ou telefone..."
                      value={clienteBusca}
                      onValueChange={setClienteBusca}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          Nenhum cliente encontrado.
                        </p>
                      </CommandEmpty>
                      <CommandGroup>
                        {clientesFiltrados.slice(0, 50).map((cliente) => (
                          <CommandItem
                            key={cliente.id}
                            value={cliente.id}
                            onSelect={() => {
                              setSelectedCliente(cliente);
                              setClienteOpen(false);
                              setClienteBusca('');
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedCliente?.id === cliente.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">{cliente.nome}</span>
                            {cliente.telefones?.[0] && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {cliente.telefones[0]}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {podeCadastrarCliente && (
              <Button type="button" variant="outline" onClick={() => setNovoClienteAberto(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Novo Cliente
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ── Equipamento ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipamento</CardTitle>
            <p className="text-sm text-muted-foreground">
              Todos os campos vêm de Cadastros &gt; Listas do Sistema. Se faltar alguma opção,
              digite e cadastre na hora.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoCatalogo
                id="equipamento"
                tipo="os_equipamento"
                label="Equipamento"
                placeholder="Celular, Console, Controle..."
                valor={form.equipamento_id}
                onChange={(v) => alterar('equipamento_id', v)}
              />
              <div className="space-y-2">
                <Label htmlFor="numero_serie">IMEI / Nº de Série</Label>
                <Input
                  id="numero_serie"
                  value={form.numero_serie}
                  onChange={(e) => alterar('numero_serie', e.target.value)}
                  placeholder="Identificação única do aparelho"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <CampoCatalogo
                id="marca"
                tipo="os_marca"
                label="Marca"
                valor={form.marca_id}
                onChange={(v) => alterar('marca_id', v)}
              />
              <CampoCatalogo
                id="modelo"
                tipo="os_modelo"
                label="Modelo"
                valor={form.modelo_id}
                onChange={(v) => alterar('modelo_id', v)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <CampoCatalogo
                id="cor"
                tipo="os_cor"
                label="Cor"
                valor={form.cor_id}
                onChange={(v) => alterar('cor_id', v)}
              />
              <CampoCatalogo
                id="memoria"
                tipo="os_memoria"
                label="Memória / Capacidade"
                valor={form.memoria_id}
                onChange={(v) => alterar('memoria_id', v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Check-in ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Check-in do aparelho</CardTitle>
            <p className="text-sm text-muted-foreground">
              Marque o que o cliente relatou, o que veio junto e como o aparelho chegou.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="defeito">Problema informado pelo cliente</Label>
              <Textarea
                id="defeito"
                value={form.defeito_cliente}
                onChange={(e) => alterar('defeito_cliente', e.target.value)}
                placeholder="Nas palavras do cliente. Se ficar em branco, valem os sintomas marcados abaixo."
                rows={2}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <ChecklistEntrada
                tipo="checklist_defeito"
                titulo="Defeitos e sintomas"
                hint="O que o cliente relata — não é o diagnóstico."
                tom="defeito"
                selecionados={defeitos}
                onChange={setDefeitos}
              />
              <ChecklistEntrada
                tipo="acessorio_entrada"
                titulo="Itens do aparelho"
                hint="O que veio junto. Protege a loja na devolução."
                tom="item"
                selecionados={acessorios}
                onChange={setAcessorios}
              />
              <ChecklistEntrada
                tipo="condicao_entrada"
                titulo="Condições de entrada"
                hint="Estado físico ANTES do reparo."
                tom="condicao"
                selecionados={condicoes}
                onChange={setCondicoes}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="anotacoes">Anotações do check-in</Label>
                <Textarea
                  id="anotacoes"
                  value={form.anotacoes_checkin}
                  onChange={(e) => alterar('anotacoes_checkin', e.target.value)}
                  placeholder="O que não coube no checklist. Aparece no laudo do cliente."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações internas</Label>
                <Textarea
                  id="observacoes"
                  value={form.observacoes}
                  onChange={(e) => alterar('observacoes', e.target.value)}
                  placeholder="Só a equipe vê. Não sai no laudo do cliente."
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Senhas ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Senhas do aparelho</CardTitle>
            <p className="text-sm text-muted-foreground">
              Sem a senha, o técnico não testa o reparo — e o aparelho volta pro balcão à toa.
            </p>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="senha">Senha digitada</Label>
              <Input
                id="senha"
                value={form.senha_aparelho}
                onChange={(e) => alterar('senha_aparelho', e.target.value)}
                placeholder="PIN, senha alfanumérica, conta Google..."
              />
            </div>
            <div className="space-y-2">
              <Label>Senha de desenho</Label>
              <SenhaPadrao
                valor={form.senha_padrao}
                onChange={(v) => alterar('senha_padrao', v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Atendimento ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atendimento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vendedor">Quem recebeu (balcão)</Label>
              <Select
                value={form.vendedor_id || 'nenhum'}
                onValueChange={(v) => alterar('vendedor_id', v === 'nenhum' ? '' : v)}
              >
                <SelectTrigger id="vendedor">
                  <SelectValue placeholder="Não informado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Não informado</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tecnico">Técnico responsável</Label>
              <Select
                value={form.tecnico_id || 'nenhum'}
                onValueChange={(v) => alterar('tecnico_id', v === 'nenhum' ? '' : v)}
              >
                <SelectTrigger id="tecnico">
                  <SelectValue placeholder="Definir depois" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Definir depois</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select
                value={form.prioridade}
                onValueChange={(v) => alterar('prioridade', v as OsPrioridade)}
              >
                <SelectTrigger id="prioridade">
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
              <Select value={form.tipo} onValueChange={(v) => alterar('tipo', v as OsTipo)}>
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paga">Paga</SelectItem>
                  <SelectItem value="garantia">Garantia</SelectItem>
                  <SelectItem value="cortesia">Cortesia</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/os')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Abrindo...' : 'Abrir OS'}
          </Button>
        </div>
      </form>

      {/* Mesmo formulário de Cadastros > Clientes — decisão de 08/08: não
          existe versão reduzida do cadastro. */}
      <ClienteFormDialog
        open={novoClienteAberto}
        onOpenChange={setNovoClienteAberto}
        nomeInicial={clienteBusca.trim()}
        onSalvo={(salvo) => {
          const novo: Cliente = {
            id: salvo.id,
            nome: salvo.nome,
            telefones: salvo.telefones,
          };
          setClientes((atuais) =>
            [...atuais, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
          );
          setSelectedCliente(novo);
          setClienteBusca('');
        }}
        onUsarExistente={(id) => {
          const existente = clientes.find((c) => c.id === id);
          if (existente) {
            setSelectedCliente(existente);
            setClienteBusca('');
          }
        }}
      />
    </div>
  );
}
