import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvataresPessoas } from '@/components/tarefas/AvataresPessoas';
import { estaFeita, primeiroNome, resumoDeStatus } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type { AcoesDoQuadro, DiaFiltro, Etiqueta, Lista, PeriodoOpcao, Pessoa, Tarefa } from '@/types/tarefas';
import { BarraResumo } from './BarraResumo';
import {
  descreverResumoDePrioridade,
  descreverResumoDeStatus,
  resumoDePrioridade,
  segmentosDePrioridade,
  segmentosDeStatus,
} from './resumoDoGrupo';
import { CELULA, CELULA_FIXA, COLUNAS_DA_TABELA } from './colunas';
import { estiloDaLista, type EstiloDaLista } from './estiloDaLista';
import { LinhaTarefa } from './LinhaTarefa';

function contarTarefas(n: number): string {
  if (n === 0) return 'Nenhuma tarefa';
  return n === 1 ? '1 tarefa' : `${n} tarefas`;
}

/**
 * A linha "+ Adicionar tarefa" no pé do grupo: digita e dá Enter, como no
 * Monday. O campo continua aberto e com o cursor depois de criar, para quem
 * está cadastrando a rotina da semana ir emendando uma tarefa atrás da outra.
 */
function LinhaNovaTarefa({
  lista,
  estilo,
  onCriar,
}: {
  lista: Lista;
  estilo: EstiloDaLista;
  onCriar: (titulo: string) => Promise<boolean | void>;
}) {
  const [titulo, setTitulo] = useState('');
  const [criando, setCriando] = useState(false);

  const criar = async () => {
    const limpo = titulo.trim();
    if (!limpo || criando) return;
    setCriando(true);
    // As ações do quadro não rejeitam: se o banco recusar, o aviso já aparece
    // por lá, em português, e o título digitado fica no campo para corrigir.
    const gravou = await onCriar(limpo);
    setCriando(false);
    if (gravou !== false) setTitulo('');
  };

  return (
    <tr>
      <td className={cn(CELULA_FIXA, estilo.borda, 'rounded-bl-lg')}>
        <div className="flex h-10 items-center gap-2 pl-3 pr-2">
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <input
            value={titulo}
            // Só leitura (e não desabilitado) enquanto grava: desabilitar tira
            // o cursor do campo e quebra o "emendar a próxima".
            readOnly={criando}
            // O banco recusa título com mais de 200 letras.
            maxLength={200}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void criar();
              }
              if (e.key === 'Escape') {
                setTitulo('');
                e.currentTarget.blur();
              }
            }}
            placeholder="Adicionar tarefa"
            aria-label={`Adicionar tarefa em ${lista.nome}`}
            className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted/50 focus:bg-background focus:ring-2 focus:ring-ring/40"
          />
          {titulo.trim() && (
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={criando}
              onClick={() => void criar()}
            >
              {criando ? 'Criando...' : 'Adicionar'}
            </Button>
          )}
        </div>
      </td>
      <td colSpan={COLUNAS_DA_TABELA.length - 1} className={cn(CELULA, 'rounded-br-lg')} />
    </tr>
  );
}

/**
 * Um grupo da Tabela = uma lista do quadro (a "coluna do Pedro" do Trello vira
 * o "grupo do Pedro" do Monday). Cabeçalho na cor da lista, as colunas, uma
 * linha por tarefa, "+ Adicionar tarefa" e o rodapé com as barrinhas de
 * resumo.
 */
export function GrupoTabela({
  lista,
  tarefas,
  recolhido,
  onAlternarRecolhido,
  hojeISO,
  meuId,
  podeEditar,
  acoes,
  onAbrirTarefa,
  pessoas,
  periodos,
  etiquetas,
  filtroAtivo = false,
  onLimparFiltros,
  diaDoFiltro = 'todas',
}: {
  lista: Lista;
  /** Só as desta lista, já em ordem. */
  tarefas: Tarefa[];
  recolhido: boolean;
  onAlternarRecolhido: () => void;
  hojeISO: string;
  /** Quem está logado: o responsável marca o andamento mesmo sem tasks.edit. */
  meuId: string | null;
  podeEditar: boolean;
  acoes: AcoesDoQuadro;
  onAbrirTarefa: (tarefaId: string) => void;
  pessoas: Pessoa[];
  periodos: PeriodoOpcao[];
  etiquetas: Etiqueta[];
  /** Há filtro ligado: grupo sem linha pode ser só o filtro escondendo. */
  filtroAtivo?: boolean;
  onLimparFiltros?: () => void;
  /** O chip de dia ligado no quadro (trava a bolinha no chip de outro dia; ver LinhaTarefa). */
  diaDoFiltro?: DiaFiltro;
}) {
  const estilo = estiloDaLista(lista);
  const status = resumoDeStatus(tarefas, hojeISO);
  const prioridades = resumoDePrioridade(tarefas);
  const textoStatus = descreverResumoDeStatus(status);
  const feitas = tarefas.filter(estaFeita).length;

  // Mesma regra do banco (eh_responsavel_da_tarefa): está entre os
  // responsáveis da tarefa, ou a coluna inteira é dele.
  const ehResponsavel = (t: Tarefa) =>
    Boolean(meuId) && (lista.responsavel_id === meuId || t.responsaveis.some((p) => p.id === meuId));

  return (
    <section aria-label={`Grupo ${lista.nome}`} className="space-y-2">
      {/* Preso na esquerda: ao rolar a tabela para o lado, o nome do grupo
          continua à vista. */}
      <div className="sticky left-0 z-20 flex w-fit max-w-[100vw] flex-wrap items-center gap-x-3 gap-y-1 pr-4">
        <h3>
          <button
            type="button"
            onClick={onAlternarRecolhido}
            aria-expanded={!recolhido}
            title={recolhido ? 'Mostrar as tarefas deste grupo' : 'Esconder as tarefas deste grupo'}
            className={cn(
              'flex items-center gap-1.5 rounded-md py-1 pl-1 pr-2 text-lg font-bold tracking-tight transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              estilo.texto,
            )}
          >
            <ChevronDown
              className={cn('h-5 w-5 shrink-0 transition-transform duration-200', recolhido && '-rotate-90')}
            />
            {lista.nome}
          </button>
        </h3>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {contarTarefas(tarefas.length)}
        </span>
        {lista.responsavel && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AvataresPessoas pessoas={[lista.responsavel]} max={1} />
            Coluna de {primeiroNome(lista.responsavel.nome)}
          </span>
        )}
      </div>

      {recolhido ? (
        <button
          type="button"
          onClick={onAlternarRecolhido}
          className={cn(
            'sticky left-0 flex w-[640px] max-w-full items-center gap-4 rounded-lg border border-l-4 bg-card px-4 py-2.5 text-left shadow-sm',
            'transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            estilo.borda,
          )}
        >
          <BarraResumo
            segmentos={segmentosDeStatus(status)}
            descricao={textoStatus}
            className="h-3 w-40 shrink-0"
          />
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{textoStatus}</span>
          <span className="shrink-0 text-xs font-medium text-primary">Mostrar tarefas</span>
        </button>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            {COLUNAS_DA_TABELA.map((c) => (
              <col key={c.chave} className={c.largura} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUNAS_DA_TABELA.map((c, i) =>
                i === 0 ? (
                  <th
                    key={c.chave}
                    scope="col"
                    className={cn(CELULA_FIXA, estilo.borda, 'h-9 rounded-tl-lg border-t text-left')}
                  >
                    <div
                      className={cn(
                        'flex h-9 items-center rounded-tl-md pl-4 text-xs font-semibold text-foreground/80',
                        estilo.suave,
                      )}
                    >
                      {c.titulo}
                    </div>
                  </th>
                ) : (
                  <th
                    key={c.chave}
                    scope="col"
                    className={cn(
                      'h-9 border-b border-r border-t border-border bg-muted/40 px-2 text-center text-xs font-semibold text-muted-foreground',
                      i === COLUNAS_DA_TABELA.length - 1 && 'rounded-tr-lg',
                    )}
                  >
                    {c.titulo}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {tarefas.map((t) => (
              <LinhaTarefa
                key={t.id}
                tarefa={t}
                estilo={estilo}
                hojeISO={hojeISO}
                podeEditar={podeEditar}
                podeMarcarAndamento={podeEditar || ehResponsavel(t)}
                diaDoFiltro={diaDoFiltro}
                acoes={acoes}
                onAbrir={onAbrirTarefa}
                pessoas={pessoas}
                periodos={periodos}
                etiquetas={etiquetas}
              />
            ))}
            {tarefas.length === 0 && (
              <tr>
                <td
                  colSpan={COLUNAS_DA_TABELA.length}
                  className={cn(
                    'h-14 border-b border-l-4 border-r border-border bg-card px-4 text-sm text-muted-foreground',
                    estilo.borda,
                  )}
                >
                  {filtroAtivo ? (
                    <span className="flex items-center gap-2">
                      Nenhuma tarefa desta coluna com esse filtro.
                      {onLimparFiltros && (
                        <button
                          type="button"
                          onClick={onLimparFiltros}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Limpar filtros
                        </button>
                      )}
                    </span>
                  ) : podeEditar ? (
                    'Nenhuma tarefa nesta coluna. Escreva a primeira na linha de baixo.'
                  ) : (
                    'Nenhuma tarefa nesta coluna.'
                  )}
                </td>
              </tr>
            )}
            {podeEditar && (
              <LinhaNovaTarefa
                lista={lista}
                estilo={estilo}
                onCriar={(titulo) => acoes.criarTarefa({ lista_id: lista.id, titulo })}
              />
            )}
          </tbody>
          {tarefas.length > 0 && (
            <tfoot>
              <tr>
                <td className="sticky left-0 z-10 bg-background p-0">
                  <div className="flex h-11 items-center justify-end gap-1 pr-3 text-xs text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">
                      {feitas} de {tarefas.length}
                    </span>
                    {feitas === 1 ? 'feita' : 'feitas'}
                  </div>
                </td>
                <td />
                <td className="px-1.5 py-2">
                  <BarraResumo
                    segmentos={segmentosDePrioridade(prioridades)}
                    descricao={descreverResumoDePrioridade(prioridades)}
                  />
                </td>
                <td className="px-1.5 py-2">
                  <BarraResumo segmentos={segmentosDeStatus(status)} descricao={textoStatus} />
                </td>
                <td colSpan={COLUNAS_DA_TABELA.length - 4} />
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </section>
  );
}
