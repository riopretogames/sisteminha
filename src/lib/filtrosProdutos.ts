/**
 * Regras do filtro de Estoque — sem JSX de propósito.
 *
 * Pedido do Felipe em 10/08, com o sistema antigo como referência: a tela só
 * tinha uma busca por texto solta. Mesmo padrão de `filtrosOS.ts`/
 * `filtrosVenda.ts` — objeto plano de strings, filtro em memória sobre a
 * lista que `Estoque.tsx` já busca inteira (ativos e inativos).
 */

export interface FiltrosProdutosValores {
  /** Nome, código de barras ou IMEI/série. */
  busca: string;
  grupoProdutoId: string;
  marcaId: string;
  modeloId: string;
  corId: string;
  condicaoId: string;
  memoriaId: string;
  categoria: string;
  localizacao: string;
  /** '' = todos, 'sim' = apto à venda, 'nao' = não apto (inativo). */
  aptoVenda: '' | 'sim' | 'nao';
  /** 'YYYY-MM-DD' — recorte pela data de entrada (created_at). */
  de: string;
  ate: string;
}

export const FILTROS_PRODUTOS_VAZIO: FiltrosProdutosValores = {
  busca: '',
  grupoProdutoId: '',
  marcaId: '',
  modeloId: '',
  corId: '',
  condicaoId: '',
  memoriaId: '',
  categoria: '',
  localizacao: '',
  aptoVenda: '',
  de: '',
  ate: '',
};

interface ProdutoFiltravel {
  nome: string;
  codigo_barra?: string | null;
  imei_serial?: string | null;
  marca?: string | null;
  modelo?: string | null;
  grupo_produto_id?: string | null;
  marca_id?: string | null;
  modelo_id?: string | null;
  cor_id?: string | null;
  condicao_id?: string | null;
  memoria_id?: string | null;
  categoria?: string | null;
  localizacao?: string | null;
  ativo: boolean;
  created_at: string;
}

/** Aplica o filtro numa lista já carregada. */
export function aplicarFiltrosProdutos<T extends ProdutoFiltravel>(
  produtos: T[],
  f: FiltrosProdutosValores
): T[] {
  const termo = f.busca.trim().toLowerCase();

  return produtos.filter((p) => {
    if (termo) {
      const achou =
        p.nome.toLowerCase().includes(termo) ||
        (p.codigo_barra ?? '').toLowerCase().includes(termo) ||
        (p.imei_serial ?? '').toLowerCase().includes(termo) ||
        (p.marca ?? '').toLowerCase().includes(termo) ||
        (p.modelo ?? '').toLowerCase().includes(termo);
      if (!achou) return false;
    }

    if (f.grupoProdutoId && p.grupo_produto_id !== f.grupoProdutoId) return false;
    if (f.marcaId && p.marca_id !== f.marcaId) return false;
    if (f.modeloId && p.modelo_id !== f.modeloId) return false;
    if (f.corId && p.cor_id !== f.corId) return false;
    if (f.condicaoId && p.condicao_id !== f.condicaoId) return false;
    if (f.memoriaId && p.memoria_id !== f.memoriaId) return false;
    if (f.categoria && p.categoria !== f.categoria) return false;
    if (f.localizacao && p.localizacao !== f.localizacao) return false;

    if (f.aptoVenda === 'sim' && !p.ativo) return false;
    if (f.aptoVenda === 'nao' && p.ativo) return false;

    // Compara só a parte da data: created_at é timestamp, e comparar texto
    // completo deixaria a própria data do "até" de fora.
    const dia = p.created_at.slice(0, 10);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;

    return true;
  });
}
