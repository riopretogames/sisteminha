import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { montarCan, bancoFalso, silenciarConsole } from '@/test/apoio';
import { OS_ETAPAS } from '@/config/osStatus';

/**
 * A ficha da OS — achados da revisão de 24/09.
 *
 *   • na OS recusada, o valor é a taxa de análise: quem não aprova orçamento
 *     não mexe nele (o técnico zerava a taxa ou cobrava o conserto recusado);
 *   • o motivo da recusa desfeita aparece na linha do tempo (o banco gravava
 *     e nenhuma tela lia);
 *   • subir o valor que o cliente aprovou pede confirmação antes de salvar.
 */

const mockToast = vi.fn();
const mockCan = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', profile: { id: 'p1', tenant_id: 'loja-1' } },
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

function os(campos: Record<string, unknown> = {}) {
  return {
    id: 'os-1',
    numero_os: 'OS-202609-0001',
    status: OS_ETAPAS.APROVADO,
    tipo: 'paga',
    prioridade: 'normal',
    marca: 'Sony',
    modelo: null,
    cor: null,
    memoria: null,
    numero_serie: null,
    defeito_cliente: 'Não liga',
    observacoes: null,
    anotacoes_checkin: null,
    senha_aparelho: null,
    senha_padrao: null,
    prazo_previsto: null,
    garantia_dias: 90,
    total_orcamento: 80,
    valor_final_pago: null,
    data_finalizacao: null,
    created_at: '2026-09-20T10:00:00+00:00',
    vendedor_id: null,
    diagnostico_iniciado_em: null,
    diagnostico_iniciado_por: null,
    laudo_aprovado: false,
    laudo_decidido_em: '2026-09-21T10:00:00+00:00',
    laudo_decidido_por: null,
    laudo_motivo_recusa: 'achou caro',
    valor_orcado_recusado: 450,
    pecas_estornadas_em: null,
    execucao_iniciada_em: null,
    execucao_iniciada_por: null,
    laudo_eletronico: true,
    clientes: { nome: 'Adriana Prado', telefones: ['17910000001'] },
    os_checklist: [],
    tecnico_id: null,
    tecnico: null,
    suspeita_tecnica: null,
    constatacao_tecnica: null,
    risco_informado_em: null,
    reparo_inviavel: false,
    ...campos,
  };
}

async function abrirFicha(opcoes: {
  perfil: 'tecnico' | 'vendedor';
  osNoBanco: ReturnType<typeof os>;
  historico?: unknown[];
}) {
  mockCan.mockImplementation(montarCan({ perfil: opcoes.perfil }));
  mockSupabase.atual = bancoFalso({
    service_orders: [opcoes.osNoBanco],
    service_order_history: opcoes.historico ?? [],
    os_status_config: [],
    vw_os_itens: [],
    profiles: [],
  });
  const { default: OSDetalhe } = await import('./OSDetalhe');
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/os/os-1']}>
        <Routes>
          <Route path="/os/:id" element={<OSDetalhe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.findByLabelText(/valor \(r\$\)/i);
}

describe('A ficha da OS', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('na OS recusada, o técnico NÃO mexe na taxa de análise', async () => {
    const campo = await abrirFicha({ perfil: 'tecnico', osNoBanco: os() });
    expect(campo).toBeDisabled();
    expect(screen.getByText(/decisão de quem aprova/i)).toBeInTheDocument();
  });

  it('quem aprova orçamento continua podendo (dispensar a taxa é decisão dele)', async () => {
    const campo = await abrirFicha({ perfil: 'vendedor', osNoBanco: os() });
    expect(campo).toBeEnabled();
  });

  it('o motivo da recusa desfeita aparece na linha do tempo', async () => {
    const comentario =
      'Recusa desfeita: o cliente havia recusado o orçamento de R$ 450.00 — motivo: achou caro.';
    await abrirFicha({
      perfil: 'vendedor',
      osNoBanco: os({ status: OS_ETAPAS.AGUARDANDO_ANALISE, laudo_aprovado: null, laudo_decidido_em: null }),
      historico: [
        {
          id: 'h1',
          usuario_id: null,
          status_anterior: OS_ETAPAS.APROVADO,
          status_novo: OS_ETAPAS.AGUARDANDO_ANALISE,
          created_at: '2026-09-22T10:00:00+00:00',
          comentario,
        },
      ],
    });
    expect(await screen.findByText(comentario)).toBeInTheDocument();
  });

  it('subir o valor que o cliente aprovou pede confirmação antes de salvar', async () => {
    const perguntou = vi.spyOn(window, 'confirm').mockImplementation(() => false);
    const campo = await abrirFicha({
      perfil: 'tecnico',
      osNoBanco: os({
        laudo_aprovado: true,
        laudo_motivo_recusa: null,
        valor_orcado_recusado: null,
        total_orcamento: 200,
      }),
    });

    fireEvent.change(campo, { target: { value: '350' } });
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(perguntou).toHaveBeenCalled());
    const texto = String(perguntou.mock.calls[0][0]);
    expect(texto).toContain('200');
    expect(texto).toContain('350');
    // Disse "não": nada de "Orçamento salvo".
    expect(mockToast).not.toHaveBeenCalled();
  });
});
