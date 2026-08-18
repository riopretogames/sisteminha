/**
 * Sentido de um movimento de estoque: entrou ou saiu mercadoria?
 *
 * Achado na revisão de 18/08: as telas decidiam isso pelo SINAL do número,
 * e o sinal mente no caso mais comum do dia. Os gatilhos de venda e de peça
 * usada em OS gravam a quantidade como número POSITIVO — quem diferencia é
 * o campo `tipo = 'saida'`. Só o ajuste manual usa número negativo.
 *
 * Resultado: vender um produto aparecia em verde com "+", igual a uma
 * entrada de mercadoria, justamente na tela que existe pra ser a auditoria
 * do estoque.
 *
 * A régua correta: **o `tipo` manda; o sinal só decide onde o tipo não diz.**
 * - `entrada` e `saida` já dizem o sentido, qualquer que seja o sinal.
 * - `ajuste` e `inventario` podem ir pros dois lados — aí o sinal decide.
 */

export type SentidoMovimento = 'entrada' | 'saida' | 'neutro';

export interface MovimentoParaSentido {
  tipo: string;
  quantidade: number;
}

export function sentidoDoMovimento(m: MovimentoParaSentido): SentidoMovimento {
  if (m.tipo === 'entrada') return 'entrada';
  if (m.tipo === 'saida') return 'saida';
  // Ajuste e inventário: quem manda é o sinal, porque os dois ajustam pra
  // cima ou pra baixo.
  if (m.quantidade > 0) return 'entrada';
  if (m.quantidade < 0) return 'saida';
  return 'neutro';
}

/**
 * Quantidade com o sinal que corresponde ao sentido de verdade.
 *
 * Usa o valor absoluto de propósito: a saída de venda vem positiva do banco
 * e a saída de ajuste vem negativa — as duas devem aparecer como "-N".
 * Hífen comum, não o traço tipográfico, porque este mesmo texto vai pro CSV.
 */
export function quantidadeComSinal(m: MovimentoParaSentido): string {
  const sentido = sentidoDoMovimento(m);
  const modulo = Math.abs(m.quantidade);
  if (sentido === 'entrada') return `+${modulo}`;
  if (sentido === 'saida') return `-${modulo}`;
  return '0';
}

/** Classe de cor para a quantidade: verde entra, vermelho sai. */
export function corDaQuantidade(m: MovimentoParaSentido): string {
  const sentido = sentidoDoMovimento(m);
  if (sentido === 'entrada') return 'text-emerald-600';
  if (sentido === 'saida') return 'text-red-600';
  return 'text-muted-foreground';
}
