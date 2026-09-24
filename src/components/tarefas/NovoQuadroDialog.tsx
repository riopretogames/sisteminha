import { useEffect, useRef, useState, type ComponentType } from 'react';
import { ArrowLeft, Check, LayoutGrid, Loader2, Plus, Store, Trash2, Undo2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  MODELOS_DE_QUADRO,
  modeloPorId,
  montarDadosDoModelo,
  resumoDoModelo,
  type IdModeloDeQuadro,
  type ModeloDeQuadro,
} from '@/components/tarefas/modelosDeQuadro';
import { CORES_ETIQUETA } from '@/lib/cores';
import { cn } from '@/lib/utils';
import type { DadosNovoQuadro } from '@/types/tarefas';

/**
 * "Novo quadro" em dois passos: escolher o modelo, depois ajustar.
 *
 * Os modelos Loja e Assistência são o Trello do Felipe passado a limpo (ver
 * `modelosDeQuadro.ts`). No segundo passo dá para trocar o nome do quadro, a
 * cor e o nome de cada lista — "Vendedor sênior" pode virar "Pedro" — antes
 * de criar, porque renomear seis colunas depois, uma por uma, é exatamente o
 * trabalho repetido que o Felipe quer parar de fazer.
 *
 * Tirar uma lista do modelo tira as tarefas dela junto (o número aparece do
 * lado de cada lista, para ninguém ser pego de surpresa). Lista acrescentada
 * aqui nasce vazia.
 */

export interface PropsNovoQuadroDialog {
  aberto: boolean;
  onClose: () => void;
  /**
   * Grava o quadro (normalmente `useQuadros().criarQuadro`). Se rejeitar, a
   * ficha continua aberta com tudo que a pessoa escreveu — o aviso do erro é
   * de quem grava. Se der certo, a ficha se fecha sozinha.
   */
  onCriar: (dados: DadosNovoQuadro) => Promise<unknown>;
  /** Abre direto no segundo passo com este modelo (os atalhos do estado vazio de Quadros). */
  modeloInicial?: IdModeloDeQuadro;
}

const ICONE_DO_MODELO: Record<IdModeloDeQuadro, ComponentType<{ className?: string }>> = {
  'em-branco': LayoutGrid,
  loja: Store,
  assistencia: Wrench,
};

/** Uma lista no rascunho. `origem` = índice da lista no modelo (ausente = lista nova). */
interface ListaDoRascunho {
  chave: string;
  nome: string;
  cor: string | null;
  origem?: number;
}

let proximaChave = 0;
const novaChave = () => `lista-${++proximaChave}`;

function listasDoModelo(modelo: ModeloDeQuadro): ListaDoRascunho[] {
  return modelo.listas.map((l, i) => ({ chave: novaChave(), nome: l.nome, cor: l.cor ?? null, origem: i }));
}

/** Pluralzinho para os resumos: "1 coluna", "5 colunas". */
const contar = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

export function NovoQuadroDialog({ aberto, onClose, onCriar, modeloInicial }: PropsNovoQuadroDialog) {
  const [passo, setPasso] = useState<'modelo' | 'ajustes'>('modelo');
  const [modeloId, setModeloId] = useState<IdModeloDeQuadro>('em-branco');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [cor, setCor] = useState<string>(CORES_ETIQUETA[0].value);
  const [listas, setListas] = useState<ListaDoRascunho[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [focarChave, setFocarChave] = useState<string | null>(null);
  /**
   * A última coluna tirada, para o "Desfazer". Tirar uma coluna do modelo
   * tira as tarefas prontas dela, e no celular não há "parar o mouse em cima"
   * para ler o aviso: o Desfazer é a rede de quem tocou sem querer.
   */
  const [removida, setRemovida] = useState<{ lista: ListaDoRascunho; indice: number; tarefas: number } | null>(
    null,
  );

  const escolherModelo = (id: IdModeloDeQuadro) => {
    const modelo = modeloPorId(id);
    setModeloId(id);
    setNome(modelo.nomeDoQuadro);
    setDescricao(modelo.descricaoDoQuadro ?? '');
    setCor(modelo.cor);
    setListas(listasDoModelo(modelo));
    setRemovida(null);
    setPasso('ajustes');
  };

  // Cada abertura começa do zero: rascunho de uma tentativa anterior
  // aparecendo na próxima faz a pessoa criar o quadro errado sem perceber.
  useEffect(() => {
    if (!aberto) return;
    setSalvando(false);
    if (modeloInicial) escolherModelo(modeloInicial);
    else setPasso('modelo');
  }, [aberto, modeloInicial]);

  const modelo = modeloPorId(modeloId);
  const tarefasDaLista = (l: ListaDoRascunho) =>
    l.origem === undefined ? 0 : modelo.listas[l.origem]?.tarefas.length ?? 0;
  const totalDeTarefas = listas.reduce((soma, l) => soma + tarefasDaLista(l), 0);

  const faltaNome = nome.trim() === '';
  const semListas = listas.length === 0;
  const listaSemNome = listas.some((l) => l.nome.trim() === '');
  const podeCriar = !faltaNome && !semListas && !listaSemNome && !salvando;

  const trocarLista = (chave: string, mudanca: Partial<ListaDoRascunho>) =>
    setListas((atuais) => atuais.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));

  const removerLista = (chave: string) => {
    const indice = listas.findIndex((l) => l.chave === chave);
    if (indice < 0) return;
    setRemovida({ lista: listas[indice], indice, tarefas: tarefasDaLista(listas[indice]) });
    setListas((atuais) => atuais.filter((l) => l.chave !== chave));
  };

  const desfazerRemocao = () => {
    if (!removida) return;
    setListas((atuais) => {
      const novas = [...atuais];
      novas.splice(Math.min(removida.indice, novas.length), 0, removida.lista);
      return novas;
    });
    setRemovida(null);
  };

  const adicionarLista = () => {
    // A cor da lista nova segue a paleta, para duas colunas vizinhas não
    // nascerem iguais.
    const corLivre =
      CORES_ETIQUETA.find((c) => !listas.some((l) => l.cor === c.value))?.value ??
      CORES_ETIQUETA[listas.length % CORES_ETIQUETA.length].value;
    const chave = novaChave();
    setListas((atuais) => [...atuais, { chave, nome: '', cor: corLivre }]);
    setFocarChave(chave);
  };

  const criar = async () => {
    if (!podeCriar) return;
    // O modelo derivado é o modelo com as listas como ficaram aqui: as que
    // vieram dele levam as tarefas dele; as novas vão vazias.
    const derivado: ModeloDeQuadro = {
      ...modelo,
      nomeDoQuadro: nome.trim(),
      descricaoDoQuadro: descricao.trim() || undefined,
      cor,
      listas: listas.map((l) => {
        const original = l.origem === undefined ? undefined : modelo.listas[l.origem];
        return { nome: l.nome, cor: l.cor ?? undefined, tarefas: original?.tarefas ?? [] };
      }),
    };
    const dados = montarDadosDoModelo(
      derivado,
      listas.map((l) => l.nome),
    );

    setSalvando(true);
    try {
      await onCriar(dados);
      onClose();
    } catch {
      // O aviso já apareceu (quem grava mostra). A ficha fica aberta, com
      // tudo que foi escrito, para tentar de novo.
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v && !salvando) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {passo === 'modelo' ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Novo quadro</DialogTitle>
              <DialogDescription>
                Comece de um modelo pronto ou do zero. Dá para mudar tudo depois, no próprio quadro.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              {MODELOS_DE_QUADRO.map((m) => (
                <CartaoDoModelo key={m.id} modelo={m} onEscolher={() => escolherModelo(m.id)} />
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="cancelar" onClick={onClose}>
                Cancelar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void criar();
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-xl">Ajuste o quadro</DialogTitle>
              <DialogDescription>
                Modelo <strong className="text-foreground">{modelo.nome}</strong>. Troque o que quiser antes de
                criar.
              </DialogDescription>
            </DialogHeader>

            {/* Prévia: o quadro como vai aparecer na lista de quadros. */}
            <div className={cn('overflow-hidden rounded-xl shadow-sm', cor)}>
              <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-6">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{nome.trim() || 'Nome do quadro'}</p>
                  <p className="text-xs opacity-90">
                    {contar(listas.length, 'coluna', 'colunas')} · {contar(totalDeTarefas, 'tarefa', 'tarefas')}
                  </p>
                </div>
                <div aria-hidden className="flex items-end gap-1">
                  {listas.slice(0, 6).map((l) => (
                    <span
                      key={l.chave}
                      className="w-3 rounded-sm bg-white/30"
                      style={{ height: `${Math.min(40, 10 + tarefasDaLista(l) * 3)}px` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="novo-quadro-nome">Nome do quadro</Label>
                <Input
                  id="novo-quadro-nome"
                  autoFocus
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Estoque, Marketing, Limpeza"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="novo-quadro-descricao">
                  Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="novo-quadro-descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Para que serve este quadro"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Cor do quadro</p>
              <PaletaDeCores valor={cor} onChange={setCor} />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Colunas do quadro</p>
                <p className="text-xs text-muted-foreground">
                  {contar(listas.length, 'coluna', 'colunas')}
                  {totalDeTarefas > 0 && ` · ${contar(totalDeTarefas, 'tarefa pronta', 'tarefas prontas')}`}
                </p>
              </div>

              <ul className="space-y-2">
                {listas.map((l, i) => {
                  const qtd = tarefasDaLista(l);
                  return (
                    <li
                      key={l.chave}
                      className="flex items-center gap-2 rounded-lg border bg-card p-1.5 pl-2 transition-colors hover:border-foreground/20"
                    >
                      <CorDaLista
                        valor={l.cor}
                        nome={l.nome}
                        onChange={(nova) => trocarLista(l.chave, { cor: nova })}
                      />
                      <Input
                        aria-label={`Nome da coluna ${i + 1}`}
                        value={l.nome}
                        autoFocus={focarChave === l.chave}
                        onChange={(e) => trocarLista(l.chave, { nome: e.target.value })}
                        onKeyDown={(e) => {
                          // Enter numa lista pula para a próxima em vez de
                          // criar o quadro no meio da digitação.
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          const campos = e.currentTarget
                            .closest('ul')
                            ?.querySelectorAll<HTMLInputElement>('input[aria-label^="Nome da coluna"]');
                          campos?.[i + 1]?.focus();
                        }}
                        placeholder="Nome da coluna"
                        className={cn('h-9 border-transparent bg-transparent shadow-none focus-visible:bg-background', l.nome.trim() === '' && 'border-amber-400')}
                      />
                      <span
                        className={cn(
                          // Visível também no celular: é o único aviso de que
                          // tirar esta coluna leva as tarefas junto.
                          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                          qtd > 0 ? 'bg-muted text-muted-foreground' : 'text-muted-foreground/60',
                        )}
                      >
                        {qtd > 0 ? contar(qtd, 'tarefa', 'tarefas') : 'vazia'}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remover a coluna ${l.nome.trim() || i + 1}`}
                        title={qtd > 0 ? `Remover a coluna e as ${qtd} tarefas dela` : 'Remover a coluna'}
                        onClick={() => removerLista(l.chave)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>

              {removida && (
                <div
                  role="status"
                  className="flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
                >
                  <span className="min-w-0 truncate">
                    Lista “{removida.lista.nome.trim() || 'sem nome'}” removida
                    {removida.tarefas > 0 ? ` com ${contar(removida.tarefas, 'tarefa', 'tarefas')}` : ''}.
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0" onClick={desfazerRemocao}>
                    <Undo2 />
                    Desfazer
                  </Button>
                </div>
              )}

              <Button type="button" variant="outline" size="sm" onClick={adicionarLista}>
                <Plus />
                Adicionar coluna
              </Button>
            </div>

            {!podeCriar && !salvando && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {faltaNome
                  ? 'Dê um nome ao quadro para poder criar.'
                  : semListas
                    ? 'O quadro precisa de pelo menos uma coluna.'
                    : 'Dê um nome para cada coluna (ou remova a que ficou vazia).'}
              </p>
            )}

            <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasso('modelo')}
                disabled={salvando}
              >
                <ArrowLeft />
                Trocar de modelo
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="cancelar" onClick={onClose} disabled={salvando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!podeCriar}>
                  {salvando ? <Loader2 className="animate-spin" /> : <Check />}
                  {salvando ? 'Criando...' : 'Criar quadro'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** O cartão de um modelo, com uma miniatura das colunas pintada na cor dele. */
function CartaoDoModelo({ modelo, onEscolher }: { modelo: ModeloDeQuadro; onEscolher: () => void }) {
  const Icone = ICONE_DO_MODELO[modelo.id];
  const resumo = resumoDoModelo(modelo);
  return (
    <button
      type="button"
      onClick={onEscolher}
      aria-label={`Usar o modelo ${modelo.nome}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg active:translate-y-0 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <div aria-hidden className={cn('flex h-20 items-end gap-1.5 px-3 pb-2.5', modelo.cor)}>
        {modelo.listas.slice(0, 6).map((l, i) => (
          <span
            key={i}
            className="w-4 rounded-sm bg-white/30 transition-all group-hover:bg-white/40"
            style={{ height: `${Math.min(52, 12 + l.tarefas.length * 3)}px` }}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="flex items-center gap-2 font-semibold">
          <Icone className="h-4 w-4 text-muted-foreground" />
          {modelo.nome}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">{modelo.descricao}</p>
        <p className="mt-auto pt-2 text-xs font-semibold">
          {contar(resumo.listas, 'coluna', 'colunas')}
          {resumo.tarefas > 0 ? ` · ${contar(resumo.tarefas, 'tarefa', 'tarefas')}` : ' · sem tarefas'}
        </p>
      </div>
    </button>
  );
}

/** Bolinhas da paleta de `lib/cores.ts` — as mesmas cores das etiquetas do sistema. */
function PaletaDeCores({ valor, onChange }: { valor: string | null; onChange: (cor: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
      {CORES_ETIQUETA.map((c) => {
        const escolhida = c.value === valor;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={escolhida}
            aria-label={c.label}
            title={c.label}
            onClick={() => onChange(c.value)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              c.value,
              escolhida && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
            )}
          >
            {escolhida && <Check className="h-4 w-4" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

/** A bolinha colorida de cada lista, que abre a paleta. */
function CorDaLista({
  valor,
  nome,
  onChange,
}: {
  valor: string | null;
  nome: string;
  onChange: (cor: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          ref={gatilho}
          type="button"
          aria-label={`Trocar a cor da coluna ${nome.trim() || ''}`.trim()}
          title="Trocar a cor"
          className={cn(
            'h-6 w-6 shrink-0 rounded-full shadow-inner transition-transform hover:scale-110',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            valor ?? 'bg-slate-500 text-white',
          )}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <PaletaDeCores
          valor={valor}
          onChange={(cor) => {
            onChange(cor);
            setAberto(false);
            gatilho.current?.focus();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
