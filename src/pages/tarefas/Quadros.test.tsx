import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderizarTela, montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * A lista de quadros.
 *
 * O ponto principal é a permissão: criar, renomear e arquivar quadro é de
 * quem gerencia (`tasks.manage`). O vendedor vê os quadros e entra neles, mas
 * não vê botão que o banco vai recusar — botão que só dá "não permitido" é
 * tela quebrada para quem está atendendo.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const mockCan = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'u1', nome: 'Felipe Bottaro', tenant_id: 'loja-1' } },
    session: {},
    loading: false,
    can: (p: string) => mockCan(p),
    canAny: () => true,
    hasRole: () => false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

const QUADRO_LOJA = {
  id: 'q-loja',
  nome: 'Loja',
  descricao: 'Rotina do balcão: vendedores, gerente, dono e anúncios.',
  cor: 'bg-blue-500 text-white',
  ordem: 1024,
  arquivado_em: null,
  created_at: '2026-09-23T10:00:00Z',
  updated_at: '2026-09-23T10:00:00Z',
  // A contagem embutida que o useQuadros pede ao banco: as colunas ATIVAS,
  // cada uma com as tarefas ativas dela (achado 24 da revisão de 24/09).
  tarefas_listas: [
    { id: 'l1', tarefas: [{ count: 10 }] },
    { id: 'l2', tarefas: [{ count: 12 }] },
    { id: 'l3', tarefas: [{ count: 9 }] },
    { id: 'l4', tarefas: [{ count: 12 }] },
    { id: 'l5', tarefas: [{ count: 0 }] },
  ],
};

async function abrirQuadros(perfil: 'vendedor' | 'gerente', quadros: unknown[]) {
  mockCan.mockImplementation(montarCan({ perfil }));
  mockSupabase.atual = bancoFalso({ tarefas_quadros: quadros });
  const { default: Quadros } = await import('./Quadros');
  return renderizarTela(
    <Routes>
      <Route path="/" element={<Quadros />} />
      <Route path="/tarefas/:id" element={<p>Quadro aberto</p>} />
    </Routes>,
  );
}

describe('Contagem do cartão do quadro (achado 24)', () => {
  it('conta as tarefas pelas colunas ativas: a da coluna arquivada não entra', async () => {
    const { SELECT_QUADRO_COM_CONTAGEM, contagemDoQuadro } = await import('@/hooks/useQuadros');
    // Contrato com o banco (o dublê ignora o texto do select): as tarefas vêm
    // DENTRO das colunas, e não direto do quadro — contar direto somava as
    // tarefas de coluna arquivada, que o quadro aberto não mostra.
    expect(SELECT_QUADRO_COM_CONTAGEM).toContain('tarefas_listas(id, tarefas(count))');
    expect(SELECT_QUADRO_COM_CONTAGEM.replace('tarefas_listas(id, tarefas(count))', '')).not.toContain(
      'tarefas(count)',
    );

    expect(contagemDoQuadro({ tarefas_listas: [{ id: 'a', tarefas: [{ count: 3 }] }, { id: 'b', tarefas: [] }] })).toEqual({
      total_listas: 2,
      total_tarefas: 3,
    });
    // Sem a contagem (o servidor recusou o formato): sem número, em vez de "0".
    expect(contagemDoQuadro({})).toEqual({ total_listas: undefined, total_tarefas: undefined });
  });
});

describe('Quadros de tarefas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('mostra o quadro com a contagem de listas e tarefas', async () => {
    await abrirQuadros('vendedor', [QUADRO_LOJA]);

    expect(await screen.findByText('Loja')).toBeInTheDocument();
    expect(screen.getByText('5 colunas')).toBeInTheDocument();
    expect(screen.getByText('43 tarefas')).toBeInTheDocument();
  });

  it('o vendedor entra no quadro, mas não vê criar, renomear nem arquivar', async () => {
    await abrirQuadros('vendedor', [QUADRO_LOJA]);

    await screen.findByText('Loja');
    expect(screen.queryByRole('button', { name: /criar quadro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /opções do quadro/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Abrir o quadro Loja' }));
    expect(await screen.findByText('Quadro aberto')).toBeInTheDocument();
  });

  it('o gerente vê criar quadro e o menu do quadro', async () => {
    await abrirQuadros('gerente', [QUADRO_LOJA]);

    await screen.findByText('Loja');
    expect(screen.getByRole('button', { name: /criar quadro/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opções do quadro Loja' })).toBeInTheDocument();
  });

  it('sem quadro nenhum, o gerente ganha os modelos da Loja e da Assistência como atalho', async () => {
    await abrirQuadros('gerente', []);

    expect(await screen.findByText('Nenhum quadro ainda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar o modelo “Loja”' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar o modelo “Assistência”' })).toBeInTheDocument();
    // "Em branco" não vira cartão de modelo (não tem tarefa pronta): é o
    // botão de começar do zero.
    expect(screen.queryByRole('button', { name: 'Usar o modelo “Em branco”' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar quadro em branco' })).toBeInTheDocument();
  });

  it('o atalho do modelo abre a criação já no modelo, com os nomes das listas para ajustar', async () => {
    await abrirQuadros('gerente', []);

    fireEvent.click(await screen.findByRole('button', { name: 'Usar o modelo “Loja”' }));

    // As colunas do Trello de hoje, prontas para trocar de nome antes de criar.
    expect(await screen.findByDisplayValue('Vendedor sênior')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Anúncios OLX')).toBeInTheDocument();
  });

  it('sem quadro nenhum, o vendedor é orientado a pedir para o gerente', async () => {
    await abrirQuadros('vendedor', []);

    expect(await screen.findByText('Nenhum quadro ainda')).toBeInTheDocument();
    expect(screen.getByText(/peça para o gerente criar o primeiro/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /criar quadro/i })).not.toBeInTheDocument();
  });
});
