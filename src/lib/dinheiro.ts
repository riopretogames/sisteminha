/**
 * Conta de dinheiro em CENTAVOS inteiros.
 *
 * Por que isto existe (revisão de 24/09): o computador guarda número quebrado
 * em binário, e alguns valores de loja não cabem exatos lá dentro. Somar
 * R$ 9,90 + R$ 69,90 dá 79.80000000000001 — um fio acima do que a tela mostra.
 * O vendedor digitava R$ 79,80, a conferência "pago < total" reprovava, e o
 * PDV travava mostrando "Falta R$ 0,00" com o botão de confirmar desligado.
 *
 * A saída é a de qualquer caixa registradora: contar em centavos, que são
 * números inteiros e somam sempre exato. Tudo que é comparado, somado ou
 * gravado passa por aqui; a tela só volta para reais na hora de mostrar ou de
 * mandar para o banco.
 */

/**
 * Valor em reais → centavos inteiros, arredondando o que sobrar.
 *
 * O `toFixed(6)` antes do arredondamento corrige o resíduo binário da
 * multiplicação: 1,005 × 100 dá 100.49999999999999 no computador, e sem isso
 * arredondaria para baixo o que no papel é meio centavo exato.
 *
 * Texto também é aceito (o que vem de um campo digitado), com vírgula ou ponto
 * decimal. Texto que não é número vira `NaN`, para quem chamou perceber —
 * engolir o erro como zero foi o que fez o caixa abrir com R$ 0,00 em 18/08.
 */
export function emCentavos(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const numero =
    typeof valor === 'number' ? valor : Number(String(valor).trim().replace(',', '.'));
  if (!Number.isFinite(numero)) return Number.NaN;
  const vezesCem = Number((numero * 100).toFixed(6));
  // Arredonda "para longe do zero" dos dois lados: Math.round(-0,5) daria -0.
  return Math.sign(vezesCem) * Math.round(Math.abs(vezesCem));
}

/** Centavos inteiros → reais, para mostrar na tela ou gravar no banco. */
export function emReais(centavos: number): number {
  return centavos / 100;
}

/** Arredonda um valor em reais para 2 casas, do jeito que o banco guarda. */
export function arredondarReais(valor: number | string | null | undefined): number {
  return emReais(emCentavos(valor));
}

/** Soma valores em reais sem deixar resíduo — o resultado já vem com 2 casas. */
export function somarReais(valores: ReadonlyArray<number | string | null | undefined>): number {
  return emReais(valores.reduce<number>((soma, v) => soma + emCentavos(v), 0));
}

/**
 * Lê um valor digitado pelo vendedor e devolve os centavos, ou `null` quando
 * não dá para entender ou não é positivo.
 *
 * "79.80", "79,80" e "79,8" viram 7980. Vazio, zero, negativo e letra viram
 * `null` — nenhum desses é um pagamento de verdade.
 */
export function lerValorDigitado(texto: string): number | null {
  if (!texto.trim()) return null;
  const centavos = emCentavos(texto);
  if (!Number.isFinite(centavos) || centavos <= 0) return null;
  return centavos;
}
