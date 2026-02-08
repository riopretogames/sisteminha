import {
  Home,
  LayoutDashboard,
  FileBarChart,
  Package,
  ShoppingCart,
  ClipboardList,
  DollarSign,
  FileText,
  Building2,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface MenuChild {
  label: string;
  path: string;
  roles?: string[];
  group?: string; // visual grouping label
}

export interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path?: string;
  children?: MenuChild[];
  roles?: string[];
}

export const sidebarMenu: MenuItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    path: '/dashboard',
  },
  {
    id: 'dashboards',
    label: 'Dashboards',
    icon: LayoutDashboard,
    children: [
      { label: 'Venda', path: '/dashboards/venda', group: 'Dashboards Operacionais' },
      { label: 'Estoque', path: '/dashboards/estoque', group: 'Dashboards Operacionais' },
      { label: 'Metas', path: '/dashboards/metas', group: 'Dashboards Operacionais' },
      { label: 'IE - Estoque', path: '/dashboards/ie/estoque', group: 'Inteligência Empresarial' },
      { label: 'IE - Comercial', path: '/dashboards/ie/comercial', group: 'Inteligência Empresarial' },
      { label: 'IE - Serviço', path: '/dashboards/ie/servico', group: 'Inteligência Empresarial' },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: FileBarChart,
    roles: ['admin'],
    children: [
      { label: 'Relatório de Vendas', path: '/relatorios/vendas' },
      { label: 'Relatório de OS', path: '/relatorios/os' },
      { label: 'Relatório Financeiro', path: '/relatorios/financeiro' },
      { label: 'Relatório de Estoque', path: '/relatorios/estoque' },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque',
    icon: Package,
    children: [
      { label: 'Produtos', path: '/estoque' },
      { label: 'Movimentações', path: '/estoque/movimentacoes' },
      { label: 'Estoque Crítico', path: '/estoque/critico' },
      { label: 'Fornecedores', path: '/estoque/fornecedores' },
    ],
  },
  {
    id: 'venda',
    label: 'Venda',
    icon: ShoppingCart,
    children: [
      { label: 'Nova Venda (PDV)', path: '/pdv' },
      { label: 'Histórico de Vendas', path: '/vendas/historico' },
      { label: 'Pagamentos', path: '/vendas/pagamentos' },
    ],
  },
  {
    id: 'os',
    label: 'Ordem de Serviço',
    icon: ClipboardList,
    children: [
      { label: 'Kanban de OS', path: '/os' },
      { label: 'Lista de OS', path: '/os/lista' },
      { label: 'OS Finalizadas', path: '/os/finalizadas' },
      { label: 'Orçamentos', path: '/os/orcamentos' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: DollarSign,
    roles: ['admin'],
    children: [
      { label: 'Caixa', path: '/financeiro/caixa' },
      { label: 'Contas a Pagar', path: '/financeiro/pagar' },
      { label: 'Contas a Receber', path: '/financeiro/receber' },
      { label: 'Fluxo de Caixa', path: '/financeiro/fluxo' },
    ],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: FileText,
    children: [
      { label: 'Clientes', path: '/clientes' },
      { label: 'Produtos', path: '/cadastros/produtos' },
      { label: 'Serviços', path: '/cadastros/servicos' },
      { label: 'Usuários', path: '/cadastros/usuarios', roles: ['admin'] },
    ],
  },
  {
    id: 'empresa',
    label: 'Minha Empresa',
    icon: Building2,
    path: '/empresa',
    roles: ['admin'],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings,
    roles: ['admin'],
    children: [
      { label: 'Perfis de Usuário', path: '/configuracoes/perfis' },
      { label: 'Permissões', path: '/configuracoes/permissoes' },
      { label: 'Preferências do Sistema', path: '/configuracoes/preferencias' },
      { label: 'Logs / Auditoria', path: '/configuracoes/logs' },
    ],
  },
];

// Exported separately for direct access to dashboard structure
export const dashboardMenu = {
  key: 'dashboards',
  label: 'Dashboards',
  icon: 'pie-chart',
  type: 'submenu' as const,
  children: [
    {
      type: 'group' as const,
      label: 'Dashboards Operacionais',
      children: [
        { key: 'dashboard_venda', label: 'Venda', icon: 'shopping-cart', route: '/dashboards/venda' },
        { key: 'dashboard_estoque', label: 'Estoque', icon: 'box', route: '/dashboards/estoque' },
        { key: 'dashboard_metas', label: 'Metas', icon: 'line-chart', route: '/dashboards/metas' },
      ],
    },
    {
      type: 'group' as const,
      label: 'Inteligência Empresarial',
      children: [
        { key: 'ie_estoque', label: 'IE - Estoque', icon: 'cube', route: '/dashboards/ie/estoque' },
        { key: 'ie_comercial', label: 'IE - Comercial', icon: 'trending-up', route: '/dashboards/ie/comercial' },
        { key: 'ie_servico', label: 'IE - Serviço', icon: 'settings', route: '/dashboards/ie/servico' },
      ],
    },
  ],
};
