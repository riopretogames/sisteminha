import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { moeda } from '@/lib/format';

/**
 * Quanto a loja cobra pela análise quando o cliente NÃO aprova o orçamento.
 *
 * Decisão do Felipe em 31/08: *"a taxa de 80 reais vai ser configurável, porém
 * 80 é o padrão"*. Mesmo raciocínio dos campos obrigatórios — quem comprar o
 * sisteminha cobra outro valor, ou não cobra nada.
 *
 * O que este número faz na prática: quando alguém registra que o cliente
 * recusou o orçamento, a OS deixa de valer o reparo recusado e passa a valer
 * esta taxa. O cliente busca o aparelho e paga isso na retirada — pelo fluxo
 * de entrega que já existe, sem passo novo para a equipe.
 *
 * Zero é resposta válida e significa "não cobramos análise": a OS recusada vai
 * para a retirada sem valor, e a entrega não pede pagamento.
 */
export function TaxaDeAnalise() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;

  const [valor, setValor] = useState<string | null>(null);

  const { data: taxaSalva, isLoading } = useQuery({
    queryKey: ['taxa-analise', tenantId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('taxa_analise')
        .eq('id', tenantId!)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.taxa_analise ?? 0);
    },
    enabled: !!tenantId,
  });

  const salvar = useMutation({
    mutationFn: async (novo: number) => {
      const { error } = await supabase
        .from('tenants')
        .update({ taxa_analise: novo })
        .eq('id', tenantId!);
      if (error) throw error;
    },
    onSuccess: (_d, novo) => {
      queryClient.invalidateQueries({ queryKey: ['taxa-analise', tenantId] });
      setValor(null);
      toast({
        variant: 'success',
        title: 'Taxa de análise salva',
        description:
          novo > 0
            ? `Orçamento recusado passa a valer ${moeda(novo)}, cobrados na retirada.`
            : 'A loja não cobra análise: orçamento recusado sai sem valor.',
      });
    },
    onError: (erro: unknown) => {
      const msg = erro instanceof Error ? erro.message : 'Erro desconhecido';
      toast({
        title: 'Não foi possível salvar',
        description: /row-level security|policy/i.test(msg)
          ? 'Seu acesso não permite mudar as configurações da loja.'
          : msg,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const atual = taxaSalva ?? 0;
  const digitado = valor ?? String(atual);
  const numero = Number(digitado.replace(',', '.'));
  const invalido = Number.isNaN(numero) || numero < 0;
  const mudou = !invalido && numero !== atual;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="taxa-analise">Taxa de análise (R$)</Label>
            <Input
              id="taxa-analise"
              type="number"
              min="0"
              step="0.01"
              className="w-40"
              value={digitado}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          {/* Verde: salvar é confirmar, e confirmar é verde nesta casa
              (lib/acoes.ts, com teste que cobra). */}
          <Button
            variant="sucesso"
            disabled={!mudou || salvar.isPending}
            onClick={() => salvar.mutate(numero)}
          >
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Cobrada quando o cliente <strong>não aprova</strong> o orçamento: a OS deixa de valer o
          reparo recusado e passa a valer esta taxa, que o cliente paga ao retirar o aparelho.
          Quando ele <strong>aprova</strong>, nada muda — vale o valor do laudo, que é o que ele
          já viu.
        </p>
        {atual === 0 && (
          <p className="text-sm text-muted-foreground">
            Hoje está em zero: a loja não cobra análise.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
