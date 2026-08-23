/**
 * Agregação para os painéis: quem vendeu mais, o que saiu mais, quem consertou
 * mais.
 *
 * Está separado das telas porque a conta é sempre a mesma — junta por uma
 * chave, soma quantidade e dinheiro, ordena — e cada painel que a reescreve
 * inventa uma variação sutil. Foi exatamente assim que a regra de "estoque
 * crítico" acabou existindo em 7 versões pelo sistema (ver lib/estoque.ts).
 *
 * Todas as funções aqui são puras: recebem lista, devolvem lista. Nada de
 * banco, nada de data do relógio.
 */

export interface LinhaRanking {
  /** Identificador de quem/o quê. Usado como chave de lista no React. */
  chave: string;
  nome: string;
  /** Quantas vezes apareceu — vendas fechadas, peças vendidas, OS entregues. */
  quantidade: number;
  /** Dinheiro somado. */
  valor: number;
}

/** Como o item vira uma linha do ranking. */
export interface Extrator<T> {
  chave: (item: T) => string | null | undefined;
  nome: (item: T) => string | null | undefined;
  quantidade?: (item: T) => number;
  valor: (item: T) => number;
}

/**
 * Junta os itens por chave, somando quantidade e valor.
 *
 * Item sem chave é IGNORADO, de propósito. Venda sem vendedor preenchido é
 * real (importação antiga, venda de balcão sem atribuição), e jogar todas num
 * balde "sem nome" produziria um "vendedor" fantasma no topo do ranking — que
 * é pior que não mostrar, porque parece um funcionário de verdade.
 */
export function agrupar<T>(itens: readonly T[], extrair: Extrator<T>): LinhaRanking[] {
  const mapa = new Map<string, LinhaRanking>();

  for (const item of itens) {
    const chave = extrair.chave(item);
    if (!chave) continue;

    const atual = mapa.get(chave) ?? {
      chave,
      nome: extrair.nome(item) || 'Sem nome',
      quantidade: 0,
      valor: 0,
    };
    atual.quantidade += extrair.quantidade ? extrair.quantidade(item) : 1;
    atual.valor += extrair.valor(item);
    mapa.set(chave, atual);
  }

  return Array.from(mapa.values());
}

/**
 * Ordena por dinheiro, do maior para o menor.
 *
 * Empate cai para a quantidade, e depois para o nome em ordem alfabética. Sem
 * esse desempate a ordem varia entre um carregamento e outro quando dois
 * vendedores fecham o mesmo valor — e um painel que troca de lugar sozinho
 * faz a pessoa duvidar do número.
 */
export function porValor(linhas: readonly LinhaRanking[]): LinhaRanking[] {
  return [...linhas].sort(
    (a, b) =>
      b.valor - a.valor ||
      b.quantidade - a.quantidade ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** Ordena por quantidade. Mesmo critério de desempate, invertido. */
export function porQuantidade(linhas: readonly LinhaRanking[]): LinhaRanking[] {
  return [...linhas].sort(
    (a, b) =>
      b.quantidade - a.quantidade ||
      b.valor - a.valor ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** O primeiro colocado, ou null quando não há nada no período. */
export function lider(linhas: readonly LinhaRanking[]): LinhaRanking | null {
  return linhas.length > 0 ? porValor(linhas)[0] : null;
}

/**
 * Quanto esta linha representa do total, em porcentagem (0 a 100).
 *
 * Total zero devolve 0 em vez de estourar — acontece em loja parada, ou num
 * dia em que tudo que vendeu foi devolvido.
 */
export function participacao(linha: LinhaRanking, linhas: readonly LinhaRanking[]): number {
  const total = linhas.reduce((soma, l) => soma + l.valor, 0);
  if (total <= 0) return 0;
  return (linha.valor / total) * 100;
}

/**
 * Em que hora do dia mais entrou dinheiro.
 *
 * Serve para escala de equipe: saber que o movimento é das 14h às 16h vale
 * mais que saber o total do dia. Devolve null sem movimento nenhum.
 */
export function horarioDePico(
  datas: readonly string[],
): { hora: number; quantidade: number } | null {
  if (datas.length === 0) return null;

  const porHora = new Map<number, number>();
  for (const iso of datas) {
    const hora = new Date(iso).getHours();
    porHora.set(hora, (porHora.get(hora) ?? 0) + 1);
  }

  let melhor: { hora: number; quantidade: number } | null = null;
  for (const [hora, quantidade] of porHora) {
    // `>` e não `>=`: no empate fica a hora mais cedo, que é a ordem em que a
    // loja vive o dia.
    if (!melhor || quantidade > melhor.quantidade) melhor = { hora, quantidade };
  }
  return melhor;
}

/** "14h às 15h" — o jeito que se fala, não "14:00-15:00". */
export function faixaDeHora(hora: number): string {
  return `${hora}h às ${hora + 1}h`;
}
