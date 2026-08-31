import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronsUpDown, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import { OS_STATUS_INICIAL } from '@/config/osStatus';
import { faltandoParaAbrirOS } from '@/lib/osObrigatorios';
import { useCamposObrigatorios } from '@/hooks/useCamposObrigatorios';

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
  /**
   * Desligado = o banco RECUSA venda pra esse cliente (gatilho
   * `trg_venda_cliente_bloqueado`, migration 20260808160000). Mas OS a trava
   * não alcança de propósito: aparelho que já está na bancada precisa ser
   * devolvido de algum jeito, e recusar a abertura da OS deixaria o aparelho
   * sem registro nenhum. Serve pra avisar, não pra impedir.
   */
  liberado_venda: boolean | null;
}

interface Pessoa {
  id: string;
  nome: string;
}

type OsPrioridade = 'baixa' | 'normal' | 'alta' | 'urgente';
type OsTipo = 'paga' | 'garantia' | 'cortesia';

/**
 * Onde cada campo obrigatório mora na tela.
 *
 * Serve para o aviso de "falta o modelo" rolar a página até o modelo. Sem
 * isso, numa página longa como esta, o atendente lê o aviso e fica procurando
 * o campo — que é como se aprende a odiar o sistema.
 */
const CAMPO_NA_TELA: Record<string, string> = {
  cliente_id: 'cliente',
  equipamento_id: 'equipamento',
  numero_serie: 'numero_serie',
  marca_id: 'marca',
  modelo_id: 'modelo',
  defeito_cliente: 'defeito',
  tem_senha: 'tem-senha',
  senha_aparelho: 'senha',
  vendedor_id: 'vendedor',
  prazo_previsto: 'prazo',
};

const FORM_VAZIO = {
  equipamento_id: '',
  marca_id: '',
  modelo_id: '',
  cor_id: '',
  memoria_id: '',
  numero_serie: '',
  defeito_cliente: '',
  // "O aparelho tem senha?" — vazio significa que ninguém perguntou ainda, e
  // é isso que a abertura barra. Ver src/lib/osObrigatorios.ts.
  tem_senha: '' as '' | 'sim' | 'nao',
  senha_aparelho: '',
  senha_padrao: '',
  anotacoes_checkin: '',
  observacoes: '',
  tecnico_id: '',
  vendedor_id: '',
  // Prazo do laudo: 3 dias. Regra da loja (09/08) - a OS nasce com ele
  // preenchido, e o atendente troca por "reparo avançado" ou por uma data
  // livre quando for o caso.
  prazo_previsto: '',
  // Toda OS nasce esperando laudo: é o caminho mais cuidadoso. Desligar é
  // escolha consciente para o serviço tabelado, em que a loja já sabe o preço
  // antes de abrir o aparelho. Se fosse o contrário, o esquecimento levaria o
  // aparelho para a bancada sem ninguém ter combinado a análise com o cliente.
  laudo_eletronico: true,
  // Padrão da loja. Decisão do Felipe em 09/08.
  garantia_dias: '90',
  prioridade: 'normal' as OsPrioridade,
  tipo: 'paga' as OsTipo,
};

/**
 * Prazos de garantia que a loja pratica.
 *
 * Esta é uma lista fixa de propósito, contrariando a regra geral de "campo que
 * a loja cadastra vem de Listas do Sistema" — e vale explicar por quê: o valor
 * aqui é CONTA, não texto. Vai virar data de vencimento quando os status da
 * assistência entrarem. Numa lista editável, alguém cadastraria "três meses" ou
 * "1 ano e meio" e o cálculo quebraria sem aviso.
 *
 * "Outro" resolve o caso raro sem travar o balcão: digita os dias e pronto.
 */
const GARANTIAS = [
  { dias: '30', label: '30 dias' },
  { dias: '60', label: '60 dias' },
  { dias: '90', label: '90 dias (padrão da loja)' },
  { dias: '180', label: '180 dias' },
  { dias: '365', label: '1 ano' },
];

/**
 * Tipo de reparo — atalho que preenche o prazo prometido.
 *
 * Regra da loja, ditada pelo Felipe em 09/08: toda OS nasce com **3 dias**,
 * que é o prazo para dar o laudo ao cliente. Passou disso sem laudo, a OS entra
 * na lista de atrasadas. Reparo avançado (microsoldagem, placa, o que depende
 * de peça) leva **30 dias**.
 *
 * São atalhos, não regras fechadas: a data continua editável logo abaixo,
 * porque sempre existe o caso que não cabe em nenhuma das duas caixas.
 */
const TIPOS_DE_REPARO = [
  { id: 'simples', label: 'Reparo simples', dias: 3, hint: '3 dias para o laudo' },
  { id: 'avancado', label: 'Reparo avançado', dias: 30, hint: '30 dias de retorno' },
] as const;

/** Data de hoje + N dias, em 'YYYY-MM-DD' e no fuso local. */
function prazoEmDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export default function NovaOS() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, can } = useAuth();
  const podeCadastrarCliente = can(PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE);
  // O que ESTA loja exige. Configurável em Configurações > Campos
  // Obrigatórios; sem configuração, vale o padrão de 27/08.
  const { exige, exigencias } = useCamposObrigatorios('os');

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [clienteBusca, setClienteBusca] = useState('');
  const [novoClienteAberto, setNovoClienteAberto] = useState(false);
  const [saving, setSaving] = useState(false);
  // Nasce com o prazo do laudo já preenchido (3 dias). Calculado aqui e não na
  // constante porque a data de hoje muda: constante de módulo congelaria o
  // valor de quando a página foi carregada pela primeira vez.
  const [form, setForm] = useState(() => ({
    ...FORM_VAZIO,
    prazo_previsto: prazoEmDias(TIPOS_DE_REPARO[0].dias),
  }));

  /**
   * "Quem recebeu" nasce com quem está logado.
   *
   * Pedido do Felipe em 27/08: *"se tá no login do Felipe, logicamente quem
   * recebeu foi o Felipe"*. Continua trocável — o balcão empresta a máquina o
   * tempo todo —, mas o caso comum deixa de custar um clique.
   *
   * Duas condições, e as duas custaram um teste que falhou antes de eu
   * entender:
   *
   *   1. Só preenche o que está VAZIO. Se o atendente já escolheu outra
   *      pessoa, mexer aqui desfaria a escolha dele.
   *   2. Só depois que a lista de pessoas chegou do banco. Escolher alguém
   *      que ainda não está na lista faz o campo se limpar sozinho — o
   *      componente descarta valor que não corresponde a nenhuma opção, e o
   *      resultado é o campo em branco justamente na tela em que ele agora é
   *      obrigatório. A lista vem por consulta, então no primeiro instante
   *      ela está vazia SEMPRE, não só no teste.
   */
  useEffect(() => {
    const eu = user?.profile?.id;
    if (!eu || !pessoas.some((p) => p.id === eu)) return;
    setForm((f) => (f.vendedor_id ? f : { ...f, vendedor_id: eu }));
  }, [user?.profile?.id, pessoas]);

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
      .select('id, nome, telefones, liberado_venda')
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

    // A lista do que é obrigatório mora em src/lib/osObrigatorios.ts, com
    // testes. Aqui a tela só avisa o primeiro que falta: despejar sete avisos
    // de uma vez faz o atendente fechar todos sem ler.
    const falta = faltandoParaAbrirOS(
      {
      cliente_id: selectedCliente?.id ?? '',
      equipamento_id: form.equipamento_id,
      numero_serie: form.numero_serie,
      marca_id: form.marca_id,
      modelo_id: form.modelo_id,
      defeito_cliente: form.defeito_cliente,
      defeitos_marcados: defeitos,
      tem_senha: form.tem_senha,
      senha_aparelho: form.senha_aparelho,
      senha_padrao: form.senha_padrao,
      vendedor_id: form.vendedor_id,
      prazo_previsto: form.prazo_previsto,
      },
      exigencias,
    );

    if (falta.length > 0) {
      const primeiro = falta[0];
      toast({
        title: primeiro.titulo,
        description:
          falta.length === 1
            ? primeiro.comoResolver
            : `${primeiro.comoResolver} (faltam ${falta.length} campos)`,
        variant: 'destructive',
      });
      document.getElementById(CAMPO_NA_TELA[primeiro.campo] ?? '')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
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
            // Respondeu "não tem senha"? O que estiver digitado é resto de
            // quem mudou de ideia no meio — não vai para a ficha.
            tem_senha: form.tem_senha === 'sim',
            senha_aparelho:
              form.tem_senha === 'sim' ? form.senha_aparelho.trim() || null : null,
            senha_padrao: form.tem_senha === 'sim' ? form.senha_padrao || null : null,
            anotacoes_checkin: form.anotacoes_checkin.trim() || null,
            observacoes: form.observacoes.trim() || null,
            tecnico_id: form.tecnico_id || null,
            vendedor_id: form.vendedor_id || null,
            laudo_eletronico: form.laudo_eletronico,
            prazo_previsto: form.prazo_previsto || null,
            // Sem automação nenhuma por enquanto: só guarda o prazo prometido.
            // A contagem a partir da retirada entra junto com os status.
            garantia_dias: Number(form.garantia_dias) || 90,
            prioridade: form.prioridade,
            tipo: form.tipo,
            status: OS_STATUS_INICIAL,
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
        variant: 'success',
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
              <Label htmlFor="cliente">
                Dono do aparelho<span className="text-destructive"> *</span>
              </Label>
              <Popover open={clienteOpen} onOpenChange={setClienteOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="cliente"
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
                            {cliente.liberado_venda === false && (
                              <Badge
                                variant="secondary"
                                className="ml-2 shrink-0 bg-amber-500/10 text-amber-700"
                              >
                                Bloqueado
                              </Badge>
                            )}
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

            {/*
              Achado na revisão de 18/08: a trava de cliente bloqueado vale
              pra venda, não pra OS — e isso é de propósito, porque aparelho
              que já está na bancada precisa ser devolvido. O problema era
              não avisar: o balcão abria a OS achando que estava tudo certo e
              só descobria o bloqueio lá na frente, na hora de cobrar, com o
              conserto já feito. Agora o aviso aparece no começo.
            */}
            {selectedCliente?.liberado_venda === false && (
              <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-sm font-medium text-amber-800">
                  {selectedCliente.nome} está bloqueado para venda.
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  A OS pode ser aberta normalmente — o aparelho precisa ser
                  registrado de qualquer forma. Mas o sistema vai{' '}
                  <strong>recusar a cobrança na entrega</strong> enquanto o
                  bloqueio existir. Resolva a pendência com o cliente antes de
                  começar o reparo.
                </p>
              </div>
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
                obrigatorio={exige('equipamento_id')}
                label="Equipamento"
                placeholder="Celular, Console, Controle..."
                valor={form.equipamento_id}
                onChange={(v) => alterar('equipamento_id', v)}
              />
              <div className="space-y-2">
                <Label htmlFor="numero_serie">
                  IMEI / Nº de Série
                  {exige('numero_serie') && <span className="text-destructive"> *</span>}
                </Label>
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
                obrigatorio={exige('marca_id')}
                label="Marca"
                valor={form.marca_id}
                onChange={(v) => alterar('marca_id', v)}
              />
              <CampoCatalogo
                id="modelo"
                tipo="os_modelo"
                obrigatorio={exige('modelo_id')}
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
              <Label htmlFor="defeito">
                Problema informado pelo cliente<span className="text-destructive"> *</span>
              </Label>
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
        {/* A pergunta vem antes dos campos, e é obrigatória: aparelho sem
            senha existe e é normal, mas "ninguém perguntou" não pode passar.
            Pedido do Felipe em 27/08. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Senha do aparelho</CardTitle>
            <p className="text-sm text-muted-foreground">
              Sem a senha, o técnico não testa o reparo — e o aparelho volta pro balcão à toa.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2" id="tem-senha">
              <Label>
                O aparelho tem senha?
                {exige('tem_senha') && <span className="text-destructive"> *</span>}
              </Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.tem_senha === 'sim' ? 'default' : 'outline'}
                  onClick={() => alterar('tem_senha', 'sim')}
                >
                  Sim
                </Button>
                <Button
                  type="button"
                  variant={form.tem_senha === 'nao' ? 'default' : 'outline'}
                  onClick={() => alterar('tem_senha', 'nao')}
                >
                  Não tem senha
                </Button>
              </div>
            </div>

            {form.tem_senha === 'sim' && (
              <div className="grid gap-6 sm:grid-cols-2">
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
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Uma das duas basta — a digitada ou o desenho.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Atendimento ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atendimento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* A bifurcação da triagem, do organograma do Felipe: serviço
                tabelado (preço na hora) x análise completa (laudo, taxa e
                prazo). O lembrete embaixo é o roteiro do que dizer ao cliente
                AGORA — depois que ele vai embora, a conversa fica cara. */}
            <div className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="laudo_eletronico" className="text-sm font-medium">
                    Vai ter laudo eletrônico?
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Ligado: o técnico abre o aparelho, investiga e monta o laudo.
                    Desligado: serviço tabelado, preço e prazo você já informa agora.
                  </p>
                </div>
                <Switch
                  id="laudo_eletronico"
                  checked={form.laudo_eletronico}
                  onCheckedChange={(v) => alterar('laudo_eletronico', v)}
                  aria-label="Vai ter laudo eletrônico"
                />
              </div>

              <div className="mt-3 rounded-md bg-muted/50 p-2.5 text-xs">
                {form.laudo_eletronico ? (
                  <>
                    <p className="font-medium">Combine com o cliente antes de fechar a OS:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      <li>a análise é completa, com o aparelho aberto na bancada;</li>
                      <li>a taxa de análise é de <strong>R$ 80,00</strong>;</li>
                      <li>o prazo do laudo é de <strong>1 a 3 dias úteis</strong>;</li>
                      <li>
                        se ele aprovar o serviço, a taxa <strong>é abatida</strong> do valor;
                        se recusar, os R$ 80 são cobrados na retirada.
                      </li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Serviço tabelado — informe agora ao cliente:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      <li>o preço da tabela;</li>
                      <li>o prazo da tabela.</li>
                    </ul>
                    <p className="mt-1 text-muted-foreground">
                      Sem laudo, não há taxa de análise — e o técnico vai direto para a execução.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vendedor">
                Quem recebeu (balcão)
                {exige('vendedor_id') && <span className="text-destructive"> *</span>}
              </Label>
              <Select
                value={form.vendedor_id || 'nenhum'}
                onValueChange={(v) => alterar('vendedor_id', v === 'nenhum' ? '' : v)}
              >
                <SelectTrigger id="vendedor">
                  <SelectValue placeholder="Quem está atendendo" />
                </SelectTrigger>
                <SelectContent>
                  {/* Sem opção "não informado": o campo é obrigatório e já
                      nasce com quem está logado. */}
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

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prazo">
                Prazo prometido
                {exige('prazo_previsto') && <span className="text-destructive"> *</span>}
              </Label>
              <div className="flex flex-wrap gap-2">
                {TIPOS_DE_REPARO.map((tipo) => {
                  const escolhido = form.prazo_previsto === prazoEmDias(tipo.dias);
                  return (
                    <Button
                      key={tipo.id}
                      type="button"
                      variant={escolhido ? 'default' : 'outline'}
                      onClick={() => alterar('prazo_previsto', prazoEmDias(tipo.dias))}
                    >
                      {tipo.label}
                      <span className="ml-2 text-xs opacity-80">({tipo.hint})</span>
                    </Button>
                  );
                })}
              </div>
              <Input
                id="prazo"
                type="date"
                value={form.prazo_previsto}
                onChange={(e) => alterar('prazo_previsto', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Toda OS nasce com 3 dias — o prazo para dar o laudo ao cliente. Passou disso sem
                laudo, ela entra na lista de atrasadas. Os botões são atalhos: a data continua
                livre para o caso que não cabe em nenhum dos dois.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="garantia">Garantia</Label>
              <Select
                value={
                  GARANTIAS.some((g) => g.dias === form.garantia_dias)
                    ? form.garantia_dias
                    : 'outro'
                }
                onValueChange={(v) => alterar('garantia_dias', v === 'outro' ? '' : v)}
              >
                <SelectTrigger id="garantia">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GARANTIAS.map((g) => (
                    <SelectItem key={g.dias} value={g.dias}>
                      {g.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="outro">Outro prazo...</SelectItem>
                </SelectContent>
              </Select>
              {!GARANTIAS.some((g) => g.dias === form.garantia_dias) && (
                <Input
                  type="number"
                  min={0}
                  value={form.garantia_dias}
                  onChange={(e) => alterar('garantia_dias', e.target.value)}
                  placeholder="Quantos dias de garantia"
                  autoFocus
                />
              )}
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
            liberado_venda: salvo.liberado_venda,
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
