/**
 * Paleta das etiquetas coloridas (status de OS, marcações de cliente).
 *
 * Precisa estar escrita por extenso em algum arquivo do projeto: o Tailwind
 * só gera o CSS das classes que encontra no código-fonte. Cor montada em
 * pedaços, ou vinda só do banco, não existe na folha de estilo — a etiqueta
 * apareceria sem cor nenhuma e ninguém entenderia por quê.
 */

export const CORES_ETIQUETA: { value: string; label: string }[] = [
  { value: 'bg-blue-500 text-white', label: 'Azul' },
  { value: 'bg-purple-500 text-white', label: 'Roxo' },
  { value: 'bg-amber-500 text-white', label: 'Âmbar' },
  { value: 'bg-orange-500 text-white', label: 'Laranja' },
  { value: 'bg-violet-500 text-white', label: 'Violeta' },
  { value: 'bg-emerald-500 text-white', label: 'Esmeralda' },
  { value: 'bg-green-600 text-white', label: 'Verde' },
  { value: 'bg-red-500 text-white', label: 'Vermelho' },
  { value: 'bg-pink-500 text-white', label: 'Rosa' },
  { value: 'bg-cyan-500 text-white', label: 'Ciano' },
  { value: 'bg-slate-500 text-white', label: 'Cinza' },
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


/**
 * A cor de BOTÃO de uma etapa, a partir da cor da etiqueta dela.
 *
 * Pedido do Felipe em 30/08: *"gostaria que as etapas de avanço sejam da mesma
 * cor das categorias do Kanban"*. O botão dizia "Enviar laudo para aprovação"
 * em azul enquanto a coluna de destino era laranja — a pessoa lê o botão, olha
 * o quadro e não liga uma coisa à outra.
 *
 * As classes estão escritas por extenso porque o Tailwind só gera o CSS do que
 * encontra no código: cor montada em pedaços chega ao navegador sem existir.
 * Mesma armadilha que este arquivo já documenta para as etiquetas.
 */
const BOTAO_POR_FAMILIA: Record<string, string> = {
  blue: 'bg-blue-600 text-white hover:bg-blue-700',
  purple: 'bg-purple-600 text-white hover:bg-purple-700',
  amber: 'bg-amber-600 text-white hover:bg-amber-700',
  orange: 'bg-orange-600 text-white hover:bg-orange-700',
  violet: 'bg-violet-600 text-white hover:bg-violet-700',
  emerald: 'bg-emerald-600 text-white hover:bg-emerald-700',
  green: 'bg-green-600 text-white hover:bg-green-700',
  red: 'bg-red-600 text-white hover:bg-red-700',
  pink: 'bg-pink-600 text-white hover:bg-pink-700',
  cyan: 'bg-cyan-600 text-white hover:bg-cyan-700',
  slate: 'bg-slate-600 text-white hover:bg-slate-700',
};

/**
 * Recebe a cor da etiqueta ("bg-amber-500 text-white" ou a versão clara
 * "bg-amber-500/10 text-amber-600", as duas convivem no banco) e devolve as
 * classes do botão na mesma família.
 *
 * Cor que este arquivo não conhece devolve `undefined` — e aí o botão fica com
 * a cor padrão do sistema, que é melhor do que um botão sem cor nenhuma.
 */
export function corDeBotaoDaEtapa(cor: string | null | undefined): string | undefined {
  const familia = /bg-([a-z]+)-\d/.exec(cor ?? '')?.[1];
  return familia ? BOTAO_POR_FAMILIA[familia] : undefined;
}
