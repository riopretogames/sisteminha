import { OS_ETAPAS } from '@/config/osStatus';

/**
 * A resposta do cliente ao laudo tem UMA porta só.
 *
 * O par de botões da ficha (components/os/DecisaoDoLaudo) não muda só a etapa:
 * chama `registrar_decisao_do_laudo` no banco, e é essa função que grava quem
 * respondeu, quando, e — na recusa — o motivo, além de trocar o valor da OS
 * pela taxa de análise guardando à parte quanto era o orçamento recusado.
 *
 * O problema que este arquivo resolve: mudar a etapa "na mão" chega no mesmo
 * lugar sem nada disso. Arrastar o cartão de "Aguardando aprovação" para
 * "Aprovado" no quadro, ou escolher a etapa no seletor da ficha e da lista,
 * fazia um UPDATE cru de status. A OS ficava aprovada sem ninguém ter
 * registrado que o cliente aprovou — e sem o motivo, sem a taxa no lugar do
 * orçamento, e sem as peças voltando ao estoque, quando a resposta era não.
 *
 * "Finalizado" entra na mesma lista por outro motivo: de "Aguardando
 * aprovação" ele é um PULO. Ir direto para lá diz "pronto, pode buscar" sem
 * ninguém ter respondido nada — nem o cliente, nem a bancada. (Até 01/09 era
 * também onde a recusa caía; hoje a recusa vai para a bancada remontar o
 * aparelho, mas o pulo continua sendo pulo.)
 *
 * Caminho paralelo para uma decisão registrada é o mesmo que não registrar:
 * basta uma pessoa com pressa arrastar o cartão, e o dado que explica o
 * orçamento perdido some. Por isso as três telas perguntam a mesma coisa aqui.
 *
 * Voltar uma etapa (para "Aguardando análise") e cancelar continuam liberados:
 * o primeiro é conserto de engano, o segundo é a saída de emergência — nenhum
 * dos dois é a resposta do cliente.
 */
export function passagemPedeDecisaoDoLaudo(de: string, para: string): boolean {
  if (de !== OS_ETAPAS.AGUARDANDO_APROVACAO) return false;
  return para === OS_ETAPAS.APROVADO || para === OS_ETAPAS.FINALIZADO;
}

/** O que dizer a quem tentou pelo caminho de fora. */
export const AVISO_DECISAO_DO_LAUDO = {
  title: 'Use os botões da resposta do cliente',
  description:
    'Nesta etapa a OS anda pelos botões "Laudo aprovado" e "Cliente não aprovou", na ficha da OS. ' +
    'São eles que registram quem respondeu, quando, e o motivo da recusa — e é o motivo que explica ' +
    'o orçamento perdido.',
} as const;
