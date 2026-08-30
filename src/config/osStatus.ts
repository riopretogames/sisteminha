/**
 * As etapas obrigatórias da assistência técnica.
 *
 * -----------------------------------------------------------------------------
 * O problema que isto resolve
 * -----------------------------------------------------------------------------
 * Antes de 09/08, as chaves de status estavam escritas à mão em 34 lugares de 7
 * telas, mais um gatilho no banco. Excluir o status errado em "Gerenciar
 * Status" quebrava um fluxo inteiro sem ninguém perceber — a fila de orçamentos
 * ficava suja para sempre, por exemplo.
 *
 * Agora existe um lugar só. E a `key` de cada etapa é contrato:
 *
 *   - o código depende dela (esta lista);
 *   - o banco depende dela (gatilho de título, estorno de estoque);
 *   - **as automações do n8n dependem dela** — cada etapa vai ter fluxo
 *     pendurado, e renomear a chave quebraria o fluxo do lado de fora, onde
 *     nenhum teste daqui alcança.
 *
 * Por isso o banco recusa excluir, desativar ou renomear a chave de uma etapa
 * de sistema (migration `20260809130000`). Rótulo e cor, a loja muda à vontade.
 *
 * -----------------------------------------------------------------------------
 * A esteira, ditada pelo Felipe em 09/08
 * -----------------------------------------------------------------------------
 * Entra na loja → laudo → orçamento com o cliente → cliente aprovou → serviço
 * pronto → cliente retirou e pagou.
 *
 * A loja pode criar outras etapas no meio. Hoje existem duas, criadas por ela e
 * não por esta lista: **Aguardando peça** e **Terceirizada** (o aparelho saiu
 * da loja para outra empresa consertar — microsoldagem, garantia de fabricante,
 * serviço especializado). Essas cinco é que não podem faltar.
 *
 * -----------------------------------------------------------------------------
 * O número da etapa
 * -----------------------------------------------------------------------------
 * Desde 30/08 cada etapa tem um número de exibição, ditado pelo Felipe:
 *
 *   1 Entrada/Análise · 2a Aguardando aprovação · 2b Aguardando Peça ·
 *   3 Aprovado/Executar · 4 Finalizado · 5 Entregue · 6 Terceirizada
 *
 * Ele mora em `os_status_config.numero` (texto, editável em Gerenciar Status),
 * NÃO aqui: "2a" e "2b" são a mesma fase com dois caminhos, o que não cabe no
 * inteiro de `etapa` — e `etapa` é contrato de código e das automações do n8n.
 */

export const OS_ETAPAS = {
  /** 1 — Entrou na loja, OS criada. Esperando o técnico dar o laudo. */
  AGUARDANDO_ANALISE: 'aguardando_analise',
  /** 2 — Orçamento na mão do cliente. A loja está parada esperando resposta. */
  AGUARDANDO_APROVACAO: 'aguardando_aprovacao',
  /** 3 — Cliente aprovou. A bancada pode executar. */
  APROVADO: 'aprovado',
  /** 4 — Serviço pronto. Aparelho na prateleira esperando o cliente. */
  FINALIZADO: 'finalizado',
  /** 5 — Cliente retirou e pagou. É daqui que a garantia passa a contar. */
  ENTREGUE: 'entregue',
} as const;

/**
 * Fora da esteira, mas o sistema depende dela: é a saída de emergência para OS
 * que não vai acontecer. Cancelar estorna o estoque das peças lançadas.
 */
export const OS_CANCELADO = 'cancelado';

export type OsEtapa = (typeof OS_ETAPAS)[keyof typeof OS_ETAPAS];

/** As cinco, na ordem do fluxo. Serve para montar o Kanban. */
export const OS_ETAPAS_EM_ORDEM: OsEtapa[] = [
  OS_ETAPAS.AGUARDANDO_ANALISE,
  OS_ETAPAS.AGUARDANDO_APROVACAO,
  OS_ETAPAS.APROVADO,
  OS_ETAPAS.FINALIZADO,
  OS_ETAPAS.ENTREGUE,
];

/** Status em que a OS já terminou — não aparece na fila de trabalho. */
export const OS_STATUS_ENCERRADOS: string[] = [OS_ETAPAS.ENTREGUE, OS_CANCELADO];

/** A OS ainda está em andamento? */
export function osEmAndamento(status: string | null | undefined): boolean {
  return !OS_STATUS_ENCERRADOS.includes(status ?? '');
}

/** Status com que toda OS nasce. */
export const OS_STATUS_INICIAL: OsEtapa = OS_ETAPAS.AGUARDANDO_ANALISE;

/**
 * O cliente já disse SIM para o orçamento?
 *
 * Serve para separar "dinheiro que a loja pode contar" de "dinheiro que talvez
 * aconteça". Antes de aprovar, o orçamento é uma proposta: o cliente pode
 * recusar, sumir, ou nem ter recebido o laudo ainda.
 *
 * Achado em 18/08, corrigido em 21/08: o indicador "Orçamento em aberto" do
 * Relatório de OS somava TODA OS não entregue — inclusive as que nem foram
 * diagnosticadas — e chamava isso de "Aprovado, ainda não recebido". Quem
 * usasse o número para estimar caixa futuro contava com dinheiro que ainda
 * dependia de o cliente dizer sim.
 *
 * Etapa extra criada pela loja (tipo "Aguardando peça") não entra: só as
 * etapas fixas dizem, com certeza, que houve aprovação. Errar para menos aqui
 * é melhor do que prometer caixa que não vem.
 */
export function osOrcamentoAprovado(status: string | null | undefined): boolean {
  return status === OS_ETAPAS.APROVADO || status === OS_ETAPAS.FINALIZADO;
}
