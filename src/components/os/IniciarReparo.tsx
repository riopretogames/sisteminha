import { useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PERMISSIONS } from '@/config/permissions';
import { OS_ETAPAS } from '@/config/osStatus';
import { dataHora } from '@/lib/format';
import { INICIAR_REPARO } from '@/lib/acaoDaEtapa';

/**
 * "Iniciar reparo" — o momento em que o aparelho sai da fila e vai para a mesa.
 *
 * Vem do organograma do processo (Felipe, 30/08), onde o passo aparece com
 * duas frases escritas ao lado: *"só o perfil Técnico vê este botão"* e
 * *"reparo começa aqui"*.
 *
 * O que ele NÃO faz: mudar a etapa. A OS continua em "Entrada / Análise"
 * enquanto o técnico desmonta e investiga — o quadro não ganha coluna nova.
 * O que se marca é a HORA, e é isso que hoje falta para responder a pergunta
 * de todo dia: "faz três dias que está na análise" não distingue o aparelho
 * que ninguém pegou do que está aberto na bancada desde ontem.
 *
 * A trava de perfil está no banco também (função `iniciar_reparo_os`, exige
 * `orders.diagnose`). Aqui só se decide o que aparece na tela.
 */

interface Props {
  osId: string;
  status: string;
  reparoIniciadoEm: string | null;
  /** Nome de quem começou, já resolvido pela tela — a ficha da OS tem a lista
   *  de perfis para a linha do tempo. */
  nomeDeQuemIniciou: string;
  onMudou: () => void;
}

export function IniciarReparo({
  osId,
  status,
  reparoIniciadoEm,
  nomeDeQuemIniciou,
  onMudou,
}: Props) {
  const { can } = useAuth();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);

  // Já começou: o botão dá lugar ao registro. Quem chega depois precisa saber
  // que o aparelho está na mesa de alguém, e desde quando.
  if (reparoIniciadoEm) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        Reparo iniciado em{' '}
        <span className="font-medium text-foreground">{dataHora(reparoIniciadoEm)}</span>
        {nomeDeQuemIniciou !== '—' && (
          <>
            por <span className="font-medium text-foreground">{nomeDeQuemIniciou}</span>
          </>
        )}
      </p>
    );
  }

  // Só a bancada. `orders.diagnose` é a permissão de quem trabalha no
  // aparelho — hoje Técnico e Gerente Técnico.
  if (!can(PERMISSIONS.ORDERS_DIAGNOSE)) return null;

  // Só faz sentido na entrada, que é onde o organograma põe este passo. Depois
  // do laudo aprovado o técnico volta ao aparelho, mas aí o passo do processo
  // é outro ("iniciar a execução"), com botão próprio.
  if (status !== OS_ETAPAS.AGUARDANDO_ANALISE) return null;

  const iniciar = async () => {
    if (!window.confirm(INICIAR_REPARO.confirmar)) return;

    setSalvando(true);
    try {
      const { error } = await supabase.rpc('iniciar_reparo_os', { _os_id: osId });
      if (error) throw error;

      toast({
        variant: 'success',
        title: 'Reparo iniciado',
        description: 'A partir de agora conta como aparelho na bancada, com o seu nome.',
      });
      onMudou();
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Tente novamente.';
      toast({
        title: 'Não foi possível iniciar o reparo',
        description: /privilege|permission|policy/i.test(msg)
          ? 'Só quem trabalha na bancada pode iniciar o reparo.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Button onClick={iniciar} disabled={salvando}>
      {salvando ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Wrench className="mr-2 h-4 w-4" />
      )}
      {INICIAR_REPARO.rotulo}
    </Button>
  );
}
