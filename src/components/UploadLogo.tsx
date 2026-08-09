import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

/**
 * Envio da logo da loja.
 *
 * Pedido do Felipe em 09/08: "a logo seria anexada, não URL". O campo antigo
 * pedia um endereço da internet — só servia para quem já tivesse a imagem
 * publicada em algum lugar. Quem tem loja tem o arquivo no computador.
 *
 * O arquivo vai para o bucket `logos`, na pasta da própria loja, e o endereço
 * público resultante é gravado em `tenants.logo_url`. A coluna continua sendo
 * texto: nada que já lê esse campo (laudo, documento) precisou mudar.
 *
 * Sempre o mesmo nome de arquivo por loja, com `upsert`. Assim trocar a logo
 * não deixa lixo acumulado no armazenamento, e o endereço gravado continua
 * valendo. O `?v=` no fim é o que força o navegador a mostrar a imagem nova em
 * vez da que ele guardou em cache — sem isso, trocar a logo parece não ter
 * funcionado.
 */

interface Props {
  tenantId: string | null;
  valor: string;
  onChange: (url: string) => void;
  podeEditar: boolean;
}

const TAMANHO_MAXIMO = 2 * 1024 * 1024; // 2 MB
const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export function UploadLogo({ tenantId, valor, onChange, podeEditar }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroImagem, setErroImagem] = useState(false);

  const enviar = async (arquivo: File) => {
    if (!tenantId) {
      toast({
        title: 'Loja não identificada',
        description: 'Seu usuário precisa estar vinculado a uma loja.',
        variant: 'destructive',
      });
      return;
    }

    if (!TIPOS.includes(arquivo.type)) {
      toast({
        title: 'Formato não aceito',
        description: 'Envie uma imagem PNG, JPG, WEBP ou SVG.',
        variant: 'destructive',
      });
      return;
    }

    if (arquivo.size > TAMANHO_MAXIMO) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O limite é 2 MB. Logo de loja costuma ter bem menos que isso.',
        variant: 'destructive',
      });
      return;
    }

    setEnviando(true);
    try {
      const extensao = arquivo.name.split('.').pop()?.toLowerCase() || 'png';
      const caminho = `${tenantId}/logo.${extensao}`;

      const { error } = await supabase.storage
        .from('logos')
        .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });

      if (error) throw error;

      const { data } = supabase.storage.from('logos').getPublicUrl(caminho);
      setErroImagem(false);
      onChange(`${data.publicUrl}?v=${Date.now()}`);

      toast({
        title: 'Logo enviada',
        description: 'Clique em Salvar para confirmar.',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Tente novamente.';
      toast({
        title: 'Não foi possível enviar',
        description: /policy|permission|unauthorized/i.test(msg)
          ? 'Seu perfil de acesso não permite alterar os dados da loja.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setEnviando(false);
      // Limpa o campo para permitir escolher o mesmo arquivo de novo depois.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label>Logo da loja</Label>
      <p className="text-sm text-muted-foreground">
        Aparece nos laudos e documentos entregues ao cliente. PNG, JPG, WEBP ou SVG, até 2 MB.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {valor && !erroImagem ? (
          <img
            src={valor}
            alt="Logo da loja"
            className="h-20 max-w-[200px] rounded border bg-white object-contain p-2"
            onError={() => setErroImagem(true)}
          />
        ) : (
          <div className="flex h-20 w-[200px] items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
            {erroImagem ? 'Não foi possível abrir' : 'Sem logo'}
          </div>
        )}

        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={TIPOS.join(',')}
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void enviar(arquivo);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
            >
              {enviando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {valor ? 'Trocar logo' : 'Escolher arquivo'}
            </Button>

            {valor && (
              <Button
                type="button"
                variant="outline"
                disabled={enviando}
                onClick={() => {
                  // Tira só a referência. O arquivo em si fica no armazenamento:
                  // apagar de verdade quebraria um laudo antigo que já aponta
                  // para ele.
                  setErroImagem(false);
                  onChange('');
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
