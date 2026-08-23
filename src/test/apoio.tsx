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
  vendedor: [
    'dashboards.view',
    'dashboards.sales.view',
    'dashboards.goals.view',
    'inventory.view',
    'sales.create',
    'sales.view',
    'registry.customers.view',
    'registry.customers.manage',
    'service.view',
  ],
  tecnico: [
    'dashboards.view',
    'dashboards.stock.view',
    'dashboards.service.view',
    'inventory.view',
    'inventory.adjust',
    'service.view',
    'service.edit',
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

  return (p: Permission) => {
    if (tiradas.has(p)) return false;
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
