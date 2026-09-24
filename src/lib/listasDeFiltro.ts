import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PRODUTO_CATEGORIAS } from '@/lib/constants';

/**
 * De onde saem as listas dos filtros dos dashboards.
 *
 * **A lição que gerou este arquivo (23/09/2026).** A primeira versão dos
 * filtros montava cada lista a partir dos dados que a tela tinha carregado:
 * os vendedores vinham das vendas do período, as categorias vinham dos
 * produtos vendidos, os equipamentos vinham das OS abertas. Na prática isso
 * quer dizer que **só aparece no filtro quem já apareceu no movimento** — e o
 * Felipe achou os dois buracos no primeiro teste:
 *
 *   • a Luana, vendedora ativa, não estava na lista de vendedores, porque não
 *     tinha venda naquele período. Justamente quem você mais quer filtrar
 *     ("por que a Luana não vendeu?") é quem some da lista;
 *   • o filtro de categoria mostrava uma categoria só, e o de equipamento,
 *     três — o resto do cadastro não existia para a tela.
 *
 * A regra, que vale para todo filtro novo: **a lista vem do CADASTRO, e o
 * movimento só acrescenta.** É a mesma regra das listas editáveis do
 * `CLAUDE.md` — o que a loja cadastra em Cadastros > Listas do Sistema tem que
 * aparecer sozinho na tela que usa.
 *
 * O "movimento só acrescenta" não é detalhe: quem foi desligado e arquivado
 * sai do cadastro, mas as vendas que ele fez continuam no período. Sem a
 * união, o painel mostraria um faturamento que nenhum filtro alcança.
 */

export interface OpcaoFiltro {
  /** O que é gravado no dado (id do catálogo, chave do enum, id da pessoa). */
  id: string;
  /** O que a pessoa lê na tela. */
  nome: string;
}

/**
 * Junta a lista do cadastro com o que apareceu no movimento, sem repetir.
 *
 * O cadastro manda na ordem e no nome; o que veio do movimento e não está
 * cadastrado entra depois, no fim.
 */
export function unirOpcoes(
  doCadastro: readonly OpcaoFiltro[],
  doMovimento: readonly OpcaoFiltro[],
): OpcaoFiltro[] {
  const vistos = new Set(doCadastro.map((o) => o.id));
  const extras = doMovimento
    .filter((o) => o.id && !vistos.has(o.id))
    .filter((o, i, lista) => lista.findIndex((x) => x.id === o.id) === i)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return [...doCadastro, ...extras];
}

/**
 * As categorias travadas do produto (Celular, Acessório, Peça, Serviço).
 *
 * Continuam existindo no cadastro do produto, mas **não são mais a régua dos
 * painéis**: decisão do Felipe em 23/09/2026. Esta lista é fixa no banco — ele
 * não consegue criar categoria nova pela tela, e era justamente isso que ele
 * pedia ("ao adicionar uma categoria nova, tem que aparecer aí também"). Quem
 * manda nos filtros agora é o Grupo de Produto, que a loja edita em
 * Cadastros > Listas do Sistema.
 */
export function categoriasDeProduto(): OpcaoFiltro[] {
  return Object.entries(PRODUTO_CATEGORIAS).map(([chave, cfg]) => ({
    id: chave,
    nome: cfg.label,
  }));
}

/**
 * O valor usado no filtro para "produto que ninguém classificou ainda".
 *
 * Existe porque, em 23/09, 11 dos 12 produtos ativos estavam sem grupo
 * preenchido. Sem esta opção, esses produtos simplesmente sumiriam de qualquer
 * filtro — e não haveria como achá-los para corrigir o cadastro. Ela só
 * aparece na lista quando existe produto assim.
 */
export const SEM_GRUPO = '__sem_grupo__';

/**
 * A lista de Grupo de Produto para os filtros, com a opção "Sem grupo" no fim
 * quando houver produto sem classificação.
 */
export function gruposDeProduto(
  doCadastro: readonly OpcaoFiltro[],
  temProdutoSemGrupo: boolean,
): OpcaoFiltro[] {
  const lista = [...doCadastro];
  if (temProdutoSemGrupo) {
    lista.push({ id: SEM_GRUPO, nome: 'Sem grupo definido' });
  }
  return lista;
}

/**
 * As pessoas que aparecem nos filtros de vendedor e de técnico.
 *
 * Vem de `profiles`, que todo mundo logado da loja consegue ler — de
 * propósito: se dependesse da tabela de papéis, um vendedor abriria o painel
 * com o filtro vazio, porque ler o papel dos outros exige permissão de
 * gerenciar usuários.
 *
 * Sem separar por papel: a loja tem gerente que vende e técnico que atende no
 * balcão, e uma lista que "adivinha" quem pode aparecer erra justamente nesses
 * casos.
 */
export function usePessoasDoFiltro() {
  return useQuery({
    queryKey: ['pessoas-do-filtro'],
    queryFn: async (): Promise<OpcaoFiltro[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome')
        .eq('ativo', true)
        .is('arquivado_em', null)
        .order('nome');
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, nome: p.nome }));
    },
    // A lista de gente da loja muda uma vez por mês, não a cada tela aberta.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Uma lista do cadastro de Listas do Sistema (`catalogos`), pelo tipo.
 *
 * Usada pelo filtro de equipamento da Assistência: são os TIPOS de aparelho
 * (Video game, Celular, Computador, Notebook…), não os modelos. O Felipe pediu
 * exatamente isso em 23/09 — a bancada recebe mais de cem aparelhos por
 * semana, e uma lista de modelos seria inutilizável.
 *
 * Item desativado continua na lista: ele some do cadastro novo, mas as OS
 * antigas que o usam precisam continuar filtráveis.
 */
export function useListaDoSistema(tipo: string) {
  return useQuery({
    queryKey: ['lista-do-sistema', tipo],
    queryFn: async (): Promise<OpcaoFiltro[]> => {
      const { data, error } = await supabase
        .from('catalogos')
        .select('id, descricao, ativo')
        .eq('tipo', tipo)
        .order('ordem', { ascending: true })
        .order('descricao', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id,
        nome: c.ativo ? c.descricao : `${c.descricao} (desativado)`,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
