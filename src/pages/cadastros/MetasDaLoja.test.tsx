import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderizarTela, bancoFalso, silenciarConsole } from '@/test/apoio';

/**
 * Cadastros > Metas — o espelho da planilha "Metas RPG".
 *
 * O que precisa ficar de pé: a tela mostra as metas como a planilha manda,
 * diz quando a planilha chegou (e por que falhou, quando falhou), calcula a
 * meta de cada vendedor do mesmo jeito que a aba META POR VENDEDOR, e não
 * oferece jeito nenhum de editar — a planilha é a fonte.
 */

const HOJE = new Date('2026-09-23T15:00:00');

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'felipe' },
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

const URL_PLANILHA = 'https://docs.google.com/spreadsheets/d/abc/edit';

const SETEMBRO = { ano: 2026, mes: 9, vendedores: 2, apuracao: 'quinzenal', faturamento_ano_passado: 93000 };
const MARCO = { ano: 2026, mes: 3, vendedores: 2, apuracao: 'quatro_periodos', faturamento_ano_passado: null };

const FAIXAS_SETEMBRO = [
  { ano: 2026, mes: 9, faixa: 'bronze', valor_meta: 108000 },
  { ano: 2026, mes: 9, faixa: 'prata', valor_meta: 128000 },
  { ano: 2026, mes: 9, faixa: 'ouro', valor_meta: 152000 },
  { ano: 2026, mes: 9, faixa: 'diamante', valor_meta: 184000 },
];

const SYNC_OK = {
  recebido_em: '2026-09-23T14:32:00Z',
  sucesso: true,
  erro: null,
  planilha_nome: 'Metas RPG 2026',
  planilha_url: URL_PLANILHA,
  enviado_por: 'felipebottaro@gmail.com',
  resumo: {},
};

async function abrir(tabelas: Record<string, unknown[]>) {
  mockSupabase.atual = bancoFalso({
    vw_metas_mes: [],
    metas_faturamento: [],
    metas_campanha: [],
    metas_sincronizacoes: [],
    catalogos: [{ id: 'g-acess', descricao: 'Acessório', ativo: true, ordem: 1 }],
    ...tabelas,
  });
  const { default: MetasDaLoja } = await import('./MetasDaLoja');
  return renderizarTela(<MetasDaLoja />);
}

describe('Cadastros > Metas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('antes da primeira atualização, explica de onde as metas vão vir', async () => {
    await abrir({});

    await waitFor(() => {
      expect(screen.getByText(/ainda não enviou nada para o sistema/)).toBeInTheDocument();
    });
  });

  it('mostra a meta da loja e a de cada vendedor, com a mesma conta da planilha', async () => {
    await abrir({ vw_metas_mes: [SETEMBRO], metas_faturamento: FAIXAS_SETEMBRO, metas_sincronizacoes: [SYNC_OK] });

    await waitFor(() => {
      // Aparece na linha do mês e no total do ano (só há um mês no teste).
      expect(screen.getAllByText('R$ 108.000,00').length).toBeGreaterThan(0);
    });
    // Aba META POR VENDEDOR: 108.000 ÷ 2 = 54.000 no mês e 27.000 na quinzena.
    expect(screen.getByText('R$ 54.000,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 27.000,00')).toBeInTheDocument();
  });

  it('diz quando a planilha chegou por último e dá o atalho para abri-la', async () => {
    await abrir({ vw_metas_mes: [SETEMBRO], metas_faturamento: FAIXAS_SETEMBRO, metas_sincronizacoes: [SYNC_OK] });

    await waitFor(() => {
      expect(screen.getByText(/Última atualização da planilha/)).toBeInTheDocument();
    });
    const link = screen.getByRole('link', { name: /Abrir a planilha/ });
    expect(link).toHaveAttribute('href', URL_PLANILHA);
  });

  it('endereço que não é do Google Docs não vira link', async () => {
    // O endereço chega de fora (do robô da planilha). Mesmo com o código de
    // acesso protegendo a porta, a tela não transforma qualquer texto em link.
    await abrir({
      vw_metas_mes: [SETEMBRO],
      metas_faturamento: FAIXAS_SETEMBRO,
      metas_sincronizacoes: [{ ...SYNC_OK, planilha_url: 'https://site-estranho.example/planilha' }],
    });

    await waitFor(() => {
      expect(screen.getByText(/Última atualização da planilha/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /Abrir a planilha/ })).not.toBeInTheDocument();
  });

  it('quando a última tentativa falhou, mostra o motivo que o banco deu', async () => {
    await abrir({
      vw_metas_mes: [SETEMBRO],
      metas_faturamento: FAIXAS_SETEMBRO,
      metas_sincronizacoes: [
        {
          ...SYNC_OK,
          recebido_em: '2026-09-23T15:00:00Z',
          sucesso: false,
          erro: 'Em outubro, a faixa Prata (R$ 100000) é menor que a anterior (R$ 110000). As faixas precisam subir.',
        },
        SYNC_OK,
      ],
    });

    await waitFor(() => {
      expect(screen.getByText(/A última tentativa de atualização falhou/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Em outubro, a faixa Prata/)).toBeInTheDocument();
    // E tranquiliza: o que está na tela é a última versão boa.
    expect(screen.getByText(/nada foi gravado pela metade/)).toBeInTheDocument();
  });

  it('mês de 4 períodos mostra que a quinzena não se aplica', async () => {
    await abrir({
      vw_metas_mes: [MARCO],
      metas_faturamento: [{ ano: 2026, mes: 3, faixa: 'bronze', valor_meta: 50000 }],
    });

    await waitFor(() => {
      expect(screen.getAllByText('não se aplica').length).toBeGreaterThan(0);
    });
  });

  it('campanha sem grupo de produto ligado explica como resolver', async () => {
    await abrir({
      metas_campanha: [
        { chave: 'jogos', nome: 'Jogos', grupo_produto_id: null, periodicidade: 'quinzenal', faixa: 'bronze', meta: 750, premio: 30 },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('sem grupo de produto ligado')).toBeInTheDocument();
    });
    expect(screen.getByText(/Não existe um Grupo de Produto com o nome "Jogos"/)).toBeInTheDocument();
  });

  it('campanha mostra meta, prêmio e o percentual sobre o vendido', async () => {
    await abrir({
      metas_campanha: [
        { chave: 'acessorios', nome: 'Acessórios', grupo_produto_id: 'g-acess', periodicidade: 'quinzenal', faixa: 'bronze', meta: 3000, premio: 60 },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('R$ 3.000,00')).toBeInTheDocument();
    });
    expect(screen.getByText('R$ 60,00')).toBeInTheDocument();
    expect(screen.getByText('2,00%')).toBeInTheDocument();
  });

  it('a tela não oferece nenhum jeito de editar meta — a planilha é a fonte', async () => {
    await abrir({ vw_metas_mes: [SETEMBRO], metas_faturamento: FAIXAS_SETEMBRO, metas_sincronizacoes: [SYNC_OK] });

    await waitFor(() => {
      // Aparece na linha do mês e no total do ano (só há um mês no teste).
      expect(screen.getAllByText('R$ 108.000,00').length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: /salvar|cadastrar|editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
