import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { hojeISO as calcularHojeISO } from '@/lib/format';
import { agruparPorLista, ordenarPorOrdem } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type { PropsVisaoQuadro, Tarefa } from '@/types/tarefas';
import { LARGURA_MINIMA_DA_TABELA } from './colunas';
import { GrupoTabela } from './GrupoTabela';

const SEM_TAREFAS: Tarefa[] = [];

function chaveDosRecolhidos(quadroId: string | undefined): string | null {
  return quadroId ? `tarefas_tabela_recolhidos:${quadroId}` : null;
}

function lerRecolhidos(chave: string | null): Set<string> {
  if (!chave) return new Set();
  try {
    const salvo = JSON.parse(localStorage.getItem(chave) ?? '[]');
    return new Set(Array.isArray(salvo) ? salvo.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Grupos fechados, lembrados por quadro neste navegador: o gerente que só olha
 * o grupo dele não precisa fechar os outros toda vez que abre a tela.
 * Navegador que não deixa guardar (aba anônima, por exemplo) só esquece.
 */
function useGruposRecolhidos(quadroId: string | undefined) {
  const chave = chaveDosRecolhidos(quadroId);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => lerRecolhidos(chave));

  useEffect(() => setRecolhidos(lerRecolhidos(chave)), [chave]);

  const alternar = useCallback(
    (listaId: string) => {
      const novo = new Set(recolhidos);
      if (novo.has(listaId)) novo.delete(listaId);
      else novo.add(listaId);
      setRecolhidos(novo);
      if (chave) {
        try {
          localStorage.setItem(chave, JSON.stringify([...novo]));
        } catch {
          // Sem onde guardar: o grupo fecha agora e abre de novo no próximo acesso.
        }
      }
    },
    [chave, recolhidos],
  );

  return { recolhidos, alternar };
}

/**
 * A visão Tabela do quadro — o Monday do Felipe dentro do sisteminha.
 *
 * Mesmos dados do Kanban (frase dele: "tudo é um kanban... é tudo cards,
 * colunas e fileiras"): cada lista vira um grupo, cada tarefa uma linha, e as
 * colunas coloridas se editam na própria célula. Esta tela não fala com o
 * banco — tudo passa pelas `acoes` que a página recebe de `useQuadro`.
 *
 * A rolagem para o lado é uma só para o quadro inteiro (e não uma por grupo),
 * para as colunas de todos os grupos andarem juntas, como no Monday.
 */
export function QuadroTabela({
  listas,
  tarefas,
  podeEditar,
  acoes,
  onAbrirTarefa,
  pessoas,
  periodos,
  etiquetas,
  filtroAtivo = false,
  onLimparFiltros,
}: PropsVisaoQuadro) {
  const { user } = useAuth();
  const meuId = user?.id ?? null;
  // Uma vez por render: todas as linhas decidem "atrasada"/"feito hoje" com a
  // mesma data, mesmo se a meia-noite passar no meio do desenho.
  const hoje = calcularHojeISO();

  const emOrdem = useMemo(() => ordenarPorOrdem(listas), [listas]);
  const porLista = useMemo(() => agruparPorLista(tarefas), [tarefas]);
  const { recolhidos, alternar } = useGruposRecolhidos(listas[0]?.quadro_id);

  if (emOrdem.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/60 px-6 py-16 text-center">
        <div className="rounded-full bg-muted p-4">
          <Table2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="mt-4 text-lg font-semibold">Este quadro ainda não tem colunas</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {podeEditar
            ? 'Crie a primeira no botão “Adicionar coluna”, aqui em cima. Na tabela, cada coluna do quadro vira um bloco de linhas — por exemplo, um para cada pessoa da equipe.'
            : 'Quem organiza os quadros ainda não criou as colunas deste. Assim que criar, as tarefas aparecem aqui.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className={cn('space-y-8 pr-1', LARGURA_MINIMA_DA_TABELA)}>
        {emOrdem.map((lista) => (
          <GrupoTabela
            key={lista.id}
            lista={lista}
            tarefas={porLista.get(lista.id) ?? SEM_TAREFAS}
            recolhido={recolhidos.has(lista.id)}
            onAlternarRecolhido={() => alternar(lista.id)}
            hojeISO={hoje}
            meuId={meuId}
            podeEditar={podeEditar}
            acoes={acoes}
            onAbrirTarefa={onAbrirTarefa}
            pessoas={pessoas}
            periodos={periodos}
            etiquetas={etiquetas}
            filtroAtivo={filtroAtivo}
            onLimparFiltros={onLimparFiltros}
          />
        ))}
      </div>
    </div>
  );
}
