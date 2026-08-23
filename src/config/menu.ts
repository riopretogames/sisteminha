import { PERMISSIONS, type Permission } from './permissions';
import type { IconName } from './icons';

/**
 * MENU — fonte única de verdade da navegação do RPG System.IO.
 *
 * Este arquivo é DADO, não componente. Nada aqui importa React, e o ícone é
 * uma string resolvida pelo registry em `config/icons.ts`. Consequência prática:
 * Sidebar, rotas e guards de permissão são todos derivados daqui, e o menu pode
 * um dia vir do banco sem que nenhum componente mude.
 *
 * Três tipos de nó, e só três:
 *
 *   link    → item clicável. Tem `path`, `element` e (quase sempre) `permission`.
 *   group   → rótulo visual. NUNCA clicável, NUNCA tem rota. Só agrupa.
 *   section → item de primeiro nível que abre/fecha e contém group | link.
 *
 * `element` é a chave do componente no registry de rotas (`routes/registry.tsx`).
 * Item cujo element ainda não existe cai na página "Em construção" — de
 * propósito: tela honesta é melhor que 404 silencioso.
 */

export interface MenuLink {
  kind: 'link';
  id: string;
  label: string;
  path: string;
  element: string;
  icon?: IconName;
  permission?: Permission;
  /** Descrição curta em português leigo — usada nos hubs de módulo. */
  hint?: string;
  hidden?: boolean;
}

export interface MenuGroup {
  kind: 'group';
  id: string;
  label: string;
  children: MenuLink[];
  hidden?: boolean;
}

export interface MenuSection {
  kind: 'section';
  id: string;
  label: string;
  icon: IconName;
  /** Permissão do módulo inteiro. Sem ela, a seção some por completo. */
  permission?: Permission;
  children: Array<MenuGroup | MenuLink>;
  /** Esconde o módulo sem removê-lo da config (feature flag). */
  hidden?: boolean;
}

export type MenuNode = MenuLink | MenuGroup | MenuSection;
export type MenuRoot = MenuLink | MenuSection;

export const MENU: MenuRoot[] = [
  {
    kind: 'link',
    id: 'home',
    label: 'Home',
    path: '/home',
    element: 'Home',
    icon: 'home',
    permission: PERMISSIONS.HOME_VIEW,
  },

  {
    kind: 'section',
    id: 'dashboards',
    label: 'Dashboards',
    icon: 'dashboard',
    permission: PERMISSIONS.DASHBOARDS_VIEW,
    children: [
      {
        kind: 'group',
        id: 'dashboards-operacionais',
        label: 'Dashboards Operacionais',
        children: [
          { kind: 'link', id: 'dash-venda', label: 'Venda', path: '/dashboards/venda', element: 'DashboardVenda', permission: PERMISSIONS.DASHBOARDS_SALES_VIEW },
          { kind: 'link', id: 'dash-assistencia', label: 'Assistência', path: '/dashboards/assistencia', element: 'DashboardAssistencia', permission: PERMISSIONS.DASHBOARDS_SERVICE_VIEW },
          { kind: 'link', id: 'dash-estoque', label: 'Estoque', path: '/dashboards/estoque', element: 'DashboardEstoque', permission: PERMISSIONS.DASHBOARDS_STOCK_VIEW },
          { kind: 'link', id: 'dash-metas', label: 'Metas', path: '/dashboards/metas', element: 'DashboardMetas', permission: PERMISSIONS.DASHBOARDS_GOALS_VIEW },
        ],
      },
      {
        kind: 'group',
        id: 'inteligencia-empresarial',
        label: 'Inteligência Empresarial',
        children: [
          { kind: 'link', id: 'ie-estoque', label: 'IE - Estoque', path: '/dashboards/ie/estoque', element: 'IeEstoque', permission: PERMISSIONS.BI_STOCK_VIEW },
          { kind: 'link', id: 'ie-comercial', label: 'IE - Comercial', path: '/dashboards/ie/comercial', element: 'IeComercial', permission: PERMISSIONS.BI_COMMERCIAL_VIEW },
          { kind: 'link', id: 'ie-servico', label: 'IE - Serviço', path: '/dashboards/ie/servico', element: 'IeServico', permission: PERMISSIONS.BI_SERVICE_VIEW },
        ],
      },
    ],
  },

  {
    kind: 'section',
    id: 'relatorios',
    label: 'Relatórios',
    icon: 'reports',
    permission: PERMISSIONS.REPORTS_VIEW,
    children: [
      { kind: 'link', id: 'rel-vendas', label: 'Relatório de Vendas', path: '/relatorios/vendas', element: 'RelatorioVendas', permission: PERMISSIONS.REPORTS_VIEW },
      { kind: 'link', id: 'rel-os', label: 'Relatório de OS', path: '/relatorios/os', element: 'RelatorioOS', permission: PERMISSIONS.REPORTS_VIEW },
      // Lê `titulos_financeiros`, exatamente como o Fluxo de Caixa — por isso
      // pede a MESMA permissão que ele. Até 21/08 pedia `finance.view`, que é
      // o crachá de ENTRAR no módulo Financeiro e ver o caixa, e não está
      // entre as três que a RLS de títulos aceita. Resultado: quem tivesse só
      // `finance.view` abria o relatório e via uma tela vazia, sem erro — o
      // banco filtrava tudo em silêncio.
      { kind: 'link', id: 'rel-financeiro', label: 'Relatório Financeiro', path: '/relatorios/financeiro', element: 'RelatorioFinanceiro', permission: PERMISSIONS.FINANCE_CASHFLOW_VIEW },
      { kind: 'link', id: 'rel-estoque', label: 'Relatório de Estoque', path: '/relatorios/estoque', element: 'RelatorioEstoque', permission: PERMISSIONS.REPORTS_VIEW },
    ],
  },

  {
    kind: 'section',
    id: 'estoque',
    label: 'Estoque',
    icon: 'package',
    permission: PERMISSIONS.INVENTORY_VIEW,
    children: [
      { kind: 'link', id: 'est-produtos', label: 'Produtos', path: '/estoque', element: 'Estoque', permission: PERMISSIONS.INVENTORY_VIEW },
      // Pede `inventory.adjust`, nao `inventory.view`: dar entrada digita
      // preco de compra. A tela exige TAMBEM `inventory.cost.view` e diz
      // isso na cara quando falta, em vez de abrir vazia.
      { kind: 'link', id: 'est-entrada', label: 'Entrada de Mercadoria', path: '/estoque/entrada', element: 'EntradaMercadoria', permission: PERMISSIONS.INVENTORY_ADJUST },
      { kind: 'link', id: 'est-mov', label: 'Movimentações', path: '/estoque/movimentacoes', element: 'EstoqueMovimentacoes', permission: PERMISSIONS.INVENTORY_VIEW },
      { kind: 'link', id: 'est-critico', label: 'Estoque Crítico', path: '/estoque/critico', element: 'EstoqueCritico', permission: PERMISSIONS.INVENTORY_VIEW },
    ],
  },

  {
    kind: 'section',
    id: 'venda',
    label: 'Venda',
    icon: 'cart',
    permission: PERMISSIONS.SALES_VIEW,
    children: [
      { kind: 'link', id: 'venda-pdv', label: 'Nova Venda (PDV)', path: '/pdv', element: 'PDV', permission: PERMISSIONS.SALES_CREATE },
      { kind: 'link', id: 'venda-orcamento', label: 'Orçamento (Simulação)', path: '/vendas/orcamento', element: 'OrcamentoVenda', permission: PERMISSIONS.SALES_CREATE, hint: 'Calcula o valor pro cliente sem gravar nada — pra fechar de verdade, use o PDV' },
      { kind: 'link', id: 'venda-hist', label: 'Histórico de Vendas', path: '/vendas/historico', element: 'VendasHistorico', permission: PERMISSIONS.SALES_VIEW },
      { kind: 'link', id: 'venda-pag', label: 'Pagamentos', path: '/vendas/pagamentos', element: 'VendasPagamentos', permission: PERMISSIONS.SALES_VIEW },
      { kind: 'link', id: 'venda-troca', label: 'Troca / Devolução', path: '/vendas/troca-devolucao', element: 'TrocaDevolucao', permission: PERMISSIONS.SALES_CANCEL, hint: 'Devolver ou trocar produto de uma venda já fechada' },
    ],
  },

  {
    kind: 'section',
    id: 'os',
    label: 'Ordem de Serviço',
    icon: 'clipboard',
    permission: PERMISSIONS.ORDERS_VIEW,
    children: [
      { kind: 'link', id: 'os-kanban', label: 'Kanban de OS', path: '/os', element: 'OrdensServico', permission: PERMISSIONS.ORDERS_VIEW },
      { kind: 'link', id: 'os-nova', label: 'Nova OS', path: '/os/nova', element: 'NovaOS', permission: PERMISSIONS.ORDERS_CREATE },
      { kind: 'link', id: 'os-finalizadas', label: 'OS Finalizadas', path: '/os/finalizadas', element: 'OSFinalizadas', permission: PERMISSIONS.ORDERS_VIEW },
      { kind: 'link', id: 'os-orcamentos', label: 'Orçamentos', path: '/os/orcamentos', element: 'OSOrcamentos', permission: PERMISSIONS.ORDERS_VIEW },
      // Regra da loja: aparelho pronto parado há mais de 6 meses é tratado como
      // abandonado. Sem esta tela, quem lembrava de cobrar o cliente era a
      // memória de quem atendeu.
      { kind: 'link', id: 'os-retirada', label: 'Aguardando Retirada', path: '/os/aguardando-retirada', element: 'OSAguardandoRetirada', permission: PERMISSIONS.ORDERS_VIEW, hint: 'Aparelhos prontos que o cliente ainda não buscou' },
    ],
  },

  {
    kind: 'section',
    id: 'financeiro',
    label: 'Financeiro',
    icon: 'money',
    permission: PERMISSIONS.FINANCE_VIEW,
    children: [
      { kind: 'link', id: 'fin-caixa', label: 'Caixa', path: '/financeiro/caixa', element: 'FinanceiroCaixa', permission: PERMISSIONS.FINANCE_CASHIER_CLOSE },
      { kind: 'link', id: 'fin-pagar', label: 'Contas a Pagar', path: '/financeiro/pagar', element: 'ContasPagar', permission: PERMISSIONS.FINANCE_PAYABLE_MANAGE },
      { kind: 'link', id: 'fin-receber', label: 'Contas a Receber', path: '/financeiro/receber', element: 'ContasReceber', permission: PERMISSIONS.FINANCE_RECEIVABLE_MANAGE },
      { kind: 'link', id: 'fin-fluxo', label: 'Fluxo de Caixa', path: '/financeiro/fluxo', element: 'FluxoCaixa', permission: PERMISSIONS.FINANCE_CASHFLOW_VIEW },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CADASTROS
  //
  // Espelha o que existe hoje no OK Cells, mas agrupado por natureza do dado em
  // vez de uma lista solta de 10 itens. O grupo "Tabelas de Apoio" reúne todos
  // os cadastros de lista simples (descrição + ativo), que rodam numa tela
  // genérica configurada em `config/catalogos.ts` — uma tela, doze cadastros.
  // ───────────────────────────────────────────────────────────────────────────
  {
    kind: 'section',
    id: 'cadastros',
    label: 'Cadastros',
    icon: 'file',
    permission: PERMISSIONS.REGISTRY_VIEW,
    children: [
      {
        kind: 'link',
        id: 'cad-hub',
        label: 'Visão Geral',
        path: '/cadastros',
        element: 'CadastrosHub',
        permission: PERMISSIONS.REGISTRY_VIEW,
        hint: 'Todos os cadastros do sistema em um só lugar',
        icon: 'dashboard',
      },
      {
        kind: 'group',
        id: 'cad-pessoas',
        label: 'Pessoas e Parceiros',
        children: [
          { kind: 'link', id: 'cad-clientes', label: 'Clientes', path: '/cadastros/clientes', element: 'Clientes', permission: PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE, hint: 'Quem compra e quem deixa aparelho na assistência', icon: 'users' },
          { kind: 'link', id: 'cad-clientes-import', label: 'Importação de Clientes', path: '/cadastros/clientes/importar', element: 'ClientesImportar', permission: PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE, hint: 'Subir clientes em massa por planilha', icon: 'clipboard' },
          { kind: 'link', id: 'cad-fornecedores', label: 'Fornecedores', path: '/cadastros/fornecedores', element: 'Fornecedores', permission: PERMISSIONS.REGISTRY_SUPPLIERS_MANAGE, hint: 'De quem você compra produto e peça', icon: 'truck' },
          { kind: 'link', id: 'cad-transportadoras', label: 'Transportadoras', path: '/cadastros/transportadoras', element: 'Transportadoras', permission: PERMISSIONS.REGISTRY_SUPPLIERS_MANAGE, hint: 'Quem leva e traz encomenda', icon: 'truck' },
          // `users.manage` em vez de `users.view`: só o Administrador tem essa
          // permissão. Gerente enxerga o resto de Cadastros, mas não a tela que
          // decide quem entra no sistema e com qual poder.
          { kind: 'link', id: 'cad-usuarios', label: 'Usuários', path: '/cadastros/usuarios', element: 'Usuarios', permission: PERMISSIONS.USERS_MANAGE, hint: 'Quem acessa o sistema e com qual perfil', icon: 'shield' },
        ],
      },
      {
        kind: 'group',
        id: 'cad-catalogo',
        label: 'Catálogo',
        children: [
          // "Cadastro de Produtos" foi removido daqui de propósito (05/08):
          // a tela de Estoque já tem CRUD completo de produto (nome, custo,
          // preço, categoria, localização, estoque). Duas telas pro mesmo
          // cadastro só confundiria sobre qual é a "de verdade".
          { kind: 'link', id: 'cad-servicos', label: 'Serviços', path: '/cadastros/servicos', element: 'CadastroServicos', permission: PERMISSIONS.REGISTRY_SERVICES_MANAGE, hint: 'Mão de obra da assistência e valor de referência', icon: 'wrench' },
          { kind: 'link', id: 'cad-pagamento', label: 'Formas de Pagamento', path: '/cadastros/formas-pagamento', element: 'FormasPagamento', permission: PERMISSIONS.REGISTRY_PRODUCTS_MANAGE, hint: 'Parcelas, taxas e juros de cada forma', icon: 'money' },
        ],
      },
      {
        kind: 'group',
        id: 'cad-apoio',
        label: 'Tabelas de Apoio',
        children: [
          { kind: 'link', id: 'cad-catalogos', label: 'Listas do Sistema', path: '/cadastros/listas', element: 'CatalogosHub', permission: PERMISSIONS.REGISTRY_VIEW, hint: 'Marcas, cores, condições, checklist, origens e afins', icon: 'boxes' },
        ],
      },
    ],
  },

  {
    kind: 'link',
    id: 'empresa',
    label: 'Minha Empresa',
    path: '/empresa',
    element: 'MinhaEmpresa',
    icon: 'company',
    permission: PERMISSIONS.COMPANY_VIEW,
  },

  {
    kind: 'section',
    id: 'configuracoes',
    label: 'Configurações',
    icon: 'settings',
    permission: PERMISSIONS.SETTINGS_VIEW,
    children: [
      { kind: 'link', id: 'cfg-perfis', label: 'Perfis e Permissões', path: '/configuracoes/perfis', element: 'ConfigPerfis', permission: PERMISSIONS.ROLES_MANAGE },
      { kind: 'link', id: 'cfg-prefs', label: 'Preferências do Sistema', path: '/configuracoes/preferencias', element: 'ConfigPreferencias', permission: PERMISSIONS.SETTINGS_EDIT },
      { kind: 'link', id: 'cfg-logs', label: 'Logs / Auditoria', path: '/configuracoes/logs', element: 'ConfigLogs', permission: PERMISSIONS.AUDIT_VIEW },
    ],
  },
];

/* ────────────────────────────────────────────────────────────────────────── */
/*  Derivações — não duplique esta lógica em componente nenhum.               */
/* ────────────────────────────────────────────────────────────────────────── */

/** Todos os links navegáveis, achatados. É a base para gerar as rotas. */
export function flattenLinks(nodes: MenuRoot[] = MENU): MenuLink[] {
  const out: MenuLink[] = [];

  for (const node of nodes) {
    if (node.kind === 'link') {
      out.push(node);
      continue;
    }
    for (const child of node.children) {
      if (child.kind === 'link') out.push(child);
      else out.push(...child.children);
    }
  }

  return out.filter((l) => !l.hidden);
}

/** Descobre a seção dona de um caminho — abre o submenu certo ao entrar na rota. */
export function findSectionIdByPath(pathname: string): string | null {
  for (const node of MENU) {
    if (node.kind !== 'section') continue;

    const links: MenuLink[] = [];
    for (const child of node.children) {
      if (child.kind === 'link') links.push(child);
      else links.push(...child.children);
    }

    if (links.some((l) => pathname === l.path || pathname.startsWith(l.path + '/'))) {
      return node.id;
    }
  }
  return null;
}
