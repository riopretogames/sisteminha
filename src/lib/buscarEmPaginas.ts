/**
 * Busca TODAS as linhas de uma consulta, de mil em mil.
 *
 * O Supabase devolve no máximo 1.000 linhas por pedido — é o limite padrão da
 * API, e ele corta calado: não dá erro, só para de mandar. Enquanto os painéis
 * eram fixos em "hoje" e "esta semana", nunca chegava perto. Com os filtros de
 * 22/09 dá para pedir "Este ano" ou "Ano passado" (que ainda busca o período
 * anterior junto, para comparar), e uma loja com movimento passa das mil
 * vendas fácil. Achado da revisão de 23/09: os números saíam calculados sobre
 * uma parte QUALQUER das vendas, sem aviso nenhum.
 *
 * Por isso toda consulta de período dos painéis passa por aqui.
 *
 * `montar` precisa devolver uma consulta NOVA a cada chamada e com ORDEM
 * fixa (ex.: `.order('created_at').order('id')`) — sem ordem, uma linha pode
 * aparecer em duas páginas e outra em nenhuma.
 */

interface ConsultaPaginavel {
  range: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>;
}

/** Tamanho da página: o limite do próprio Supabase. */
const PAGINA = 1000;

/** Freio de segurança: 200 páginas = 200 mil linhas. Passou disso, é defeito. */
const PAGINAS_NO_MAXIMO = 200;

export async function buscarEmPaginas<T>(montar: () => ConsultaPaginavel): Promise<T[]> {
  const todas: T[] = [];
  for (let pagina = 0; pagina < PAGINAS_NO_MAXIMO; pagina++) {
    const inicio = pagina * PAGINA;
    const { data, error } = await montar().range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    const linhas = (data ?? []) as T[];
    todas.push(...linhas);
    if (linhas.length < PAGINA) return todas;
  }
  throw new Error('O período escolhido tem registros demais para o painel. Escolha um período menor.');
}
