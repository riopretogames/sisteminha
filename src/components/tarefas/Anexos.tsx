import { useEffect, useMemo, useRef, useState, type ComponentType, type DragEvent } from 'react';
import {
  CloudUpload,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  ImageOff,
  Loader2,
  Paperclip,
  Trash2,
} from 'lucide-react';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAnexos } from '@/hooks/useAnexos';
import { usePessoasDaLoja } from '@/hooks/usePessoasDaLoja';
import { dataHora } from '@/lib/format';
import { LIMITE_DO_ANEXO, ehImagem, quandoFoi, tamanhoLegivel } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type { Anexo } from '@/types/tarefas';

export interface PropsAnexos {
  tarefaId: string;
  /**
   * Pode anexar? Quem edita o quadro OU é responsável pela tarefa — a mesma
   * regra do banco: anexar a foto do serviço feito é andamento, não edição.
   */
  podeAnexar: boolean;
  /** Tem `tasks.edit`: remove o anexo de qualquer um. Sem isso, só os que a própria pessoa enviou. */
  podeRemoverQualquer: boolean;
  /** Id da conta de quem está logado — é o que `enviado_por` guarda. */
  euId: string;
}

/**
 * Os arquivos da tarefa (v2, pedido do Felipe em 24/09: "tem que anexar
 * arquivos" — foto, PDF, o que for).
 *
 * Foto aparece em miniatura, porque é o que a equipe mais vai mandar (a
 * vitrine arrumada, o balcão limpo, a peça que chegou) e o gerente quer bater
 * o olho sem abrir um por um. O resto (PDF, planilha, áudio do WhatsApp) vira
 * uma linha com ícone, nome e tamanho.
 *
 * O arquivo mora num cofre fechado: para mostrar ou abrir, a tela pede um
 * link que vale 10 minutos. Por isso "Abrir" pede o link na hora do clique, e
 * não reaproveita um velho que pode já ter vencido.
 */
export function Anexos({ tarefaId, podeAnexar, podeRemoverQualquer, euId }: PropsAnexos) {
  const { anexos, carregando, enviando, enviar, remover, urlDe } = useAnexos(tarefaId);
  const pessoas = usePessoasDaLoja().data;
  const { toast } = useToast();
  const seletor = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [paraRemover, setParaRemover] = useState<Anexo | null>(null);

  const nomePorId = useMemo(() => new Map((pessoas ?? []).map((p) => [p.id, p.nome])), [pessoas]);
  const quemEnviou = (a: Anexo) =>
    a.enviado_por === euId ? 'você' : nomePorId.get(a.enviado_por) ?? 'alguém da equipe';
  const podeRemover = (a: Anexo) => podeRemoverQualquer || a.enviado_por === euId;

  const imagens = anexos.filter((a) => ehImagem(a.tipo, a.nome));
  const outros = anexos.filter((a) => !ehImagem(a.tipo, a.nome));

  /**
   * Confere o tamanho ANTES de subir: o banco também recusaria, mas só depois
   * de a pessoa esperar o vídeo de 80 MB atravessar a internet inteiro. Os
   * que cabem seguem; os grandes ficam de fora com o nome dito no aviso.
   */
  const receber = (lista: FileList | File[] | null) => {
    const arquivos = Array.from(lista ?? []);
    if (arquivos.length === 0) return;
    const grandes = arquivos.filter((a) => a.size > LIMITE_DO_ANEXO);
    const cabem = arquivos.filter((a) => a.size <= LIMITE_DO_ANEXO);

    if (grandes.length > 0) {
      toast({
        title:
          grandes.length === 1
            ? `"${grandes[0].name}" não foi anexado`
            : `${grandes.length} arquivos não foram anexados`,
        description:
          grandes.length === 1
            ? `Arquivo grande demais: o limite é 20 MB (este tem ${tamanhoLegivel(grandes[0].size)}).`
            : `Arquivo grande demais: o limite é 20 MB. Ficaram de fora: ${grandes.map((a) => a.name).join(', ')}.`,
        variant: 'destructive',
      });
    }
    if (cabem.length > 0) void enviar(cabem);
  };

  const abrir = async (anexo: Anexo) => {
    // A aba nova abre JÁ, no clique, e só depois recebe o endereço: janela
    // aberta depois de uma espera é barrada pelo bloqueador do navegador.
    const janela = window.open('', '_blank');
    const url = await urlDe(anexo);
    if (!url) {
      janela?.close();
      toast({
        title: 'Não foi possível abrir o arquivo',
        description: 'Tente de novo; se continuar, avise o Felipe.',
        variant: 'destructive',
      });
      return;
    }
    if (janela) {
      janela.opener = null;
      janela.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // Só arquivo de verdade liga a área (arrastar um texto ou um cartão não).
  const temArquivo = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const soltavel = podeAnexar
    ? {
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          if (!temArquivo(e)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setArrastando(true);
        },
        onDragLeave: (e: DragEvent<HTMLDivElement>) => {
          // Passar por cima de uma miniatura também dispara "saiu"; só apaga o
          // destaque quando o arquivo sai da área inteira.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setArrastando(false);
        },
        onDrop: (e: DragEvent<HTMLDivElement>) => {
          if (!temArquivo(e)) return;
          e.preventDefault();
          e.stopPropagation();
          setArrastando(false);
          receber(e.dataTransfer.files);
        },
      }
    : {};

  const botaoAnexar = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={enviando}
      onClick={() => seletor.current?.click()}
      className="bg-background"
    >
      {enviando ? <Loader2 className="animate-spin" /> : <Paperclip />}
      {enviando ? 'Enviando...' : 'Anexar arquivo'}
    </Button>
  );

  return (
    <div
      {...soltavel}
      data-testid="area-de-anexos"
      className={cn(
        'relative space-y-3 rounded-xl transition-colors',
        arrastando && 'outline-dashed outline-2 outline-offset-4 outline-primary/60',
      )}
    >
      {podeAnexar && (
        <input
          ref={seletor}
          type="file"
          multiple
          hidden
          aria-label="Escolher arquivos para anexar"
          onChange={(e) => {
            receber(e.target.files);
            // Limpa para o mesmo arquivo poder ser escolhido de novo depois.
            e.target.value = '';
          }}
        />
      )}

      {arrastando && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/10 backdrop-blur-[1px]">
          <p className="flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-semibold text-primary shadow-md">
            <CloudUpload className="h-4 w-4" />
            Solte para anexar
          </p>
        </div>
      )}

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </p>
      ) : anexos.length === 0 ? (
        podeAnexar ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <CloudUpload className="h-5 w-5" />}
            </span>
            <p className="text-sm font-medium">
              {enviando ? 'Enviando...' : 'Arraste fotos e arquivos para cá'}
            </p>
            {!enviando && (
              <>
                {botaoAnexar}
                <p className="text-[11px] text-muted-foreground">Foto, PDF, planilha, áudio... até 20 MB cada.</p>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum arquivo anexado.</p>
        )
      ) : (
        <>
          {imagens.length > 0 && (
            <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-label="Fotos anexadas">
              {imagens.map((a) => (
                <Miniatura
                  key={a.id}
                  anexo={a}
                  urlDe={urlDe}
                  quem={quemEnviou(a)}
                  podeRemover={podeRemover(a)}
                  onAbrir={() => void abrir(a)}
                  onRemover={() => setParaRemover(a)}
                />
              ))}
            </ul>
          )}

          {outros.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card" aria-label="Arquivos anexados">
              {outros.map((a) => {
                const { Icone, cor, rotulo } = aparenciaDoArquivo(a);
                return (
                  <li key={a.id} className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', cor)}>
                      <Icone className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={a.nome}>
                        {a.nome}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={`Enviado em ${dataHora(a.created_at)}`}>
                        {[rotulo, tamanhoLegivel(a.tamanho), quemEnviou(a), quandoFoi(a.created_at)]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 px-2.5"
                      aria-label={`Abrir ${a.nome}`}
                      onClick={() => void abrir(a)}
                    >
                      <ExternalLink />
                      <span className="hidden sm:inline">Abrir</span>
                    </Button>
                    {podeRemover(a) && (
                      <button
                        type="button"
                        aria-label={`Remover ${a.nome}`}
                        title="Remover anexo"
                        onClick={() => setParaRemover(a)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {enviando && (
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Enviando... pode continuar mexendo na tarefa.
            </p>
          )}

          {podeAnexar && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {botaoAnexar}
              <span className="text-[11px] text-muted-foreground">ou arraste para cá · até 20 MB cada</span>
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={Boolean(paraRemover)}
        onOpenChange={(aberto) => {
          if (!aberto) setParaRemover(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              "{paraRemover?.nome}" sai da tarefa e o arquivo é apagado. Depois de removido, não tem como trazer de
              volta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                if (paraRemover) void remover(paraRemover);
                setParaRemover(null);
              }}
            >
              Remover anexo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * A foto em miniatura. O link para desenhar é pedido quando ela aparece (o
 * cofre é fechado: sem link assinado não há imagem) e `loading="lazy"` deixa
 * o navegador baixar só as que estão à vista.
 */
function Miniatura({
  anexo,
  urlDe,
  quem,
  podeRemover,
  onAbrir,
  onRemover,
}: {
  anexo: Anexo;
  urlDe: (a: Anexo) => Promise<string | null>;
  quem: string;
  podeRemover: boolean;
  onAbrir: () => void;
  onRemover: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const jaTentouDeNovo = useRef(false);

  /**
   * A imagem não carregou. O motivo mais comum não é arquivo ruim: o link
   * vale 10 minutos, e com `loading="lazy"` a imagem só é pedida quando a
   * pessoa rola até ela — com a ficha aberta há mais tempo que isso, o link
   * já venceu. Então pede um link novo UMA vez; só se esse também falhar é
   * que a miniatura fica "Sem prévia".
   */
  const imagemFalhou = () => {
    if (jaTentouDeNovo.current) {
      setFalhou(true);
      return;
    }
    jaTentouDeNovo.current = true;
    void urlDe(anexo).then((u) => {
      if (u) setUrl(u);
      else setFalhou(true);
    });
  };

  useEffect(() => {
    jaTentouDeNovo.current = false;
    let viva = true;
    void urlDe(anexo).then((u) => {
      if (!viva) return;
      if (u) setUrl(u);
      else setFalhou(true);
    });
    return () => {
      viva = false;
    };
    // O link depende do caminho do arquivo, não do objeto (que a recarga troca).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anexo.caminho, urlDe]);

  const detalhes = `${anexo.nome} · ${tamanhoLegivel(anexo.tamanho)} · enviado por ${quem} ${quandoFoi(anexo.created_at)}`;

  return (
    <li className="group relative min-w-0">
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Abrir ${anexo.nome}`}
        title={detalhes}
        className="block aspect-square w-full overflow-hidden rounded-lg border bg-muted shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {url && !falhou ? (
          <img
            src={url}
            alt={anexo.nome}
            loading="lazy"
            onError={imagemFalhou}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : falhou ? (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            <span className="text-[10px]">Sem prévia</span>
          </span>
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </button>
      {podeRemover && (
        <button
          type="button"
          aria-label={`Remover ${anexo.nome}`}
          title="Remover anexo"
          onClick={onRemover}
          // No celular não existe "passar o mouse": lá o botão fica sempre à vista.
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-100 transition-opacity hover:bg-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <p className="mt-1 truncate text-[11px] font-medium" title={anexo.nome}>
        {anexo.nome}
      </p>
      <p className="truncate text-[10px] text-muted-foreground">
        {tamanhoLegivel(anexo.tamanho)} · {quem}
      </p>
    </li>
  );
}

/** Ícone, cor e rótulo curto do arquivo, pelo tipo ou, sem tipo, pela extensão. */
function aparenciaDoArquivo(a: Anexo): {
  Icone: ComponentType<{ className?: string }>;
  cor: string;
  rotulo: string;
} {
  const tipo = (a.tipo ?? '').toLowerCase();
  const ext = /\.([a-z0-9]{1,5})$/i.exec(a.nome)?.[1]?.toLowerCase() ?? '';
  const rotulo = ext.toUpperCase();

  if (tipo === 'application/pdf' || ext === 'pdf') {
    return { Icone: FileText, cor: 'bg-red-500/10 text-red-600 dark:text-red-400', rotulo: 'PDF' };
  }
  if (tipo.includes('spreadsheet') || tipo.includes('excel') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
    return { Icone: FileSpreadsheet, cor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', rotulo };
  }
  if (tipo.startsWith('image/') || ['heic', 'heif', 'tif', 'tiff'].includes(ext)) {
    return { Icone: FileImage, cor: 'bg-pink-500/10 text-pink-600 dark:text-pink-400', rotulo };
  }
  if (tipo.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return { Icone: FileVideo, cor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', rotulo };
  }
  // .oga/.ogg/.opus é o áudio que vem do WhatsApp.
  if (tipo.startsWith('audio/') || ['mp3', 'oga', 'ogg', 'opus', 'm4a', 'wav'].includes(ext)) {
    return { Icone: FileAudio, cor: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', rotulo };
  }
  if (tipo.includes('zip') || tipo.includes('compressed') || ['zip', 'rar', '7z'].includes(ext)) {
    return { Icone: FileArchive, cor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', rotulo };
  }
  if (tipo.includes('word') || tipo.startsWith('text/') || ['doc', 'docx', 'txt', 'odt'].includes(ext)) {
    return { Icone: FileText, cor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', rotulo };
  }
  return { Icone: File, cor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400', rotulo };
}
