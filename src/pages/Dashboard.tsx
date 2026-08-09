import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  ClipboardList,
  Users,
  DollarSign,
  Package,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';
import { OS_STATUS } from '@/lib/constants';
import { OS_ETAPAS } from '@/config/osStatus';
import { AvisoAguardandoRetirada } from '@/components/os/AvisoAguardandoRetirada';

interface DashboardStats {
  vendasHoje: number;
  vendasOntem: number;
  osAbertas: number;
  osPendentes: number;
  caixaHoje: number;
  estoqueCritico: number;
}

interface RecentOS {
  id: string;
  numero_os: string;
  cliente_nome: string;
  modelo: string;
  status: string;
  created_at: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    vendasHoje: 0,
    vendasOntem: 0,
    osAbertas: 0,
    osPendentes: 0,
    caixaHoje: 0,
    estoqueCritico: 0,
  });
  const [recentOS, setRecentOS] = useState<RecentOS[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Fetch sales today
      const { count: vendasHoje } = await supabase
        .from('vendas')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString())
        .eq('status', 'pago');

      // Fetch sales yesterday
      const { count: vendasOntem } = await supabase
        .from('vendas')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString())
        .eq('status', 'pago');

      // Fetch open OS
      const { count: osAbertas } = await supabase
        .from('service_orders')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '("entregue","cancelado")');

      // Fetch pending approval OS
      const { count: osPendentes } = await supabase
        .from('service_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', OS_ETAPAS.AGUARDANDO_APROVACAO);

      // Fetch today's revenue
      const { data: vendasHojeData } = await supabase
        .from('vendas')
        .select('total')
        .gte('created_at', today.toISOString())
        .eq('status', 'pago');

      const caixaHoje = vendasHojeData?.reduce((acc, v) => acc + Number(v.total), 0) || 0;

      // Fetch critical stock — o PostgREST não compara duas colunas da
      // mesma linha direto no filtro (`.lte('estoque_atual', 'estoque_minimo')`
      // comparava com o TEXTO "estoque_minimo", não com a coluna: sempre
      // deu número errado). Traz as duas colunas e conta no cliente, mesmo
      // padrão usado em Estoque.tsx e EstoqueCritico.tsx.
      const { data: estoqueData } = await supabase
        .from('vw_produtos')
        .select('estoque_atual, estoque_minimo')
        .eq('ativo', true);

      const estoqueCritico = (estoqueData ?? []).filter(
        (p) => p.estoque_atual <= p.estoque_minimo
      ).length;

      // Fetch recent OS with client name
      const { data: osData } = await supabase
        .from('service_orders')
        .select(`
          id,
          numero_os,
          modelo,
          status,
          created_at,
          clientes!inner(nome)
        `)
        .not('status', 'in', '("entregue","cancelado")')
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        vendasHoje: vendasHoje || 0,
        vendasOntem: vendasOntem || 0,
        osAbertas: osAbertas || 0,
        osPendentes: osPendentes || 0,
        caixaHoje,
        estoqueCritico: estoqueCritico || 0,
      });

      setRecentOS(
        osData?.map(os => ({
          id: os.id,
          numero_os: os.numero_os,
          cliente_nome: (os.clientes as any)?.nome || 'Cliente',
          modelo: os.modelo || 'Não informado',
          status: os.status,
          created_at: os.created_at,
        })) || []
      );
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatRelativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d atrás`;
    if (hours > 0) return `${hours}h atrás`;
    return 'Agora';
  };

  const getStatusConfig = (status: string) => {
    return OS_STATUS[status as keyof typeof OS_STATUS] || { label: status, color: 'bg-gray-100 text-gray-600' };
  };

  const vendasTrend = stats.vendasHoje - stats.vendasOntem;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          Olá, {user?.profile?.nome?.split(' ')[0] || 'Usuário'}! 👋
        </h1>
        <p className="text-muted-foreground">
          Aqui está o resumo da sua loja hoje.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        {can(PERMISSIONS.SALES_CREATE) ? (
          <Button
            size="lg"
            className="h-20 text-lg kpi-vendas border-0 hover:opacity-90"
            onClick={() => navigate('/pdv')}
          >
            <ShoppingCart className="mr-3 h-6 w-6" />
            Nova Venda
          </Button>
        ) : null}
        {can(PERMISSIONS.ORDERS_CREATE) ? (
          <Button
            size="lg"
            className="h-20 text-lg kpi-os border-0 hover:opacity-90"
            onClick={() => navigate('/os/nova')}
          >
            <ClipboardList className="mr-3 h-6 w-6" />
            Nova OS
          </Button>
        ) : null}
        {can(PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE) ? (
          <Button
            size="lg"
            className="h-20 text-lg kpi-caixa border-0 hover:opacity-90"
            onClick={() => navigate('/cadastros/clientes')}
          >
            <Users className="mr-3 h-6 w-6" />
            Novo Cliente
          </Button>
        ) : null}
      </div>

      {/* Aparelho parado esperando o cliente buscar. Fica ACIMA dos números
          porque é o único aviso da tela que pede ação hoje: passou de 6 meses,
          a loja trata como abandonado, e antes disso alguém precisa cobrar. */}
      <AvisoAguardandoRetirada />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Vendas Hoje */}
        <Card className="overflow-hidden">
          <div className="kpi-vendas p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vendas Hoje</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.vendasHoje}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              {vendasTrend >= 0 ? (
                <ArrowUpRight className="mr-1 h-4 w-4 text-green-500" />
              ) : (
                <ArrowDownRight className="mr-1 h-4 w-4 text-red-500" />
              )}
              <span className={vendasTrend >= 0 ? 'text-green-500' : 'text-red-500'}>
                {Math.abs(vendasTrend)}
              </span>
              <span className="ml-1">vs ontem</span>
            </div>
          </CardContent>
        </Card>

        {/* OS Abertas */}
        <Card className="overflow-hidden">
          <div className="kpi-os p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">OS Abertas</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.osAbertas}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <Clock className="mr-1 h-4 w-4 text-orange-500" />
              <span className="text-orange-500">{stats.osPendentes}</span>
              <span className="ml-1">aguardando aprovação</span>
            </div>
          </CardContent>
        </Card>

        {/* Caixa Hoje */}
        <Card className="overflow-hidden">
          <div className="kpi-caixa p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Caixa Hoje</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.caixaHoje)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.vendasHoje} vendas realizadas
            </p>
          </CardContent>
        </Card>

        {/* Estoque Crítico */}
        <Card
          className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
          onClick={() => navigate('/estoque/critico')}
        >
          <div className="kpi-estoque p-1" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Estoque Crítico</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.estoqueCritico}</div>
            {stats.estoqueCritico > 0 ? (
              <div className="flex items-center text-xs text-orange-500">
                <AlertTriangle className="mr-1 h-4 w-4" />
                Produtos abaixo do mínimo
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tudo em ordem!
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent OS */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Ordens de Serviço Recentes</CardTitle>
            <CardDescription>
              OS abertas aguardando ação
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/os')}>
            Ver todas
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : recentOS.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhuma OS aberta no momento
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => navigate('/os/nova')}
              >
                Criar primeira OS
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentOS.map(os => {
                const statusConfig = getStatusConfig(os.status);
                return (
                  <div
                    key={os.id}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/os/${os.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/10">
                        <ClipboardList className="h-5 w-5 text-secondary" />
                      </div>
                      <div>
                        <p className="font-medium">{os.numero_os}</p>
                        <p className="text-sm text-muted-foreground">
                          {os.cliente_nome} • {os.modelo}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className={statusConfig.color}>
                        {statusConfig.label}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatRelativeTime(os.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
