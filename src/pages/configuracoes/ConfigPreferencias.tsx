import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { TaxaDeAnalise } from '@/components/configuracoes/TaxaDeAnalise';

/**
 * Preferências do Sistema.
 *
 * Guarda o que configura o comportamento do sistema e não cabe em outro lugar.
 * Hoje: categorias financeiras — que não têm tela própria e sem as quais o
 * Fluxo de Caixa não consegue separar nada por tipo de gasto.
 *
 * As demais listas de configuração vivem em telas próprias; esta página aponta
 * para elas em vez de duplicar.
 */

interface Categoria {
  id: string;
  nome: string;
  natureza: 'receita' | 'despesa';
  ativo: boolean;
}

function EditorCategorias({ natureza }: { natureza: 'receita' | 'despesa' }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;

  const [nova, setNova] = useState('');
  const chave = ['categorias-financeiras-admin', natureza];

  const { data, isLoading } = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from('categorias_financeiras')
        .select('id, nome, natureza, ativo')
        .eq('natureza', natureza)
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });

  const aoFalhar = (error: unknown) => {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    toast({
      title: 'Não foi possível salvar',
      description: /row-level security|policy/i.test(msg)
        ? 'Só quem pode alterar configurações do sistema mexe aqui.'
        : msg,
      variant: 'destructive',
    });
  };

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: chave });
    queryClient.invalidateQueries({ queryKey: ['categorias-financeiras', natureza] });
  };

  const criar = useMutation({
    mutationFn: async (nome: string) => {
      if (!tenantId) throw new Error('Usuário sem loja vinculada.');
      const proxima = ((data ?? []).length + 1) * 10;
      const { error } = await supabase
        .from('categorias_financeiras')
        .insert({ tenant_id: tenantId, nome: nome.trim(), natureza, ordem: proxima });
      if (error) throw error;
    },
    onSuccess: () => {
      setNova('');
      invalidar();
    },
    onError: aoFalhar,
  });

  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('categorias_financeiras').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {natureza === 'despesa'
          ? 'Como o dinheiro sai da loja. É o que separa "Aluguel" de "Compra de peças" no Fluxo de Caixa.'
          : 'Como o dinheiro entra. Separa venda de produto de serviço de assistência nos relatórios.'}
      </p>

      <div className="flex gap-2">
        <Input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && nova.trim() && criar.mutate(nova)}
          placeholder={
            natureza === 'despesa' ? 'Ex.: Manutenção da loja' : 'Ex.: Venda de acessórios'
          }
        />
        <Button onClick={() => criar.mutate(nova)} disabled={!nova.trim() || criar.isPending}>
          {criar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {(data ?? []).map((c) => (
            <li
              key={c.id}
              className={cn('flex items-center gap-3 px-4 py-2.5', !c.ativo && 'bg-muted/40')}
            >
              <span className={cn('flex-1 text-sm', !c.ativo && 'text-muted-foreground line-through')}>
                {c.nome}
              </span>
              <Switch
                checked={c.ativo}
                onCheckedChange={(ativo) => alternar.mutate({ id: c.id, ativo })}
                aria-label={`${c.ativo ? 'Desativar' : 'Ativar'} ${c.nome}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ATALHOS = [
  {
    titulo: 'Listas do Sistema',
    hint: 'Marcas, cores, condições, checklist de defeitos, origens de venda.',
    para: '/cadastros/listas',
  },
  {
    titulo: 'Perfis e Permissões',
    hint: 'O que cada perfil de acesso pode fazer.',
    para: '/configuracoes/perfis',
  },
  {
    titulo: 'Formas de Pagamento',
    hint: 'Parcelas, taxas e juros de cada forma de recebimento.',
    para: '/cadastros/formas-pagamento',
  },
];

export default function ConfigPreferencias() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        titulo="Preferências do Sistema"
        hint="Ajustes que mudam o comportamento do sistema para a loja inteira."
      />

      <section className="mb-10">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Categorias financeiras
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground/80">
          Sem categoria, todo lançamento cai em "Sem categoria" e o Fluxo de Caixa
          não consegue mostrar para onde o dinheiro foi.
        </p>

        <Tabs defaultValue="despesa">
          <TabsList className="mb-4">
            <TabsTrigger value="despesa">Despesas</TabsTrigger>
            <TabsTrigger value="receita">Receitas</TabsTrigger>
          </TabsList>
          <TabsContent value="despesa">
            <EditorCategorias natureza="despesa" />
          </TabsContent>
          <TabsContent value="receita">
            <EditorCategorias natureza="receita" />
          </TabsContent>
        </Tabs>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Assistência técnica
        </h2>
        <TaxaDeAnalise />
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Outras configurações
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ATALHOS.map((a) => (
            <Link key={a.para} to={a.para} className="group">
              <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
                <CardContent className="flex items-start justify-between gap-3 p-5">
                  <div>
                    <p className="font-medium leading-none">{a.titulo}</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">{a.hint}</p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground/0 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
