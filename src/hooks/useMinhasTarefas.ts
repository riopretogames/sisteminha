import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { gravarPlanoDeStatus, lerFeitasHoje, SELECT_TAREFA } from '@/hooks/useQuadro';
import { hojeISO } from '@/lib/format';
import { montarTarefa, tarefaCaiNoDia, type LinhaTarefaDoBanco } from '@/lib/tarefas';
import {
  mensagemLeiga,
  planoDeAlternarFeito,
  planoDeStatus,
  type PlanoDeStatus,
} from '@/lib/tarefasMutacoes';
import type { TarefaMinha, TarefaStatus } from '@/types/tarefas';

/**
 * O que é da pessoa logada para HOJE, de todos os quadros.
 *
 * É por esta tela que a equipe usa o sistema no dia a dia; o quadro inteiro é
 * para quem gerencia. "Minha" tem dois sentidos, e os dois contam:
 *
 *   - a pessoa está entre os responsáveis da tarefa (as bolinhas do Trello);
 *   - a tarefa está na coluna dela (a "coluna do Pedro"), mesmo sem ninguém
 *     ter marcado o Pedro na tarefa.
 *
 * Pausada ("não fazer por enquanto") não entra: é justamente o que a pessoa
 * NÃO deve fazer hoje.
 *
 * A chave leva a data de hoje: na virada do dia a lista se refaz sozinha, e
 * as recorrentes voltam a aparecer pendentes sem ninguém zerar nada.
 */

type LinhaMinha = LinhaTarefaDoBanco & {
  quadro?: { nome: string; arquivado_em: string | null } | null;
  lista?: { nome: string; responsavel_id: string | null; arquivada_em: string | null } | null;
};

const SELECT_MINHA =
  `${SELECT_TAREFA}, ` +
  'quadro:tarefas_quadros(nome, arquivado_em), ' +
  'lista:tarefas_listas(nome, responsavel_id, arquivada_em)';

async function lerMinhasTarefas(userId: string, hoje: string): Promise<TarefaMinha[]> {
  const [resp, colunas, feitasHoje] = await Promise.all([
    supabase.from('tarefas_responsaveis').select('tarefa_id').eq('user_id', userId),
    supabase.from('tarefas_listas').select('id').eq('responsavel_id', userId).is('arquivada_em', null),
    lerFeitasHoje(),
  ]);
  if (resp.error) throw resp.error;
  if (colunas.error) throw colunas.error;

  const idsDeTarefa = [...new Set((resp.data ?? []).map((r) => r.tarefa_id))];
  const idsDeLista = (colunas.data ?? []).map((l) => l.id);

  // Duas consultas e união por id, em vez de um `or` que misturasse as duas
  // regras: cada uma fica simples de ler, e a tarefa que é "minha" pelos dois
  // caminhos aparece uma vez só.
  const [porResponsavel, porColuna] = await Promise.all([
    idsDeTarefa.length > 0
      ? supabase.from('tarefas').select(SELECT_MINHA).in('id', idsDeTarefa).is('arquivada_em', null)
      : Promise.resolve({ data: [], error: null }),
    idsDeLista.length > 0
      ? supabase.from('tarefas').select(SELECT_MINHA).in('lista_id', idsDeLista).is('arquivada_em', null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (porResponsavel.error) throw porResponsavel.error;
  if (porColuna.error) throw porColuna.error;

  const unicas = new Map<string, LinhaMinha>();
  for (const linha of [
    ...((porResponsavel.data ?? []) as unknown as LinhaMinha[]),
    ...((porColuna.data ?? []) as unknown as LinhaMinha[]),
  ]) {
    unicas.set(linha.id, linha);
  }

  const diaSemana = new Date().getDay();
  return [...unicas.values()]
    // Quadro ou coluna arquivados: a tarefa saiu de circulação junto.
    .filter((l) => !l.quadro?.arquivado_em && !l.lista?.arquivada_em)
    .map((l) => ({
      ...montarTarefa(l, feitasHoje, hoje),
      quadro_nome: l.quadro?.nome ?? '',
      lista_nome: l.lista?.nome ?? '',
    }))
    .filter((t) => t.status !== 'pausada' && tarefaCaiNoDia(t, diaSemana, hoje));
}

export function useMinhasTarefas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const hoje = hojeISO();
  const chave = ['minhas-tarefas', hoje] as const;
  const userId = user?.id ?? null;

  const consulta = useQuery({
    queryKey: chave,
    enabled: Boolean(userId),
    queryFn: () => lerMinhasTarefas(userId!, hoje),
    refetchInterval: 60_000,
  });

  const aplicar = useMutation({
    mutationFn: (d: { id: string; plano: PlanoDeStatus }) => gravarPlanoDeStatus(d.id, d.plano),
    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: chave });
      const lista = qc.getQueryData<TarefaMinha[]>(chave);
      const antes = lista?.find((t) => t.id === d.id);
      if (lista) {
        qc.setQueryData<TarefaMinha[]>(
          chave,
          lista.map((t) => (t.id === d.id ? { ...t, ...d.plano.otimista } : t)),
        );
      }
      // Guarda só a tarefa mexida: voltar a lista inteira desfaria na tela
      // outra tarefa marcada logo em seguida (ver desfazerSo em useQuadro).
      return { antes };
    },
    onError: (erro, d, ctx) => {
      const antes = ctx?.antes;
      if (antes) {
        qc.setQueryData<TarefaMinha[]>(chave, (atual) => atual?.map((t) => (t.id === d.id ? antes : t)));
      }
      toast({
        title: 'Não foi possível marcar o andamento',
        description: mensagemLeiga(erro),
        variant: 'destructive',
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['minhas-tarefas'] });
      qc.invalidateQueries({ queryKey: ['tarefas-quadro'] });
    },
  });

  const { mutateAsync } = aplicar;
  const tarefaAgora = useCallback(
    (id: string) => qc.getQueryData<TarefaMinha[]>(['minhas-tarefas', hojeISO()])?.find((t) => t.id === id),
    [qc],
  );

  /** Mesma regra do quadro (lib/tarefasMutacoes). Nunca rejeita. */
  const alternarFeito = useCallback(
    async (id: string) => {
      const t = tarefaAgora(id);
      if (!t) return;
      await mutateAsync({ id, plano: planoDeAlternarFeito(t, new Date().toISOString()) }).catch(() => undefined);
    },
    [tarefaAgora, mutateAsync],
  );

  const definirStatus = useCallback(
    async ({ id, status }: { id: string; status: TarefaStatus }) => {
      const t = tarefaAgora(id);
      if (!t) return;
      const plano = planoDeStatus(t, status, new Date().toISOString());
      if (!plano.linha && !plano.conclusaoDeHoje) return;
      await mutateAsync({ id, plano }).catch(() => undefined);
    },
    [tarefaAgora, mutateAsync],
  );

  return {
    tarefas: consulta.data ?? [],
    carregando: consulta.isLoading,
    erro: consulta.error,
    /** Tenta ler de novo (botão "Tentar de novo" do aviso de erro). */
    recarregar: consulta.refetch,
    alternarFeito,
    definirStatus,
  };
}
