/**
 * Dublê do banco que RESPEITA os filtros da consulta.
 *
 * O `bancoFalso` de `apoio.tsx` devolve a tabela inteira para qualquer
 * consulta — ótimo para tela que lê cada tabela uma vez só. Não serve quando a
 * MESMA tabela é lida duas vezes com recortes diferentes, que é justamente o
 * que o Financeiro faz de propósito (o Fluxo de Caixa lê os títulos por
 * vencimento E por data de pagamento; o Caixa lê a sessão aberta E as
 * fechadas). Com o dublê cego os dois recortes voltariam iguais e o teste não
 * provaria nada.
 *
 * Aqui `eq`, `neq`, `gte`, `gt`, `lte`, `lt`, `in`, `is` e `not(..., 'in', ...)`
 * filtram de verdade, `range` pagina, e as gravações ficam registradas em
 * `gravacoes` para o teste conferir O QUE a tela mandou gravar. Coluna com
 * ponto (`devolucoes.created_at`) olha dentro do objeto embutido.
 */

type Linha = Record<string, unknown>;

export interface Gravacao {
  tabela: string;
  tipo: 'insert' | 'update' | 'upsert' | 'delete';
  valores: unknown;
  /** Os filtros encadeados depois da gravação, na forma [coluna, operador, valor]. */
  filtros: Array<[string, string, unknown]>;
}

export interface OpcoesBancoComFiltros {
  /**
   * Resposta de uma gravação. Sem isto, gravar dá certo e devolve lista vazia
   * (o que o `.select()` depois de um update devolveria sem linha afetada).
   */
  aoGravar?: (g: Gravacao) => { data?: unknown; error?: unknown } | void;
}

function valorDaColuna(linha: unknown, coluna: string): unknown {
  return coluna.split('.').reduce<unknown>((atual, chave) => {
    if (atual == null) return atual;
    if (Array.isArray(atual)) return (atual[0] as Linha | undefined)?.[chave];
    return (atual as Linha)[chave];
  }, linha);
}

function comparar(a: unknown, b: unknown): number {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

export function bancoComFiltros(tabelas: Record<string, Linha[]>, opcoes: OpcoesBancoComFiltros = {}) {
  const gravacoes: Gravacao[] = [];

  function consulta(tabela: string) {
    const filtros: Array<(l: Linha) => boolean> = [];
    const filtrosTexto: Array<[string, string, unknown]> = [];
    let gravacao: Gravacao | null = null;
    let faixa: [number, number] | null = null;
    let limite: number | null = null;

    const q: Record<string, unknown> = {};
    const filtrar = (op: string, coluna: string, valor: unknown, teste: (v: unknown) => boolean) => {
      filtrosTexto.push([coluna, op, valor]);
      filtros.push((l) => teste(valorDaColuna(l, coluna)));
      return q;
    };

    q.select = () => q;
    q.order = () => q;
    q.eq = (c: string, v: unknown) => filtrar('eq', c, v, (x) => x === v);
    q.neq = (c: string, v: unknown) => filtrar('neq', c, v, (x) => x !== v);
    q.gte = (c: string, v: unknown) => filtrar('gte', c, v, (x) => x != null && comparar(x, v) >= 0);
    q.gt = (c: string, v: unknown) => filtrar('gt', c, v, (x) => x != null && comparar(x, v) > 0);
    q.lte = (c: string, v: unknown) => filtrar('lte', c, v, (x) => x != null && comparar(x, v) <= 0);
    q.lt = (c: string, v: unknown) => filtrar('lt', c, v, (x) => x != null && comparar(x, v) < 0);
    q.in = (c: string, vs: unknown[]) => filtrar('in', c, vs, (x) => vs.includes(x));
    q.is = (c: string, v: unknown) => filtrar('is', c, v, (x) => (v === null ? x == null : x === v));
    q.not = (c: string, op: string, v: unknown) => {
      if (op === 'in') {
        const lista = String(v).replace(/[()"]/g, '').split(',');
        return filtrar('not.in', c, v, (x) => !lista.includes(String(x)));
      }
      return filtrar(`not.${op}`, c, v, (x) => x !== v);
    };
    q.range = (de: number, ate: number) => {
      faixa = [de, ate];
      return q;
    };
    q.limit = (n: number) => {
      limite = n;
      return q;
    };
    for (const tipo of ['insert', 'update', 'upsert', 'delete'] as const) {
      q[tipo] = (valores?: unknown) => {
        gravacao = { tabela, tipo, valores, filtros: filtrosTexto };
        return q;
      };
    }

    const resolver = () => {
      if (gravacao) {
        gravacoes.push(gravacao);
        const r = (opcoes.aoGravar?.(gravacao) ?? undefined) as { data?: unknown; error?: unknown } | undefined;
        return { data: r?.data ?? [], error: r?.error ?? null };
      }
      let linhas = (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
      if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1);
      if (limite != null) linhas = linhas.slice(0, limite);
      return { data: linhas, error: null, count: linhas.length };
    };

    q.maybeSingle = () => {
      const r = resolver();
      return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error });
    };
    q.single = q.maybeSingle;
    q.then = (aceitar: (r: unknown) => unknown, rejeitar?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(aceitar, rejeitar);
    return q;
  }

  return {
    gravacoes,
    from: (tabela: string) => consulta(tabela),
    rpc: (nome: string) => Promise.resolve({ data: tabelas[`rpc:${nome}`] ?? null, error: null }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-teste' } }, error: null }),
    },
  };
}
