import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PERMISSIONS } from '@/config/permissions';
import { OS_ETAPAS } from '@/config/osStatus';
import { moeda } from '@/lib/format';

/**
 * A resposta do cliente ao laudo — o par aprovou / não aprovou.
 *
 * Organograma do Felipe (30/08): depois do laudo enviado, a OS fica esperando.
 * Quando o cliente responde, **quem registra é o vendedor**, porque é ele que
 * fala com o cliente.
 *
 *   Aprovou    → a OS vai para a bancada executar.
 *   Não aprovou → o MOTIVO é obrigatório, e a OS é encerrada.
 *
 * Por que o motivo é obrigatório: é a informação mais valiosa que uma recusa
 * deixa. Preço alto, prazo longo, cliente achou que não compensa consertar —
 * sem isso a loja perde orçamento e não sabe por quê. Antes disso ele sumia na
 * conversa do balcão.
 *
 * Este componente substitui o botão genérico de avanço nesta etapa: ter dois
 * caminhos para a mesma decisão, um deles sem registrar nada, faria o registro
 * valer só quando alguém lembrasse de usar o caminho certo.
 */

interface Props {
  osId: string;
  status: string;
  /** Paga, garantia ou cortesia — só a paga passa pelo caixa na retirada. */
  tipo: 'paga' | 'garantia' | 'cortesia';
  totalOrcamento: number;
  onMudou: () => void;
}

export function DecisaoDoLaudo({ osId, status, tipo, totalOrcamento, onMudou }: Props) {
  const { can } = useAuth();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);
  const [recusaAberta, setRecusaAberta] = useState(false);
  const [motivo, setMotivo] = useState('');

  /**
   * A taxa de análise da loja (Configurações > Preferências do Sistema).
   *
   * Só é lida quando o diálogo de recusa abre: é o único momento em que o
   * número importa, e quem só aprova nunca precisa dele.
   */
  const { data: taxa } = useQuery({
    queryKey: ['taxa-analise-da-loja'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from('tenants').select('taxa_analise').maybeSingle();
      if (error) throw error;
      return Number(data?.taxa_analise ?? 0);
    },
    enabled: recusaAberta,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * Garantia e cortesia não passam pelo caixa na entrega — então recusa nelas
   * não cobra nada, e o diálogo não pode prometer cobrança. O banco faz a
   * mesma conta (migration 20260901120000); aqui é só para o texto não mentir.
   */
  const cobraTaxa = tipo === 'paga' && (taxa ?? 0) > 0;

  // Só faz sentido enquanto a OS espera a resposta.
  if (status !== OS_ETAPAS.AGUARDANDO_APROVACAO) return null;

  // Decidir orçamento é decisão de dinheiro: exige `orders.approve`, a mesma
  // que o banco cobra desde 17/08. Quem não tem fica sabendo de quem é a vez,
  // em vez de olhar para uma tela sem botão nenhum.
  if (!can(PERMISSIONS.ORDERS_APPROVE)) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Esperando a resposta do cliente — quem registra é quem aprova orçamento.
      </p>
    );
  }

  const registrar = async (aprovado: boolean, motivoDaRecusa?: string) => {
    setSalvando(true);
    try {
      const { error } = await supabase.rpc('registrar_decisao_do_laudo', {
        _os_id: osId,
        _aprovado: aprovado,
        _motivo: motivoDaRecusa ?? null,
      });
      if (error) throw error;

      toast({
        variant: aprovado ? 'success' : 'default',
        title: aprovado ? 'Laudo aprovado' : 'Recusa registrada',
        description: aprovado
          ? 'A OS foi para a bancada executar o serviço.'
          : 'Peças devolvidas ao estoque. Remonte o aparelho e combine a retirada com o cliente.',
      });
      setRecusaAberta(false);
      setMotivo('');
      onMudou();
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Tente novamente.';
      toast({
        title: 'Não foi possível registrar a resposta',
        description: /privilege|permission|policy/i.test(msg)
          ? 'Seu acesso não permite decidir orçamento.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  const aprovar = () => {
    const valor = totalOrcamento > 0 ? ` de ${moeda(totalOrcamento)}` : '';
    if (
      !window.confirm(
        `Confirma que o cliente aprovou o orçamento${valor}? A OS vai para a bancada executar.`,
      )
    ) {
      return;
    }
    void registrar(true);
  };

  return (
    <>
      <Button
        // Verde: é o "andou bem" da paleta, e a mesma cor da coluna Aprovado /
        // Executar, para onde a OS vai.
        className="bg-green-600 text-white hover:bg-green-700"
        disabled={salvando}
        onClick={aprovar}
      >
        {salvando ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Check className="mr-2 h-4 w-4" />
        )}
        Laudo aprovado
      </Button>

      <Button variant="outline" disabled={salvando} onClick={() => setRecusaAberta(true)}>
        <X className="mr-2 h-4 w-4" />
        Cliente não aprovou
      </Button>

      <Dialog open={recusaAberta} onOpenChange={(aberto) => !aberto && setRecusaAberta(false)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>O cliente não aprovou o orçamento</DialogTitle>
            <DialogDescription>
              {cobraTaxa ? (
                <>
                  A OS passa a valer <strong>{moeda(taxa ?? 0)}</strong> — a taxa de análise —, e o
                  aparelho fica pronto para o cliente retirar. Ele paga esse valor na retirada,
                  pelo mesmo caminho de qualquer outra OS. O valor recusado fica guardado na ficha.
                </>
              ) : tipo !== 'paga' ? (
                <>
                  A OS vai para a retirada <strong>sem valor</strong>: esta é uma OS de{' '}
                  {tipo === 'garantia' ? 'garantia' : 'cortesia'}, e a loja não cobra análise
                  nelas. O valor recusado fica guardado na ficha.
                </>
              ) : (
                <>
                  A OS vai para a retirada <strong>sem valor</strong>: esta loja não cobra taxa de
                  análise. Dá para mudar isso em Configurações &gt; Preferências do Sistema.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="motivo-recusa">
              Por que ele não aprovou?<span className="text-destructive"> *</span>
            </Label>
            <Textarea
              id="motivo-recusa"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: achou o valor alto, vai comprar outro aparelho, prazo não serve"
            />
            <p className="text-xs text-muted-foreground">
              É o dado que explica orçamento perdido. Sem ele, a loja só sabe que perdeu.
            </p>
          </div>

          {/* As duas coisas que acontecem fora da tela e a equipe precisa saber
              antes de clicar: o aparelho está aberto na bancada, e as peças que
              o técnico separou voltam para a prateleira. */}
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <strong>Antes de devolver:</strong> o aparelho precisa ser remontado — ele saiu
            aberto do diagnóstico. As peças lançadas nesta OS voltam sozinhas para o estoque
            quando você registrar a recusa.
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusaAberta(false)} disabled={salvando}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={salvando || !motivo.trim()}
              onClick={() => registrar(false, motivo)}
            >
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {taxa && taxa > 0 ? `Registrar recusa e cobrar ${moeda(taxa)}` : 'Registrar recusa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
