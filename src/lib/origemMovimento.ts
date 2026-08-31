/**
 * De onde veio um movimento de estoque — e para onde a tela pode levar.
 *
 * Cada linha de `movimentos_estoque` carrega uma etiqueta de origem escrita
 * pelo próprio banco, no formato `tipo:identificador`:
 *
 *   venda:OV0006            baixa por venda      (20260804120000:77)
 *   estorno:venda:OV0006    venda cancelada      (20260807040000:70)
 *   os:OS0001               peça usada numa OS   (20260805090000:200)
 *   estorno:os:OS0001       OS cancelada         (20260822110000:69)
 *   entrada:EM0003          entrada de mercadoria(20260823110000:270)
 *   devolucao:<uuid>        devolução            (20260808100000:177)
 *   cadastro:<uuid>         estoque inicial      (20260805090000:46)
 *   ajuste_manual           ajuste na mão        (20260805090000)
 *
 * Duas armadilhas que este módulo existe para tratar:
 *
 * 1. **É número de documento, não chave.** O gatilho grava `OV0006`, o número
 *    que a loja fala em voz alta — não o id. Para abrir a ficha é preciso uma
 *    consulta a mais, procurando a venda por esse número.
 *
 * 2. **Às vezes é o UUID mesmo.** Todos os gatilhos usam
 *    `COALESCE(numero, id::text)`: quando o número ainda não foi gerado no
 *    instante do movimento, sobra o id cru. Quem for buscar precisa saber com
 *    qual dos dois está lidando — daí o campo `pareceId`.
 */

export type TipoDeOrigem = 'venda' | 'os' | 'entrada' | 'devolucao' | 'cadastro' | 'ajuste';

export interface OrigemDoMovimento {
  tipo: TipoDeOrigem | null;
  /** O que vem depois dos dois-pontos: número do documento ou id. */
  referencia: string;
  /** É um UUID em vez do número do documento (ver armadilha 2). */
  pareceId: boolean;
  /** Foi um estorno — a venda ou a OS foi cancelada e o estoque voltou. */
  estorno: boolean;
  /** Como a linha deve aparecer na tela, em português de gente. */
  rotulo: string;
  /** Dá para abrir alguma ficha a partir daqui? */
  navegavel: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOME_DO_TIPO: Record<TipoDeOrigem, string> = {
  venda: 'Venda',
  os: 'OS',
  entrada: 'Entrada',
  devolucao: 'Devolução',
  cadastro: 'Cadastro do produto',
  ajuste: 'Ajuste manual',
};

/** Só venda e OS têm ficha para abrir hoje. */
const TEM_FICHA: TipoDeOrigem[] = ['venda', 'os'];

export function lerOrigem(origem: string | null | undefined): OrigemDoMovimento {
  const cru = (origem ?? '').trim();
  if (!cru) {
    return { tipo: null, referencia: '', pareceId: false, estorno: false, rotulo: '—', navegavel: false };
  }

  // `ajuste_manual` e `ajuste:manual` convivem no banco: a primeira versão da
  // função de ajuste (05/08) gravava com sublinhado e a de 18/08 com
  // dois-pontos. Nenhuma das duas leva a lugar nenhum, então as duas caem no
  // mesmo rótulo em vez de aparecerem como coisas diferentes na tela.
  if (cru === 'ajuste_manual' || cru === 'ajuste:manual' || cru === 'ajuste') {
    return {
      tipo: 'ajuste', referencia: '', pareceId: false, estorno: false,
      rotulo: NOME_DO_TIPO.ajuste, navegavel: false,
    };
  }

  const estorno = cru.startsWith('estorno:');
  const semEstorno = estorno ? cru.slice('estorno:'.length) : cru;

  const corte = semEstorno.indexOf(':');
  const prefixo = corte >= 0 ? semEstorno.slice(0, corte) : semEstorno;
  const referencia = corte >= 0 ? semEstorno.slice(corte + 1).trim() : '';

  const tipo = (['venda', 'os', 'entrada', 'devolucao', 'cadastro'] as TipoDeOrigem[]).find(
    (t) => t === prefixo,
  ) ?? null;

  if (!tipo) {
    // Etiqueta que este módulo não conhece: mostra como está, sem inventar.
    // Melhor um texto cru na tela do que um link que leva ao lugar errado.
    return { tipo: null, referencia: '', pareceId: false, estorno: false, rotulo: cru, navegavel: false };
  }

  const pareceId = UUID.test(referencia);

  // Com id no lugar do número, o rótulo diz "(sem número)" em vez de mostrar
  // o UUID: ninguém lê UUID, mas um "Venda" solto ao lado de vários "Venda
  // OV000X" parece linha pela metade. Dizer que o número não existe é a
  // informação honesta — e ela ainda abre a ficha normalmente.
  //
  // Só vale para quem TEM número de documento. Cadastro de produto e
  // devolução guardam o id por natureza, nunca tiveram número, e escrever
  // "(sem número)" neles seria apontar uma falta que não existe.
  const temNumeroDeDocumento = tipo === 'venda' || tipo === 'os' || tipo === 'entrada';
  const identificacao = pareceId
    ? (temNumeroDeDocumento ? ' (sem número)' : '')
    : referencia
      ? ` ${referencia}`
      : '';
  const rotulo = `${estorno ? 'Estorno de ' : ''}${NOME_DO_TIPO[tipo]}${identificacao}`;

  return {
    tipo,
    referencia,
    pareceId,
    estorno,
    rotulo,
    navegavel: TEM_FICHA.includes(tipo) && referencia.length > 0,
  };
}
