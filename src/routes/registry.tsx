import { lazy, type LazyExoticComponent, type ComponentType } from 'react';

/**
 * Registry de páginas.
 *
 * Liga a chave `element` de `config/menu.ts` ao componente que a renderiza.
 * É o único lugar que conhece as duas pontas — o menu não importa React e as
 * páginas não sabem em que rota vivem.
 *
 * Chave do menu sem entrada aqui NÃO quebra o build nem cai em 404: cai na
 * página "Em construção". Isso permite desenhar o menu inteiro primeiro e ir
 * preenchendo as telas, sem nunca deixar um caminho morto.
 *
 * Todas as páginas entram por `lazy`: o bundle inicial carrega só o que a rota
 * atual precisa, o que importa num ERP com dezenas de telas.
 */

type Page = LazyExoticComponent<ComponentType<unknown>>;

export const PAGES: Record<string, Page> = {
  /* ── Dashboards operacionais ────────────────────────────────────────────── */
  DashboardVenda: lazy(() => import('@/pages/DashboardVenda')),
  DashboardEstoque: lazy(() => import('@/pages/DashboardEstoque')),
  DashboardMetas: lazy(() => import('@/pages/DashboardMetas')),

  /* ── Operação ───────────────────────────────────────────────────────────── */
  Home: lazy(() => import('@/pages/Dashboard')),
  Estoque: lazy(() => import('@/pages/Estoque')),
  EstoqueCritico: lazy(() => import('@/pages/EstoqueCritico')),
  EntradaMercadoria: lazy(() => import('@/pages/EntradaMercadoria')),
  EstoqueMovimentacoes: lazy(() => import('@/pages/EstoqueMovimentacoes')),
  PDV: lazy(() => import('@/pages/PDV')),
  OrcamentoVenda: lazy(() => import('@/pages/OrcamentoVenda')),
  VendasHistorico: lazy(() => import('@/pages/VendasHistorico')),
  VendasPagamentos: lazy(() => import('@/pages/VendasPagamentos')),
  TrocaDevolucao: lazy(() => import('@/pages/TrocaDevolucao')),
  OrdensServico: lazy(() => import('@/pages/OrdensServico')),
  NovaOS: lazy(() => import('@/pages/NovaOS')),
  OSFinalizadas: lazy(() => import('@/pages/OSFinalizadas')),
  OSOrcamentos: lazy(() => import('@/pages/OSOrcamentos')),
  OSAguardandoRetirada: lazy(() => import('@/pages/OSAguardandoRetirada')),
  Clientes: lazy(() => import('@/pages/Clientes')),

  /* ── Cadastros ──────────────────────────────────────────────────────────── */
  CadastrosHub: lazy(() => import('@/pages/cadastros/CadastrosHub')),
  CatalogosHub: lazy(() => import('@/pages/cadastros/CatalogosHub')),
  Usuarios: lazy(() => import('@/pages/cadastros/Usuarios')),
  Fornecedores: lazy(() => import('@/pages/cadastros/Fornecedores')),
  Transportadoras: lazy(() => import('@/pages/cadastros/Transportadoras')),
  CadastroServicos: lazy(() => import('@/pages/cadastros/CadastroServicos')),
  FormasPagamento: lazy(() => import('@/pages/cadastros/FormasPagamento')),
  ClientesImportar: lazy(() => import('@/pages/cadastros/ClientesImportar')),

  /* ── Financeiro ─────────────────────────────────────────────────────────── */
  FinanceiroCaixa: lazy(() => import('@/pages/financeiro/FinanceiroCaixa')),
  ContasPagar: lazy(() => import('@/pages/financeiro/ContasPagar')),
  ContasReceber: lazy(() => import('@/pages/financeiro/ContasReceber')),
  FluxoCaixa: lazy(() => import('@/pages/financeiro/FluxoCaixa')),

  /* ── Relatórios ─────────────────────────────────────────────────────────── */
  RelatorioVendas: lazy(() => import('@/pages/relatorios/RelatorioVendas')),
  RelatorioOS: lazy(() => import('@/pages/relatorios/RelatorioOS')),
  RelatorioFinanceiro: lazy(() => import('@/pages/relatorios/RelatorioFinanceiro')),
  RelatorioEstoque: lazy(() => import('@/pages/relatorios/RelatorioEstoque')),

  /* ── Inteligência Empresarial ───────────────────────────────────────────── */
  IeComercial: lazy(() => import('@/pages/IeComercial')),
  IeEstoque: lazy(() => import('@/pages/IeEstoque')),

  /* ── Minha Empresa ──────────────────────────────────────────────────────── */
  MinhaEmpresa: lazy(() => import('@/pages/MinhaEmpresa')),

  /* ── Configurações ──────────────────────────────────────────────────────── */
  ConfigPerfis: lazy(() => import('@/pages/configuracoes/ConfigPerfis')),
  ConfigPreferencias: lazy(() => import('@/pages/configuracoes/ConfigPreferencias')),
  ConfigLogs: lazy(() => import('@/pages/configuracoes/ConfigLogs')),

  /* ── Ainda não construídas ──────────────────────────────────────────────────
   * Não precisam ser listadas: `element` ausente cai em EmConstrucao.
   * Ficam aqui como lista de trabalho.
   *
   *   IeServico (depende da tela de itens da OS, feita — falta só o
   *   relatório de lucro em cima dos itens)
   */
};

export const FallbackPage: Page = lazy(() => import('@/pages/EmConstrucao'));

/** Componente de uma chave de menu. Chave desconhecida → "Em construção". */
export function resolvePage(element: string): Page {
  return PAGES[element] ?? FallbackPage;
}
