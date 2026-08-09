/**
 * A cor do botão ensina o que ele faz.
 *
 * Regra do Felipe (09/08): **cor fixa por tipo de ação, no sistema inteiro.**
 * Não é enfeite — é o que faz alguém em treinamento não clicar em "cancelar
 * venda" achando que está confirmando. Quem trabalha rápido lê a cor antes de
 * ler a palavra.
 *
 * -----------------------------------------------------------------------------
 * O padrão
 * -----------------------------------------------------------------------------
 *   VERDE     confirmar, aprovar, concluir, finalizar, receber
 *   VERMELHO  cancelar, excluir, recusar, bloquear, estornar
 *   ÂMBAR     interromper sem destruir: colocar em espera, devolver para a fila
 *   AZUL      ação principal e neutra da tela (abrir OS, nova venda, salvar)
 *   CINZA     ação secundária (voltar, fechar, limpar filtro)
 *
 * -----------------------------------------------------------------------------
 * Como usar
 * -----------------------------------------------------------------------------
 *   <Button variant="sucesso">Aprovar orçamento</Button>
 *   <Button variant="destructive">Cancelar OS</Button>
 *   <Button variant="alerta">Aguardando peça</Button>
 *   <Button>Abrir OS</Button>              // azul: a ação principal
 *   <Button variant="outline">Voltar</Button>
 *
 * -----------------------------------------------------------------------------
 * A regra que mais economiza discussão
 * -----------------------------------------------------------------------------
 * Verde e vermelho **só** aparecem quando algo é de fato confirmado ou
 * desfeito. Se tudo virar colorido, a cor deixa de avisar — é o mesmo motivo de
 * a sobra aparecer todo dia no caixa e ninguém mais investigar.
 */

/** Tipos de ação do sistema, com a variante de botão que cada um usa. */
export const VARIANTE_POR_ACAO = {
  confirmar: 'sucesso',
  aprovar: 'sucesso',
  concluir: 'sucesso',
  finalizar: 'sucesso',

  cancelar: 'destructive',
  excluir: 'destructive',
  recusar: 'destructive',
  bloquear: 'destructive',

  aguardar: 'alerta',
  devolver: 'alerta',

  principal: 'default',
  secundaria: 'outline',
} as const;

export type TipoAcao = keyof typeof VARIANTE_POR_ACAO;

/**
 * Cores de etiqueta (Badge) por significado, para status e situações.
 *
 * Escritas por extenso porque o Tailwind só gera o CSS do que encontra no
 * código — classe montada em pedaços aparece sem cor nenhuma.
 */
export const TOM_SITUACAO = {
  /** Terminou bem: entregue, pago, aprovado, concluído. */
  positivo: 'bg-emerald-500 text-white',
  /** Terminou mal ou foi desfeito: cancelado, recusado, bloqueado. */
  negativo: 'bg-red-500 text-white',
  /** Parado esperando alguém: aguardando peça, aguardando aprovação. */
  espera: 'bg-amber-500 text-white',
  /** Andando: em reparo, em diagnóstico. */
  andamento: 'bg-blue-500 text-white',
  /** Acabou de entrar, ninguém tocou ainda. */
  novo: 'bg-violet-500 text-white',
  /** Sem significado especial. */
  neutro: 'bg-slate-500 text-white',
} as const;

export type TomSituacao = keyof typeof TOM_SITUACAO;
