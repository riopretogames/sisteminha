import { soDigitos } from '@/lib/documento';
import { deISO, paraISO } from '@/lib/periodo';

/**
 * Regras dos filtros do histórico de vendas — sem JSX de propósito.
 *
 * Pedido do Felipe em 09/08, com o sistema antigo como referência: a tela de
 * vendas tinha um campo de busca só (número e cliente), o que serve para quem
 * já sabe o que procurar. Na prática as perguntas são outras: "quanto o Bruno
 * vendeu esse mês?", "essa peça saiu para quem?", "quem comprou pagando no
 * cartão?".
 */

export interface FiltrosVendaValores {
  /** Número da venda, cliente ou vendedor. */
  busca: string;
  status: string;
  vendedorId: string;
  /** Nome (ou parte) do produto vendido. */
  produto: string;
  /** IMEI ou número de série do produto vendido. */
  serie: string;
  formaPagamento: string;
  de: string;
  ate: string;
  valorMin: string;
  valorMax: string;
}

export const FILTROS_VENDA_VAZIO: FiltrosVendaValores = {
  busca: '',
  status: '',
  vendedorId: '',
  produto: '',
  serie: '',
  formaPagamento: '',
  de: '',
  ate: '',
  valorMin: '',
  valorMax: '',
};

/** O que a consulta precisa trazer para os filtros funcionarem. */
export interface VendaFiltravel {
  numero_venda: string | null;
  created_at: string | null;
  status: string | null;
  total: number | null;
  vendedor_id: string | null;
  clientes: { nome: string } | null;
  vendedor: { nome: string } | null;
  itens_venda: { produtos: { nome: string; imei_serial: string | null } | null }[] | null;
  pagamentos_venda: { forma: string | null; forma_pagamento_id?: string | null }[] | null;
}

/**
 * Prefixo do valor do filtro de forma quando o pagamento é de antes de
 * 07/08, quando `pagamentos_venda` ainda não guardava QUAL forma cadastrada
 * foi usada — só o tipo amplo (dinheiro, pix...). Esses entram no filtro pelo
 * tipo, para não sumirem de filtro nenhum.
 */
export const FORMA_PELO_TIPO = 'tipo:';

/**
 * O pagamento é da forma escolhida no filtro?
 *
 * O filtro escolhe a forma CADASTRADA (Cadastros > Formas de Pagamento) —
 * "Shopee", "Link de Pagamento" e "Cartão Crédito - Taxa" são formas
 * diferentes para a loja, mesmo sendo todas "cartão de crédito" por baixo.
 * Até 24/09 o filtro usava uma lista fixa no código, com "Crediário" (que a
 * loja não usa) e sem nenhuma dessas três.
 */
export function pagamentoDaForma(
  p: { forma: string | null; forma_pagamento_id?: string | null },
  filtro: string,
): boolean {
  if (filtro.startsWith(FORMA_PELO_TIPO)) {
    return !p.forma_pagamento_id && p.forma === filtro.slice(FORMA_PELO_TIPO.length);
  }
  return p.forma_pagamento_id === filtro;
}

/**
 * O dia (de/até, datas puras 'AAAA-MM-DD') em instantes completos, no horário
 * da LOJA — o do computador de quem está usando.
 *
 * Achado de 24/09: o período ia para o banco como '2026-09-14' e
 * '2026-09-14T23:59:59', sem fuso, e o banco lê isso como horário de Londres.
 * O dia 14 começava às 21h do dia 13 em Rio Preto e acabava às 20h59 do dia
 * 14: a venda das 21h36 do dia 14 só aparecia filtrando o dia 15. Os painéis
 * (lib/periodo.ts) já contavam pelo horário local, então a mesma pergunta dava
 * números diferentes em telas diferentes.
 *
 * O fim é EXCLUSIVO — a meia-noite do dia seguinte —, como em lib/periodo.ts:
 * usar `<` nele não perde a venda das 23h59min59s.
 */
export function intervaloDoDia(de: string, ate: string): { inicio?: string; fimExclusivo?: string } {
  const r: { inicio?: string; fimExclusivo?: string } = {};
  if (de) r.inicio = deISO(de).toISOString();
  if (ate) {
    const fim = deISO(ate);
    fim.setDate(fim.getDate() + 1);
    r.fimExclusivo = fim.toISOString();
  }
  return r;
}

/** O dia de um instante do banco, no horário da loja ('AAAA-MM-DD'). */
export function diaLocal(instante: string | null | undefined): string {
  if (!instante) return '';
  const d = new Date(instante);
  return Number.isNaN(d.getTime()) ? '' : paraISO(d);
}

export function aplicarFiltrosVenda<T extends VendaFiltravel>(
  vendas: T[],
  f: FiltrosVendaValores
): T[] {
  const termo = f.busca.trim().toLowerCase();
  const produto = f.produto.trim().toLowerCase();
  const serie = f.serie.trim().toLowerCase();
  const serieDigitos = soDigitos(serie);

  return vendas.filter((v) => {
    if (termo) {
      const achou =
        (v.numero_venda ?? '').toLowerCase().includes(termo) ||
        (v.clientes?.nome ?? '').toLowerCase().includes(termo) ||
        (v.vendedor?.nome ?? '').toLowerCase().includes(termo);
      if (!achou) return false;
    }

    if (f.status && v.status !== f.status) return false;
    if (f.vendedorId && v.vendedor_id !== f.vendedorId) return false;

    if (produto) {
      const temProduto = (v.itens_venda ?? []).some((i) =>
        (i.produtos?.nome ?? '').toLowerCase().includes(produto)
      );
      if (!temProduto) return false;
    }

    if (serie) {
      // IMEI costuma ser digitado sem pontuação, e número de série tem letra:
      // compara dos dois jeitos para não obrigar a acertar o formato.
      const temSerie = (v.itens_venda ?? []).some((i) => {
        const valor = (i.produtos?.imei_serial ?? '').toLowerCase();
        if (!valor) return false;
        return (
          valor.includes(serie) ||
          (serieDigitos.length > 0 && soDigitos(valor).includes(serieDigitos))
        );
      });
      if (!temSerie) return false;
    }

    if (f.formaPagamento) {
      const temForma = (v.pagamentos_venda ?? []).some((p) => pagamentoDaForma(p, f.formaPagamento));
      if (!temForma) return false;
    }

    // Recorta pelo dia, não pelo instante: `created_at` é timestamp, e comparar
    // o texto completo deixaria de fora a própria data escolhida em "até". O
    // dia é o do horário da loja, não o de Londres (ver `intervaloDoDia`).
    const dia = diaLocal(v.created_at);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;

    const total = Number(v.total ?? 0);
    if (f.valorMin && total < Number(f.valorMin)) return false;
    if (f.valorMax && total > Number(f.valorMax)) return false;

    return true;
  });
}
