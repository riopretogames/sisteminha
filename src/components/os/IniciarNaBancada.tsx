import { useState } from 'react';
import { Loader2, Wrench, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PERMISSIONS } from '@/config/permissions';
import { OS_ETAPAS } from '@/config/osStatus';
import { dataHora } from '@/lib/format';

/**
 * Os dois botões de "começar" da bancada, do organograma do Felipe (30/08).
 *
 *   ETAPA 1 (Entrada / Análise) → **Iniciar diagnóstico**
 *       "reparo começa aqui": o aparelho sai da fila e vai para a mesa, o
 *       técnico desmonta, investiga e monta o laudo.
 *
 *   ETAPA 3 (Aprovado / Executar) → **Iniciar a execução**
 *       o cliente aprovou; agora é fazer o serviço.
 *
 * São dois momentos com o mesmo aparelho, e a distância entre eles é o tempo
 * em que a OS ficou parada esperando o cliente responder. Guardar só um faria
 * o tempo de reparo da loja incluir a espera do cliente — que não é trabalho
 * da bancada e não deveria contar contra ela.
 *
 * NENHUM DOS DOIS MUDA A ETAPA. O quadro continua igual; o que se marca é a
 * hora e o nome de quem pegou.
 *
 * Por que o botão pode não aparecer, em ordem:
 *   1. a OS não está numa das duas etapas (em "Aguardando aprovação" ninguém
 *      começa nada — o aparelho está esperando resposta);
 *   2. já foi iniciado (aí aparece o registro no lugar);
 *   3. quem está olhando não trabalha na bancada — e aí aparece uma linha
 *      dizendo isso, em vez de simplesmente não haver nada na tela.
 */

interface Props {
  osId: string;
  status: string;
  /**
   * FALSE = o cliente recusou o orçamento. Esta OS está em "Aprovado /
   * Executar" mesmo assim, porque o aparelho voltou aberto do diagnóstico e
   * precisa ser remontado — mas não há execução para iniciar.
   */
  laudoAprovado: boolean | null;
  diagnosticoIniciadoEm: string | null;
  execucaoIniciadaEm: string | null;
  /** Nomes já resolvidos pela ficha, que tem a lista de perfis. */
  nomeDeQuemIniciouDiagnostico: string;
  nomeDeQuemIniciouExecucao: string;
  onMudou: () => void;
}

/** O que fazer em cada etapa. Fora do componente: é a regra, não o desenho. */
const FASES = {
  [OS_ETAPAS.AGUARDANDO_ANALISE]: {
    rotulo: 'Iniciar diagnóstico',
    funcao: 'iniciar_diagnostico_os',
    confirmar:
      'O diagnóstico passa a contar a partir de agora, com o seu nome. ' +
      'Confirma que vai começar este aparelho?',
    aviso: 'A partir de agora conta como aparelho na bancada, com o seu nome.',
    registro: 'Diagnóstico iniciado em',
  },
  [OS_ETAPAS.APROVADO]: {
    rotulo: 'Iniciar a execução',
    funcao: 'iniciar_execucao_os',
    confirmar:
      'O cliente aprovou e o serviço começa agora, com o seu nome. ' +
      'Confirma que vai executar este reparo?',
    aviso: 'Execução iniciada, com o seu nome.',
    registro: 'Execução iniciada em',
  },
} as const;

export function IniciarNaBancada({
  osId,
  status,
  laudoAprovado,
  diagnosticoIniciadoEm,
  execucaoIniciadaEm,
  nomeDeQuemIniciouDiagnostico,
  nomeDeQuemIniciouExecucao,
  onMudou,
}: Props) {
  const { can } = useAuth();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);

  const fase = FASES[status as keyof typeof FASES];
  const jaIniciado =
    status === OS_ETAPAS.APROVADO ? execucaoIniciadaEm : diagnosticoIniciadoEm;
  const nomeDeQuemIniciou =
    status === OS_ETAPAS.APROVADO ? nomeDeQuemIniciouExecucao : nomeDeQuemIniciouDiagnostico;
  const daBancada = can(PERMISSIONS.ORDERS_DIAGNOSE);

  const iniciar = async () => {
    if (!fase) return;
    if (!window.confirm(fase.confirmar)) return;

    setSalvando(true);
    try {
      const { error } = await supabase.rpc(fase.funcao, { _os_id: osId });
      if (error) throw error;

      toast({ variant: 'success', title: fase.rotulo.replace('Iniciar', 'Iniciado'), description: fase.aviso });
      onMudou();
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Tente novamente.';
      toast({
        title: `Não foi possível ${fase.rotulo.toLowerCase()}`,
        description: /privilege|permission|policy/i.test(msg)
          ? 'Só quem trabalha na bancada pode começar — peça a um administrador a permissão de diagnóstico.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  /* -- o que a tela mostra, em ordem de precedência ------------------------ */

  // Etapa em que ninguém começa nada (esperando o cliente, peça, entregue…).
  //
  // Esta pergunta vem ANTES da do registro de propósito, e foi assim que a
  // revisão de 01/09 achou o defeito: estando depois, a linha "Diagnóstico
  // iniciado em 30/08 por Fulano" ficava na barra de ações da OS para sempre —
  // na OS finalizada, na entregue, na que está esperando peça. A barra é o
  // lugar do que dá para fazer AGORA; o quando-começou tem lugar próprio na
  // linha do tempo da ficha, que já mostra os dois marcos.
  if (!fase) return null;

  /**
   * OS recusada parada na etapa da bancada: não existe execução para começar.
   *
   * Decisão do Felipe em 01/09: a OS recusada volta pela MESMA esteira — vai
   * para "Aprovado / Executar", o técnico remonta o aparelho e aperta Reparo
   * concluído. Sem esta linha, o técnico veria "Iniciar a execução" e ficaria
   * na dúvida se deve consertar um serviço que o cliente não quis; e a marca
   * de hora que o botão grava contaria como tempo de reparo um trabalho que
   * não é reparo.
   */
  if (laudoAprovado === false && status === OS_ETAPAS.APROVADO) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span>
          <strong className="text-foreground">Cliente não aprovou.</strong> Não há serviço a
          executar — remonte o aparelho e marque <em>Reparo concluído</em> para ele ficar pronto
          para retirada.
        </span>
      </p>
    );
  }

  // Já começou: o botão dá lugar ao registro, para TODO MUNDO — o vendedor
  // também precisa saber que o aparelho está na mesa de alguém, e desde quando.
  if (jaIniciado) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        {fase.registro}{' '}
        <span className="font-medium text-foreground">{dataHora(jaIniciado)}</span>
        {nomeDeQuemIniciou !== '—' && (
          <>
            por <span className="font-medium text-foreground">{nomeDeQuemIniciou}</span>
          </>
        )}
      </p>
    );
  }

  // Não é da bancada: em vez de sumir sem explicação — o que faz o dono
  // procurar um botão que nunca vai achar —, diz de quem é a vez.
  if (!daBancada) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Aguardando a bancada: quem tem acesso de diagnóstico é quem aperta
        &quot;{fase.rotulo}&quot;.
      </p>
    );
  }

  return (
    <Button onClick={iniciar} disabled={salvando}>
      {salvando ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Wrench className="mr-2 h-4 w-4" />
      )}
      {fase.rotulo}
    </Button>
  );
}
