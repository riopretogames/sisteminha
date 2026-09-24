import { useState, useEffect, useMemo, useCallback } from 'react';
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
import {
  bloqueioDaPassagem,
  passagemDesfazRecusa,
  textoDeDesfazerRecusa,
} from '@/lib/decisaoDoLaudo';
import {
  AVISO_ENTREGA_SEM_COBRANCA_SEM_PERMISSAO,
  entregaSemCobranca,
  textoDeEntregaSemCobranca,
} from '@/lib/acaoDaEtapa';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import { mensagemDoErro } from '@/lib/mensagemDoErro';

/**
 * A OS como o quadro precisa dela: além do cartão, o que a regra de troca de
 * etapa lê (lib/decisaoDoLaudo) — o laudo eletrônico (serviço tabelado vai
 * direto para a execução) e, na OS recusada, o valor e o motivo, para a
 * confirmação de "desfazer a recusa" dizer o que muda.
 */
export type OSDoQuadro = ServiceOrder & {
  laudo_eletronico: boolean | null;
  valor_orcado_recusado: number | null;
  laudo_motivo_recusa: string | null;
};

/**
 * Por quantos dias a OS entregue ou cancelada continua no quadro.
 *
 * Achado na revisão de 24/09: o quadro trazia TODAS as OS da história, e o
 * Supabase corta calado em 1.000 linhas (lib/buscarEmPaginas.ts) — com a
 * ordem da mais antiga para a mais nova, passando de mil OS as NOVAS sumiriam
 * do quadro, da lista e dos contadores, sem erro nenhum, travando o balcão.
 * Agora a busca é em páginas (nada é cortado) e o que já terminou há mais de
 * 30 dias fica só em OS Finalizadas, que é o arquivo da assistência.
 */
const DIAS_DE_ENCERRADAS_NO_QUADRO = 30;

/** Os campos que o quadro lê. `clientes(nome)` sem `!inner`: OS sem cliente
 *  aparece como "Cliente", em vez de sumir do quadro. */
const CAMPOS_DO_QUADRO = `
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
  laudo_eletronico,
  valor_orcado_recusado,
  laudo_motivo_recusa,
  total_orcamento,
  tecnico_id,
  prazo_previsto,
  created_at,
  clientes(nome),
  tecnico:profiles!service_orders_tecnico_id_fkey(nome)
`;

interface LinhaDoQuadro {
  id: string;
  numero_os: string;
  cliente_id: string;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  defeito_cliente: string;
  status: string | null;
  tipo: string | null;
  prioridade: string | null;
  laudo_aprovado: boolean | null;
  laudo_eletronico: boolean | null;
  valor_orcado_recusado: number | null;
  laudo_motivo_recusa: string | null;
  total_orcamento: number | null;
  tecnico_id: string | null;
  prazo_previsto: string | null;
  created_at: string;
  clientes: { nome?: string } | null;
  tecnico: { nome?: string } | null;
}

function paraOSDoQuadro(order: LinhaDoQuadro): OSDoQuadro {
  return {
    id: order.id,
    numero_os: order.numero_os,
    cliente_id: order.cliente_id,
    cliente_nome: order.clientes?.nome || 'Cliente',
    marca: order.marca,
    modelo: order.modelo,
    numero_serie: order.numero_serie,
    defeito_cliente: order.defeito_cliente,
    status: order.status || OS_STATUS_INICIAL,
    tipo: order.tipo as ServiceOrder['tipo'],
    prioridade: (order.prioridade || 'normal') as OsPrioridade,
    laudo_aprovado: order.laudo_aprovado,
    laudo_eletronico: order.laudo_eletronico,
    valor_orcado_recusado:
      order.valor_orcado_recusado == null ? null : Number(order.valor_orcado_recusado),
    laudo_motivo_recusa: order.laudo_motivo_recusa,
    total_orcamento: Number(order.total_orcamento || 0),
    tecnico_id: order.tecnico_id,
    // O card mostra o NOME do técnico. Antes a consulta trazia só o id, e
    // o campo do card ficava eternamente vazio — a opção "Técnico
    // Responsável" na configuração do cartão não mostrava nada.
    tecnico_nome: order.tecnico?.nome ?? null,
    prazo_previsto: order.prazo_previsto,
    created_at: order.created_at,
  };
}

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

  const [orders, setOrders] = useState<OSDoQuadro[]>([]);
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

  // O quadro fica aberto o dia inteiro no balcão, e outras pessoas mexem nas
  // OS em outros computadores. Voltar para a janela recarrega a lista —
  // antes, o quadro mostrava a etapa e o valor de quando foi aberto (achado de
  // 24/09). A decisão de mover ainda relê a OS do banco (ver
  // `handleStatusChange`), então isto é para os olhos, não para a regra.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') fetchOrders();
    };
    window.addEventListener('focus', aoVoltar);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.removeEventListener('focus', aoVoltar);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
    // fetchOrders é estável o bastante: só usa o `supabase` e o setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const desde = new Date(Date.now() - DIAS_DE_ENCERRADAS_NO_QUADRO * 86_400_000).toISOString();
      // Em páginas, e em duas partes: a fila de verdade (tudo o que não
      // terminou, sem recorte de data) e o que terminou há pouco. Ver
      // DIAS_DE_ENCERRADAS_NO_QUADRO.
      const [emAndamento, encerradasRecentes] = await Promise.all([
        buscarEmPaginas<LinhaDoQuadro>(() =>
          supabase
            .from('service_orders')
            .select(CAMPOS_DO_QUADRO)
            .not('status', 'in', `("${OS_ETAPAS.ENTREGUE}","${OS_CANCELADO}")`)
            .order('created_at')
            .order('id'),
        ),
        buscarEmPaginas<LinhaDoQuadro>(() =>
          supabase
            .from('service_orders')
            .select(CAMPOS_DO_QUADRO)
            .in('status', [OS_ETAPAS.ENTREGUE, OS_CANCELADO])
            .gte('updated_at', desde)
            .order('created_at')
            .order('id'),
        ),
      ]);

      setOrders([...emAndamento, ...encerradasRecentes].map(paraOSDoQuadro));
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: 'Erro ao carregar OS',
        description: mensagemDoErro(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * A OS como está NO BANCO agora. A decisão de mover um cartão não pode
   * depender da lista que a tela carregou há horas: outra pessoa pode ter
   * registrado a recusa, mudado o valor ou entregue a OS (achado de 24/09).
   */
  const relerOS = useCallback(async (orderId: string): Promise<OSDoQuadro | null> => {
    const { data, error } = await supabase
      .from('service_orders')
      .select(CAMPOS_DO_QUADRO)
      .eq('id', orderId)
      .maybeSingle();
    if (error || !data) return null;
    const fresca = paraOSDoQuadro(data as unknown as LinhaDoQuadro);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? fresca : o)));
    return fresca;
  }, []);

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

    // A OS como está no banco AGORA, não como estava quando o quadro abriu.
    // Sem isto, o cartão arrastado para Entregue abria o pagamento com o valor
    // velho (R$ 450 numa OS que já tinha virado R$ 80 de taxa), e a regra
    // abaixo decidia sobre uma etapa que já não era a da OS. Se a releitura
    // falhar, segue com o que a tela tem — o banco confere tudo de novo.
    const ordemAtual = (await relerOS(orderId)) ?? orders.find((o) => o.id === orderId);
    if (!ordemAtual) return;
    if (ordemAtual.status === newStatus) return;

    const situacao = {
      status: ordemAtual.status,
      laudoAprovado: ordemAtual.laudo_aprovado,
      laudoEletronico: ordemAtual.laudo_eletronico,
    };

    // Quem pode levar esta OS para esta etapa: aprovar e recusar orçamento,
    // pular a resposta do cliente, desfazer a recusa. A regra é UMA, em
    // lib/decisaoDoLaudo.ts, igual à da ficha, da lista e do banco — cada tela
    // com a sua cópia foi como uma trava ficou "consertada numa porta de
    // três" em 01/09.
    const barrado = bloqueioDaPassagem(situacao, newStatus, podeAprovar);
    if (barrado) {
      toast({ title: barrado.titulo, description: barrado.descricao, variant: 'destructive' });
      return;
    }

    const destino = statuses.find((s) => s.key === newStatus)?.label ?? newStatus;

    // Tirar do "entregue" pelo card arrastado ou pelo seletor da grade tem
    // o mesmo risco do seletor da ficha: o título já lançado não é desfeito
    // e o orçamento volta a ficar editável. Mesma confirmação dos dois
    // lados — o porquê está em `lib/reabrirOS.ts`.
    if (ordemAtual.status === OS_ETAPAS.ENTREGUE && newStatus !== OS_ETAPAS.ENTREGUE) {
      const seguir = confirmarReaberturaDeOSEntregue({
        numeroOs: ordemAtual.numero_os,
        destino,
        tipo: ordemAtual.tipo,
        totalOrcamento: ordemAtual.total_orcamento ?? 0,
      });
      if (!seguir) return;
    }

    // Voltar uma OS recusada para a análise desfaz a recusa: a OS volta a
    // valer o orçamento cheio e as peças saem do estoque de novo. Quem pode
    // fazer isso confirma lendo o que muda.
    if (passagemDesfazRecusa(situacao, newStatus)) {
      const seguir = window.confirm(
        textoDeDesfazerRecusa({
          numeroOs: ordemAtual.numero_os,
          destino,
          valorRecusado: ordemAtual.valor_orcado_recusado,
          valorAtual: ordemAtual.total_orcamento ?? 0,
          motivo: ordemAtual.laudo_motivo_recusa,
        }),
      );
      if (!seguir) return;
    }

    if (newStatus === OS_ETAPAS.ENTREGUE) {
      // OS paga em R$ 0: sair sem cobrança é decisão de quem aprova
      // orçamento, e mesmo essa pessoa confirma (lib/acaoDaEtapa.ts).
      if (entregaSemCobranca(ordemAtual.tipo, ordemAtual.total_orcamento)) {
        if (!podeAprovar) {
          toast({
            title: AVISO_ENTREGA_SEM_COBRANCA_SEM_PERMISSAO.titulo,
            description: AVISO_ENTREGA_SEM_COBRANCA_SEM_PERMISSAO.descricao,
            variant: 'destructive',
          });
          return;
        }
        if (!window.confirm(textoDeEntregaSemCobranca(ordemAtual.numero_os))) return;
      } else if (ordemAtual.tipo === 'paga') {
        // OS paga com valor: abre o mesmo diálogo de pagamento da ficha em
        // vez de atualizar o status direto — o gatilho do banco
        // (conferir_pagamento_ao_entregar) recusaria sem os_pagamentos
        // suficiente. Garantia e cortesia seguem para o update abaixo.
        setEntregandoOsId(orderId);
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      // O cartão muda de coluna na hora; a releitura logo abaixo confirma.
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
      );
      toast({
        title: 'Status atualizado',
        description: `OS alterada para ${destino}`,
        variant: 'success',
      });
    } catch (error) {
      // O motivo que o banco escreveu chega inteiro (achado de 24/09: antes,
      // todo "não" do banco virava "Tente novamente").
      toast({
        title: 'Não foi possível mudar a etapa',
        description: mensagemDoErro(error, {
          semAcesso: 'Seu perfil de acesso não permite esta mudança.',
        }),
        variant: 'destructive',
      });
    } finally {
      // Recarrega depois de QUALQUER tentativa: a mudança de etapa dispara
      // gatilhos que mexem em outras colunas (a recusa desfeita volta o
      // valor, a entrega congela o valor pago) — trocar só o status na lista
      // deixaria o cartão mentindo.
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

          {/* Só para quem pode abrir OS — mesma régua do cabeçalho. O técnico
              não tem essa permissão e caía na tela de acesso negado. */}
          {can(PERMISSIONS.ORDERS_CREATE) && (
            <Button onClick={() => navigate('/os/nova')}>
              <Plus className="mr-2 h-4 w-4" />
              Nova OS
            </Button>
          )}
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
        {/* O quadro mostra o que terminou há pouco, não a história inteira —
            dizer isso evita a pergunta "cadê a OS de março?". */}
        <p className="-mt-3 text-xs text-muted-foreground">
          Entregues e canceladas aparecem aqui por {DIAS_DE_ENCERRADAS_NO_QUADRO} dias. As mais antigas
          ficam em OS Finalizadas.
        </p>

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
            podeCriar={can(PERMISSIONS.ORDERS_CREATE)}
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
