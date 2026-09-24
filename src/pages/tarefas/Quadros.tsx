import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Columns3,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  SquareKanban,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NovoQuadroDialog } from '@/components/tarefas/NovoQuadroDialog';
import {
  MODELOS_DE_QUADRO,
  resumoDoModelo,
  type IdModeloDeQuadro,
  type ModeloDeQuadro,
} from '@/components/tarefas/modelosDeQuadro';
import { PERMISSIONS } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useQuadros } from '@/hooks/useQuadros';
import { corDaEtiqueta } from '@/lib/cores';
import { mensagemLeiga } from '@/lib/tarefasMutacoes';
import { cn } from '@/lib/utils';
import type { DadosNovoQuadro, Quadro } from '@/types/tarefas';

/**
 * Os quadros de tarefas da loja, em cartões — a tela inicial do Trello.
 *
 * Só tarefa da equipe mora aqui (decisão do Felipe em 23/09: "é só para
 * gestão de tarefas"). Vídeo, curso, projeto piloto e coisa pessoal continuam
 * no Trello; por isso esta tela não oferece anexo nem "quadro pessoal".
 *
 * Criar, renomear e arquivar quadro é estrutura (`tasks.manage`): quem não
 * tem não vê os botões. O banco confere a mesma regra — esconder aqui é só
 * para ninguém clicar num botão que vai dar "não permitido".
 */

/** "1 coluna", "6 colunas" — número com a palavra certa. */
function contar(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * As colunas em miniatura no topo do cartão, como a capa de quadro do Trello.
 * As alturas são fixas e escritas por extenso (o Tailwind só gera o CSS das
 * classes que encontra no código).
 */
const ALTURAS_DAS_MINIATURAS = ['h-10', 'h-6', 'h-12', 'h-8', 'h-9', 'h-5'];

function MiniaturaDasListas({ quantas }: { quantas: number }) {
  const n = Math.min(Math.max(quantas, 3), ALTURAS_DAS_MINIATURAS.length);
  return (
    <div className="flex items-end gap-1.5" aria-hidden>
      {ALTURAS_DAS_MINIATURAS.slice(0, n).map((altura, i) => (
        <span key={i} className={cn('w-5 rounded-md bg-white/30 shadow-sm', altura)} />
      ))}
    </div>
  );
}

function CartaoDoQuadro({
  quadro,
  podeGerenciar,
  onAbrir,
  onRenomear,
  onArquivar,
}: {
  quadro: Quadro;
  podeGerenciar: boolean;
  onAbrir: () => void;
  onRenomear: () => void;
  onArquivar: () => void;
}) {
  const cor = quadro.cor ?? corDaEtiqueta(null, quadro.nome);
  const temContagem = typeof quadro.total_listas === 'number' && typeof quadro.total_tarefas === 'number';

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Abrir o quadro ${quadro.nome}`}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir();
        }
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card shadow-sm',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <div className={cn('relative flex h-28 items-end justify-between px-4 pb-3', cor)}>
        <MiniaturaDasListas quantas={quadro.total_listas ?? 4} />
        <SquareKanban className="h-8 w-8 opacity-40 transition-opacity group-hover:opacity-70" aria-hidden />

        {podeGerenciar && (
          // O menu mora dentro do cartão, e o clique no cartão abre o quadro:
          // sem barrar aqui, escolher "Renomear" abriria o quadro junto.
          <div className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-current hover:bg-white/20 hover:text-current"
                  aria-label={`Opções do quadro ${quadro.nome}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onRenomear}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Renomear quadro
                </DropdownMenuItem>
                <DropdownMenuItem className="text-amber-600 focus:text-amber-700" onClick={onArquivar}>
                  <Archive className="mr-2 h-4 w-4" />
                  Arquivar quadro
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h2 className="text-lg font-semibold leading-tight tracking-tight">{quadro.nome}</h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {quadro.descricao || 'Clique para ver as colunas e as tarefas deste quadro.'}
        </p>
        {temContagem && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              <Columns3 className="h-3.5 w-3.5" />
              {contar(quadro.total_listas!, 'coluna', 'colunas')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              <ListChecks className="h-3.5 w-3.5" />
              {contar(quadro.total_tarefas!, 'tarefa', 'tarefas')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Atalho do estado vazio: um modelo pronto (o Trello atual do Felipe). Abre
 * o diálogo de criação já no modelo, com os nomes das listas editáveis — a
 * "coluna do Pedro" do modelo pode virar a do Gabriel antes de criar.
 */
function AtalhoDeModelo({ modelo, onUsar }: { modelo: ModeloDeQuadro; onUsar: () => void }) {
  const resumo = resumoDoModelo(modelo);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-shadow hover:shadow-md">
      <div className={cn('flex h-16 items-end px-4 pb-2', modelo.cor)}>
        <MiniaturaDasListas quantas={resumo.listas} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="font-semibold">{modelo.nome}</p>
        <p className="text-sm text-muted-foreground">{modelo.descricao}</p>
        <p className="text-xs font-medium text-muted-foreground">
          {contar(resumo.listas, 'coluna', 'colunas')} · {contar(resumo.tarefas, 'tarefa pronta', 'tarefas prontas')}
        </p>
        <Button className="mt-auto" onClick={onUsar}>
          <Plus className="h-4 w-4" />
          Usar o modelo “{modelo.nome}”
        </Button>
      </div>
    </div>
  );
}

export default function Quadros() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const podeGerenciar = can(PERMISSIONS.TASKS_MANAGE);
  const { quadros, criarQuadro, renomearQuadro, arquivarQuadro } = useQuadros();

  const [novoAberto, setNovoAberto] = useState(false);
  const [modeloInicial, setModeloInicial] = useState<IdModeloDeQuadro | undefined>(undefined);
  const [renomeando, setRenomeando] = useState<Quadro | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [arquivando, setArquivando] = useState<Quadro | null>(null);

  const lista = quadros.data ?? [];
  const abrir = (id: string) => navigate(`/tarefas/${id}`);

  /**
   * Cria e já abre o quadro novo. `criarQuadro` rejeita quando o banco
   * recusa (o aviso já apareceu): a rejeição segue para o diálogo, que fica
   * aberto com o que a pessoa digitou em vez de fechar como se tivesse dado
   * certo.
   */
  const criarEAbrir = async (dados: DadosNovoQuadro) => {
    const id = await criarQuadro(dados);
    setNovoAberto(false);
    abrir(id);
  };

  const abrirNovo = (modelo?: IdModeloDeQuadro) => {
    setModeloInicial(modelo);
    setNovoAberto(true);
  };

  const salvarNome = async (e: FormEvent) => {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!renomeando || !nome) return;
    const quadro = renomeando;
    setRenomeando(null);
    if (nome !== quadro.nome) await renomearQuadro({ id: quadro.id, nome });
  };

  // Só os modelos que já trazem tarefas viram cartão: o "Em branco" fica no
  // botão de baixo, que é o que ele é — começar do zero.
  const modelosProntos = MODELOS_DE_QUADRO.filter((m) => m.listas.some((l) => l.tarefas.length > 0));

  return (
    <div className="animate-fade-in">
      <PageHeader
        titulo="Quadros de tarefas"
        hint="Cada quadro junta as tarefas de uma área da loja, com uma coluna por pessoa ou assunto — como no Trello. Clique num quadro para abrir."
        acoes={
          podeGerenciar && (
            <Button onClick={() => abrirNovo()}>
              <Plus className="h-4 w-4" />
              Criar quadro
            </Button>
          )
        }
      />

      {quadros.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Carregando os quadros">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-xl border bg-card">
              <Skeleton className="h-28 rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : quadros.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="font-semibold">Não foi possível carregar os quadros.</p>
          <p className="mt-1 text-sm text-muted-foreground">{mensagemLeiga(quadros.error)}</p>
          <Button variant="outline" className="mt-4" onClick={() => quadros.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Tentar de novo
          </Button>
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SquareKanban className="h-7 w-7" />
          </span>
          <p className="mt-4 text-lg font-semibold">Nenhum quadro ainda</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {podeGerenciar
              ? 'Comece por um dos modelos abaixo: eles já vêm com as colunas e as tarefas do Trello de hoje. Dá para mudar tudo depois.'
              : 'Quem gerencia a loja ainda não criou nenhum quadro. Peça para o gerente criar o primeiro.'}
          </p>

          {podeGerenciar && (
            <>
              {modelosProntos.length > 0 && (
                <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
                  {modelosProntos.map((m) => (
                    <AtalhoDeModelo key={m.id} modelo={m} onUsar={() => abrirNovo(m.id)} />
                  ))}
                </div>
              )}
              <Button variant="outline" className="mt-6" onClick={() => abrirNovo('em-branco')}>
                <Plus className="h-4 w-4" />
                Criar quadro em branco
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((q) => (
            <CartaoDoQuadro
              key={q.id}
              quadro={q}
              podeGerenciar={podeGerenciar}
              onAbrir={() => abrir(q.id)}
              onRenomear={() => {
                setNovoNome(q.nome);
                setRenomeando(q);
              }}
              onArquivar={() => setArquivando(q)}
            />
          ))}
        </div>
      )}

      {podeGerenciar && (
        <NovoQuadroDialog
          aberto={novoAberto}
          modeloInicial={modeloInicial}
          onClose={() => setNovoAberto(false)}
          onCriar={criarEAbrir}
        />
      )}

      <Dialog open={renomeando !== null} onOpenChange={(v) => !v && setRenomeando(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={salvarNome}>
            <DialogHeader>
              <DialogTitle>Renomear quadro</DialogTitle>
              <DialogDescription>O nome novo aparece para toda a equipe na hora.</DialogDescription>
            </DialogHeader>
            <Input
              className="my-4"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex.: Loja, Assistência"
              autoFocus
              aria-label="Nome do quadro"
            />
            <DialogFooter>
              <Button type="button" variant="cancelar" onClick={() => setRenomeando(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="sucesso" disabled={!novoNome.trim()}>
                Salvar nome
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={arquivando !== null} onOpenChange={(v) => !v && setArquivando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar o quadro “{arquivando?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele sai da lista de quadros e as tarefas dele param de aparecer em Minhas Tarefas. Ainda não
              há tela para trazer um quadro arquivado de volta: se precisar, fale com o Felipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={buttonVariants({ variant: 'cancelar' })}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'alerta' })}
              onClick={() => {
                if (arquivando) arquivarQuadro(arquivando.id);
                setArquivando(null);
              }}
            >
              Arquivar quadro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
