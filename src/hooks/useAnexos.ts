import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { LIMITE_DO_ANEXO, nomeDeArquivoSeguro, tamanhoLegivel } from '@/lib/tarefas';
import { mensagemLeiga } from '@/lib/tarefasMutacoes';
import type { Anexo } from '@/types/tarefas';

/**
 * Os arquivos de uma tarefa (v2, pedido do Felipe em 24/09: "tem que anexar
 * arquivos" — foto, PDF, o que for).
 *
 * O arquivo em si vai para o bucket PRIVADO `tarefas-anexos`; a tabela
 * `tarefas_anexos` guarda o nome, o caminho, o tamanho e quem enviou. Privado
 * porque foto de bancada e de balcão não é para circular por link solto na
 * internet: para abrir, a tela pede um link assinado que vale 10 minutos.
 *
 * O caminho começa pela loja (`<tenant_id>/<tarefa_id>/<uuid>-<nome>`): é
 * assim que a regra do Storage confere que o arquivo é da loja de quem pede.
 */

export const BUCKET_DE_ANEXOS = 'tarefas-anexos';
/** Quanto tempo o link de abrir um anexo vale (segundos). */
const VALIDADE_DO_LINK = 600;

export const chaveDosAnexos = (tarefaId: string | null) => ['anexos', tarefaId] as const;

/**
 * O aviso leigo de um envio que o armazenamento de arquivos (Storage) recusou.
 *
 * Os erros de lá não trazem o `code` que `mensagemLeiga` reconhece — só o
 * número da resposta (`statusCode`/`status`) e a frase crua do servidor, em
 * inglês técnico ("The object exceeded the maximum allowed size", "Bad
 * Gateway"). Então:
 * - 413: arquivo grande demais (o limite do cofre é 20 MB);
 * - o que `mensagemLeiga` já sabe traduzir (sem internet, sessão vencida,
 *   falta de permissão) sai como ela traduz;
 * - 401/403 que ela não reconheceu: sessão vencida / falta de permissão;
 * - o resto: frase genérica — nunca o inglês do servidor.
 */
export function avisoDoEnvio(erro: unknown): string {
  const e = (erro ?? {}) as { statusCode?: string | number; status?: string | number; message?: unknown };
  const numero = Number(e.statusCode ?? e.status);
  if (numero === 413) return 'Arquivo grande demais: o limite é 20 MB.';

  const leiga = mensagemLeiga(erro);
  const cru = erro instanceof Error ? erro.message : typeof e.message === 'string' ? e.message : 'Erro desconhecido';
  if (leiga !== cru) return leiga;
  if (numero === 401) return 'Sua sessão expirou. Entre de novo no sistema.';
  if (numero === 403) return 'Seu perfil de acesso não permite isso.';
  return 'Não foi possível enviar o arquivo. Tente de novo; se continuar, avise o Felipe.';
}

/** Mais antigo primeiro, como a lista vem do banco. */
function porCriacao(a: Anexo, b: Anexo): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/** Um id novo para o caminho: dois arquivos com o mesmo nome não se atropelam. */
function idNovo(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useAnexos(tarefaId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;
  const chave = chaveDosAnexos(tarefaId);
  const [enviandoAgora, setEnviandoAgora] = useState(0);

  const consulta = useQuery({
    queryKey: chave,
    enabled: Boolean(tarefaId),
    queryFn: async (): Promise<Anexo[]> => {
      const { data, error } = await supabase
        .from('tarefas_anexos')
        .select('id, tarefa_id, nome, caminho, tipo, tamanho, enviado_por, created_at')
        .eq('tarefa_id', tarefaId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as Anexo[];
    },
  });

  const atualizarTelas = useCallback(() => {
    qc.invalidateQueries({ queryKey: chave });
    // O clipe com a contagem, no cartão do quadro.
    qc.invalidateQueries({ queryKey: ['tarefas-quadro'] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, tarefaId]);

  /**
   * Envia um arquivo por vez, e cada um vale por si: se a foto 2 de 3 falhar,
   * a 1 e a 3 ficam, e o aviso diz qual faltou. Nunca rejeita.
   */
  const enviar = useCallback(
    async (arquivos: File[]) => {
      if (!tarefaId || arquivos.length === 0) return;
      if (!tenantId) {
        toast({
          title: 'Não foi possível anexar',
          description: 'Não deu para identificar a sua loja. Entre de novo no sistema.',
          variant: 'destructive',
        });
        return;
      }

      setEnviandoAgora((n) => n + 1);
      try {
        for (const arquivo of arquivos) {
          // Conferido aqui antes de subir: o banco também recusa, mas só
          // depois de a pessoa esperar o arquivo inteiro atravessar a internet.
          if (arquivo.size > LIMITE_DO_ANEXO) {
            toast({
              title: `"${arquivo.name}" não foi anexado`,
              description: `Arquivo grande demais: o limite é 20 MB (este tem ${tamanhoLegivel(arquivo.size)}).`,
              variant: 'destructive',
            });
            continue;
          }

          const caminho = `${tenantId}/${tarefaId}/${idNovo()}-${nomeDeArquivoSeguro(arquivo.name)}`;
          const armazenamento = supabase.storage.from(BUCKET_DE_ANEXOS);
          const { error: erroUpload } = await armazenamento.upload(caminho, arquivo, {
            contentType: arquivo.type || undefined,
            upsert: false,
          });
          if (erroUpload) {
            toast({
              title: `"${arquivo.name}" não foi anexado`,
              description: avisoDoEnvio(erroUpload),
              variant: 'destructive',
            });
            continue;
          }

          // Sem tenant_id e sem enviado_por: o banco copia a loja da tarefa e
          // carimba quem está logado (ninguém anexa em nome de outro).
          const { error: erroLinha } = await supabase.from('tarefas_anexos').insert({
            tarefa_id: tarefaId,
            nome: arquivo.name.slice(0, 200),
            caminho,
            tipo: arquivo.type || null,
            tamanho: arquivo.size,
          } as TablesInsert<'tarefas_anexos'>);
          if (erroLinha) {
            // O arquivo subiu mas a ficha dele não gravou: sem a ficha, ninguém
            // acha o arquivo — ele só ocuparia espaço. Apaga do bucket.
            await armazenamento.remove([caminho]).catch(() => undefined);
            toast({
              title: `"${arquivo.name}" não foi anexado`,
              description: mensagemLeiga(erroLinha),
              variant: 'destructive',
            });
          }
        }
      } finally {
        setEnviandoAgora((n) => n - 1);
        atualizarTelas();
      }
    },
    [tarefaId, tenantId, toast, atualizarTelas],
  );

  /**
   * Remove a ficha primeiro e o arquivo depois. Nessa ordem porque o que a
   * pessoa vê é a ficha: se o arquivo não sair do bucket, só sobra espaço
   * ocupado, sem nada quebrado na tela. Na ordem contrária, uma falha deixaria
   * na tarefa um anexo que não abre. Nunca rejeita.
   */
  const remover = useCallback(
    async (anexo: Anexo) => {
      qc.setQueryData<Anexo[]>(chave, (lista) => lista?.filter((a) => a.id !== anexo.id));

      // `.select('id')` para saber se apagou MESMO: quando a regra de acesso
      // barra um delete, o banco não dá erro — só apaga zero linhas. Sem essa
      // conferência, o passo seguinte apagaria o arquivo do bucket (a regra do
      // Storage é mais larga) e a tarefa ficaria com um anexo que não abre.
      const { data: apagadas, error } = await supabase
        .from('tarefas_anexos')
        .delete()
        .eq('id', anexo.id)
        .select('id');
      if (error || (apagadas ?? []).length === 0) {
        // Volta SÓ o anexo recusado, por cima da lista como está agora — não
        // a foto da lista de antes: se a pessoa removeu A e logo depois B, e
        // só A falhou, B não pode reaparecer (mesmo cuidado do useConferencia).
        qc.setQueryData<Anexo[]>(chave, (atual) =>
          atual && !atual.some((a) => a.id === anexo.id) ? [...atual, anexo].sort(porCriacao) : atual,
        );
        toast({
          title: 'Não foi possível remover o anexo',
          description: error
            ? mensagemLeiga(error)
            : 'Só quem enviou o arquivo ou quem edita tarefas pode removê-lo.',
          variant: 'destructive',
        });
        atualizarTelas();
        return;
      }

      const { error: erroArquivo } = await supabase.storage.from(BUCKET_DE_ANEXOS).remove([anexo.caminho]);
      if (erroArquivo) {
        console.warn('Anexo removido da tarefa, mas o arquivo ficou no Storage:', anexo.caminho, erroArquivo);
      }
      atualizarTelas();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, tarefaId, toast, atualizarTelas],
  );

  /** Link assinado para abrir/mostrar o anexo (vale 10 minutos). null = não deu. */
  const urlDe = useCallback(async (anexo: Anexo): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_DE_ANEXOS)
        .createSignedUrl(anexo.caminho, VALIDADE_DO_LINK);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  }, []);

  return {
    anexos: consulta.data ?? [],
    carregando: consulta.isLoading,
    enviando: enviandoAgora > 0,
    enviar,
    remover,
    urlDe,
  };
}
