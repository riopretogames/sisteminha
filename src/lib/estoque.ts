/**
 * A regra de "estoque baixo", num lugar só.
 *
 * Estava reimplementada em 7 lugares (Estoque, EstoqueCritico, Dashboard,
 * DashboardEstoque, RelatorioEstoque ×2, ficha do produto) sempre como
 * `estoque_atual <= estoque_minimo`. Sete cópias da mesma comparação é uma
 * armadilha silenciosa: no dia em que a loja decidir que crítico é
 * "abaixo do mínimo" em vez de "no mínimo ou abaixo", ou quiser uma margem
 * de folga, seis telas vão continuar dizendo o contrário da sétima — e nada
 * quebra, o número só passa a divergir de tela pra tela.
 *
 * O corte continua sendo calculado no cliente de propósito: o PostgREST não
 * compara duas colunas da mesma linha no filtro (`.lte('estoque_atual',
 * 'estoque_minimo')` compara com o TEXTO "estoque_minimo", não com a coluna,
 * e sempre deu número errado). Por isso as telas trazem as duas colunas e
 * filtram aqui.
 */

export interface ProdutoComEstoque {
  estoque_atual: number | null;
  estoque_minimo: number | null;
}

/**
 * Está no mínimo ou abaixo — ou seja, precisa de reposição.
 *
 * MÍNIMO 0 (ou vazio) QUER DIZER "ESTE PRODUTO NÃO SE REPÕE" (revisão de
 * 24/09). Seminovo e aparelho recebido em troca são peça única: depois de
 * vendido fica com estoque 0 para sempre, e com a regra antiga (0 ≤ 0) ficava
 * para sempre como "Zerado" no Estoque Crítico e no aviso do topo — em
 * produção, 2 dos 4 críticos daquele dia eram isso. O alerta virava ruído e
 * escondia o que precisava mesmo ser comprado.
 *
 * Com mínimo 0 o produto só volta ao alerta se o estoque ficar NEGATIVO: aí
 * alguém vendeu uma unidade que o sistema não tinha, e isso precisa de
 * conferência, peça única ou não.
 */
export function estoqueCritico(p: ProdutoComEstoque): boolean {
  const atual = Number(p.estoque_atual ?? 0);
  const minimo = Number(p.estoque_minimo ?? 0);
  if (minimo <= 0) return atual < 0;
  return atual <= minimo;
}

/** Acabou de vez. Separado do crítico porque a urgência é outra: sem isto
 *  não há o que vender, não é só "está acabando". */
export function estoqueZerado(p: ProdutoComEstoque): boolean {
  return Number(p.estoque_atual ?? 0) <= 0;
}

/** Quantas unidades faltam pra voltar ao mínimo. Zero se já está acima. */
export function faltaParaOMinimo(p: ProdutoComEstoque): number {
  return Math.max(0, Number(p.estoque_minimo ?? 0) - Number(p.estoque_atual ?? 0));
}

/**
 * Lê o que a pessoa digitou num campo numérico (`<input type="number">`).
 *
 * Achado da revisão de 24/09: a Entrada de Mercadoria convertia esses campos
 * com `paraNumero()`, que foi feita para texto brasileiro ("1.500,00") e APAGA
 * todos os pontos por achar que são separador de milhar. Só que o campo
 * numérico do navegador sempre entrega o valor com PONTO decimal ("12.5"),
 * mesmo mostrando "12,5" na tela — e "12.5" virava 125. Uma película comprada
 * a R$ 12,50 entrava com custo de R$ 125,00 e lançava no financeiro uma compra
 * paga dez vezes maior.
 *
 * Aqui o ponto é decimal, como o navegador manda. Vírgula sozinha (algum
 * navegador que deixe passar "12,5") também vale como decimal. Campo vazio
 * devolve NaN — "não digitou" é diferente de "digitou zero", e quem chama
 * decide o que fazer com isso.
 */
export function numeroDoCampo(valor: string): number {
  const texto = (valor ?? '').trim();
  if (texto === '') return NaN;
  const comPonto = texto.includes(',') && !texto.includes('.') ? texto.replace(',', '.') : texto;
  return Number(comPonto);
}

/**
 * Número inteiro de um campo, ou `padrao` se o campo ficou vazio/inválido.
 *
 * Substitui o `parseInt(...) || 1` que as fichas usavam: o `|| 1` trocava o
 * ZERO digitado pelo padrão, então era impossível gravar "mínimo 0" (produto
 * que não se repõe) — digitava 0, salvava, e voltava 1.
 */
export function inteiroOu(valor: string, padrao: number): number {
  const n = numeroDoCampo(valor);
  return Number.isFinite(n) ? Math.trunc(n) : padrao;
}

/** Quantidade de estoque digitada: inteira e maior que zero. */
export function quantidadeValida(valor: string): boolean {
  const n = numeroDoCampo(valor);
  return Number.isInteger(n) && n > 0;
}

/** Preço digitado: número de verdade, zero ou mais. */
export function precoValido(valor: string): boolean {
  const n = numeroDoCampo(valor);
  return Number.isFinite(n) && n >= 0;
}

interface ProdutoRevisavel {
  id: string;
  ativo: boolean;
  preco: number | null;
  estoque_atual: number | null;
}

/**
 * O produto está esperando alguém revisar e colocar à venda?
 *
 * É o aparelho recebido em troca no PDV: o banco cria o produto DESLIGADO da
 * venda (`registrar_entrada_produto_troca`), com 1 unidade, até alguém da loja
 * conferir, definir o preço e ligar.
 *
 * Até 24/09 a regra era "inativo e preço zero", um palpite: desde 25/08 o
 * vendedor pode informar no PDV por quanto vai revender o aparelho, e o que
 * vinha COM preço ganhava a etiqueta "Inativo" (igual a produto excluído) e
 * sumia da lista sem ninguém saber que precisava ser revisado. Agora a origem
 * vem do cadastro: `idsDeTroca` são os produtos que têm linha em
 * `entradas_produto`.
 *
 * Com estoque ZERO não conta: é troca que já foi revisada, vendida e depois
 * tirada de linha — não tem mais nada para revisar.
 *
 * Se a lista de trocas não pôde ser lida (`null`), volta ao palpite antigo do
 * preço zero — melhor um aviso aproximado do que nenhum.
 */
export function aguardandoRevisao(p: ProdutoRevisavel, idsDeTroca: Set<string> | null): boolean {
  if (p.ativo) return false;
  if (idsDeTroca === null) return Number(p.preco ?? 0) === 0;
  return idsDeTroca.has(p.id) && Number(p.estoque_atual ?? 0) > 0;
}
