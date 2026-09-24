import { useCallback, useEffect, useState } from 'react';
import type { SelecaoPeriodo } from './periodo';

/**
 * O que os dashboards filtram.
 *
 * Um tipo só para os quatro painéis (Vendas, Assistência, Estoque e Metas).
 * Cada tela usa os campos que fazem sentido para ela e ignora o resto — o
 * Estoque não tem vendedor, a Assistência tem técnico no lugar dele — mas o
 * formato é o mesmo, então o filtro escolhido numa tela pode ser levado para
 * a outra sem tradução.
 */
export interface FiltrosDashboardValores {
  periodo: SelecaoPeriodo;
  /** '' = todos. Em Vendas é o vendedor; em Assistência, o técnico. */
  pessoaId: string;
  /** '' = todas. Categoria do produto (Vendas/Estoque) ou equipamento (Assistência). */
  categoria: string;
  /** Mostrar a comparação com o período anterior nos cards. */
  comparar: boolean;
}

export const FILTROS_DASHBOARD_PADRAO: FiltrosDashboardValores = {
  // "Este mês" como padrão: é o recorte que a loja usa para meta e premiação,
  // e o Felipe troca para hoje/semana/ano em um clique.
  periodo: { atalho: 'este-mes' },
  pessoaId: '',
  categoria: '',
  comparar: true,
};

/** O filtro está diferente do padrão? (liga o botão "Limpar filtros") */
export function temFiltroAplicado(v: FiltrosDashboardValores): boolean {
  return (
    v.periodo.atalho !== FILTROS_DASHBOARD_PADRAO.periodo.atalho ||
    v.pessoaId !== '' ||
    v.categoria !== ''
  );
}

/**
 * Estado dos filtros, lembrado entre visitas.
 *
 * Quem abre o painel toda manhã filtrando por "ontem" não quer reconfigurar
 * isso todo dia. A escolha fica guardada no próprio navegador (por tela, pela
 * `chave`), não no banco: é preferência de quem está olhando, não dado da
 * loja — e cada pessoa tem a sua.
 *
 * Tudo que mexe com o armazenamento está protegido: navegador em aba anônima
 * ou com armazenamento bloqueado lança exceção ao gravar, e um painel de
 * vendas não pode morrer por causa de uma preferência de tela.
 */
export function useFiltrosDashboard(
  chave: string,
  inicial: FiltrosDashboardValores = FILTROS_DASHBOARD_PADRAO,
): [FiltrosDashboardValores, (v: FiltrosDashboardValores) => void, () => void] {
  const chaveCompleta = `sisteminha:filtros:${chave}`;

  const [valores, setValores] = useState<FiltrosDashboardValores>(() => {
    try {
      const salvo = localStorage.getItem(chaveCompleta);
      if (!salvo) return inicial;
      const lido = JSON.parse(salvo) as Partial<FiltrosDashboardValores>;
      // Mistura com o padrão: se um campo novo for criado depois, quem tinha
      // preferência antiga salva não fica com o campo faltando.
      return { ...inicial, ...lido, periodo: { ...inicial.periodo, ...lido.periodo } };
    } catch {
      return inicial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(chaveCompleta, JSON.stringify(valores));
    } catch {
      /* preferência de tela não vale derrubar o painel */
    }
  }, [chaveCompleta, valores]);

  const limpar = useCallback(() => setValores(inicial), [inicial]);

  return [valores, setValores, limpar];
}

/**
 * Tira do filtro a pessoa ou o grupo que não existe mais na lista.
 *
 * Achado da revisão de 23/09: o filtro fica guardado no navegador. Se a Luana
 * é desligada e some da lista, quem tinha filtrado por ela abria o painel com
 * o campo Vendedor EM BRANCO, todos os números zerados e nada na tela dizendo
 * por quê. Agora, com as listas carregadas, o que não existe volta para
 * "Todos".
 *
 * `prontas` precisa ser `true` só com as listas já carregadas — senão, durante
 * o carregamento (lista ainda vazia), todo filtro pareceria órfão e sumiria.
 */
export function useCorrigirFiltroOrfao(
  valores: FiltrosDashboardValores,
  setValores: (v: FiltrosDashboardValores) => void,
  listas: { pessoas?: { id: string }[]; categorias?: { id: string }[] },
  prontas: boolean,
) {
  const { pessoas, categorias } = listas;
  useEffect(() => {
    if (!prontas) return;
    const pessoaSumiu =
      valores.pessoaId !== '' && pessoas !== undefined && !pessoas.some((p) => p.id === valores.pessoaId);
    const categoriaSumiu =
      valores.categoria !== '' &&
      categorias !== undefined &&
      !categorias.some((c) => c.id === valores.categoria);
    if (pessoaSumiu || categoriaSumiu) {
      setValores({
        ...valores,
        pessoaId: pessoaSumiu ? '' : valores.pessoaId,
        categoria: categoriaSumiu ? '' : valores.categoria,
      });
    }
  }, [prontas, pessoas, categorias, valores, setValores]);
}
