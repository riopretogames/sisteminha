import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ehRecorrente } from '@/lib/tarefas';
import { mensagemLeiga } from '@/lib/tarefasMutacoes';
import type { DadosNovoQuadro, Quadro } from '@/types/tarefas';

/**
 * Os quadros de tarefas da loja ("Loja", "Assistência"...).
 *
 * Criar e arquivar quadro é estrutura: o banco só deixa quem tem
 * `tasks.manage` (Administrador, Gerente e Gerente Técnico de fábrica). A
 * tela esconde os botões de quem não tem; se algo passar, o aviso volta em
 * português.
 */

export const CHAVE_QUADROS = ['tarefas-quadros'] as const;

interface LinhaQuadro {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  ordem: number;
  arquivado_em: string | null;
  created_at: string;
  updated_at: string;
  /** As colunas ATIVAS, cada uma com a contagem das tarefas ativas dela. */
  tarefas_listas?: { id: string; tarefas?: { count: number }[] }[];
}

const COLUNAS_QUADRO = 'id, nome, descricao, cor, ordem, arquivado_em, created_at, updated_at';

/**
 * A consulta com a contagem ("6 colunas · 42 tarefas").
 *
 * As tarefas são contadas DENTRO de cada coluna ativa, e não direto no quadro
 * (achado 24 da revisão de 24/09): arquivar uma coluna diz "ela saiu do quadro
 * junto com as tarefas dela", mas a contagem direta continuava somando as
 * tarefas da coluna arquivada, e o cartão mostrava um número que o quadro
 * aberto não tinha. Contando pela coluna, o número bate com o quadro (lerQuadro,
 * em useQuadro, também esconde a tarefa de coluna arquivada).
 *
 * Os filtros de "não arquivada" vão em lerQuadros, um para a coluna
 * (`tarefas_listas.arquivada_em`) e outro para a tarefa dentro dela
 * (`tarefas_listas.tarefas.arquivada_em`).
 */
export const SELECT_QUADRO_COM_CONTAGEM = `${COLUNAS_QUADRO}, tarefas_listas(id, tarefas(count))`;

/** Colunas e tarefas ativas de um quadro, somadas coluna a coluna. Sem a contagem, fica sem número. */
export function contagemDoQuadro(linha: Pick<LinhaQuadro, 'tarefas_listas'>): {
  total_listas: number | undefined;
  total_tarefas: number | undefined;
} {
  const listas = linha.tarefas_listas;
  if (!Array.isArray(listas)) return { total_listas: undefined, total_tarefas: undefined };
  return {
    total_listas: listas.length,
    total_tarefas: listas.reduce((soma, l) => soma + (l.tarefas?.[0]?.count ?? 0), 0),
  };
}

async function lerQuadros(): Promise<Quadro[]> {
  // A contagem vem embutida na mesma consulta, contando só o que não foi
  // arquivado (ver SELECT_QUADRO_COM_CONTAGEM). Se o servidor recusar esse formato,
  // a lista de quadros aparece sem os números em vez de não aparecer — os
  // números são enfeite, o quadro é o que a pessoa veio buscar.
  const comContagem = await supabase
    .from('tarefas_quadros')
    .select(SELECT_QUADRO_COM_CONTAGEM)
    .is('arquivado_em', null)
    .is('tarefas_listas.arquivada_em', null)
    .is('tarefas_listas.tarefas.arquivada_em', null)
    .order('ordem')
    .order('nome');

  let linhas: LinhaQuadro[];
  if (comContagem.error) {
    const simples = await supabase
      .from('tarefas_quadros')
      .select(COLUNAS_QUADRO)
      .is('arquivado_em', null)
      .order('ordem')
      .order('nome');
    if (simples.error) throw simples.error;
    linhas = (simples.data ?? []) as unknown as LinhaQuadro[];
  } else {
    linhas = (comContagem.data ?? []) as unknown as LinhaQuadro[];
  }

  return linhas.map((q) => ({
    id: q.id,
    nome: q.nome,
    descricao: q.descricao,
    cor: q.cor,
    ordem: q.ordem,
    arquivado_em: q.arquivado_em,
    created_at: q.created_at,
    updated_at: q.updated_at,
    ...contagemDoQuadro(q),
  }));
}

export function useQuadros() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;

  const quadros = useQuery({ queryKey: CHAVE_QUADROS, queryFn: lerQuadros });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: CHAVE_QUADROS });

  const aoFalhar = (titulo: string) => (erro: unknown) =>
    toast({ title: titulo, description: mensagemLeiga(erro), variant: 'destructive' });

  /**
   * Cria o quadro com as listas e as tarefas do modelo escolhido.
   *
   * São três gravações em sequência (quadro → listas → tarefas), porque cada
   * uma precisa do id da anterior. Se as listas ou as tarefas falharem, o
   * quadro JÁ EXISTE: isso não é tratado como falha (a janela ficaria aberta
   * com "Criar quadro" ativo, convidando a criar um segundo igual). O id volta
   * normalmente, a tela abre o quadro, e o aviso diz o que faltou.
   */
  const criar = useMutation({
    mutationFn: async (dados: DadosNovoQuadro): Promise<{ id: string; faltou: string | null }> => {
      if (!tenantId) throw new Error('Usuário sem loja vinculada.');

      // O quadro é a única tabela do módulo sem gatilho que copie a loja de
      // um "pai" (ele é o pai de todos), por isso aqui a loja vai escrita.
      const maiorOrdem = Math.max(0, ...(quadros.data ?? []).map((q) => q.ordem));
      const { data: quadro, error: e1 } = await supabase
        .from('tarefas_quadros')
        .insert({
          tenant_id: tenantId,
          nome: dados.nome.trim(),
          descricao: dados.descricao?.trim() || null,
          cor: dados.cor ?? null,
          ordem: maiorOrdem + 1024,
          criado_por: user?.id ?? null,
        })
        .select('id')
        .single();
      if (e1) throw e1;

      try {
        await criarConteudoDoQuadro(quadro.id, dados);
      } catch (erro) {
        return { id: quadro.id, faltou: mensagemLeiga(erro) };
      }
      return { id: quadro.id, faltou: null };
    },
    onSuccess: ({ faltou }, dados) =>
      faltou
        ? toast({
            title: 'Quadro criado pela metade',
            description: `"${dados.nome.trim()}" foi criado, mas parte das colunas ou tarefas do modelo não entrou (${faltou}). Crie o que faltou dentro do quadro.`,
            variant: 'destructive',
          })
        : toast({
            title: 'Quadro criado',
            description: `"${dados.nome.trim()}" está pronto para a equipe usar.`,
            variant: 'success',
          }),
    onError: aoFalhar('Não foi possível criar o quadro'),
    onSettled: invalidar,
  });

  const renomear = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from('tarefas_quadros').update({ nome: nome.trim() }).eq('id', id);
      if (error) throw error;
    },
    onError: aoFalhar('Não foi possível renomear o quadro'),
    onSettled: () => {
      invalidar();
      queryClient.invalidateQueries({ queryKey: ['tarefas-quadro'] });
    },
  });

  /** Arquivar, nunca apagar por engano: o quadro some da tela e fica no banco. */
  const arquivar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tarefas_quadros')
        .update({ arquivado_em: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      toast({
        title: 'Quadro arquivado',
        description: 'Ele saiu da lista de quadros. Para trazer de volta, fale com o Felipe.',
        variant: 'success',
      }),
    onError: aoFalhar('Não foi possível arquivar o quadro'),
    onSettled: () => {
      invalidar();
      queryClient.invalidateQueries({ queryKey: ['minhas-tarefas'] });
    },
  });

  return {
    quadros,
    /**
     * Devolve o id do quadro criado — também quando ele foi criado pela
     * metade (o aviso diz o que faltou). Rejeita só quando o quadro nem
     * chegou a existir (o aviso já foi mostrado).
     */
    criarQuadro: (dados: DadosNovoQuadro) => criar.mutateAsync(dados).then((r) => r.id),
    renomearQuadro: (d: { id: string; nome: string }) =>
      renomear.mutateAsync(d).then(
        () => undefined,
        () => undefined,
      ),
    arquivarQuadro: (id: string) =>
      arquivar.mutateAsync(id).then(
        () => undefined,
        () => undefined,
      ),
    criando: criar.isPending,
  };
}

/** Listas e tarefas do modelo, depois que o quadro já existe. */
async function criarConteudoDoQuadro(quadroId: string, dados: DadosNovoQuadro) {
  if (dados.listas.length === 0) return;

  // A loja (tenant_id) não vai: o gatilho `lista_herda_do_quadro` copia do
  // quadro. O tipo gerado pede o campo porque ele é obrigatório na tabela —
  // o `as` só diz ao TypeScript que o banco preenche.
  const listas = dados.listas.map((l, i) => ({
    quadro_id: quadroId,
    nome: l.nome.trim(),
    cor: l.cor ?? null,
    responsavel_id: l.responsavel_id ?? null,
    ordem: (i + 1) * 1024,
  }));
  const { data: criadas, error: e2 } = await supabase
    .from('tarefas_listas')
    .insert(listas as TablesInsert<'tarefas_listas'>[])
    .select('id, ordem');
  if (e2) throw e2;

  // A ordem (única por lista) é o que liga a lista criada ao índice do
  // modelo — não confiar que o banco devolve na mesma ordem em que recebeu.
  const idPorOrdem = new Map((criadas ?? []).map((l) => [l.ordem, l.id]));
  const idDaLista = (indice: number) => idPorOrdem.get((indice + 1) * 1024);

  if (dados.tarefas.length === 0) return;

  // O período vem do modelo pelo NOME ("Manhã (7 às 11)") porque o id é de
  // cada loja. Se a loja renomeou ou apagou o turno, a tarefa entra sem
  // período em vez de travar a criação do quadro inteiro.
  const { data: periodos, error: e3 } = await supabase
    .from('catalogos')
    .select('id, descricao, padrao, ativo')
    .eq('tipo', 'tarefa_periodo');
  if (e3) throw e3;
  const periodoPorNome = new Map(
    (periodos ?? []).map((p) => [p.descricao.trim().toLowerCase(), p.id]),
  );
  // Tarefa do modelo sem turno ganha o turno padrão da loja ("Livre", de
  // fábrica) — o mesmo que o "+ Adicionar tarefa" usa. Sem isso, as tarefas
  // do modelo cairiam em "Sem período definido" em Minhas Tarefas e as
  // criadas à mão em "Livre", dois grupos para a mesma coisa.
  const periodoPadrao = (periodos ?? []).find((p) => p.padrao && p.ativo)?.id ?? null;

  const contagemPorLista = new Map<number, number>();
  const tarefas = dados.tarefas
    .filter((t) => idDaLista(t.lista))
    .map((t) => {
      const posicao = (contagemPorLista.get(t.lista) ?? 0) + 1;
      contagemPorLista.set(t.lista, posicao);
      const dias = t.dias_semana ?? [];
      // Recorrente não nasce "feita" (o banco recusa): o feito é de cada dia.
      const status = t.status === 'feito' && ehRecorrente({ dias_semana: dias }) ? 'nao_iniciado' : t.status;
      return {
        lista_id: idDaLista(t.lista)!,
        titulo: t.titulo.trim(),
        dias_semana: dias,
        prioridade: t.prioridade ?? 'normal',
        status: status ?? 'nao_iniciado',
        concluida_em: status === 'feito' ? new Date().toISOString() : null,
        periodo_id: t.periodo_descricao
          ? periodoPorNome.get(t.periodo_descricao.trim().toLowerCase()) ?? null
          : periodoPadrao,
        ordem: posicao * 1024,
      };
    });

  if (tarefas.length === 0) return;
  // quadro_id e tenant_id não vão: o gatilho `tarefa_herda_da_lista` copia da
  // lista, e assim um cartão nunca aponta para lista de outro quadro.
  const { error: e4 } = await supabase.from('tarefas').insert(tarefas as TablesInsert<'tarefas'>[]);
  if (e4) throw e4;
}
