/**
 * O que a loja exige para fechar uma venda no PDV.
 *
 * Pedido do Felipe em 02/09: *"tem que se opinar os campos que são
 * obrigatórios, tanto na aba de nova venda quanto na aba de nova ordem de
 * serviço, e quem deve selecionar esse é o administrador"*.
 *
 * A regra mora aqui, e não nos `if` do PDV, pelo mesmo motivo da irmã dela
 * (`osObrigatorios.ts`): dá para testar sem abrir o navegador, e o dia em que
 * a lista mudar muda um arquivo só. Sem `exigidos`, vale o padrão de fábrica
 * (`src/config/camposObrigatorios.ts`) — que hoje não exige nada, porque é
 * assim que o balcão da Rio Preto Games funciona.
 *
 * ⚠️ CAMPO NO CATÁLOGO SEM `if` AQUI É CHAVINHA QUE NÃO FAZ NADA. Foi o
 * defeito de 01/09, com cinco campos da OS de uma vez: a loja ligava, salvava,
 * e o balcão continuava salvando sem eles. Existe um teste que percorre o
 * catálogo e cobra a regra de cada campo — campo novo lá sem regra aqui
 * derruba o teste no mesmo commit.
 */

import { padraoDoFormulario } from '@/config/camposObrigatorios';

/** O que esta loja exige. Sem isto, vale o padrão de fábrica. */
export type Exigidos = Record<string, boolean>;

const PADRAO_DA_CASA: Exigidos = padraoDoFormulario('venda');

/**
 * Onde o campo é preenchido — e, por consequência, quando dá para cobrá-lo.
 *
 * O cliente é escolhido no CARRINHO, antes de a janela de pagamento abrir; a
 * origem da venda é escolhida DENTRO dela. Cobrar tudo de uma vez só no fim
 * mandaria o vendedor fechar a janela de pagamento, com o dinheiro do cliente
 * na mão, para voltar ao carrinho — o pior momento possível para descobrir que
 * falta alguma coisa.
 */
export type EtapaDaVenda = 'carrinho' | 'pagamento';

/** Os campos da venda que esta regra enxerga. */
export interface DadosDaVenda {
  /** Quem está comprando. Vazio = venda sem cliente, que hoje é permitida. */
  cliente_id: string;
  /** Balcão, Site, WhatsApp… Nasce com o item marcado como padrão na lista. */
  origem_venda_id: string;
}

export interface CampoFaltando {
  /** Nome do campo, igual ao do formulário — serve para focar/destacar. */
  campo: keyof DadosDaVenda;
  /** Em que momento da venda este campo é preenchido. */
  etapa: EtapaDaVenda;
  /** Título do aviso, como o vendedor lê. */
  titulo: string;
  /** O que fazer para resolver. */
  comoResolver: string;
}

/**
 * Devolve o que falta preencher, na ordem em que a venda acontece.
 *
 * `etapa` recorta a resposta para o momento: ao clicar em "Finalizar Venda"
 * só faz sentido cobrar o que está no carrinho; ao confirmar, cobra-se o
 * resto. Sem `etapa`, devolve tudo — é assim que os testes olham a regra
 * inteira de uma vez.
 */
export function faltandoParaFecharVenda(
  dados: DadosDaVenda,
  exigidos: Exigidos = PADRAO_DA_CASA,
  etapa?: EtapaDaVenda,
): CampoFaltando[] {
  const falta: CampoFaltando[] = [];
  const exige = (campo: string) => exigidos[campo] === true;

  if (exige('cliente_id') && !dados.cliente_id) {
    falta.push({
      campo: 'cliente_id',
      etapa: 'carrinho',
      titulo: 'Falta o cliente',
      comoResolver:
        'Escolha quem está comprando no botão Cliente, no topo do carrinho, ' +
        'ou cadastre na hora.',
    });
  }

  if (exige('origem_venda_id') && !dados.origem_venda_id) {
    falta.push({
      campo: 'origem_venda_id',
      etapa: 'pagamento',
      titulo: 'Falta a origem da venda',
      comoResolver: 'Diga de onde veio esta venda: balcão, site, WhatsApp…',
    });
  }

  return etapa ? falta.filter((f) => f.etapa === etapa) : falta;
}

/** Atalho de leitura para a tela: dá para fechar a venda? */
export function podeFecharVenda(
  dados: DadosDaVenda,
  exigidos: Exigidos = PADRAO_DA_CASA,
  etapa?: EtapaDaVenda,
): boolean {
  return faltandoParaFecharVenda(dados, exigidos, etapa).length === 0;
}
