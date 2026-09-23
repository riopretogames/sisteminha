import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { PERMISSIONS } from '@/config/permissions';

/**
 * Cadastros > Comprovantes — o que a loja escreve no comprovante de venda.
 *
 * Por que esta tela existe: os itens de garantia e a frase de despedida
 * estavam digitados dentro do programa. Mudar "90 dias" para "180 dias" era
 * tarefa de programador, para um texto que é decisão comercial da loja.
 *
 * E é o tipo de coisa que muda de loja para loja: o Felipe pretende vender o
 * sistema, e cada empresa tem as suas regras de garantia e o seu jeito de se
 * despedir do cliente. Texto de negócio não mora no código.
 *
 * O que NÃO fica aqui: nome, CNPJ, endereço, telefone e logo da loja. Esses
 * são dados da empresa e vivem em Minha Empresa — o comprovante busca de lá.
 * Duas telas mexendo no mesmo dado divergem.
 */

interface TextosDoComprovante {
  termos: string[];
  mensagem: string;
}

/** O texto guardado é uma linha por item; a tela trabalha com uma lista. */
function paraLista(texto: string | null): string[] {
  if (!texto) return [];
  return texto.split('\n').map((l) => l.trim()).filter(Boolean);
}

export default function CadastroComprovantes() {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;
  const podeEditar = can(PERMISSIONS.COMPANY_EDIT);

  const [termos, setTermos] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['textos-comprovante', tenantId],
    queryFn: async (): Promise<TextosDoComprovante> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('termos_comprovante, mensagem_comprovante')
        .eq('id', tenantId!)
        .single();
      if (error) throw error;
      return {
        termos: paraLista(data.termos_comprovante),
        mensagem: data.mensagem_comprovante ?? '',
      };
    },
    enabled: !!tenantId,
  });

  // Carrega o que veio do banco para os campos da tela, uma vez.
  useEffect(() => {
    if (!data) return;
    setTermos(data.termos);
    setMensagem(data.mensagem);
  }, [data]);

  const alterarTermo = (indice: number, valor: string) =>
    setTermos((atual) => atual.map((t, i) => (i === indice ? valor : t)));

  const removerTermo = (indice: number) =>
    setTermos((atual) => atual.filter((_, i) => i !== indice));

  const acrescentarTermo = () => setTermos((atual) => [...atual, '']);

  /** Sobe ou desce um item na lista — a ordem é a que sai impressa. */
  const moverTermo = (indice: number, direcao: -1 | 1) =>
    setTermos((atual) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= atual.length) return atual;
      const copia = [...atual];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });

  const salvar = async () => {
    if (!tenantId) return;
    setSalvando(true);
    try {
      // Item em branco é linha que a pessoa abriu e não preencheu — não vai
      // para o papel virar um "5 -" sozinho no meio da lista.
      const limpos = termos.map((t) => t.trim()).filter(Boolean);

      const { error } = await supabase
        .from('tenants')
        .update({
          termos_comprovante: limpos.join('\n') || null,
          mensagem_comprovante: mensagem.trim() || null,
        })
        .eq('id', tenantId);
      if (error) throw error;

      setTermos(limpos);
      // O comprovante lê os mesmos dados: sem isto, quem imprimisse logo depois
      // de salvar ainda veria o texto antigo, guardado na memória do navegador.
      await queryClient.invalidateQueries({ queryKey: ['tenant-comprovante'] });
      await queryClient.invalidateQueries({ queryKey: ['textos-comprovante'] });

      toast({
        title: 'Comprovante atualizado!',
        description: 'Os próximos comprovantes já saem com este texto.',
        variant: 'success',
      });
    } catch (erro) {
      console.error('Erro ao salvar os textos do comprovante:', erro);
      const msg = erro instanceof Error ? erro.message : 'Tente novamente.';
      toast({
        title: 'Erro ao salvar',
        description: /row-level security|policy/i.test(msg)
          ? 'Seu perfil de acesso não permite fazer isso.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        titulo="Comprovantes"
        hint="O que sai escrito no comprovante de venda: as condições de garantia e a frase de despedida. Vale para a via de folha e para a térmica."
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {!podeEditar && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Você está só olhando</AlertTitle>
              <AlertDescription>
                Alterar o texto do comprovante é permissão de quem edita os dados da empresa.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Condições impressas no comprovante</CardTitle>
              <CardDescription>
                Cada linha vira um item numerado no pé do comprovante. A numeração é automática —
                ao apagar um item do meio, os outros se renumeram sozinhos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {termos.length === 0 && (
                <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Nenhuma condição cadastrada. O comprovante sai sem essa parte.
                </p>
              )}

              {termos.map((termo, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex flex-col pt-1.5">
                    <button
                      type="button"
                      aria-label="Subir"
                      disabled={!podeEditar || i === 0}
                      onClick={() => moverTermo(i, -1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="w-6 pt-2.5 text-right text-sm tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <Input
                    value={termo}
                    disabled={!podeEditar}
                    onChange={(e) => alterarTermo(i, e.target.value)}
                    placeholder="Ex.: Aparelhos novos possuem 1 ano de garantia pelo fabricante."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover"
                    disabled={!podeEditar}
                    onClick={() => removerTermo(i)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}

              {podeEditar && (
                <Button variant="outline" onClick={acrescentarTermo}>
                  <Plus className="mr-2 h-4 w-4" />
                  Acrescentar condição
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Frase de despedida</CardTitle>
              <CardDescription>
                Aparece em destaque no fim do comprovante, logo antes da linha de assinatura.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label htmlFor="mensagem">Mensagem</Label>
                <Input
                  id="mensagem"
                  value={mensagem}
                  disabled={!podeEditar}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="AGRADECEMOS A PREFERÊNCIA, VOLTE SEMPRE!"
                />
              </div>
            </CardContent>
          </Card>

          {podeEditar && (
            <div className="flex justify-end">
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
