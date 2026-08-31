import { describe, it, expect } from 'vitest';
import { osOrcamentoAprovado, OS_ETAPAS, OS_CANCELADO } from './osStatus';

/**
 * "O cliente já disse SIM?" — a pergunta que separa dinheiro que a loja pode
 * contar de dinheiro que talvez aconteça.
 *
 * O que estes testes protegem: o indicador "Orçamento aprovado, ainda não
 * recebido" do Relatório de OS. Ele já errou uma vez para mais (somava toda OS
 * não entregue, 18/08), e voltou a errar em 31/08 por um caminho novo — a OS
 * recusada passou a morar nas mesmas etapas da aprovada.
 */
describe('o orçamento que o cliente aprovou', () => {
  it('conta a OS aprovada e a finalizada', () => {
    expect(osOrcamentoAprovado(OS_ETAPAS.APROVADO)).toBe(true);
    expect(osOrcamentoAprovado(OS_ETAPAS.FINALIZADO)).toBe(true);
  });

  it('não conta quem ainda não respondeu', () => {
    expect(osOrcamentoAprovado(OS_ETAPAS.AGUARDANDO_ANALISE)).toBe(false);
    expect(osOrcamentoAprovado(OS_ETAPAS.AGUARDANDO_APROVACAO)).toBe(false);
    expect(osOrcamentoAprovado(OS_CANCELADO)).toBe(false);
  });

  it('não conta etapa extra que a loja inventou', () => {
    // "Aguardando peça", "Terceirizada": ninguém garante que houve aprovação.
    expect(osOrcamentoAprovado('aguardando_peca')).toBe(false);
    expect(osOrcamentoAprovado('tercerizada')).toBe(false);
  });

  describe('a OS que o cliente RECUSOU', () => {
    /**
     * Desde 01/09 ela anda pelas mesmas etapas da aprovada: vai para
     * "Aprovado / Executar" (o técnico remonta o aparelho) e de lá para
     * "Finalizado". Pela etapa, portanto, ela parece aprovada — e a loja
     * contaria como caixa futuro o reparo de R$ 450 que ninguém vai fazer,
     * quando o que vai entrar são os R$ 80 da análise.
     */
    it('não conta, mesmo parada na etapa Aprovado', () => {
      expect(osOrcamentoAprovado(OS_ETAPAS.APROVADO, false)).toBe(false);
    });

    it('não conta, mesmo depois de finalizada', () => {
      expect(osOrcamentoAprovado(OS_ETAPAS.FINALIZADO, false)).toBe(false);
    });
  });

  it('a OS antiga, sem decisão registrada, continua valendo pela etapa', () => {
    // Nulo é "não sei" — OS de antes de 31/08, quando a resposta do cliente
    // passou a ser gravada. Tratar como recusa apagaria o histórico da loja.
    expect(osOrcamentoAprovado(OS_ETAPAS.APROVADO, null)).toBe(true);
    expect(osOrcamentoAprovado(OS_ETAPAS.FINALIZADO, undefined)).toBe(true);
  });

  it('aprovação explícita não ressuscita etapa que não conta', () => {
    // Aprovado em "Aguardando peça" continua fora: a regra da etapa manda, e
    // errar para menos é melhor do que prometer caixa que não vem.
    expect(osOrcamentoAprovado('aguardando_peca', true)).toBe(false);
  });
});
