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
  roles?: string[]; // if undefined, visible to all
}

export interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path?: string;           // direct link (no submenu)
  children?: MenuChild[];  // submenu items
  roles?: string[];        // if undefined, visible to all
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
    path: '/dashboards',
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
