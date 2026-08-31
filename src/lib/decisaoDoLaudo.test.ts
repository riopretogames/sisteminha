import { describe, it, expect } from 'vitest';
import { passagemPedeDecisaoDoLaudo } from './decisaoDoLaudo';
import { OS_ETAPAS, OS_CANCELADO } from '@/config/osStatus';

/**
 * O que estes testes protegem: a única porta da resposta do cliente.
 *
 * Se o quadro, a lista e o seletor voltarem a aceitar a mudança crua de etapa,
 * a loja perde o motivo da recusa e cobra na retirada um reparo recusado.
 */
describe('a passagem que pede a decisão do laudo', () => {
  it('aprovar direto pelo seletor ou pelo arrasto não passa', () => {
    expect(passagemPedeDecisaoDoLaudo(OS_ETAPAS.AGUARDANDO_APROVACAO, OS_ETAPAS.APROVADO))
      .toBe(true);
  });

  it('mandar para finalizado também não — é onde a recusa cai', () => {
    // Sem passar pelo botão, a OS chegaria em Finalizado sem motivo, sem a
    // taxa de análise, e cobrando na entrega o reparo que o cliente recusou.
    expect(passagemPedeDecisaoDoLaudo(OS_ETAPAS.AGUARDANDO_APROVACAO, OS_ETAPAS.FINALIZADO))
      .toBe(true);
  });

  it('voltar para a análise continua liberado', () => {
    // Conserto de engano: mandou o laudo cedo demais.
    expect(passagemPedeDecisaoDoLaudo(OS_ETAPAS.AGUARDANDO_APROVACAO, OS_ETAPAS.AGUARDANDO_ANALISE))
      .toBe(false);
  });

  it('cancelar continua liberado — é a saída de emergência', () => {
    expect(passagemPedeDecisaoDoLaudo(OS_ETAPAS.AGUARDANDO_APROVACAO, OS_CANCELADO)).toBe(false);
  });

  it('fora de "aguardando aprovação" não vale nada disso', () => {
    // A OS que já foi aprovada anda pela esteira normalmente.
    expect(passagemPedeDecisaoDoLaudo(OS_ETAPAS.APROVADO, OS_ETAPAS.FINALIZADO)).toBe(false);
    expect(passagemPedeDecisaoDoLaudo(OS_ETAPAS.AGUARDANDO_ANALISE, OS_ETAPAS.APROVADO)).toBe(false);
  });
});
