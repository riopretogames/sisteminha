/**
 * Catálogo de permissões do RPG System.IO.
 *
 * Espelho EXATO da tabela `public.permissions` no Supabase
 * (migration 20260801000002_rbac_permissoes.sql). Se você adicionar uma
 * permissão aqui, adicione lá também — e vice-versa. O front usa esta lista
 * para montar menu e guards; o banco usa a dele para as policies de RLS.
 *
 * REGRA: nenhuma string de permissão solta no código. Sempre PERMISSIONS.X.
 */

export const PERMISSIONS = {
  HOME_VIEW: 'home.view',

  DASHBOARDS_VIEW: 'dashboards.view',
  DASHBOARDS_SALES_VIEW: 'dashboards.sales.view',
  DASHBOARDS_STOCK_VIEW: 'dashboards.stock.view',
  DASHBOARDS_GOALS_VIEW: 'dashboards.goals.view',
  DASHBOARDS_SERVICE_VIEW: 'dashboards.service.view',

  BI_STOCK_VIEW: 'bi.stock.view',
  BI_COMMERCIAL_VIEW: 'bi.commercial.view',
  BI_SERVICE_VIEW: 'bi.service.view',

  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_CREATE: 'inventory.create',
  INVENTORY_EDIT: 'inventory.edit',
  INVENTORY_DELETE: 'inventory.delete',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_COST_VIEW: 'inventory.cost.view',

  SALES_VIEW: 'sales.view',
  SALES_CREATE: 'sales.create',
  SALES_CANCEL: 'sales.cancel',
  SALES_DISCOUNT: 'sales.discount',

  ORDERS_VIEW: 'orders.view',
  ORDERS_CREATE: 'orders.create',
  ORDERS_EDIT: 'orders.edit',
  ORDERS_DELETE: 'orders.delete',
  ORDERS_APPROVE: 'orders.approve',
  ORDERS_DIAGNOSE: 'orders.diagnose',

  FINANCE_VIEW: 'finance.view',
  FINANCE_PAYABLE_MANAGE: 'finance.payable.manage',
  FINANCE_RECEIVABLE_MANAGE: 'finance.receivable.manage',
  FINANCE_CASHFLOW_VIEW: 'finance.cashflow.view',
  FINANCE_CASHIER_CLOSE: 'finance.cashier.close',

  REGISTRY_VIEW: 'registry.view',
  REGISTRY_CUSTOMERS_MANAGE: 'registry.customers.manage',
  REGISTRY_SUPPLIERS_MANAGE: 'registry.suppliers.manage',
  REGISTRY_PRODUCTS_MANAGE: 'registry.products.manage',
  REGISTRY_SERVICES_MANAGE: 'registry.services.manage',

  COMPANY_VIEW: 'company.view',
  COMPANY_EDIT: 'company.edit',

  SETTINGS_VIEW: 'settings.view',
  SETTINGS_EDIT: 'settings.edit',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_VIEW: 'audit.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Papéis do sistema. Espelha o enum `app_role` no banco. */
export const ROLES = {
  ADMINISTRADOR: 'administrador',
  GERENTE: 'gerente',
  GERENTE_TECNICO: 'gerente_tecnico',
  VENDEDOR: 'vendedor',
  TECNICO: 'tecnico',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Rótulo de exibição de cada papel. */
export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.ADMINISTRADOR]: 'Administrador',
  [ROLES.GERENTE]: 'Gerente',
  [ROLES.GERENTE_TECNICO]: 'Gerente Técnico',
  [ROLES.VENDEDOR]: 'Vendedor',
  [ROLES.TECNICO]: 'Técnico',
};

/**
 * Rótulo do papel, tolerante a valor que o front não conhece.
 *
 * O enum `app_role` do banco tem 7 valores; este arquivo conhece 5. Os dois
 * órfãos ('admin' e 'atendente') foram migrados para os novos em 01/08 e a
 * tela de Usuários só oferece os 5 — então, hoje, não existe caminho pela
 * interface que produza um valor desconhecido.
 *
 * Ainda assim a leitura precisa aguentar um: dado antigo restaurado de
 * backup, importação, ou uma linha mexida direto no banco. Sem isto, o rótulo
 * saía **em branco** — o que na tela parece "esta pessoa não tem perfil",
 * exatamente o oposto de "tem um perfil que eu não reconheço". A primeira
 * leitura convida a atribuir um papel; a segunda, a investigar.
 */
export function rotuloDoPapel(role: string | null | undefined): string {
  if (!role) return 'Sem perfil';
  return ROLE_LABELS[role as Role] ?? `Perfil desconhecido (${role})`;
}
