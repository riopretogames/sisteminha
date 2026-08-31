import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PERMISSIONS } from '@/config/permissions';
import { moeda } from '@/lib/format';

/**
 * As peças que um serviço consome — a ficha técnica dele.
 *
 * Pedido do Felipe em 31/08, comparando com o sistema antigo: *"já tem
 * serviços pré-cadastrados, com os custos já pré-cadastrados, com as peças já
 * pré-cadastradas"*.
 *
 * O que isso resolve, e é maior do que parece:
 *
 *   • na OS, lançar "Troca de tela" passa a trazer a tela junto. Hoje são dois
 *     lançamentos e o segundo é fácil de esquecer — e esquecer tira a peça do
 *     estoque da conta e infla a margem daquele serviço;
 *   • o custo do serviço vira CONTA. Antes era um número digitado uma vez: a
 *     peça encarecia e o custo do serviço continuava dizendo o preço do ano
 *     passado, sem ninguém perceber.
 *
 * É padrão, não obrigação: na OS de verdade dá para trocar a peça, mudar a
 * quantidade ou tirar.
 */

interface Props {
  /** Serviço já salvo. Enquanto não existe, a ficha técnica não tem onde morar. */
  servicoId: string | null;
}

interface PecaDoServico {
  id: string;
  produto_id: string;
  quantidade: number;
  produtos: { nome: string; custo: number | null; estoque_atual: number | null } | null;
}

export function PecasDoServico({ servicoId }: Props) {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const podeGerenciar = can(PERMISSIONS.REGISTRY_SERVICES_MANAGE);
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);

  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [salvando, setSalvando] = useState(false);

  const chave = ['servico-pecas', servicoId];

  const { data: pecas, isLoading } = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<PecaDoServico[]> => {
      const { data, error } = await supabase
        .from('servico_pecas')
        // Produto sempre pela view (regra de custo protegido): quem não pode
        // ver custo recebe a coluna nula em vez de erro de permissão.
        .select('id, produto_id, quantidade, produtos:vw_produtos(nome, custo, estoque_atual)')
        .eq('servico_id', servicoId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as PecaDoServico[];
    },
    enabled: !!servicoId,
  });

  const { data: produtos } = useQuery({
    queryKey: ['produtos-para-ficha-tecnica'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('id, nome, custo, estoque_atual')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!servicoId,
  });

  if (!servicoId) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Cadastre o serviço primeiro. Depois de salvo, você volta aqui para dizer quais peças
        ele consome — e aí lançar esse serviço numa OS já traz as peças junto.
      </p>
    );
  }

  const custoDasPecas = (pecas ?? []).reduce(
    (soma, p) => soma + Number(p.quantidade) * Number(p.produtos?.custo ?? 0),
    0,
  );

  const adicionar = async () => {
    const qtd = Number(quantidade.replace(',', '.'));
    if (!produtoId || !Number.isFinite(qtd) || qtd <= 0) {
      toast({
        title: 'Escolha a peça e a quantidade',
        description: 'A quantidade precisa ser maior que zero.',
        variant: 'destructive',
      });
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.from('servico_pecas').insert({
        tenant_id: user?.profile?.tenant_id ?? '',
        servico_id: servicoId,
        produto_id: produtoId,
        quantidade: qtd,
      });
      if (error) throw error;

      setProdutoId('');
      setQuantidade('1');
      queryClient.invalidateQueries({ queryKey: chave });
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Tente novamente.';
      toast({
        title: 'Não foi possível adicionar a peça',
        description: /duplicate|unique/i.test(msg)
          ? 'Esta peça já está na ficha técnica. Para usar mais de uma unidade, aumente a quantidade.'
          : /policy|permission/i.test(msg)
            ? 'Seu acesso não permite mexer no cadastro de serviços.'
            : msg,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from('servico_pecas').delete().eq('id', id);
    if (error) {
      toast({ title: 'Não foi possível remover', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: chave });
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (pecas ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma peça. Serviço de mão de obra pura — limpeza, formatação — fica assim mesmo.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {(pecas ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.produtos?.nome ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {Number(p.quantidade)}× · estoque hoje: {p.produtos?.estoque_atual ?? 0}
                  {veCusto && p.produtos?.custo != null && (
                    <> · {moeda(Number(p.quantidade) * Number(p.produtos.custo))}</>
                  )}
                </p>
              </div>
              {podeGerenciar && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => remover(p.id)}
                  aria-label={`Tirar ${p.produtos?.nome ?? 'peça'} da ficha técnica`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}

          {veCusto && custoDasPecas > 0 && (
            <div className="flex justify-between p-2.5 text-sm font-medium">
              <span className="text-muted-foreground">Custo das peças, com o preço de hoje</span>
              <span>{moeda(custoDasPecas)}</span>
            </div>
          )}
        </div>
      )}

      {podeGerenciar && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label htmlFor="peca-do-servico" className="text-xs">
              Peça
            </Label>
            <Select value={produtoId} onValueChange={setProdutoId}>
              <SelectTrigger id="peca-do-servico">
                <SelectValue placeholder="Escolha do estoque" />
              </SelectTrigger>
              <SelectContent>
                {(produtos ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-24 space-y-1">
            <Label htmlFor="qtd-da-peca" className="text-xs">
              Quantidade
            </Label>
            <Input
              id="qtd-da-peca"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              inputMode="decimal"
            />
          </div>

          <Button type="button" variant="outline" onClick={adicionar} disabled={salvando}>
            {salvando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Adicionar peça
          </Button>
        </div>
      )}
    </div>
  );
}
