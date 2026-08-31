import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CAMPOS_POR_FORMULARIO,
  NOME_DO_FORMULARIO,
  exigenciasDaLoja,
  type CampoConfiguravel,
  type Formulario,
} from '@/config/camposObrigatorios';

/**
 * Campos obrigatórios — cada loja escolhe o que exige.
 *
 * Pedido do Felipe em 27 e 28/08, pensando na venda do sistema: *"tem loja
 * para quem é importante ter o Instagram; para mim não é"*.
 *
 * A tela grava só o que difere do padrão de fábrica (ver
 * `src/config/camposObrigatorios.ts`), do mesmo jeito que a exceção de
 * permissão por usuário: linha no banco é exceção, ausência de linha é o
 * padrão. Por isso desligar um campo que já vinha desligado apaga a linha em
 * vez de gravar `false` — a tabela fica só com o que a loja realmente decidiu.
 */

function ListaDeCampos({ formulario }: { formulario: Formulario }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;
  const [salvando, setSalvando] = useState<string | null>(null);

  const chave = ['campos-obrigatorios', formulario];

  const { data: escolhas, isLoading } = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campos_obrigatorios')
        .select('campo, obrigatorio')
        .eq('formulario', formulario);
      if (error) throw error;
      return data ?? [];
    },
  });

  const exigencias = exigenciasDaLoja(formulario, escolhas);

  const gravar = useMutation({
    mutationFn: async ({ campo, exigir }: { campo: CampoConfiguravel; exigir: boolean }) => {
      if (!tenantId) throw new Error('Usuário sem loja vinculada.');

      // Voltou a ser igual ao padrão de fábrica? Apaga a linha em vez de
      // gravar o mesmo valor: a tabela guarda decisões, não uma cópia do
      // catálogo. Assim, mudar o padrão no código passa a valer para quem
      // nunca opinou sobre aquele campo.
      if (exigir === campo.padrao) {
        const { error } = await supabase
          .from('campos_obrigatorios')
          .delete()
          .eq('formulario', formulario)
          .eq('campo', campo.chave);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from('campos_obrigatorios').upsert(
        {
          tenant_id: tenantId,
          formulario,
          campo: campo.chave,
          obrigatorio: exigir,
          definido_por: user?.id ?? null,
        },
        { onConflict: 'tenant_id,formulario,campo' },
      );
      if (error) throw error;
    },
    onSuccess: (_dado, { campo, exigir }) => {
      queryClient.invalidateQueries({ queryKey: chave });
      toast({
        title: exigir ? `${campo.rotulo} agora é obrigatório` : `${campo.rotulo} deixou de ser obrigatório`,
        description: 'Vale a partir do próximo cadastro — inclusive para quem já está com a tela aberta, depois de atualizar.',
        variant: 'success',
      });
    },
    onError: (erro: unknown) => {
      const msg = erro instanceof Error ? erro.message : 'Erro desconhecido';
      toast({
        title: 'Não foi possível salvar',
        description: /row-level security|policy/i.test(msg)
          ? 'Seu acesso não permite mudar as configurações do sistema.'
          : msg,
        variant: 'destructive',
      });
    },
    onSettled: () => setSalvando(null),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const grupos = CAMPOS_POR_FORMULARIO[formulario].reduce<Record<string, CampoConfiguravel[]>>(
    (acc, campo) => {
      (acc[campo.grupo] ??= []).push(campo);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-4">
      {Object.entries(grupos).map(([grupo, campos]) => (
        <Card key={grupo}>
          <CardContent className="p-0">
            <p className="border-b px-4 py-2.5 text-sm font-medium text-muted-foreground">
              {grupo}
            </p>
            <div className="divide-y">
              {campos.map((campo) => {
                const exigido = exigencias[campo.chave];
                return (
                  <div key={campo.chave} className="flex items-start gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {campo.rotulo}
                        {campo.fixo && (
                          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                            <Lock className="h-3 w-3" />
                            sempre obrigatório
                          </span>
                        )}
                        {campo.condicao === 'pessoa_fisica' && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                            só pessoa física
                          </span>
                        )}
                        {campo.condicao === 'pessoa_juridica' && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                            só empresa
                          </span>
                        )}
                      </p>
                      {campo.alerta && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{campo.alerta}</p>
                      )}
                    </div>
                    <Switch
                      checked={exigido}
                      disabled={campo.fixo || salvando === campo.chave}
                      onCheckedChange={(marcado) => {
                        setSalvando(campo.chave);
                        gravar.mutate({ campo, exigir: marcado });
                      }}
                      aria-label={`Exigir ${campo.rotulo}`}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ConfigCamposObrigatorios() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        titulo="Campos obrigatórios"
        hint="Escolha o que a sua loja exige em cada cadastro. O que estiver ligado aqui passa a ser cobrado na hora de salvar — tanto num cadastro novo quanto ao editar uma ficha antiga."
      />

      <p className="mb-4 text-sm text-muted-foreground">
        Campo marcado com <strong>cadeado</strong> não pode ser desligado: é informação que o
        sistema recusa vazia de qualquer jeito. Os demais são escolha sua.
      </p>

      <Tabs defaultValue="cliente">
        <TabsList className="mb-4">
          <TabsTrigger value="cliente">{NOME_DO_FORMULARIO.cliente}</TabsTrigger>
          <TabsTrigger value="os">{NOME_DO_FORMULARIO.os}</TabsTrigger>
        </TabsList>
        <TabsContent value="cliente">
          <ListaDeCampos formulario="cliente" />
        </TabsContent>
        <TabsContent value="os">
          <ListaDeCampos formulario="os" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
