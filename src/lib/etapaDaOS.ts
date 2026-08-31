/**
 * O nome de uma etapa da assistência, com o número na frente.
 *
 * Pedido do Felipe em 30/08, olhando o quadro de OS: *"numere as etapas"*.
 * A lista é dele:
 *
 *   1    Entrada / Análise        4    Finalizado
 *   2a   Aguardando aprovação     5    Entregue / Retirado
 *   2b   Aguardando Peça          6    Terceirizada
 *   3    Aprovado / Executar
 *
 * O "2a" e o "2b" são o ponto: são duas colunas do quadro que vivem a MESMA
 * fase — o aparelho parado esperando alguém de fora, uma vez o cliente
 * respondendo o orçamento, outra a peça chegando. Numerar as duas como "2"
 * conta essa história; numerar 2 e 3 diria que uma vem depois da outra, o que
 * é falso.
 *
 * O número mora no banco (`os_status_config.numero`), junto do nome e da cor,
 * porque é escolha da loja — quem comprar o sisteminha vai ter outra esteira.
 * Etapa sem número aparece só com o nome, e nada quebra.
 */

export interface EtapaComNumero {
  label: string;
  numero?: string | null;
}

/** "2a · Aguardando aprovação" — o que aparece no cabeçalho da coluna. */
export function nomeDaEtapa(etapa: EtapaComNumero): string {
  const numero = (etapa.numero ?? '').trim();
  return numero ? `${numero} · ${etapa.label}` : etapa.label;
}

/**
 * Só o número, para caber em espaço apertado (a etiqueta dentro do cartão).
 * Devolve string vazia quando a etapa não tem número — quem chama decide se
 * mostra alguma coisa no lugar.
 */
export function numeroDaEtapa(etapa: EtapaComNumero): string {
  return (etapa.numero ?? '').trim();
}
