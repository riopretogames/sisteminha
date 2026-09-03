import { useState, useEffect, useMemo } from 'react';
import { nomeDaEtapa } from '@/lib/etapaDaOS';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  LayoutGrid,
  Columns3,
  Settings2,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { useViewMode } from '@/hooks/useViewMode';
import { OS_PRIORITY } from '@/lib/constants';
import { OSTableView } from '@/components/os/OSTableView';
import { OSKanbanView } from '@/components/os/OSKanbanView';
import { CardConfigDialog } from '@/components/os/CardConfigDialog';
import { StatusManagerDialog } from '@/components/os/StatusManagerDialog';
import { EntregarOSDialog } from '@/components/os/EntregarOSDialog';
import type { ServiceOrder, StatusConfig, OsPrioridade } from '@/types/os';
import { OS_ETAPAS, OS_ETAPAS_EM_ORDEM, OS_STATUS_INICIAL, OS_CANCELADO } from '@/config/osStatus';
import { ordenarOS } from '@/lib/ordenarOS';
import { confirmarReaberturaDeOSEntregue } from '@/lib/reabrirOS';
import { passagemPedeDecisaoDoLaudo, AVISO_DECISAO_DO_LAUDO } from '@/lib/decisaoDoLaudo';

export default function OrdensServico() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = useAuth();
  const { viewMode, setViewMode } = useViewMode();
  const podeEditar = can(PERMISSIONS.ORDERS_EDIT);
  // orders.approve, não orders.edit — mesma regra de OSOrcamentos.tsx e
  // TrocarEtapaOS.tsx: só quem fala com o cliente decide orçamento. Achado
  // em 17/08: esta tela (quadro Kanban E grade) tinha um TERCEIRO caminho
  // pra sair de aguardando_aprovacao direto pra aprovado/cancelado que só
  // conferia orders.edit — o técnico conseguia arrastar o cartão (ou usar o
  // seletor da grade) e só levava um erro técnico do banco quando o gatilho
  // barrava (migration 20260817140000). Agora bloqueia antes, com aviso
  // claro, igual às outras duas telas.
  const podeAprovar = can(PERMISSIONS.ORDERS_APPROVE);

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [cardConfigOpen, setCardConfigOpen] = useState(false);
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);
  // OS paga (com orçamento > 0) indo pra "entregue" pelo quadro/grade abre o
  // mesmo diálogo de pagamento da ficha (TrocarEtapaOS) em vez de atualizar
  // o status direto — o banco já tranca essa regra (migration 20260818100000).
  const [entregandoOsId, setEntregandoOsId] = useState<string | null>(null);

  useEffect(() => {
    fetchStatuses();
    fetchOrders();
  }, []);

  const fetchStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from('os_status_config')
        .select('*')
        .order('ordem');

      if (error) throw error;
      setStatuses((data as StatusConfig[]) || []);
    } catch (error) {
      console.error('Error fetching statuses:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          id,
          numero_os,
          cliente_id,
          marca,
          modelo,
          numero_serie,
          defeito_cliente,
          status,
          tipo,
          prioridade,
          laudo_aprovado,
          total_orcamento,
          tecnico_id,
          prazo_previsto,
          created_at,
          clientes!inner(nome),
          tecnico:profiles!service_orders_tecnico_id_fkey(nome)
        `)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setOrders(
        data?.map((order) => ({
          id: order.id,
          numero_os: order.numero_os,
          cliente_id: order.cliente_id,
          cliente_nome: (order.clientes as { nome?: string } | null)?.nome || 'Cliente',
          marca: order.marca,
          modelo: order.modelo,
          numero_serie: order.numero_serie,
          defeito_cliente: order.defeito_cliente,
          status: order.status || OS_STATUS_INICIAL,
          tipo: order.tipo as ServiceOrder['tipo'],
          prioridade: (order.prioridade || 'normal') as OsPrioridade,
          laudo_aprovado: order.laudo_aprovado,
          total_orcamento: order.total_orcamento || 0,
          tecnico_id: order.tecnico_id,
          // O card mostra o NOME do técnico. Antes a consulta trazia só o id, e
          // o campo do card ficava eternamente vazio — a opção "Técnico
          // Responsável" na configuração do cartão não mostrava nada.
          tecnico_nome: (order.tecnico as { nome?: string } | null)?.nome ?? null,
          prazo_previsto: order.prazo_previsto,
          created_at: order.created_at,
        })) || []
      );
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: 'Erro ao carregar OS',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    // Confere ANTES de mexer na tela. Antes, quem não tinha permissão arrastava
    // o cartão, via ele mudar de coluna, levava um erro técnico e assistia o
    // cartão voltar sozinho — parecia bug do sistema, não falta de acesso.
    if (!podeEditar) {
      toast({
        title: 'Sem permissão',
        description: 'Seu perfil de acesso não permite mudar a etapa da OS.',
        variant: 'destructive',
      });
      return;
    }

    // "Aprovado" é decisão de orçamento (aprovar) — exige orders.approve, não
    // importa de qual etapa a OS está saindo. Achado na revisão de 20/08: a
    // trava aqui só disparava quando `ordemAtual.status` já era
    // "aguardando_aprovacao", mas o Kanban deixa arrastar um card de
    // QUALQUER coluna pra QUALQUER coluna (todas ficam visíveis lado a
    // lado) e a grade oferece todas as etapas no seletor — então um cartão
    // ainda em "Aguardando análise", arrastado direto pra "Aprovado", ou
    // selecionado assim na grade, pulava a decisão inteira num passo só. O
    // gatilho do banco (`validar_aprovacao_orcamento_os`, migration
    // 20260817140000) só confere `OLD.status = 'aguardando_aprovacao'`, e
    // por isso também deixava passar — um técnico com só `orders.edit`
    // aprovava orçamento sem nunca ter `orders.approve`. Mesmo problema,
    // mesma correção, em TrocarEtapaOS.tsx.
    const ordemAtual = orders.find((o) => o.id === orderId);
    // ...MAS só enquanto a aprovação ainda não aconteceu. Numa OS que o cliente
    // JÁ aprovou, arrastar o cartão de volta para "Aprovado / Executar" não
    // aprova nada — é retomar o trabalho depois do desvio de "Aguardando
    // Peça". Sem esta segunda condição o técnico ficava preso lá: é ele quem
    // põe a OS na espera da peça e não conseguia tirar. Mesma correção da
    // ficha (TrocarEtapaOS), que em 01/09 ficou feita só lá — e uma trava
    // consertada numa porta de três é uma trava não consertada.
    const aprovarBloqueado =
      newStatus === OS_ETAPAS.APROVADO &&
      !podeAprovar &&
      ordemAtual?.laudo_aprovado !== true;
    // Recusar (cancelar vindo de "Aguardando aprovação") continua só nesse
    // caminho específico — cancelar de outra etapa não é "recusar
    // orçamento", e o banco nunca travou isso.
    const recusarBloqueado =
      ordemAtual?.status === OS_ETAPAS.AGUARDANDO_APROVACAO &&
      newStatus === OS_CANCELADO &&
      !podeAprovar;

    // A resposta do cliente ao laudo passa pelos botões da ficha, que gravam
    // quem respondeu, quando, e o motivo da recusa — e, na recusa, trocam o
    // valor da OS pela taxa de análise. Arrastar o cartão de "Aguardando
    // aprovação" para "Aprovado" ou "Finalizado" chegava no mesmo lugar sem
    // nada disso: OS aprovada que ninguém aprovou, ou recusada sem motivo
    // cobrando na retirada o reparo que o cliente não quis. Ver
    // lib/decisaoDoLaudo.ts.
    if (ordemAtual && passagemPedeDecisaoDoLaudo(ordemAtual.status, newStatus)) {
      toast({ ...AVISO_DECISAO_DO_LAUDO, variant: 'destructive' });
      return;
    }

    if (aprovarBloqueado || recusarBloqueado) {
      toast({
        title: 'Sem permissão',
        description:
          'Aprovar ou recusar orçamento é decisão de quem fala com o cliente — peça pra um vendedor ou gerente.',
        variant: 'destructive',
      });
      return;
    }

    // Tirar do "entregue" pelo card arrastado ou pelo seletor da grade tem
    // o mesmo risco do seletor da ficha: o título já lançado não é desfeito
    // e o orçamento volta a ficar editável. Mesma confirmação dos dois
    // lados — o porquê está em `lib/reabrirOS.ts`.
    if (ordemAtual?.status === OS_ETAPAS.ENTREGUE && newStatus !== OS_ETAPAS.ENTREGUE) {
      const seguir = confirmarReaberturaDeOSEntregue({
        numeroOs: ordemAtual.numero_os,
        destino: statuses.find((s) => s.key === newStatus)?.label ?? newStatus,
        tipo: ordemAtual.tipo,
        totalOrcamento: ordemAtual.total_orcamento ?? 0,
      });
      if (!seguir) return;
    }

    // OS paga com orçamento > 0 indo pra "entregue": abre o diálogo de
    // pagamento em vez de atualizar o status direto — o gatilho do banco
    // (conferir_pagamento_ao_entregar) recusaria o UPDATE sem os_pagamentos
    // suficiente. Garantia/cortesia/orçamento zerado seguem direto pro
    // update de sempre, abaixo.
    if (
      newStatus === OS_ETAPAS.ENTREGUE &&
      ordemAtual?.tipo === 'paga' &&
      (ordemAtual?.total_orcamento ?? 0) > 0
    ) {
      setEntregandoOsId(orderId);
      return;
    }

    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );

      const statusLabel = statuses.find((s) => s.key === newStatus)?.label || newStatus;
      toast({
        title: 'Status atualizado',
        description: `OS alterada para ${statusLabel}`,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Erro ao atualizar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
      // Revert on error
      fetchOrders();
    }
  };

  const filteredOrders = useMemo(() => {
    // Ordem pedida pelo Felipe em 09/08: atrasada primeiro, depois prioridade,
    // depois a mais antiga. Ver `lib/ordenarOS.ts` para o porquê de cada
    // degrau. Vale para a tabela E para o quadro — os dois leem daqui.
    return ordenarOS(orders.filter((order) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        order.numero_os.toLowerCase().includes(searchLower) ||
        order.cliente_nome.toLowerCase().includes(searchLower) ||
        // Marca junto com modelo desde 02/09: a abertura deixou de perguntar o
        // modelo, então buscar só por ele era buscar pelo único campo do
        // aparelho que nenhuma OS nova tem. O cliente liga dizendo "deixei um
        // Samsung aí" e o atendente não achava nada.
        order.marca?.toLowerCase().includes(searchLower) ||
        order.modelo?.toLowerCase().includes(searchLower) ||
        order.defeito_cliente.toLowerCase().includes(searchLower);

      const matchesStatus =
        statusFilter === 'all' || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    }));
  }, [orders, search, statusFilter]);

  const statusCounts = useMemo(() => {
    return orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [orders]);

  // As cinco etapas obrigatórias da assistência, na ordem do fluxo. Ditadas
  // pelo Felipe em 09/08 e travadas no banco: ver `config/osStatus.ts`.
  const mainStatuses = OS_ETAPAS_EM_ORDEM;
  const getStatusConfig = (key: string) =>
    statuses.find((s) => s.key === key) || { key, label: key, color: 'bg-gray-500/10 text-gray-600' };

  return (
    <div className="flex flex-col h-full animate-fade-in overflow-hidden">
      {/* Header - Fixed section */}
      <div className="flex-shrink-0 space-y-6 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          <p className="text-muted-foreground">
            Gerencie os reparos da sua loja
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              title="Modo Grade"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              title="Modo Kanban"
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>

          {/* Card Config - only in Kanban mode */}
          {viewMode === 'kanban' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCardConfigOpen(true)}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Configurar Cartão
            </Button>
          )}

          {/* Gerenciar status: quem configura o sistema */}
          {can(PERMISSIONS.SETTINGS_EDIT) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusManagerOpen(true)}
            >
              <Palette className="mr-2 h-4 w-4" />
              Gerenciar Status
            </Button>
          )}

          <Button onClick={() => navigate('/os/nova')}>
            <Plus className="mr-2 h-4 w-4" />
            Nova OS
          </Button>
        </div>
      </div>

        {/* Status Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {mainStatuses.map((statusKey) => {
          const config = getStatusConfig(statusKey);
          const count = statusCounts[statusKey] || 0;
          return (
            <Card
              key={statusKey}
              className={`cursor-pointer transition-all hover:shadow-md ${
                statusFilter === statusKey ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() =>
                setStatusFilter(statusFilter === statusKey ? 'all' : statusKey)
              }
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Badge className={config.color}>{nomeDaEtapa(config)}</Badge>
                  <span className="text-2xl font-bold">{count}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente, aparelho..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statuses
              .filter((s) => s.ativo)
              .map((config) => (
                <SelectItem key={config.key} value={config.key}>
                  {nomeDaEtapa(config)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* View - Scrollable section */}
      <div className="flex-1 min-h-0">
        {viewMode === 'grid' ? (
          <OSTableView
            orders={filteredOrders}
            statuses={statuses}
            loading={loading}
            onStatusChange={handleStatusChange}
            podeAprovar={podeAprovar}
          />
        ) : (
          <OSKanbanView
            orders={filteredOrders}
            statuses={statuses}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>

      {/* Dialogs */}
      <CardConfigDialog
        open={cardConfigOpen}
        onOpenChange={setCardConfigOpen}
      />
      <StatusManagerDialog
        open={statusManagerOpen}
        onOpenChange={setStatusManagerOpen}
        statuses={statuses}
        onStatusesChange={fetchStatuses}
      />
      {/* Uma instância só pro quadro inteiro (Kanban ou grade) — não por
          card. Os dados da OS vêm de `orders`, buscados pelo id guardado. */}
      <EntregarOSDialog
        open={!!entregandoOsId}
        onOpenChange={(open) => !open && setEntregandoOsId(null)}
        osId={entregandoOsId ?? ''}
        numeroOs={orders.find((o) => o.id === entregandoOsId)?.numero_os ?? ''}
        totalOrcamento={orders.find((o) => o.id === entregandoOsId)?.total_orcamento ?? 0}
        onEntregue={() => {
          setEntregandoOsId(null);
          fetchOrders();
        }}
      />
    </div>
  );
}
