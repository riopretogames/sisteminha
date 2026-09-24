import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, silenciarConsole } from '@/test/apoio';
import { bancoComFiltros, type Gravacao } from '@/test/bancoComFiltros';

/**
 * O fechamento do caixa às cegas.
 *
 * Achados 55, 56 e 71 da revisão de 24/09/2026:
 * - o "Saldo esperado" ficava na tela o tempo todo, e bastava copiá-lo na
 *   janela de fechamento para a conferência "bater" sem ninguém contar nada;
 * - o esperado era calculado AQUI, com a lista de quando a tela abriu, e
 *   gravado como verdade — venda feita em outro computador ficava de fora;
 * - se outra pessoa já tinha fechado, a tela dizia "Sobrou R$ X" sem ter
 *   gravado nada;
 * - o resultado só aparecia num aviso que some.
 */

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: mockToast,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'u1', tenant_id: 'loja-1', nome: 'Richard' } },
    session: {},
    loading: false,
    can: () => true,
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

const SESSAO_ABERTA = {
  id: 'cx-hoje',
  status: 'aberto',
  aberto_em: '2026-09-24T08:00:00',
  aberto_por: 'u1',
  valor_abertura: 100,
  fechado_em: null,
  fechado_por: null,
  valor_informado: null,
  valor_calculado: null,
  diferenca: null,
  observacoes: null,
};

const SESSAO_DE_ONTEM = {
  id: 'cx-ontem',
  status: 'fechado',
  aberto_em: '2026-09-23T08:00:00',
  aberto_por: 'u1',
  valor_abertura: 50,
  fechado_em: '2026-09-23T19:00:00',
  fechado_por: 'u2',
  valor_informado: 460,
  valor_calculado: 500,
  diferenca: -40,
  observacoes: 'faltou troco',
};

// Abertura 100 + venda 250 − sangria 70 = 280. Esse número NÃO pode aparecer.
const MOVIMENTOS = [
  { id: 'm1', sessao_id: 'cx-hoje', tipo: 'venda', descricao: 'Venda VD-1', valor: 250, created_at: '2026-09-24T10:00:00' },
  { id: 'm2', sessao_id: 'cx-hoje', tipo: 'sangria', descricao: 'Depósito', valor: -70, created_at: '2026-09-24T12:00:00' },
];

const RESUMO = [
  { sessao_id: 'cx-hoje', forma_pagamento_id: 'f-din', forma_descricao: 'Dinheiro', entra_no_caixa: true, total: 250 },
  { sessao_id: 'cx-hoje', forma_pagamento_id: 'f-pix', forma_descricao: 'PIX', entra_no_caixa: false, total: 430 },
];

async function abrirCaixa(aoGravar?: (g: Gravacao) => { data?: unknown; error?: unknown } | void) {
  const banco = bancoComFiltros(
    {
      caixa_sessoes: [SESSAO_ABERTA, SESSAO_DE_ONTEM],
      caixa_movimentos: MOVIMENTOS,
      vw_caixa_resumo_formas: RESUMO,
      profiles: [
        { id: 'u1', nome: 'Richard' },
        { id: 'u2', nome: 'Luana' },
      ],
    },
    { aoGravar },
  );
  mockSupabase.atual = banco;
  const { default: FinanceiroCaixa } = await import('./FinanceiroCaixa');
  renderizarTela(<FinanceiroCaixa />);
  await screen.findByText('Movimentos do expediente');
  return banco;
}

async function fecharCom(valor: string) {
  fireEvent.click(screen.getByRole('button', { name: /fechar caixa/i }));
  const campo = await screen.findByLabelText(/quanto tem na gaveta agora/i);
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.click(screen.getByRole('button', { name: /conferir e fechar/i }));
}

describe('Caixa — fechamento às cegas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('com o caixa aberto, o saldo esperado NÃO aparece em lugar nenhum', async () => {
    await abrirCaixa();

    expect(screen.getByText('No fechamento')).toBeInTheDocument();
    // 100 + 250 − 70 = 280: nem no cartão, nem somado em outro canto.
    expect(screen.queryByText(/R\$\s*280,00/)).not.toBeInTheDocument();
    // O total em dinheiro do resumo é, na prática, o esperado — também some.
    // O PIX continua informativo.
    await screen.findByText('PIX');
    expect(screen.getByText('Conferido no fechamento')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*430,00/)).toBeInTheDocument();
  });

  it('fechar manda SÓ o que foi contado, e mostra o esperado que o BANCO calculou', async () => {
    const banco = await abrirCaixa((g) =>
      g.tabela === 'caixa_sessoes' && g.tipo === 'update'
        ? {
            data: [
              {
                ...SESSAO_ABERTA,
                status: 'fechado',
                fechado_em: '2026-09-24T19:00:00',
                // O banco somou uma venda que chegou de outro computador
                // depois que esta tela abriu: esperado 330, e não 280.
                valor_calculado: 330,
                valor_informado: 330,
                diferenca: 0,
              },
            ],
          }
        : undefined,
    );

    await fecharCom('330,00');

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const gravacao = banco.gravacoes.find((g) => g.tabela === 'caixa_sessoes' && g.tipo === 'update');
    expect(gravacao?.valores).toEqual({ status: 'fechado', valor_informado: 330, observacoes: null });
    // Só fecha se ainda estiver aberto — senão não muda linha nenhuma.
    expect(gravacao?.filtros).toContainEqual(['status', 'eq', 'aberto']);

    const aviso = mockToast.mock.calls[0][0];
    expect(aviso.title).toBe('Caixa fechado');
    expect(aviso.description).toContain('Esperado R$');
    expect(aviso.description).toContain('330,00');
    expect(aviso.description).toContain('Conferência exata');
  });

  it('se outra pessoa já fechou, avisa que NADA foi gravado — não inventa sobra', async () => {
    // O banco não mudou linha nenhuma: devolve lista vazia.
    await abrirCaixa(() => ({ data: [] }));

    await fecharCom('500,00');

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const aviso = mockToast.mock.calls[0][0];
    expect(aviso.title).toBe('Este caixa já tinha sido fechado');
    expect(aviso.description).toMatch(/nada foi gravado/i);
    expect(String(aviso.description)).not.toMatch(/sobrou|faltou/i);
  });

  it('os fechamentos anteriores ficam na tela, com esperado, contado e diferença', async () => {
    await abrirCaixa();

    expect(await screen.findByText('Fechamentos anteriores')).toBeInTheDocument();
    await screen.findByText(/Faltou R\$\s*40,00/);
    expect(screen.getByText(/R\$\s*500,00/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*460,00/)).toBeInTheDocument();
    expect(screen.getByText('faltou troco')).toBeInTheDocument();
    expect(await screen.findByText('Richard / Luana')).toBeInTheDocument();
  });
});
