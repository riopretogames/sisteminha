import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderizarTela, silenciarConsole } from '@/test/apoio';

/**
 * A entrega com pagamento — o momento em que o dinheiro entra.
 *
 * Três defeitos da revisão de 24/09 moram aqui, e os três só aparecem com o
 * banco respondendo diferente do que a tela esperava:
 *
 *   1. o diálogo cobrava o valor que a TELA conhecia (o quadro fica aberto o
 *      dia inteiro), não o que a OS vale no banco;
 *   2. a recusa do banco ("cliente bloqueado", "falta R$ 50") aparecia como
 *      "Tente novamente", com o pagamento já gravado;
 *   3. depois dessa falha, apertar "Confirmar" de novo gravava o mesmo
 *      pagamento OUTRA VEZ.
 */

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
}));

const mockSupabase = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockSupabase.atual;
  },
}));

const BLOQUEADO =
  'O cliente Fulano está bloqueado para venda — a cobrança desta OS foi recusada. Libere na ficha dele (Cadastros > Clientes) antes de entregar.';

/**
 * Um banco de mentira que sabe a diferença entre LER e GRAVAR na mesma
 * tabela — o dublê comum devolve a mesma coisa para tudo. O erro vem como
 * objeto comum, que é como a biblioteca do Supabase entrega de verdade.
 */
function montarBanco(opcoes: { totalNoBanco: number; entregaRecusada?: string }) {
  const inseridos: unknown[] = [];

  const consulta = (resultado: { data: unknown; error: unknown }) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'in', 'limit']) c[m] = () => c;
    c.maybeSingle = () =>
      Promise.resolve({
        data: Array.isArray(resultado.data) ? (resultado.data[0] ?? null) : resultado.data,
        error: resultado.error,
      });
    c.then = (aceitar: (r: unknown) => unknown) => Promise.resolve(resultado).then(aceitar);
    return c;
  };

  const banco = {
    from: (tabela: string) => {
      if (tabela === 'formas_pagamento') {
        return consulta({
          data: [
            { id: 'f-pix', descricao: 'Pix', forma_enum: 'pix', max_parcelas: 1, contem_taxa: false, taxa_percent: 0 },
          ],
          error: null,
        });
      }
      if (tabela === 'os_pagamentos') {
        const leitura = consulta({ data: [], error: null });
        return {
          ...leitura,
          insert: (linhas: unknown[]) => {
            inseridos.push(...linhas);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (tabela === 'service_orders') {
        const leitura = consulta({
          data: [{ total_orcamento: opcoes.totalNoBanco, tipo: 'paga', status: 'finalizado' }],
          error: null,
        });
        return {
          ...leitura,
          update: () =>
            consulta({
              data: null,
              error: opcoes.entregaRecusada
                ? { message: opcoes.entregaRecusada, code: '23514', details: null, hint: null }
                : null,
            }),
        };
      }
      return consulta({ data: [], error: null });
    },
  };

  return { banco, inseridos };
}

async function abrir(opcoes: { totalDaTela: number; totalNoBanco: number; entregaRecusada?: string }) {
  const { banco, inseridos } = montarBanco(opcoes);
  mockSupabase.atual = banco;
  const { EntregarOSDialog } = await import('./EntregarOSDialog');
  renderizarTela(
    <EntregarOSDialog
      open
      onOpenChange={() => {}}
      osId="os-1"
      numeroOs="OS-202609-0001"
      totalOrcamento={opcoes.totalDaTela}
      onEntregue={() => {}}
    />,
  );
  return { inseridos };
}

/** Lança um pagamento em Pix pelo campo de valor e o botão "+". */
async function lancarPagamento(valor: string) {
  const campo = await screen.findByPlaceholderText('Valor');
  fireEvent.change(campo, { target: { value: valor } });
  const botoes = campo.parentElement!.querySelectorAll('button');
  fireEvent.click(botoes[botoes.length - 1]);
}

describe('A entrega com pagamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    silenciarConsole();
  });

  it('cobra o valor que a OS tem NO BANCO, não o que a tela conhecia', async () => {
    // O quadro abriu com R$ 450; nesse meio-tempo a OS foi recusada e passou
    // a valer R$ 80 (a taxa). Cobrar R$ 450 aqui era o cliente pagando R$ 370
    // a mais, contado como "troco" que ninguém via.
    await abrir({ totalDaTela: 450, totalNoBanco: 80 });

    expect(await screen.findByText(/o valor desta OS mudou/i)).toBeInTheDocument();
    expect(screen.getByText(/Total a receber: R\$\s80,00/)).toBeInTheDocument();
  });

  it('a recusa do banco aparece com o motivo — e avisa que o pagamento ficou registrado', async () => {
    await abrir({ totalDaTela: 80, totalNoBanco: 80, entregaRecusada: BLOQUEADO });

    await lancarPagamento('80');
    const confirmar = await screen.findByRole('button', { name: /confirmar entrega/i });
    await waitFor(() => expect(confirmar).toBeEnabled());
    fireEvent.click(confirmar);

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const aviso = mockToast.mock.calls.at(-1)![0] as { description: string };
    expect(aviso.description).toContain('bloqueado para venda');
    expect(aviso.description).not.toBe('Tente novamente.');
    expect(aviso.description).toMatch(/ficou registrado/);
  });

  it('tentar de novo depois da recusa NÃO grava o mesmo pagamento outra vez', async () => {
    // os_pagamentos não aceita apagar: pagamento gravado em dobro é dinheiro
    // cobrado em dobro no relatório, para sempre.
    const { inseridos } = await abrir({ totalDaTela: 80, totalNoBanco: 80, entregaRecusada: BLOQUEADO });

    await lancarPagamento('80');
    const confirmar = await screen.findByRole('button', { name: /confirmar entrega/i });
    await waitFor(() => expect(confirmar).toBeEnabled());
    fireEvent.click(confirmar);
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));

    // O pagamento de antes já conta como pago: dá para confirmar sem lançar nada.
    await waitFor(() => expect(confirmar).toBeEnabled());
    fireEvent.click(confirmar);
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(2));

    expect(inseridos).toHaveLength(1);
  });
});
