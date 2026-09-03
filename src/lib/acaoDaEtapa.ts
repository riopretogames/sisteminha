import { OS_ETAPAS } from '@/config/osStatus';

/**
 * O nome do botão que avança a OS — dito como a bancada fala, não como o
 * sistema pensa.
 *
 * Vem do organograma que o Felipe desenhou do processo da assistência (Figma,
 * 30/08). Nele, cada passagem de etapa tem um NOME DE AÇÃO:
 *
 *   • na entrada, o técnico aperta **INICIAR REPARO** (e confirma, porque é
 *     dali que o reparo passa a contar);
 *   • terminado o laudo, ele **envia o laudo para aprovação**;
 *   • com o cliente respondendo, o vendedor marca **LAUDO APROVADO**;
 *   • aprovado, o técnico **inicia a execução**;
 *   • pronto, marca **REPARO CONCLUÍDO**;
 *   • e a entrega é o que o cliente vem buscar.
 *
 * Antes disso o botão dizia sempre "Avançar para <nome da próxima coluna>" —
 * correto e inútil: obriga quem está com o aparelho na mão a traduzir o nome
 * da coluna para a ação que ele vai fazer. O organograma existe justamente
 * porque essa tradução não é óbvia para quem entra na equipe.
 *
 * A etapa continua sendo a mesma coisa no banco; o que muda é o que está
 * escrito no botão.
 */

export interface AcaoDeEtapa {
  /** Texto do botão. */
  rotulo: string;
  /**
   * Pede confirmação antes de mudar.
   *
   * Só onde o passo é uma marca no tempo que não dá para desfazer sem
   * explicação: o início do reparo (o organograma escreve "reparo começa
   * aqui") e o envio do laudo, que sai da loja para o cliente.
   */
  confirmar?: string;
}

/**
 * O que fazer para sair da etapa `de` e ir para `para`.
 *
 * `undefined` quando a passagem não tem nome próprio no processo — aí o botão
 * volta a dizer "Avançar para <etapa>", que é o certo para as etapas extras
 * que cada loja inventa.
 */
export function acaoParaAvancar(de: string, para: string): AcaoDeEtapa | undefined {
  if (de === OS_ETAPAS.AGUARDANDO_ANALISE && para === OS_ETAPAS.AGUARDANDO_APROVACAO) {
    return {
      rotulo: 'Enviar laudo para aprovação',
      confirmar:
        'O laudo vai para o cliente e a OS passa a esperar a resposta dele. ' +
        'Confirma que o laudo está pronto?',
    };
  }

  if (de === OS_ETAPAS.AGUARDANDO_APROVACAO && para === OS_ETAPAS.APROVADO) {
    // No organograma quem registra isto é o VENDEDOR, porque é ele que fala
    // com o cliente — mas quem PODE registrar continua sendo quem tem a
    // permissão de aprovar orçamento, que é regra de dinheiro e não muda por
    // causa do nome do botão.
    return { rotulo: 'Cliente aprovou o laudo' };
  }

  if (de === OS_ETAPAS.APROVADO && para === OS_ETAPAS.FINALIZADO) {
    return { rotulo: 'Reparo concluído' };
  }

  if (para === OS_ETAPAS.ENTREGUE) {
    return { rotulo: 'Entregar ao cliente' };
  }

  return undefined;
}

/**
 * O aviso de "concluir um reparo que nunca começou".
 *
 * Achado na revisão de 01/09. O organograma tem dois marcos de tempo na
 * bancada — INICIAR A EXECUÇÃO e REPARO CONCLUÍDO —, e a distância entre eles
 * é o único número que diz quanto tempo a bancada levou de fato. Só que nada
 * ligava um ao outro: dava para apertar "Reparo concluído" sem ninguém ter
 * apertado "Iniciar a execução", e aí o marco de início ficava vazio para
 * sempre. A OS some da bancada com a duração do reparo desconhecida, e nenhum
 * relatório consegue dizer depois se foram duas horas ou duas semanas.
 *
 * É aviso, não trava, e essa escolha é deliberada: o reparo REALMENTE
 * aconteceu — o aparelho está pronto na prateleira —, e barrar a conclusão por
 * causa de um botão esquecido prenderia o técnico numa etapa com o trabalho
 * feito. Quem esqueceu fica sabendo; quem tem pressa segue.
 *
 * Não vale para OS recusada: nela a execução nunca começa de propósito (o
 * cliente não quis o serviço), o técnico só remonta o aparelho. Ver
 * `components/os/IniciarNaBancada`.
 */
export const AVISO_REPARO_NUNCA_INICIADO =
  'Ninguém apertou "Iniciar a execução" nesta OS. Marcando concluído agora, ' +
  'o sistema fica sem saber quando o reparo começou — e o tempo de bancada ' +
  'desta OS não entra em nenhum relatório. Concluir mesmo assim?';
