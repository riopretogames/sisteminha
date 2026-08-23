/**
 * Regra do atalho Enter: confirmar sem quebrar nada pelo caminho.
 *
 * Decisão do Felipe em 23/08: Enter avança, Esc volta. Esc já funcionava (é
 * padrão dos diálogos do sistema); o Enter é o que precisou ser construído.
 *
 * A regra mora aqui, separada da tela, porque "Enter confirma" parece uma
 * linha de código e não é: um Enter no lugar errado apaga um usuário, fecha
 * uma venda pela metade ou impede a pessoa de escrever a segunda linha da
 * observação. Cada recusa abaixo tem um caso concreto por trás.
 */

/** O que está em foco quando a tecla foi apertada. */
export interface AlvoDoEnter {
  /** Nome da etiqueta em minúsculo: 'input', 'textarea', 'button'… */
  tag: string;
  /** `type` do campo, quando for input. */
  tipo?: string;
  /** Campo de texto rico — a ficha usa em observação. */
  editavel?: boolean;
}

export interface ContextoDoEnter {
  /** Uma lista suspensa está aberta (select, sugestão de produto, calendário). */
  listaAberta?: boolean;
  /** O botão de confirmar está habilitado. */
  podeConfirmar: boolean;
  /** A ação apaga, cancela ou não tem volta. */
  perigoso?: boolean;
  /** Alguém já tratou este Enter (outro diálogo por cima, por exemplo). */
  jaTratado?: boolean;
}

/**
 * Decide se este Enter deve confirmar o diálogo.
 *
 * Devolve `false` em toda dúvida: não confirmar é um clique a mais; confirmar
 * errado é um estrago.
 */
export function enterDeveConfirmar(alvo: AlvoDoEnter, ctx: ContextoDoEnter): boolean {
  // Outro diálogo por cima já resolveu — dois confirmando o mesmo Enter
  // fecharia os dois de uma vez.
  if (ctx.jaTratado) return false;

  // Texto de várias linhas: Enter é quebra de linha. Roubar isso impede de
  // escrever a segunda linha da observação, e a pessoa nem entende por quê.
  if (alvo.tag === 'textarea' || alvo.editavel) return false;

  // O foco já está num botão: o próprio navegador clica nele com Enter.
  // Confirmar por cima disso dispararia DUAS ações — a do botão focado e a do
  // confirmar — que costumam ser diferentes (ex.: foco em "Cancelar").
  if (alvo.tag === 'button' || alvo.tag === 'a') return false;

  // Lista suspensa aberta: o Enter é para ESCOLHER o item, não para fechar a
  // tela. Sem isto, escolher um produto no PDV fecharia a venda.
  if (ctx.listaAberta) return false;

  // Botão desabilitado quer dizer "falta coisa". Enter não pode passar por
  // cima de uma validação que o clique respeita.
  if (!ctx.podeConfirmar) return false;

  // Ação sem volta exige clique, sempre. Enter é tecla de pressa, e apagar
  // usuário ou cancelar OS não é coisa para acontecer de raspão.
  if (ctx.perigoso) return false;

  return true;
}

/**
 * Se este Esc deve fechar/voltar.
 *
 * Bem mais simples que o Enter, porque cancelar é seguro por natureza. A
 * única recusa é a lista suspensa aberta: ali o Esc fecha a LISTA, e fechar o
 * diálogo junto faria a pessoa perder tudo que digitou por ter desistido de
 * escolher um item.
 */
export function escDeveFechar(ctx: { listaAberta?: boolean; jaTratado?: boolean }): boolean {
  if (ctx.jaTratado) return false;
  if (ctx.listaAberta) return false;
  return true;
}

/** Etiquetas que o navegador considera "estou digitando". */
export function ehCampoDeTexto(tag: string, tipo?: string): boolean {
  if (tag === 'textarea') return true;
  if (tag !== 'input') return false;
  const naoTextuais = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range'];
  return !naoTextuais.includes(tipo ?? 'text');
}
