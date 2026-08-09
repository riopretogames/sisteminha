import { useState } from 'react';
import { ArrowRight, Check, Loader2, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PERMISSIONS } from '@/config/permissions';
import { OS_ETAPAS, OS_CANCELADO } from '@/config/osStatus';

/**
 * Mudar a etapa da OS a partir da ficha.
 *
 * Achado na revisão de 09/08: a ficha tinha salvar orçamento e lançar peça, mas
 * nenhuma ação de fluxo. Como abrir uma OS nova leva direto para a ficha, o
 * atendente terminava o check-in e precisava voltar à lista só para mover o
 * cartão — o caminho mais usado do sistema pedindo um desvio.
 *
 * Duas formas de mexer, de propósito:
 *
 *   - **Botão de avançar** para a próxima etapa da esteira. É o que acontece em
 *     9 de 10 vezes, e não deveria custar dois cliques e uma escolha.
 *   - **Seletor** para os casos que fogem: voltar uma etapa, pular para uma
 *     etapa extra da loja, cancelar.
 *
 * Quem não pode editar OS não vê nada aqui — a decisão do Felipe em 09/08 é que
 * o vendedor opera a OS inteira, então na prática todo mundo do balcão enxerga.
 */

interface Props {
  osId: string;
  statusAtual: string;
  onMudou: () => void;
}

export function TrocarEtapaOS({ osId, statusAtual, onMudou }: Props) {
  const { can } = useAuth();
  const { statuses } = useOsStatuses();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);

  const podeEditar = can(PERMISSIONS.ORDERS_EDIT);

  if (!podeEditar) return null;

  // Etapas na ordem do quadro. Cancelado fica fora da esteira e entra à parte.
  const etapas = statuses
    .filter((s) => s.ativo && s.key !== OS_CANCELADO)
    .sort((a, b) => a.ordem - b.ordem);

  const indiceAtual = etapas.findIndex((s) => s.key === statusAtual);
  const atual = indiceAtual >= 0 ? etapas[indiceAtual] : undefined;
  const proxima = indiceAtual >= 0 ? etapas[indiceAtual + 1] : undefined;

  const mudar = async (novoStatus: string) => {
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: novoStatus })
        .eq('id', osId);

      if (error) throw error;

      const nome = statuses.find((s) => s.key === novoStatus)?.label ?? novoStatus;
      toast({ title: 'Etapa alterada', description: `OS movida para ${nome}.` });
      onMudou();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Tente novamente.';
      toast({
        title: 'Não foi possível mudar a etapa',
        description: /permission|privilege|policy/i.test(msg)
          ? 'Seu acesso não permite esta mudança.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {proxima && (
        <Button
          // Verde só quando a próxima etapa é a que encerra bem (ver
          // `lib/acoes.ts`): avançar no meio do fluxo é ação neutra.
          variant={proxima.key === OS_ETAPAS.ENTREGUE ? 'sucesso' : 'default'}
          disabled={salvando}
          onClick={() => mudar(proxima.key)}
        >
          {salvando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : proxima.key === OS_ETAPAS.ENTREGUE ? (
            <PackageCheck className="mr-2 h-4 w-4" />
          ) : (
            <ArrowRight className="mr-2 h-4 w-4" />
          )}
          Avançar para {proxima.label}
        </Button>
      )}

      {/* Cada etapa aparece com a cor dela, aqui e no quadro. A cor é a mesma
          coisa que o Kanban usa, então a pessoa reconhece a etapa pelo tom
          antes de ler o nome — que é o ponto de ter cor. */}
      <Select value={statusAtual} onValueChange={mudar} disabled={salvando}>
        <SelectTrigger className="w-[230px]">
          <SelectValue>
            {atual ? (
              <Badge className={`${atual.color} border-0`}>{atual.label}</Badge>
            ) : (
              statusAtual
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {etapas.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              <span className="flex items-center gap-2">
                <Check
                  className={`h-3.5 w-3.5 ${s.key === statusAtual ? '' : 'opacity-0'}`}
                />
                <Badge className={`${s.color} border-0`}>{s.label}</Badge>
              </span>
            </SelectItem>
          ))}
          <SelectItem value={OS_CANCELADO}>
            <span className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 opacity-0" />
              <Badge variant="destructive">Cancelar OS</Badge>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
