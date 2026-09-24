import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Configurações > Logs.
 *
 * Achado 80 (revisão de 24/09): `campos_obrigatorios` e `tarefas_quadros` já
 * tinham gatilho de auditoria, mas a tela não os conhecia — a coluna Registro
 * mostrava o nome cru da tabela e não havia botão de filtro. Mesmo defeito
 * corrigido em 20/08 para os pagamentos de OS.
 *
 * Achado 79: mudar o perfil INTEIRO (Perfis e Permissões) não deixava rastro.
 * A migration 20260924166000 pôs o gatilho; aqui a tela precisa dizer, em
 * português, QUAL perfil ganhou ou perdeu QUAL permissão.
 */

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

const QUANDO = '2026-09-24T15:00:00Z';

const REGISTROS = [
  {
    id: 'a1',
    acao: 'UPDATE',
    tabela: 'campos_obrigatorios',
    registro_id: 'c1',
    dados_antes: { obrigatorio: false },
    dados_depois: { obrigatorio: true },
    created_at: QUANDO,
    usuario_id: 'u-felipe',
  },
  {
    id: 'a2',
    acao: 'INSERT',
    tabela: 'tarefas_quadros',
    registro_id: 'q1',
    dados_antes: null,
    dados_depois: { nome: 'Loja' },
    created_at: QUANDO,
    usuario_id: 'u-felipe',
  },
  {
    id: 'a3',
    acao: 'INSERT',
    tabela: 'role_permissions',
    registro_id: null,
    dados_antes: null,
    dados_depois: { role: 'vendedor', permission_key: 'inventory.cost.view' },
    created_at: QUANDO,
    usuario_id: 'u-felipe',
  },
  {
    id: 'a4',
    acao: 'DELETE',
    tabela: 'role_permissions',
    registro_id: null,
    dados_antes: { role: 'gerente', permission_key: 'finance.view' },
    dados_depois: null,
    created_at: QUANDO,
    usuario_id: 'u-felipe',
  },
  {
    id: 'a5',
    acao: 'UPDATE',
    tabela: 'profiles',
    registro_id: 'u-richard',
    dados_antes: { nome: 'Richard', ativo: true, arquivado_em: null },
    dados_depois: { nome: 'Richard', ativo: false, arquivado_em: null },
    created_at: QUANDO,
    usuario_id: 'u-felipe',
  },
];

async function abrirLogs() {
  mockSupabase.atual = bancoFalso({
    vw_auditoria: REGISTROS,
    profiles: [
      { id: 'u-felipe', nome: 'Felipe Bottaro' },
      { id: 'u-richard', nome: 'Richard Sanches' },
    ],
    permissions: [
      { key: 'inventory.cost.view', descricao: 'Ver custo e margem' },
      { key: 'finance.view', descricao: 'Ver financeiro' },
    ],
  });
  const { default: ConfigLogs } = await import('./ConfigLogs');
  return renderizarTela(<ConfigLogs />);
}

describe('Configurações > Logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('dá nome de gente às tabelas novas, e filtro para cada uma', async () => {
    await abrirLogs();

    // Espera as linhas chegarem (os botões de filtro aparecem antes delas).
    await waitFor(() => {
      expect(screen.getAllByText('Campo obrigatório').length).toBe(2);
    });
    // Uma vez no botão de filtro e outra na linha.
    expect(screen.getAllByText('Campo obrigatório').length).toBe(2);
    expect(screen.getAllByText('Quadro de tarefas').length).toBe(2);
    expect(screen.getAllByText('Permissão de perfil').length).toBe(3);
    // O nome cru da tabela não aparece em lugar nenhum.
    expect(screen.queryByText('campos_obrigatorios')).not.toBeInTheDocument();
    expect(screen.queryByText('tarefas_quadros')).not.toBeInTheDocument();
    expect(screen.queryByText('role_permissions')).not.toBeInTheDocument();
  });

  it('diz qual perfil ganhou ou perdeu qual permissão, com o texto da tela', async () => {
    await abrirLogs();

    await waitFor(() => {
      expect(screen.getByText('Perfil Vendedor ganhou: Ver custo e margem')).toBeInTheDocument();
    });
    expect(screen.getByText('Perfil Gerente perdeu: Ver financeiro')).toBeInTheDocument();
  });

  it('na linha de cadastro de funcionário, diz de quem é o cadastro', async () => {
    await abrirLogs();

    await waitFor(() => {
      expect(screen.getByText('Richard Sanches')).toBeInTheDocument();
    });
  });

  it('"Copiar link" do Entrar como aparece como link gerado, não como "Alterou"', async () => {
    REGISTROS.push({
      id: 'a6',
      acao: 'GEROU_ACESSO',
      tabela: 'profiles',
      registro_id: 'u-richard',
      dados_antes: null,
      dados_depois: { gerou_acesso_para: 'Richard Sanches', modo: 'link' } as never,
      created_at: QUANDO,
      usuario_id: 'u-felipe',
    });
    try {
      await abrirLogs();
      await waitFor(() => {
        expect(screen.getByText('Gerou link de acesso')).toBeInTheDocument();
      });
    } finally {
      REGISTROS.pop();
    }
  });
});
