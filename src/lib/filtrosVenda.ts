import { soDigitos } from '@/lib/documento';

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
  pagamentos_venda: { forma: string | null }[] | null;
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
      const temForma = (v.pagamentos_venda ?? []).some((p) => p.forma === f.formaPagamento);
      if (!temForma) return false;
    }

    // Recorta pelo dia, não pelo instante: `created_at` é timestamp, e comparar
    // o texto completo deixaria de fora a própria data escolhida em "até".
    const dia = (v.created_at ?? '').slice(0, 10);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;

    const total = Number(v.total ?? 0);
    if (f.valorMin && total < Number(f.valorMin)) return false;
    if (f.valorMax && total > Number(f.valorMax)) return false;

    return true;
  });
}
