import { createElement, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import { ToastAction, type ToastActionElement } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import type { CatalogoItem } from '@/hooks/useCatalogos';
import { hojeISO } from '@/lib/format';
import {
  montarTarefa,
  ordemEntre,
  ordenarPorOrdem,
  precisaRenumerar,
  renumerar,
  type LinhaTarefaDoBanco,
} from '@/lib/tarefas';
import {
  camposAoMudarFrequencia,
  mensagemLeiga,
  planoDeAlternarFeito,
  planoDeStatus,
  type PlanoDeStatus,
} from '@/lib/tarefasMutacoes';
import type {
  AcoesDoQuadro,
  Comentario,
  Etiqueta,
  ItemChecklist,
  Lista,
  Pessoa,
  Quadro,
  Tarefa,
  TarefaStatus,
} from '@/types/tarefas';

export { montarTarefa };

/**
 * Um quadro inteiro — listas, tarefas e tudo que se faz com elas.
 *
 * As visões (Kanban e Tabela) e a ficha da tarefa NÃO falam com o banco:
 * recebem os dados e as `acoes` daqui. Assim a regra de cada ação existe uma
 * vez só, e as duas visões nunca discordam sobre o que "mover" ou "feito"
 * significa.
 *
 * Tudo que a pessoa vê na hora (arrastar, marcar feito, trocar status) é
 * OTIMISTA: a tela muda antes de o banco responder, porque arrastar um cartão
 * e vê-lo voltar meio segundo depois para então pular de novo parece
 * defeito. Se o banco recusar, a tela volta ao que era e um aviso explica.
 *
 * Várias pessoas mexem no mesmo quadro ao longo do dia, por isso ele se
 * recarrega sozinho a cada 30 segundos e ao voltar para a aba.
 */

/**
 * Colunas + embeds de uma tarefa. Também usado por useMinhasTarefas.
 *
 * O turno PRECISA dizer por qual ligação ir (`!tarefas_periodo_id_fkey`):
 * `tarefas` chega em `catalogos` por dois caminhos — a coluna periodo_id e as
 * etiquetas (tarefas_etiquetas). Sem a indicação, o banco não escolhe e recusa
 * a consulta inteira (erro PGRST201), e nenhum quadro abre. O teste de
 * contrato em lib/tarefas.test.ts prende isso, porque o dublê de teste ignora
 * o texto do select e não pegaria de novo.
 */
export const SELECT_TAREFA =
  'id, quadro_id, lista_id, titulo, descricao, prioridade, status, dias_semana, periodo_id, prazo, ' +
  'concluida_em, ordem, arquivada_em, criado_por, created_at, updated_at, ' +
  'periodo:catalogos!tarefas_periodo_id_fkey(id, descricao), ' +
  'tarefas_responsaveis(user_id, profiles(id, nome, avatar_url)), ' +
  'tarefas_etiquetas(catalogo_id, catalogos(id, descricao, cor)), ' +
  'tarefas_checklist(feito), ' +
  'tarefas_comentarios(id)';

export interface DadosDoQuadro {
  quadro: Quadro | null;
  listas: Lista[];
  tarefas: Tarefa[];
}

export const chaveDoQuadro = (quadroId: string | undefined) => ['tarefas-quadro', quadroId] as const;

/** Ids das tarefas com o feito de hoje gravado. */
export async function lerFeitasHoje(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('tarefas_conclusoes')
    .select('tarefa_id')
    .eq('dia', hojeISO());
  if (error) throw error;
  return new Set((data ?? []).map((c) => c.tarefa_id));
}

async function lerQuadro(quadroId: string): Promise<DadosDoQuadro> {
  const [q, l, t, feitasHoje] = await Promise.all([
    supabase
      .from('tarefas_quadros')
      .select('id, nome, descricao, cor, ordem, arquivado_em, created_at, updated_at')
      .eq('id', quadroId)
      .maybeSingle(),
    supabase
      .from('tarefas_listas')
      .select('id, quadro_id, nome, cor, responsavel_id, ordem, arquivada_em, responsavel:profiles(id, nome, avatar_url)')
      .eq('quadro_id', quadroId)
      .is('arquivada_em', null)
      .order('ordem'),
    supabase
      .from('tarefas')
      .select(SELECT_TAREFA)
      .eq('quadro_id', quadroId)
      .is('arquivada_em', null)
      .order('ordem'),
    lerFeitasHoje(),
  ]);
  if (q.error) throw q.error;
  if (l.error) throw l.error;
  if (t.error) throw t.error;

  const listas = ((l.data ?? []) as unknown as Lista[]).map((x) => ({
    ...x,
    responsavel: x.responsavel ?? null,
  }));
  // Tarefa de lista arquivada some junto com a lista: ela não tem coluna
  // onde aparecer, e na Tabela viraria uma linha sem grupo.
  const listasAtivas = new Set(listas.map((x) => x.id));
  const tarefas = ((t.data ?? []) as unknown as LinhaTarefaDoBanco[])
    .filter((linha) => listasAtivas.has(linha.lista_id))
    .map((linha) => montarTarefa(linha, feitasHoje));

  return {
    quadro: (q.data as Quadro | null) ?? null,
    listas: ordenarPorOrdem(listas),
    tarefas: ordenarPorOrdem(tarefas),
  };
}

/**
 * Grava um plano de status (ver lib/tarefasMutacoes). Compartilhado com
 * Minhas Tarefas, para as duas telas gravarem o "feito" do mesmo jeito.
 *
 * A conclusão vai SEM `tenant_id` e SEM `concluida_por`: o gatilho copia a
 * loja da tarefa e o banco carimba quem está logado. Deixar a tela mandar
 * `concluida_por` seria deixar alguém marcar feito em nome de outro.
 */
export async function gravarPlanoDeStatus(tarefaId: string, plano: PlanoDeStatus): Promise<void> {
  if (plano.linha) {
    const { error } = await supabase.from('tarefas').update(plano.linha).eq('id', tarefaId);
    if (error) throw error;
  }
  if (plano.conclusaoDeHoje === 'gravar') {
    const { error } = await supabase
      .from('tarefas_conclusoes')
      .insert({ tarefa_id: tarefaId, dia: hojeISO() } as TablesInsert<'tarefas_conclusoes'>);
    // Já gravado (outra pessoa marcou no mesmo minuto, ou clique duplo): o
    // resultado é o que a pessoa queria, então não é erro para ela.
    if (error && error.code !== '23505') throw error;
  } else if (plano.conclusaoDeHoje === 'apagar') {
    const { error } = await supabase
      .from('tarefas_conclusoes')
      .delete()
      .eq('tarefa_id', tarefaId)
      .eq('dia', hojeISO());
    if (error) throw error;
  }
}

/** Pessoas conhecidas no cache (cadastro + quem já aparece no quadro). */
function pessoasConhecidas(qc: ReturnType<typeof useQueryClient>, dados: DadosDoQuadro): Map<string, Pessoa> {
  const mapa = new Map<string, Pessoa>();
  for (const t of dados.tarefas) for (const p of t.responsaveis) mapa.set(p.id, p);
  for (const l of dados.listas) if (l.responsavel) mapa.set(l.responsavel.id, l.responsavel);
  for (const p of qc.getQueryData<Pessoa[]>(['pessoas-da-loja']) ?? []) mapa.set(p.id, p);
  return mapa;
}

/** Itens de um catálogo que a tela já carregou (useCatalogo). */
function catalogoEmCache(qc: ReturnType<typeof useQueryClient>, tipo: string): CatalogoItem[] {
  return qc.getQueryData<CatalogoItem[]>(['catalogos', tipo]) ?? [];
}

/**
 * Desfaz na tela SÓ o que uma ação mexeu, por cima do quadro como ele está
 * AGORA — e não voltando a foto inteira de antes.
 *
 * Por quê: a pessoa marca a tarefa A e, meio segundo depois, a B. Se só a A
 * falhar, voltar a foto de antes da A apagaria da tela a B, que deu certo. E
 * se as duas falharem, a foto que a B guardou já tinha a A marcada: a A
 * ficaria marcada na tela apesar de recusada. Comparando a foto de antes com
 * o resultado otimista, dá para saber exatamente quais tarefas e listas a
 * ação tocou (as intocadas continuam sendo o mesmo objeto) e devolver só elas.
 */
function mexidas<T extends { id: string }>(antes: T[], depois: T[]) {
  const porIdAntes = new Map(antes.map((x) => [x.id, x]));
  const porIdDepois = new Map(depois.map((x) => [x.id, x]));
  const ids = new Set<string>();
  for (const [id, x] of porIdAntes) if (porIdDepois.get(id) !== x) ids.add(id);
  for (const id of porIdDepois.keys()) if (!porIdAntes.has(id)) ids.add(id);
  return { ids, porIdAntes };
}

function devolver<T extends { id: string; ordem: number }>(
  atual: T[],
  { ids, porIdAntes }: { ids: Set<string>; porIdAntes: Map<string, T> },
): T[] {
  if (ids.size === 0) return atual;
  const intocadas = atual.filter((x) => !ids.has(x.id));
  const deVolta = [...ids].map((id) => porIdAntes.get(id)).filter((x): x is T => Boolean(x));
  return ordenarPorOrdem([...intocadas, ...deVolta]);
}

export function desfazerSo(atual: DadosDoQuadro, antes: DadosDoQuadro, depois: DadosDoQuadro): DadosDoQuadro {
  return {
    ...atual,
    tarefas: devolver(atual.tarefas, mexidas(antes.tarefas, depois.tarefas)),
    listas: devolver(atual.listas, mexidas(antes.listas, depois.listas)),
  };
}

/**
 * Uma ação do quadro: mutação com atualização otimista, volta atrás em erro,
 * aviso leigo e recarga no fim. A promessa devolvida NUNCA rejeita — o erro
 * já virou aviso e a tela já voltou ao que era (contrato de AcoesDoQuadro).
 * Ela resolve `true` quando gravou e `false` quando o banco recusou, para quem
 * precisa saber (a caixa de "Adicionar tarefa" só limpa se deu certo).
 */
function useAcaoDoQuadro<V>(
  chave: QueryKey,
  cfg: {
    executar: (v: V) => Promise<void>;
    otimista?: (dados: DadosDoQuadro, v: V) => DadosDoQuadro;
    tituloDoErro: string;
    aoConcluir?: (v: V) => void;
  },
) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const m = useMutation({
    mutationFn: cfg.executar,
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: chave });
      const antes = qc.getQueryData<DadosDoQuadro>(chave);
      if (!antes || !cfg.otimista) return { antes: undefined, depois: undefined };
      const depois = cfg.otimista(antes, v);
      qc.setQueryData<DadosDoQuadro>(chave, depois);
      return { antes, depois };
    },
    onError: (erro, _v, ctx) => {
      if (ctx?.antes && ctx.depois) {
        const { antes, depois } = ctx;
        qc.setQueryData<DadosDoQuadro>(chave, (atual) => (atual ? desfazerSo(atual, antes, depois) : antes));
      }
      toast({ title: cfg.tituloDoErro, description: mensagemLeiga(erro), variant: 'destructive' });
    },
    onSuccess: (_r, v) => cfg.aoConcluir?.(v),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: chave });
      // Minhas Tarefas e a contagem da lista de quadros mostram o mesmo dado.
      qc.invalidateQueries({ queryKey: ['minhas-tarefas'] });
      qc.invalidateQueries({ queryKey: ['tarefas-quadros'] });
    },
  });

  const { mutateAsync } = m;
  return useCallback(
    (v: V): Promise<boolean> =>
      mutateAsync(v).then(
        () => true,
        () => false,
      ),
    [mutateAsync],
  );
}

function trocarTarefa(dados: DadosDoQuadro, id: string, mudar: (t: Tarefa) => Tarefa): DadosDoQuadro {
  return { ...dados, tarefas: dados.tarefas.map((t) => (t.id === id ? mudar(t) : t)) };
}

function trocarLista(dados: DadosDoQuadro, id: string, mudar: (l: Lista) => Lista): DadosDoQuadro {
  return { ...dados, listas: dados.listas.map((l) => (l.id === id ? mudar(l) : l)) };
}

/** Grava as posições 1024, 2048... de uma coluna inteira (raro; ver precisaRenumerar). */
async function gravarRenumeracao(tabela: 'tarefas' | 'tarefas_listas', ids: string[]) {
  const resultados = await Promise.all(
    renumerar(ids).map(({ id, ordem }) => supabase.from(tabela).update({ ordem }).eq('id', id)),
  );
  const falha = resultados.find((r) => r.error);
  if (falha?.error) throw falha.error;
}

export function useQuadro(quadroId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const chave = chaveDoQuadro(quadroId);

  const consulta = useQuery({
    queryKey: chave,
    enabled: Boolean(quadroId),
    queryFn: () => lerQuadro(quadroId!),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  /** O estado atual do cache — lido na hora da ação, não no render. */
  const dadosAgora = useCallback(
    (): DadosDoQuadro => qc.getQueryData<DadosDoQuadro>(chave) ?? { quadro: null, listas: [], tarefas: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, quadroId],
  );

  /* ── Tarefas ─────────────────────────────────────────────────────────────── */

  const criarTarefa = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível criar a tarefa',
    executar: async (d: Parameters<AcoesDoQuadro['criarTarefa']>[0]) => {
      const dados = dadosAgora();
      const daLista = dados.tarefas.filter((t) => t.lista_id === d.lista_id);
      const ultima = ordenarPorOrdem(daLista).slice(-1)[0];

      // Período não informado = o padrão da loja ("Livre", de fábrica).
      // Regra das listas editáveis: catálogo com padrão pré-seleciona em
      // cadastro novo — senão toda tarefa criada pelo "+ Adicionar" nasceria
      // sem turno e o agrupamento de Minhas Tarefas ficaria torto.
      let periodoId = d.periodo_id;
      if (periodoId === undefined) {
        const emCache = catalogoEmCache(qc, 'tarefa_periodo').find((p) => p.padrao && p.ativo);
        if (emCache) periodoId = emCache.id;
        else {
          const { data } = await supabase
            .from('catalogos')
            .select('id')
            .eq('tipo', 'tarefa_periodo')
            .eq('padrao', true)
            .eq('ativo', true)
            .maybeSingle();
          periodoId = data?.id ?? null;
        }
      }

      // Sem quadro_id e tenant_id: o gatilho `tarefa_herda_da_lista` copia
      // da lista. O `as` só avisa o TypeScript de que o banco preenche.
      const { data: nova, error } = await supabase
        .from('tarefas')
        .insert({
          lista_id: d.lista_id,
          titulo: d.titulo.trim(),
          dias_semana: d.dias_semana ?? [],
          prioridade: d.prioridade ?? 'normal',
          periodo_id: periodoId,
          ordem: ordemEntre(ultima?.ordem, undefined),
        } as TablesInsert<'tarefas'>)
        .select('id')
        .single();
      if (error) throw error;

      // A "coluna do Pedro": tarefa criada nela já nasce com o Pedro.
      let responsaveis = d.responsaveis ?? [];
      if (responsaveis.length === 0) {
        const lista = dados.listas.find((l) => l.id === d.lista_id);
        if (lista?.responsavel_id) responsaveis = [lista.responsavel_id];
      }
      if (responsaveis.length > 0) {
        const { error: e2 } = await supabase
          .from('tarefas_responsaveis')
          .insert(
            responsaveis.map((user_id) => ({ tarefa_id: nova.id, user_id })) as TablesInsert<'tarefas_responsaveis'>[],
          );
        // A tarefa JÁ EXISTE a esta altura. Tratar como falha ("não foi
        // possível criar") deixaria o título na caixa, e o próximo Enter
        // criaria uma segunda tarefa igual. Então conta como criada, com um
        // aviso próprio do que faltou.
        if (e2) {
          toast({
            title: 'Tarefa criada, mas sem responsável',
            description: `Não deu para pôr o responsável da coluna (${mensagemLeiga(e2)}). Abra a ficha e escolha quem faz.`,
            variant: 'destructive',
          });
        }
      }
    },
  });

  const atualizarTarefa = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível salvar a tarefa',
    otimista: (dados, d: Parameters<AcoesDoQuadro['atualizarTarefa']>[0] & { extras?: object }) => {
      const { id, extras, ...campos } = d;
      const periodo =
        'periodo_id' in campos
          ? (() => {
              const item = catalogoEmCache(qc, 'tarefa_periodo').find((p) => p.id === campos.periodo_id);
              return item ? { id: item.id, descricao: item.descricao } : null;
            })()
          : undefined;
      return trocarTarefa(dados, id, (t) => ({
        ...t,
        ...campos,
        ...(extras ?? {}),
        ...(periodo !== undefined ? { periodo } : {}),
        ...(campos.dias_semana ? { dias_semana: [...campos.dias_semana].sort((a, b) => a - b) } : {}),
      }));
    },
    executar: async (d) => {
      const { id, extras, ...campos } = d;
      const linha = { ...campos, ...(extras ?? {}) };
      if (typeof linha.titulo === 'string') linha.titulo = linha.titulo.trim();
      const { error } = await supabase.from('tarefas').update(linha).eq('id', id);
      if (error) throw error;
    },
  });

  const moverTarefa = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível mover a tarefa',
    otimista: (dados, d: Parameters<AcoesDoQuadro['moverTarefa']>[0]) =>
      trocarTarefa(dados, d.id, (t) => ({ ...t, lista_id: d.lista_id, ordem: d.ordem })),
    executar: async (d) => {
      const { error } = await supabase
        .from('tarefas')
        .update({ lista_id: d.lista_id, ordem: d.ordem })
        .eq('id', d.id);
      if (error) throw error;

      // Lido depois da atualização otimista: é a coluna como ficou.
      const destino = ordenarPorOrdem(dadosAgora().tarefas.filter((t) => t.lista_id === d.lista_id));
      if (precisaRenumerar(destino.map((t) => t.ordem))) {
        await gravarRenumeracao('tarefas', destino.map((t) => t.id));
      }
    },
  });

  const aplicarPlano = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível marcar o andamento',
    otimista: (dados, d: { id: string; plano: PlanoDeStatus }) =>
      trocarTarefa(dados, d.id, (t) => ({ ...t, ...d.plano.otimista })),
    executar: (d) => gravarPlanoDeStatus(d.id, d.plano),
  });

  /**
   * Aviso de arquivado com o botão "Desfazer". Ainda não existe tela de
   * arquivados: sem este botão, quem arquivou sem querer (às vezes a coluna
   * inteira) não teria como trazer de volta sozinho.
   */
  const avisarArquivado = (titulo: string, descricao: string, desfazer: () => void) =>
    toast({
      title: titulo,
      description: descricao,
      variant: 'success',
      duration: 10_000,
      action: createElement(
        ToastAction,
        { altText: 'Desfazer o arquivamento', onClick: desfazer },
        'Desfazer',
      ) as unknown as ToastActionElement,
    });

  const desarquivarTarefa = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível trazer a tarefa de volta',
    executar: async (id: string) => {
      const { error } = await supabase.from('tarefas').update({ arquivada_em: null }).eq('id', id);
      if (error) throw error;
    },
  });

  const arquivarTarefa = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível arquivar a tarefa',
    otimista: (dados, id: string) => ({ ...dados, tarefas: dados.tarefas.filter((t) => t.id !== id) }),
    executar: async (id) => {
      const { error } = await supabase
        .from('tarefas')
        .update({ arquivada_em: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    aoConcluir: (id) =>
      avisarArquivado('Tarefa arquivada', 'Ela saiu do quadro e de Minhas Tarefas.', () => void desarquivarTarefa(id)),
  });

  const trocarResponsaveis = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível trocar as pessoas da tarefa',
    otimista: (dados, d: { id: string; ids: string[]; entram: string[]; saem: string[] }) => {
      const conhecidas = pessoasConhecidas(qc, dados);
      const pessoas = d.ids
        .map((uid) => conhecidas.get(uid))
        .filter((p): p is Pessoa => Boolean(p))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return trocarTarefa(dados, d.id, (t) => ({ ...t, responsaveis: pessoas }));
    },
    executar: async (d) => {
      if (d.saem.length > 0) {
        const { error } = await supabase
          .from('tarefas_responsaveis')
          .delete()
          .eq('tarefa_id', d.id)
          .in('user_id', d.saem);
        if (error) throw error;
      }
      if (d.entram.length > 0) {
        const { error } = await supabase
          .from('tarefas_responsaveis')
          .insert(d.entram.map((user_id) => ({ tarefa_id: d.id, user_id })) as TablesInsert<'tarefas_responsaveis'>[]);
        if (error) throw error;
      }
    },
  });

  const trocarEtiquetas = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível trocar as etiquetas',
    otimista: (dados, d: { id: string; ids: string[]; entram: string[]; saem: string[] }) => {
      const conhecidas = new Map<string, Etiqueta>();
      for (const t of dados.tarefas) for (const e of t.etiquetas) conhecidas.set(e.id, e);
      for (const c of catalogoEmCache(qc, 'tarefa_etiqueta')) {
        conhecidas.set(c.id, { id: c.id, descricao: c.descricao, cor: c.cor });
      }
      const etiquetas = d.ids.map((cid) => conhecidas.get(cid)).filter((e): e is Etiqueta => Boolean(e));
      return trocarTarefa(dados, d.id, (t) => ({ ...t, etiquetas }));
    },
    executar: async (d) => {
      if (d.saem.length > 0) {
        const { error } = await supabase
          .from('tarefas_etiquetas')
          .delete()
          .eq('tarefa_id', d.id)
          .in('catalogo_id', d.saem);
        if (error) throw error;
      }
      if (d.entram.length > 0) {
        const { error } = await supabase
          .from('tarefas_etiquetas')
          .insert(
            d.entram.map((catalogo_id) => ({ tarefa_id: d.id, catalogo_id })) as TablesInsert<'tarefas_etiquetas'>[],
          );
        if (error) throw error;
      }
    },
  });

  /* ── Listas ──────────────────────────────────────────────────────────────── */

  const criarLista = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível criar a coluna',
    executar: async (d: Parameters<AcoesDoQuadro['criarLista']>[0]) => {
      if (!quadroId) throw new Error('Quadro não encontrado.');
      const ultima = ordenarPorOrdem(dadosAgora().listas).slice(-1)[0];
      // tenant_id não vai: o gatilho `lista_herda_do_quadro` copia do quadro.
      const { error } = await supabase.from('tarefas_listas').insert({
        quadro_id: quadroId,
        nome: d.nome.trim(),
        cor: d.cor ?? null,
        responsavel_id: d.responsavel_id ?? null,
        ordem: ordemEntre(ultima?.ordem, undefined),
      } as TablesInsert<'tarefas_listas'>);
      if (error) throw error;
    },
  });

  const atualizarLista = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível salvar a coluna',
    otimista: (dados, d: Parameters<AcoesDoQuadro['atualizarLista']>[0]) => {
      const { id, ...campos } = d;
      const responsavel =
        'responsavel_id' in campos
          ? campos.responsavel_id
            ? pessoasConhecidas(qc, dados).get(campos.responsavel_id) ?? null
            : null
          : undefined;
      return trocarLista(dados, id, (l) => ({
        ...l,
        ...campos,
        ...(responsavel !== undefined ? { responsavel } : {}),
      }));
    },
    executar: async (d) => {
      const { id, ...campos } = d;
      if (typeof campos.nome === 'string') campos.nome = campos.nome.trim();
      const { error } = await supabase.from('tarefas_listas').update(campos).eq('id', id);
      if (error) throw error;
    },
  });

  const moverLista = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível mover a coluna',
    otimista: (dados, d: Parameters<AcoesDoQuadro['moverLista']>[0]) => ({
      ...dados,
      listas: ordenarPorOrdem(dados.listas.map((l) => (l.id === d.id ? { ...l, ordem: d.ordem } : l))),
    }),
    executar: async (d) => {
      const { error } = await supabase.from('tarefas_listas').update({ ordem: d.ordem }).eq('id', d.id);
      if (error) throw error;
      const listas = ordenarPorOrdem(dadosAgora().listas);
      if (precisaRenumerar(listas.map((l) => l.ordem))) {
        await gravarRenumeracao('tarefas_listas', listas.map((l) => l.id));
      }
    },
  });

  const desarquivarLista = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível trazer a coluna de volta',
    executar: async (id: string) => {
      const { error } = await supabase.from('tarefas_listas').update({ arquivada_em: null }).eq('id', id);
      if (error) throw error;
    },
  });

  /**
   * A lista e as tarefas dela saem da tela; no banco, só a lista é marcada.
   * Por isso o "Desfazer" traz a coluna de volta com todas as tarefas.
   */
  const arquivarLista = useAcaoDoQuadro(chave, {
    tituloDoErro: 'Não foi possível arquivar a coluna',
    aoConcluir: (id: string) =>
      avisarArquivado('Coluna arquivada', 'Ela saiu do quadro junto com as tarefas dela.', () => void desarquivarLista(id)),
    otimista: (dados, id: string) => ({
      ...dados,
      listas: dados.listas.filter((l) => l.id !== id),
      tarefas: dados.tarefas.filter((t) => t.lista_id !== id),
    }),
    executar: async (id) => {
      const { error } = await supabase
        .from('tarefas_listas')
        .update({ arquivada_em: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
  });

  /* ── O contrato que as visões recebem ────────────────────────────────────── */

  const acoes: AcoesDoQuadro = useMemo(() => {
    const tarefa = (id: string) => dadosAgora().tarefas.find((t) => t.id === id);
    const agora = () => new Date().toISOString();
    // Só `criarTarefa` e `criarLista` contam ao chamador se gravaram (a caixa
    // onde se digitou só se esvazia quando deu certo); as outras já mostram o
    // resultado na própria tela (o cartão volta ao lugar se falhar).
    const semResultado =
      <V,>(acao: (v: V) => Promise<boolean>) =>
      async (v: V): Promise<void> => {
        await acao(v);
      };

    return {
      criarTarefa,
      atualizarTarefa: async (d) => {
        const t = tarefa(d.id);
        const extras = t && d.dias_semana ? camposAoMudarFrequencia(t, d.dias_semana) : {};
        await atualizarTarefa({ ...d, extras });
      },
      moverTarefa: semResultado(moverTarefa),
      definirStatus: async ({ id, status }: { id: string; status: TarefaStatus }) => {
        const t = tarefa(id);
        if (!t) return;
        const plano = planoDeStatus(t, status, agora());
        if (!plano.linha && !plano.conclusaoDeHoje) return;
        await aplicarPlano({ id, plano });
      },
      alternarFeito: async (id: string) => {
        const t = tarefa(id);
        if (!t) return;
        await aplicarPlano({ id, plano: planoDeAlternarFeito(t, agora()) });
      },
      arquivarTarefa: semResultado(arquivarTarefa),
      // A diferença (quem entra, quem sai) é calculada ANTES da atualização
      // otimista: depois dela o cache já mostra o estado novo e a conta daria
      // "ninguém mudou".
      definirResponsaveis: async ({ id, user_ids }) => {
        const antes = new Set(tarefa(id)?.responsaveis.map((p) => p.id) ?? []);
        const depois = new Set(user_ids);
        await trocarResponsaveis({
          id,
          ids: [...depois],
          entram: [...depois].filter((x) => !antes.has(x)),
          saem: [...antes].filter((x) => !depois.has(x)),
        });
      },
      definirEtiquetas: async ({ id, catalogo_ids }) => {
        const antes = new Set(tarefa(id)?.etiquetas.map((e) => e.id) ?? []);
        const depois = new Set(catalogo_ids);
        await trocarEtiquetas({
          id,
          ids: [...depois],
          entram: [...depois].filter((x) => !antes.has(x)),
          saem: [...antes].filter((x) => !depois.has(x)),
        });
      },
      criarLista,
      atualizarLista: semResultado(atualizarLista),
      moverLista: semResultado(moverLista),
      arquivarLista: semResultado(arquivarLista),
    };
  }, [
    dadosAgora,
    criarTarefa,
    atualizarTarefa,
    moverTarefa,
    aplicarPlano,
    arquivarTarefa,
    trocarResponsaveis,
    trocarEtiquetas,
    criarLista,
    atualizarLista,
    moverLista,
    arquivarLista,
  ]);

  return {
    quadro: consulta.data?.quadro ?? null,
    listas: consulta.data?.listas ?? [],
    tarefas: consulta.data?.tarefas ?? [],
    carregando: consulta.isLoading,
    erro: consulta.error,
    acoes,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Ficha da tarefa: checklist e comentários                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

interface DadosDoDetalhe {
  checklist: ItemChecklist[];
  comentarios: Comentario[];
}

export function useTarefaDetalhe(tarefaId: string | null) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const chave = ['tarefa-detalhe', tarefaId] as const;

  const consulta = useQuery({
    queryKey: chave,
    enabled: Boolean(tarefaId),
    queryFn: async (): Promise<DadosDoDetalhe> => {
      const [c, m] = await Promise.all([
        supabase
          .from('tarefas_checklist')
          .select('id, tarefa_id, titulo, feito, ordem')
          .eq('tarefa_id', tarefaId!)
          .order('ordem'),
        supabase
          .from('tarefas_comentarios')
          .select('id, tarefa_id, autor_id, texto, created_at')
          .eq('tarefa_id', tarefaId!)
          .order('created_at'),
      ]);
      if (c.error) throw c.error;
      if (m.error) throw m.error;

      // O autor do comentário aponta para a conta de acesso (auth.users), não
      // para o cadastro de pessoas — não há ligação direta que a consulta
      // possa seguir. Então o nome e a foto vêm numa segunda leitura.
      const autorIds = [...new Set((m.data ?? []).map((x) => x.autor_id))];
      let autores = new Map<string, Pessoa>();
      if (autorIds.length > 0) {
        const { data: perfis, error } = await supabase
          .from('profiles')
          .select('id, nome, avatar_url')
          .in('id', autorIds);
        if (error) throw error;
        autores = new Map((perfis ?? []).map((p) => [p.id, p as Pessoa]));
      }

      return {
        checklist: (c.data ?? []) as ItemChecklist[],
        comentarios: (m.data ?? []).map((x) => ({ ...x, autor: autores.get(x.autor_id) ?? null })),
      };
    },
  });

  const dadosAgora = (): DadosDoDetalhe =>
    qc.getQueryData<DadosDoDetalhe>(chave) ?? { checklist: [], comentarios: [] };

  const useAcao = <V,>(cfg: {
    tituloDoErro: string;
    executar: (v: V) => Promise<void>;
    otimista?: (d: DadosDoDetalhe, v: V) => DadosDoDetalhe;
  }) =>
    useMutation({
      mutationFn: cfg.executar,
      onMutate: async (v: V) => {
        await qc.cancelQueries({ queryKey: chave });
        const antes = qc.getQueryData<DadosDoDetalhe>(chave);
        if (antes && cfg.otimista) qc.setQueryData(chave, cfg.otimista(antes, v));
        return { antes };
      },
      onError: (erro, _v, ctx) => {
        if (ctx?.antes) qc.setQueryData(chave, ctx.antes);
        toast({ title: cfg.tituloDoErro, description: mensagemLeiga(erro), variant: 'destructive' });
      },
      onSettled: () => {
        qc.invalidateQueries({ queryKey: chave });
        // O cartão mostra "2/5" e o número de comentários.
        qc.invalidateQueries({ queryKey: ['tarefas-quadro'] });
        qc.invalidateQueries({ queryKey: ['minhas-tarefas'] });
      },
    });

  const trocarItem = (d: DadosDoDetalhe, id: string, mudar: (i: ItemChecklist) => ItemChecklist) => ({
    ...d,
    checklist: d.checklist.map((i) => (i.id === id ? mudar(i) : i)),
  });

  const adicionarItem = useAcao({
    tituloDoErro: 'Não foi possível adicionar o item',
    executar: async (titulo: string) => {
      if (!tarefaId) return;
      const ultima = ordenarPorOrdem(dadosAgora().checklist).slice(-1)[0];
      const { error } = await supabase.from('tarefas_checklist').insert({
        tarefa_id: tarefaId,
        titulo: titulo.trim(),
        ordem: ordemEntre(ultima?.ordem, undefined),
      } as TablesInsert<'tarefas_checklist'>);
      if (error) throw error;
    },
  });

  const alternarItem = useAcao({
    tituloDoErro: 'Não foi possível marcar o item',
    otimista: (d, v: { id: string; feito: boolean }) => trocarItem(d, v.id, (i) => ({ ...i, feito: v.feito })),
    executar: async (v) => {
      const { error } = await supabase.from('tarefas_checklist').update({ feito: v.feito }).eq('id', v.id);
      if (error) throw error;
    },
  });

  const renomearItem = useAcao({
    tituloDoErro: 'Não foi possível renomear o item',
    otimista: (d, v: { id: string; titulo: string }) => trocarItem(d, v.id, (i) => ({ ...i, titulo: v.titulo })),
    executar: async (v) => {
      const { error } = await supabase
        .from('tarefas_checklist')
        .update({ titulo: v.titulo.trim() })
        .eq('id', v.id);
      if (error) throw error;
    },
  });

  const removerItem = useAcao({
    tituloDoErro: 'Não foi possível remover o item',
    otimista: (d, id: string) => ({ ...d, checklist: d.checklist.filter((i) => i.id !== id) }),
    executar: async (id) => {
      const { error } = await supabase.from('tarefas_checklist').delete().eq('id', id);
      if (error) throw error;
    },
  });

  const comentar = useAcao({
    tituloDoErro: 'Não foi possível enviar o comentário',
    // autor_id e tenant_id não vão: o banco carimba quem está logado (e a
    // policy recusa comentário em nome de outra pessoa).
    executar: async (texto: string) => {
      if (!tarefaId) return;
      const { error } = await supabase
        .from('tarefas_comentarios')
        .insert({ tarefa_id: tarefaId, texto: texto.trim() } as TablesInsert<'tarefas_comentarios'>);
      if (error) throw error;
    },
  });

  const removerComentario = useAcao({
    tituloDoErro: 'Não foi possível apagar o comentário',
    otimista: (d, id: string) => ({ ...d, comentarios: d.comentarios.filter((c) => c.id !== id) }),
    executar: async (id) => {
      const { error } = await supabase.from('tarefas_comentarios').delete().eq('id', id);
      if (error) throw error;
    },
  });

  const semRejeitar = <V,>(fn: (v: V) => Promise<unknown>) => (v: V) =>
    fn(v).then(
      () => undefined,
      () => undefined,
    );

  return {
    checklist: consulta.data?.checklist ?? [],
    comentarios: consulta.data?.comentarios ?? [],
    carregando: consulta.isLoading,
    acoes: {
      // Conta o resultado, como `comentar`: a caixa do item novo só se esvazia
      // quando gravou.
      adicionarItem: (titulo: string): Promise<boolean> =>
        adicionarItem.mutateAsync(titulo).then(
          () => true,
          () => false,
        ),
      alternarItem: semRejeitar((id: string) => {
        const item = dadosAgora().checklist.find((i) => i.id === id);
        return item ? alternarItem.mutateAsync({ id, feito: !item.feito }) : Promise.resolve();
      }),
      renomearItem: (id: string, titulo: string) =>
        semRejeitar((v: { id: string; titulo: string }) => renomearItem.mutateAsync(v))({ id, titulo }),
      removerItem: semRejeitar((id: string) => removerItem.mutateAsync(id)),
      // O único que conta o resultado: a caixa de comentário só se esvazia
      // quando gravou — se falhar, o texto fica lá para tentar de novo.
      comentar: (texto: string): Promise<boolean> =>
        comentar.mutateAsync(texto).then(
          () => true,
          () => false,
        ),
      removerComentario: semRejeitar((id: string) => removerComentario.mutateAsync(id)),
    },
  };
}
