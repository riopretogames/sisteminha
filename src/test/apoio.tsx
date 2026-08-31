import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Permission } from '@/config/permissions';

/**
 * Apoio para testar TELA, e não só conta.
 *
 * O sistema já tinha teste de cálculo (faturamento, estoque, ranking), mas
 * nada que abrisse uma tela. E os quatro piores defeitos deste projeto foram
 * todos do mesmo tipo: **a tela pede um crachá, o banco exige outro — a tela
 * abre, os dados não vêm, e ninguém recebe erro.** Nenhum teste de cálculo
 * pega isso; só abrir a tela com o perfil errado pega.
 *
 * Aqui a tela roda num navegador de mentira, com o crachá que o teste mandar.
 * Não precisa de login, de servidor, nem de um segundo usuário de verdade.
 */

/** Permissões de cada perfil, como estão no banco (migration 20260801000002). */
export const PERMISSOES_POR_PERFIL: Record<string, string[]> = {
  administrador: ['*'],
  // Gerente: opera a loja inteira, menos o que é estrutura do sistema. No
  // banco a regra é escrita assim mesmo — "todas MENOS estas quatro"
  // (migration 20260801000002) —, e por isso aqui também: lista digitada
  // envelhece a cada permissão nova, a regra não.
  gerente: ['*', '!roles.manage', '!settings.edit', '!company.edit', '!users.manage'],
  // Gerente Técnico: manda na assistência e no que ela consome. Não vê
  // financeiro nem BI comercial — e este é o perfil que mais aparece nos
  // testes de custo, porque é o único fora do administrador com
  // `inventory.cost.view`.
  gerente_tecnico: [
    'home.view',
    'dashboards.view',
    'dashboards.stock.view',
    'dashboards.goals.view',
    'dashboards.service.view',
    'bi.stock.view',
    'bi.service.view',
    'reports.view',
    'reports.export',
    'inventory.view',
    'inventory.create',
    'inventory.edit',
    'inventory.adjust',
    'inventory.cost.view',
    'orders.view',
    'orders.create',
    'orders.edit',
    'orders.delete',
    'orders.approve',
    'orders.diagnose',
    'registry.view',
    'registry.customers.manage',
    'registry.products.manage',
    'registry.services.manage',
    'registry.suppliers.manage',
    'company.view',
  ],
  // As listas abaixo são cópia do que está NO BANCO (migrations
  // 20260801000002, 20260809150000, 20260809160000 e 20260823120000).
  //
  // Elas estavam desatualizadas e isso escondia comportamento real: o mock
  // dizia que o técnico não tinha `orders.diagnose` (tem) e que o vendedor não
  // tinha `orders.edit`/`orders.approve` (ganhou em 09/08, quando o Felipe
  // decidiu que "o vendedor opera a OS inteira"). Teste apoiado em permissão
  // que o banco não dá é teste que passa sem provar nada.
  vendedor: [
    'home.view',
    'dashboards.view',
    'dashboards.sales.view',
    'dashboards.goals.view',
    'inventory.view',
    'sales.view',
    'sales.create',
    'orders.view',
    'orders.create',
    'orders.edit',
    'orders.approve',
    'registry.view',
    'registry.customers.manage',
  ],
  tecnico: [
    'home.view',
    'dashboards.view',
    'dashboards.stock.view',
    'dashboards.service.view',
    'inventory.view',
    'orders.view',
    'orders.edit',
    'orders.diagnose',
    'registry.view',
  ],
};

/** Estado do usuário que o teste quer simular. */
export interface UsuarioDeTeste {
  perfil?: keyof typeof PERMISSOES_POR_PERFIL;
  /** Permissões extras, para testar exceção por pessoa. */
  extras?: string[];
  /** Permissões a tirar, mesmo que o perfil dê. */
  menos?: string[];
}

export function montarCan(u: UsuarioDeTeste) {
  const doPerfil = PERMISSOES_POR_PERFIL[u.perfil ?? 'administrador'] ?? [];
  const tudo = doPerfil.includes('*');
  const concedidas = new Set([...doPerfil, ...(u.extras ?? [])]);
  const tiradas = new Set(u.menos ?? []);

  // "!permissao" tira, mesmo com o curinga. É como o banco define o gerente:
  // todas menos quatro.
  const excecoesDoPerfil = new Set(
    doPerfil.filter((k) => k.startsWith('!')).map((k) => k.slice(1)),
  );

  return (p: Permission) => {
    if (tiradas.has(p) || excecoesDoPerfil.has(p)) return false;
    if (tudo) return true;
    return concedidas.has(p);
  };
}

/**
 * Resposta encadeável do Supabase.
 *
 * A biblioteca deixa escrever `.from(x).select(y).eq(a,b).order(c)`, então o
 * dublê precisa devolver a si mesmo em cada passo e só entregar os dados
 * quando alguém finalmente aguardar o resultado.
 */
function consultaFalsa(dados: unknown[], erro: unknown = null) {
  const resultado = { data: dados, error: erro, count: dados.length };
  const encadeavel: Record<string, unknown> = {};
  const metodos = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is',
    'in', 'or', 'not', 'order', 'limit', 'range', 'filter', 'match',
  ];
  for (const m of metodos) encadeavel[m] = () => encadeavel;
  encadeavel.single = () => Promise.resolve({ data: dados[0] ?? null, error: erro });
  encadeavel.maybeSingle = () => Promise.resolve({ data: dados[0] ?? null, error: erro });
  encadeavel.then = (aceitar: (r: unknown) => unknown) => Promise.resolve(resultado).then(aceitar);
  return encadeavel;
}

/**
 * Dublê do banco.
 *
 * Recebe um mapa de tabela → linhas. Tabela não listada devolve vazio, que é
 * o mesmo que a tela veria com o RLS barrando — de propósito: é assim que se
 * testa "a tela abre vazia porque falta permissão".
 */
export function bancoFalso(tabelas: Record<string, unknown[]>) {
  return {
    from: (tabela: string) => consultaFalsa(tabelas[tabela] ?? []),
    rpc: (nome: string) => Promise.resolve({ data: tabelas[`rpc:${nome}`] ?? null, error: null }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-teste' } }, error: null }),
    },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  };
}

/** Renderiza a tela com roteador e cache próprios, isolados por teste. */
export function renderizarTela(elemento: ReactElement): RenderResult {
  const cliente = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter>{elemento}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Silencia os avisos de console que as telas emitem em erro esperado. */
export function silenciarConsole() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}
