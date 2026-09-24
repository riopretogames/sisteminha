import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TAREFA_PRIORIDADES } from '@/config/tarefas';
import { normalizarHorario } from '@/lib/tarefas';
import { mensagemLeiga } from '@/lib/tarefasMutacoes';
import type { ItemDeConferencia, TarefaPrioridade } from '@/types/tarefas';

/**
 * A aba Conferência: o que a equipe marcou como feito e o gerente ainda não
 * conferiu (v2, pedido do Felipe em 24/09: "que meu gerente vai lá e vai
 * conferir o que foi feito").
 *
 * Dois lugares guardam um feito, e os dois entram aqui:
 *
 *   - tarefa que se repete: uma linha por DIA em `tarefas_conclusoes` — o
 *     feito de segunda e o de terça são conferidos separados, e o de ontem que
 *     ninguém conferiu continua aqui até alguém conferir;
 *   - tarefa avulsa: a própria linha de `tarefas` (`concluida_em` preenchido,
 *     `conferida_em` vazio).
 *
 * Aprovar e devolver passam SEMPRE pela função `conferir_tarefa` do banco — é
 * a única porta: quem não tem `tasks.review` não se auto-confere nem pela API.
 *
 * `quadroId` presente = só aquele quadro (a aba dentro do quadro); ausente =
 * todos (a página Conferência do menu).
 */

/**
 * O feito do dia com a tarefa embutida. `concluida_por` vai como id puro: ele
 * aponta para a conta de acesso (auth.users), não para `profiles` — embutir o
 * cadastro ali faria o banco recusar a consulta. O nome vem de
 * usePessoasDaLoja na tela. De conclusões para tarefas há uma ligação só,
 * então o embed não precisa dizer qual.
 */
export const SELECT_CONCLUSAO_PENDENTE =
  'tarefa_id, dia, concluida_em, concluida_por, conferida_em, ' +
  'tarefa:tarefas(id, titulo, prioridade, dias_semana, horario, arquivada_em, quadro_id, lista_id, ' +
  'quadro:tarefas_quadros(nome, arquivado_em), lista:tarefas_listas(nome, cor, arquivada_em))';

/**
 * A tarefa avulsa concluída, com o endereço dela (quadro › coluna) e de quem
 * ela é. O banco não guarda quem concluiu a avulsa (só quando), então a aba
 * mostra o responsável: sem isso, numa coluna com nome de função ("Vendedor
 * sênior"), o gerente não saberia de quem é o feito.
 */
export const SELECT_AVULSA_PENDENTE =
  'id, titulo, prioridade, dias_semana, horario, concluida_em, conferida_em, arquivada_em, quadro_id, lista_id, ' +
  'tarefas_responsaveis(user_id), ' +
  'quadro:tarefas_quadros(nome, arquivado_em), lista:tarefas_listas(nome, cor, arquivada_em, responsavel_id)';

type Endereco = {
  quadro?: { nome: string; arquivado_em?: string | null } | null;
  lista?: { nome: string; cor: string | null; arquivada_em?: string | null; responsavel_id?: string | null } | null;
};

type TarefaDaConferencia = Endereco & {
  id: string;
  titulo: string;
  prioridade: string;
  dias_semana: number[] | null;
  horario: string | null;
  arquivada_em: string | null;
  quadro_id: string;
  lista_id: string;
};

type LinhaConclusao = {
  tarefa_id: string;
  dia: string;
  concluida_em: string;
  concluida_por: string | null;
  conferida_em: string | null;
  tarefa: TarefaDaConferencia | null;
};

type LinhaAvulsa = TarefaDaConferencia & {
  concluida_em: string | null;
  conferida_em: string | null;
  tarefas_responsaveis?: { user_id: string }[] | null;
};

/**
 * De quem é a avulsa: o primeiro responsável da tarefa (quem foi escalado
 * para ela) ou, sem nenhum, o dono da coluna — a "coluna do Pedro" é do
 * Pedro. É o que a aba mostra no lugar de "quem marcou".
 */
function responsavelDaAvulsa(a: LinhaAvulsa): string | null {
  return a.tarefas_responsaveis?.[0]?.user_id ?? a.lista?.responsavel_id ?? null;
}

export const chaveDaConferencia = (quadroId?: string) => ['conferencia', quadroId ?? 'todos'] as const;

/** Mesma tarefa, mesmo dia (null = avulsa): é o que identifica um item. */
export function mesmoItem(a: Pick<ItemDeConferencia, 'tarefa_id' | 'dia'>, b: Pick<ItemDeConferencia, 'tarefa_id' | 'dia'>) {
  return a.tarefa_id === b.tarefa_id && (a.dia ?? null) === (b.dia ?? null);
}

/**
 * Tarefa que saiu de circulação (arquivada, ou coluna/quadro arquivados) não
 * tem para onde voltar depois de conferida — some da conferência também.
 */
function emCirculacao(t: TarefaDaConferencia | null | undefined): t is TarefaDaConferencia {
  return Boolean(t && !t.arquivada_em && !t.quadro?.arquivado_em && !t.lista?.arquivada_em);
}

function prioridadeConhecida(p: string): TarefaPrioridade {
  return (p in TAREFA_PRIORIDADES ? p : 'normal') as TarefaPrioridade;
}

function montarItem(
  t: TarefaDaConferencia,
  feito: { dia: string | null; feita_por: string | null; feita_em: string },
): ItemDeConferencia {
  return {
    tarefa_id: t.id,
    dia: feito.dia,
    titulo: t.titulo,
    prioridade: prioridadeConhecida(t.prioridade),
    dias_semana: [...(t.dias_semana ?? [])].sort((a, b) => a - b),
    horario: normalizarHorario(t.horario),
    quadro_id: t.quadro_id,
    quadro_nome: t.quadro?.nome ?? '',
    lista_id: t.lista_id,
    lista_nome: t.lista?.nome ?? '',
    lista_cor: t.lista?.cor ?? null,
    feita_por: feito.feita_por,
    feita_em: feito.feita_em,
  };
}

/**
 * Junta as duas leituras numa lista só, a mais recente primeiro. Exportada
 * para teste: é aqui que mora a regra do que entra na aba.
 *
 * Os filtros do banco (não conferido, não arquivado, do quadro) são repetidos
 * aqui de propósito: custa nada, e a aba continua certa mesmo se uma consulta
 * vier mais larga do que devia.
 */
export function montarItensDeConferencia(
  conclusoes: LinhaConclusao[],
  avulsas: LinhaAvulsa[],
  quadroId?: string,
): ItemDeConferencia[] {
  const doQuadro = (t: TarefaDaConferencia) => !quadroId || t.quadro_id === quadroId;
  const itens: ItemDeConferencia[] = [];

  for (const c of conclusoes) {
    if (c.conferida_em || !emCirculacao(c.tarefa) || !doQuadro(c.tarefa)) continue;
    itens.push(montarItem(c.tarefa, { dia: c.dia, feita_por: c.concluida_por ?? null, feita_em: c.concluida_em }));
  }
  for (const a of avulsas) {
    // Avulsa só: recorrente com concluida_em é resto de antes da regra do
    // "feito do dia" e não é conferida por aqui.
    if ((a.dias_semana ?? []).length > 0) continue;
    if (!a.concluida_em || a.conferida_em || !emCirculacao(a) || !doQuadro(a)) continue;
    itens.push(montarItem(a, { dia: null, feita_por: responsavelDaAvulsa(a), feita_em: a.concluida_em }));
  }

  return itens.sort((x, y) => (x.feita_em < y.feita_em ? 1 : x.feita_em > y.feita_em ? -1 : 0));
}

async function lerConferencia(quadroId?: string): Promise<ItemDeConferencia[]> {
  let avulsas = supabase
    .from('tarefas')
    .select(SELECT_AVULSA_PENDENTE)
    .not('concluida_em', 'is', null)
    .is('conferida_em', null)
    .is('arquivada_em', null);
  if (quadroId) avulsas = avulsas.eq('quadro_id', quadroId);

  // Dentro de um quadro, o próprio banco filtra os feitos do dia pelo quadro
  // da tarefa: `!inner` faz o feito sem tarefa daquele quadro nem vir, em vez
  // de trazer a loja inteira e jogar fora aqui. De conclusões para tarefas há
  // uma ligação só (conferido no banco em 24/09), então não há ambiguidade.
  let conclusoes = supabase
    .from('tarefas_conclusoes')
    .select(quadroId ? SELECT_CONCLUSAO_PENDENTE.replace('tarefa:tarefas(', 'tarefa:tarefas!inner(') : SELECT_CONCLUSAO_PENDENTE)
    .is('conferida_em', null);
  if (quadroId) conclusoes = conclusoes.eq('tarefa.quadro_id', quadroId);

  const [c, a] = await Promise.all([
    conclusoes.order('concluida_em', { ascending: false }),
    avulsas.order('concluida_em', { ascending: false }),
  ]);
  if (c.error) throw c.error;
  if (a.error) throw a.error;

  return montarItensDeConferencia(
    (c.data ?? []) as unknown as LinhaConclusao[],
    (a.data ?? []) as unknown as LinhaAvulsa[],
    quadroId,
  );
}

export function useConferencia(quadroId?: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const chave = chaveDaConferencia(quadroId);

  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => lerConferencia(quadroId),
    // A equipe marca feito o dia inteiro; o gerente deixa a aba aberta.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const conferir = useMutation({
    mutationFn: async (d: { item: ItemDeConferencia; aprovada: boolean }) => {
      const { error } = await supabase.rpc('conferir_tarefa', {
        _tarefa_id: d.item.tarefa_id,
        // Nulo = tarefa avulsa. O tipo gerado diz `string` porque o gerador
        // não sabe que a função aceita nulo; ela aceita (ver a migration
        // 20260924100000, "_dia nulo = tarefa avulsa").
        _dia: d.item.dia as string,
        _aprovada: d.aprovada,
      });
      if (error) throw error;
    },
    onMutate: async (d) => {
      // O item sai da aba na hora, em TODAS as listas abertas (a do quadro e
      // a geral mostram o mesmo item). Guarda cada uma para voltar se falhar.
      await qc.cancelQueries({ queryKey: ['conferencia'] });
      const antes = qc.getQueriesData<ItemDeConferencia[]>({ queryKey: ['conferencia'] });
      qc.setQueriesData<ItemDeConferencia[]>({ queryKey: ['conferencia'] }, (lista) =>
        lista?.filter((i) => !mesmoItem(i, d.item)),
      );
      return { antes };
    },
    onError: (erro, d, ctx) => {
      // Volta só o item recusado, por cima de como a lista está AGORA: se o
      // gerente aprovou outro logo em seguida e esse deu certo, ele não pode
      // reaparecer (mesmo cuidado de desfazerSo em useQuadro).
      for (const [k, lista] of ctx?.antes ?? []) {
        const doItem = lista?.find((i) => mesmoItem(i, d.item));
        if (!doItem) continue;
        qc.setQueryData<ItemDeConferencia[]>(k as QueryKey, (atual) =>
          atual && !atual.some((i) => mesmoItem(i, d.item))
            ? [...atual, doItem].sort((x, y) => (x.feita_em < y.feita_em ? 1 : x.feita_em > y.feita_em ? -1 : 0))
            : atual,
        );
      }
      toast({
        title: d.aprovada ? 'Não foi possível conferir' : 'Não foi possível devolver',
        description: mensagemLeiga(erro),
        variant: 'destructive',
      });
    },
    onSuccess: (_r, d) => {
      // Aprovar tira o item da lista sem pergunta (é o clique mais comum da
      // aba). O aviso diz QUAL foi, para um clique na linha errada não passar
      // em branco. Ainda não há "desfazer": a função do banco só sabe aprovar
      // ou devolver, e devolver apaga o feito da pessoa.
      if (d.aprovada) {
        toast({ title: `"${d.item.titulo}" conferida`, description: 'Voltou ao quadro como feita.' });
      }
    },
    onSettled: () => {
      // Aprovar devolve o cartão ao quadro (feito, com o selo); devolver faz a
      // tarefa voltar pendente para a pessoa — quadro e Minhas Tarefas mudam.
      qc.invalidateQueries({ queryKey: ['conferencia'] });
      qc.invalidateQueries({ queryKey: ['tarefas-quadro'] });
      qc.invalidateQueries({ queryKey: ['minhas-tarefas'] });
    },
  });

  const { mutateAsync } = conferir;
  /** Nunca rejeita: o erro já virou aviso e o item já voltou para a lista. */
  const aprovar = useCallback(
    async (item: ItemDeConferencia) => {
      await mutateAsync({ item, aprovada: true }).catch(() => undefined);
    },
    [mutateAsync],
  );
  const devolver = useCallback(
    async (item: ItemDeConferencia) => {
      await mutateAsync({ item, aprovada: false }).catch(() => undefined);
    },
    [mutateAsync],
  );

  return {
    itens: consulta.data ?? [],
    carregando: consulta.isLoading,
    erro: consulta.error,
    /** Tenta ler de novo (botão "Tentar de novo" do aviso de erro). */
    recarregar: consulta.refetch,
    aprovar,
    devolver,
  };
}
