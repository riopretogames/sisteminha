import { OS_ETAPAS, OS_CANCELADO } from '@/config/osStatus';
import { moeda } from '@/lib/format';

/**
 * Quem pode levar uma OS para qual etapa — UMA regra, lida pelas três telas
 * que mudam etapa (o seletor da ficha, o seletor da lista e o arrastar do
 * quadro) e espelhada no banco (`validar_aprovacao_orcamento_os`,
 * `desfazer_recusa_ao_reabrir_os`; migration 20260924161000).
 *
 * -----------------------------------------------------------------------------
 * A resposta do cliente ao laudo tem UMA porta só
 * -----------------------------------------------------------------------------
 * O par de botões da ficha (components/os/DecisaoDoLaudo) não muda só a etapa:
 * chama `registrar_decisao_do_laudo` no banco, e é essa função que grava quem
 * respondeu, quando, e — na recusa — o motivo, além de trocar o valor da OS
 * pela taxa de análise guardando à parte quanto era o orçamento recusado.
 *
 * Mudar a etapa "na mão" chegava no mesmo lugar sem nada disso. Arrastar o
 * cartão, ou escolher a etapa no seletor, fazia um UPDATE cru de status: a OS
 * ficava aprovada sem ninguém ter registrado que o cliente aprovou — e sem o
 * motivo, sem a taxa e sem as peças voltando ao estoque, quando a resposta era
 * não. Caminho paralelo para uma decisão registrada é o mesmo que não
 * registrar: basta uma pessoa com pressa arrastar o cartão.
 *
 * Até 24/09 esta regra só olhava a saída de "Aguardando aprovação" para
 * "Aprovado" e "Finalizado". A revisão de 24/09 achou as outras portas:
 *
 *   • de "Aguardando aprovação" para Aguardando Peça, Terceirizada ou
 *     Entregue a tela deixava, o banco recusava o técnico (com o erro
 *     escondido atrás de "Tente novamente") e deixava o vendedor passar sem
 *     registrar a resposta — a OS-202608-0007 está até hoje em "Aguardando
 *     Peça" sem resposta do cliente;
 *   • da ENTRADA, a OS com laudo eletrônico ia direto para Finalizado ou
 *     Entregue, sem laudo enviado nem resposta, e era cobrada cheia.
 *
 * A regra nova, numa frase: **OS com laudo eletrônico só passa da análise
 * para a frente com a resposta do cliente registrada** — vale para todo mundo,
 * inclusive quem aprova orçamento (quem aprova tem os botões; é por eles).
 *
 * -----------------------------------------------------------------------------
 * O serviço tabelado vai direto para a execução
 * -----------------------------------------------------------------------------
 * PROCESSO-ORDEM-DE-SERVICO.md, passo 9: "Se for tabelado: pula o laudo
 * eletrônico e vai direto para a Etapa 3". Preço e prazo foram combinados no
 * balcão; não existe laudo para o cliente aprovar. Até 24/09 o técnico não
 * conseguia fazer isso (a tela tratava "Aprovado" como aprovar orçamento) e,
 * ao mesmo tempo, conseguia pular para "Finalizado" — a porta certa fechada e
 * a errada aberta. Agora a OS tabelada vai para "Aprovado / Executar" pela
 * mão de quem está na bancada.
 *
 * -----------------------------------------------------------------------------
 * Desfazer a recusa é decisão de quem fala com o cliente
 * -----------------------------------------------------------------------------
 * Voltar uma OS recusada para a Entrada (ou para Aguardando aprovação) desfaz
 * a recusa: ela volta a valer o orçamento cheio no lugar da taxa, as peças
 * saem do estoque de novo e a resposta do cliente volta a ficar em aberto
 * (`desfazer_recusa_ao_reabrir_os`). É o caso do cliente que volta atrás no
 * dia seguinte — e quem sabe disso é quem fala com ele. Registrar a recusa já
 * exigia a permissão de aprovar orçamento; apagá-la não exigia nada, e bastava
 * um arrasto do técnico. Agora as duas pontas pedem a mesma permissão, e quem
 * pode ainda confirma antes, lendo o que vai mudar.
 */

/** O que a regra precisa saber da OS. */
export interface SituacaoDoLaudo {
  status: string;
  /** TRUE aprovou, FALSE recusou, NULL ainda não respondeu. */
  laudoAprovado: boolean | null | undefined;
  /**
   * FALSE = serviço tabelado (não há laudo para o cliente aprovar). Vazio conta
   * como "tem laudo", igual ao banco (COALESCE(laudo_eletronico, true)): as OS
   * antigas, de antes da chavinha existir, todas passaram por análise.
   */
  laudoEletronico?: boolean | null;
}

/** Recusou também é resposta: só NULL é "o cliente ainda não respondeu". */
export function clienteJaRespondeu(laudoAprovado: boolean | null | undefined): boolean {
  return laudoAprovado === true || laudoAprovado === false;
}

/** Serviço tabelado: combinado no balcão, sem laudo eletrônico. */
export function ehServicoTabelado(laudoEletronico: boolean | null | undefined): boolean {
  return laudoEletronico === false;
}

/** As etapas de antes da resposta do cliente. Voltar para elas nunca "pula" nada. */
const ANTES_DA_RESPOSTA: string[] = [OS_ETAPAS.AGUARDANDO_ANALISE, OS_ETAPAS.AGUARDANDO_APROVACAO];

/**
 * A passagem pula a resposta do cliente?
 *
 * Vale para TODO MUNDO — não é questão de permissão, é de registro: quem pode
 * aprovar tem os botões "Laudo aprovado" / "Cliente não aprovou", e é por eles
 * que a OS anda.
 */
export function passagemPedeDecisaoDoLaudo(os: SituacaoDoLaudo, para: string): boolean {
  if (para === os.status) return false;
  if (!ANTES_DA_RESPOSTA.includes(os.status)) return false;
  // Voltar para a análise, mandar o laudo, ou cancelar: nenhum é a resposta.
  if (ANTES_DA_RESPOSTA.includes(para) || para === OS_CANCELADO) return false;
  if (clienteJaRespondeu(os.laudoAprovado)) return false;
  // Parada em "Aguardando aprovação", a OS espera resposta mesmo sendo
  // tabelada (a loja mandou perguntar ao cliente). Na Entrada, só a OS com
  // laudo eletrônico espera; a tabelada segue direto.
  if (os.status === OS_ETAPAS.AGUARDANDO_ANALISE && ehServicoTabelado(os.laudoEletronico)) {
    return false;
  }
  return true;
}

/** Por que a passagem foi barrada — com o texto que a tela mostra. */
export interface BloqueioDaPassagem {
  motivo: 'resposta_do_cliente' | 'aprovar_orcamento' | 'recusar_orcamento' | 'desfazer_recusa';
  titulo: string;
  descricao: string;
}

/**
 * A passagem de `os.status` para `para` pode acontecer? `null` = pode.
 *
 * As três telas perguntam aqui, e o banco faz a mesma conta nos gatilhos: tela
 * que oferece o que o banco recusa vira "Tente novamente" no balcão; tela que
 * esconde o que o banco aceita vira beco sem saída para o técnico.
 */
export function bloqueioDaPassagem(
  os: SituacaoDoLaudo,
  para: string,
  podeAprovar: boolean,
): BloqueioDaPassagem | null {
  if (para === os.status) return null;

  if (passagemPedeDecisaoDoLaudo(os, para)) {
    const aviso =
      os.status === OS_ETAPAS.AGUARDANDO_APROVACAO
        ? AVISO_DECISAO_DO_LAUDO
        : AVISO_LAUDO_AINDA_NAO_ENVIADO;
    return { motivo: 'resposta_do_cliente', titulo: aviso.titulo, descricao: aviso.descricao };
  }

  // "Aprovado" é APROVAR orçamento só enquanto o cliente não respondeu e a OS
  // tem laudo. Respondida (aprovou OU recusou) ou tabelada, "Aprovado /
  // Executar" é a bancada — voltar para lá é rotina de quem edita OS (é o
  // técnico tirando o aparelho de "Aguardando Peça", achado de 31/08).
  if (
    para === OS_ETAPAS.APROVADO &&
    !podeAprovar &&
    !clienteJaRespondeu(os.laudoAprovado) &&
    !ehServicoTabelado(os.laudoEletronico)
  ) {
    return {
      motivo: 'aprovar_orcamento',
      titulo: 'Sem permissão',
      descricao:
        'O cliente ainda não respondeu ao orçamento desta OS. Aprovar é decisão de quem fala com o cliente — peça a um vendedor ou gerente.',
    };
  }

  // Sair de "Aguardando aprovação" para "Cancelado" é RECUSAR o orçamento.
  // Cancelar de outra etapa não é recusa, e o banco nunca travou isso.
  if (os.status === OS_ETAPAS.AGUARDANDO_APROVACAO && para === OS_CANCELADO && !podeAprovar) {
    return {
      motivo: 'recusar_orcamento',
      titulo: 'Sem permissão',
      descricao:
        'Recusar o orçamento é decisão de quem fala com o cliente — peça a um vendedor ou gerente.',
    };
  }

  if (passagemDesfazRecusa(os, para) && !podeAprovar) {
    return {
      motivo: 'desfazer_recusa',
      titulo: 'Só quem aprova orçamento desfaz a recusa',
      descricao:
        'O cliente recusou o orçamento desta OS. Voltar com ela para a análise desfaz a recusa e volta a cobrar o orçamento cheio — só faça isso se o cliente voltou atrás, e quem registra é um vendedor ou gerente.',
    };
  }

  return null;
}

/**
 * A passagem desfaz a recusa do cliente?
 *
 * É o que o banco faz sozinho quando a OS recusada volta para a Entrada ou
 * para "Aguardando aprovação" (`desfazer_recusa_ao_reabrir_os`).
 */
export function passagemDesfazRecusa(os: SituacaoDoLaudo, para: string): boolean {
  return os.laudoAprovado === false && para !== os.status && ANTES_DA_RESPOSTA.includes(para);
}

/**
 * A confirmação de quem PODE desfazer a recusa. Ninguém deveria descobrir
 * depois que a OS voltou a valer R$ 450 e que a peça saiu do estoque de novo.
 */
export function textoDeDesfazerRecusa(params: {
  numeroOs: string;
  destino: string;
  /** Quanto era o orçamento recusado (volta a valer). */
  valorRecusado: number | null | undefined;
  /** Quanto a OS vale hoje (a taxa de análise). */
  valorAtual: number;
  motivo: string | null | undefined;
}): string {
  const { numeroOs, destino, valorRecusado, valorAtual, motivo } = params;
  const recusado = Number(valorRecusado ?? 0);
  const linhas = [
    `O cliente RECUSOU o orçamento da OS ${numeroOs}` +
      (recusado > 0 ? ` (${moeda(recusado)})` : '') +
      (motivo ? ` — motivo: "${motivo}".` : '.'),
    '',
    `Voltar para "${destino}" desfaz a recusa:`,
    recusado > 0
      ? `• a OS volta a valer ${moeda(recusado)} no lugar de ${moeda(valorAtual)};`
      : '• o valor recusado volta a valer no lugar da taxa;',
    '• as peças lançadas saem do estoque de novo;',
    '• a resposta do cliente volta a ficar em aberto (o motivo fica guardado na linha do tempo).',
    '',
    'Faça isso só se o cliente voltou atrás. Confirma?',
  ];
  return linhas.join('\n');
}

/** O que dizer a quem tentou sair de "Aguardando aprovação" pelo caminho de fora. */
export const AVISO_DECISAO_DO_LAUDO = {
  titulo: 'Use os botões da resposta do cliente',
  descricao:
    'Nesta etapa a OS anda pelos botões "Laudo aprovado" e "Cliente não aprovou", na ficha da OS. ' +
    'São eles que registram quem respondeu, quando, e o motivo da recusa — e é o motivo que explica ' +
    'o orçamento perdido. Depois da resposta, a OS segue para onde precisar (inclusive Aguardando Peça).',
} as const;

/** O que dizer a quem tentou pular da Entrada, numa OS com laudo eletrônico. */
export const AVISO_LAUDO_AINDA_NAO_ENVIADO = {
  titulo: 'Esta OS espera o laudo e a resposta do cliente',
  descricao:
    'Ela foi aberta com laudo eletrônico: só segue para a bancada depois que o cliente responder. ' +
    'Envie o laudo para aprovação e registre a resposta dele pelos botões "Laudo aprovado" / ' +
    '"Cliente não aprovou". (Serviço tabelado, sem laudo, vai direto para a execução.)',
} as const;
