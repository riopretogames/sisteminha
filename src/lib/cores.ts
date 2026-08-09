/**
 * Paleta das etiquetas coloridas (status de OS, marcações de cliente).
 *
 * Precisa estar escrita por extenso em algum arquivo do projeto: o Tailwind
 * só gera o CSS das classes que encontra no código-fonte. Cor montada em
 * pedaços, ou vinda só do banco, não existe na folha de estilo — a etiqueta
 * apareceria sem cor nenhuma e ninguém entenderia por quê.
 */

export const CORES_ETIQUETA: { value: string; label: string }[] = [
  { value: 'bg-blue-500/10 text-blue-600', label: 'Azul' },
  { value: 'bg-purple-500/10 text-purple-600', label: 'Roxo' },
  { value: 'bg-amber-500/10 text-amber-600', label: 'Âmbar' },
  { value: 'bg-orange-500/10 text-orange-600', label: 'Laranja' },
  { value: 'bg-violet-500/10 text-violet-600', label: 'Violeta' },
  { value: 'bg-emerald-500/10 text-emerald-600', label: 'Esmeralda' },
  { value: 'bg-green-500/10 text-green-600', label: 'Verde' },
  { value: 'bg-red-500/10 text-red-600', label: 'Vermelho' },
  { value: 'bg-pink-500/10 text-pink-600', label: 'Rosa' },
  { value: 'bg-cyan-500/10 text-cyan-600', label: 'Ciano' },
  { value: 'bg-gray-500/10 text-gray-600', label: 'Cinza' },
];

/**
 * Cor de uma etiqueta que veio do catálogo.
 *
 * A tela de Listas do Sistema ainda não deixa escolher cor, então marcação
 * criada pela loja chega sem nenhuma. Em vez de sair cinza no meio das
 * coloridas, ganha uma cor da paleta escolhida pelo próprio texto — sempre a
 * mesma para a mesma palavra, então "Atacado" não muda de cor a cada tela.
 */
export function corDaEtiqueta(cor: string | null | undefined, chave: string): string {
  if (cor) return cor;

  let soma = 0;
  for (let i = 0; i < chave.length; i++) soma += chave.charCodeAt(i);
  return CORES_ETIQUETA[soma % CORES_ETIQUETA.length].value;
}
