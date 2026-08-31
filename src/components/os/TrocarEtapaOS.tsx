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
import { confirmarReaberturaDeOSEntregue } from '@/lib/reabrirOS';
import { acaoParaAvancar } from '@/lib/acaoDaEtapa';
import { passagemPedeDecisaoDoLaudo } from '@/lib/decisaoDoLaudo';
import { corDeBotaoDaEtapa } from '@/lib/cores';
import { cn } from '@/lib/utils';
import { EntregarOSDialog } from '@/components/os/EntregarOSDialog';

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
  numeroOs: string;
  statusAtual: string;
  tipo: 'paga' | 'garantia' | 'cortesia';
  totalOrcamento: number;
  onMudou: () => void;
}

export function TrocarEtapaOS({ osId, numeroOs, statusAtual, tipo, totalOrcamento, onMudou }: Props) {
  const { can } = useAuth();
  const { statuses } = useOsStatuses();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);
  // OS paga com orçamento > 0 precisa capturar o pagamento antes de virar
  // "entregue" — o banco já tranca essa regra (migration 20260818100000),
  // este diálogo só existe pra não deixar o vendedor descobrir isso pelo
  // erro cru do gatilho. Garantia/cortesia/orçamento zerado seguem direto.
  const [dialogEntregaAberto, setDialogEntregaAberto] = useState(false);

  const podeEditar = can(PERMISSIONS.ORDERS_EDIT);
  const podeAprovar = can(PERMISSIONS.ORDERS_APPROVE);

  if (!podeEditar) return null;

  // Sair de "aguardando aprovação" pra "cancelado" é RECUSAR o orçamento —
  // mesma regra de OSOrcamentos.tsx e do gatilho `validar_aprovacao_orcamento_os`
  // no banco (migration 20260817140000): exige orders.approve, não só
  // orders.edit. Só essa saída específica; cancelar de qualquer outra etapa
  // não é "recusar orçamento" e o banco nunca travou isso.
  const decisaoDeOrcamentoBloqueada =
    statusAtual === OS_ETAPAS.AGUARDANDO_APROVACAO && !podeAprovar;

  // "Aprovado" é decisão de orçamento (APROVAR) não importa de qual etapa se
  // está saindo — achado na revisão de 20/08: o seletor só escondia
  // "Aprovado" quando a OS JÁ estava em "Aguardando aprovação", mas o
  // dropdown sempre ofereceu TODAS as etapas como destino (é assim de
  // propósito, para "voltar uma etapa" ou "pular pra etapa extra"). Vindo de
  // qualquer outra etapa — inclusive uma OS recém-aberta em
  // "Aguardando análise" — dava pra pular direto pra "Aprovado" num clique
  // só. O gatilho do banco só confere `OLD.status = 'aguardando_aprovacao'`
  // (migration 20260817140000), então esse pulo passava batido também no
  // banco: um técnico com `orders.edit` aprovava orçamento sem nunca ter
  // `orders.approve`, driblando a permissão inteira. Por isso "Aprovado"
  // exige `podeAprovar` sempre, e não só quando `decisaoDeOrcamentoBloqueada`.
  const aprovarBloqueado = !podeAprovar;

  // Etapas na ordem do quadro. Cancelado fica fora da esteira e entra à parte.
  const etapas = statuses
    .filter((s) => s.ativo && s.key !== OS_CANCELADO)
    .sort((a, b) => a.ordem - b.ordem);

  const indiceAtual = etapas.findIndex((s) => s.key === statusAtual);
  const atual = indiceAtual >= 0 ? etapas[indiceAtual] : undefined;

  /**
   * A próxima etapa SUGERIDA é a próxima da esteira, não a próxima coluna.
   *
   * Achado pelo Felipe em 30/08: parado em "Aguardando aprovação", o botão
   * oferecia "Avançar para Aguardando Peça" — porque a Peça é mesmo a coluna
   * seguinte no quadro. Só que ela é um DESVIO (o aparelho esperando peça
   * chegar), não o passo seguinte do processo: depois de o cliente aprovar,
   * vem Aprovado / Executar.
   *
   * Por isso a sugestão pula as etapas extras da loja e vai na próxima etapa
   * de sistema. Estando NUMA etapa extra, sugere a próxima de sistema depois
   * dela — de Aguardando Peça vai para Aprovado (a peça chegou, pode
   * executar), de Terceirizada vai para Finalizado (voltou de fora, pronto).
   * O desvio continua alcançável pelo seletor ao lado, que oferece todas.
   */
  const proximaBruta = etapas.find((s) => s.sistema && s.ordem > (atual?.ordem ?? -1));
  // Some o atalho de avançar quando o próximo passo seria justamente a
  // decisão bloqueada (aguardando_aprovacao → aprovado).
  const proxima =
    // Em "Aguardando aprovação" quem move a OS é o par de botões da decisão do
    // laudo (components/os/DecisaoDoLaudo), que registra a resposta do cliente
    // e o motivo da recusa. Dois caminhos para a mesma decisão, um deles sem
    // registrar nada, faria o registro valer só quando alguém lembrasse.
    statusAtual === OS_ETAPAS.AGUARDANDO_APROVACAO
      ? undefined
      : aprovarBloqueado && proximaBruta?.key === OS_ETAPAS.APROVADO
        ? undefined
        : proximaBruta;
  // "Aprovado" some sempre que falta orders.approve, não só saindo de
  // aguardando_aprovacao (ver comentário de `aprovarBloqueado`). "Cancelar
  // OS" continua com a regra estreita de sempre (só some saindo de
  // aguardando_aprovacao), porque é a única saída de cancelamento que o
  // banco de fato trava.
  //
  // O seletor era o caminho de fora da decisão do laudo: o BOTÃO de avançar já
  // sumia em "Aguardando aprovação" (acima), mas a lista ao lado continuava
  // oferecendo "Aprovado" e "Finalizado" — os dois destinos da resposta do
  // cliente — como escolha crua de etapa, sem registrar quem respondeu nem o
  // motivo da recusa. Tirar o botão e deixar a lista é não ter tirado nada.
  const etapasSelecionaveis = etapas.filter((s) => {
    if (aprovarBloqueado && s.key === OS_ETAPAS.APROVADO) return false;
    if (passagemPedeDecisaoDoLaudo(statusAtual, s.key)) return false;
    return true;
  });

  const mudar = async (novoStatus: string) => {
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: novoStatus })
        .eq('id', osId);

      if (error) throw error;

      const nome = statuses.find((s) => s.key === novoStatus)?.label ?? novoStatus;
      toast({ variant: 'success', title: 'Etapa alterada', description: `OS movida para ${nome}.` });
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

  /**
   * Ponto único de decisão antes de mudar de etapa:
   *
   *   - Entregar uma OS paga (com orçamento > 0) precisa do diálogo de
   *     pagamento primeiro.
   *   - REABRIR uma OS já entregue precisa de confirmação — ver abaixo.
   *
   * Qualquer outra transição segue direto pro `mudar` de sempre.
   */
  /**
   * O nome do passo, como o processo o chama (ver lib/acaoDaEtapa.ts). Quando
   * a passagem não tem nome próprio — etapa extra que a loja criou —, volta
   * para "Avançar para <etapa>", que é o certo ali.
   */
  const acao = proxima ? acaoParaAvancar(statusAtual, proxima.key) : undefined;

  const irPara = (novoStatus: string) => {
    // Reabrir OS entregue: avisa o que continua lançado no financeiro antes
    // de deixar seguir. O porquê está em `lib/reabrirOS.ts`, junto do texto.
    if (statusAtual === OS_ETAPAS.ENTREGUE && novoStatus !== OS_ETAPAS.ENTREGUE) {
      const seguir = confirmarReaberturaDeOSEntregue({
        numeroOs,
        destino: statuses.find((s) => s.key === novoStatus)?.label ?? novoStatus,
        tipo,
        totalOrcamento,
      });
      if (!seguir) return;
    }

    if (novoStatus === OS_ETAPAS.ENTREGUE && tipo === 'paga' && totalOrcamento > 0) {
      setDialogEntregaAberto(true);
      return;
    }
    // Passo que marca hora e não se desfaz sem explicação pede confirmação:
    // o organograma escreve "reparo começa aqui" e "laudo enviado ao cliente".
    if (novoStatus === proxima?.key && acao?.confirmar) {
      if (!window.confirm(acao.confirmar)) return;
    }

    mudar(novoStatus);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {proxima && (
        <Button
          // A cor é a da COLUNA de destino, a pedido do Felipe (30/08): ele lê
          // o botão, olha o quadro e reconhece para onde o aparelho vai. Cor
          // que o sistema não conhece cai no padrão, nunca em botão sem cor.
          className={cn(corDeBotaoDaEtapa(proxima.color))}
          disabled={salvando}
          onClick={() => irPara(proxima.key)}
        >
          {salvando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : proxima.key === OS_ETAPAS.ENTREGUE ? (
            <PackageCheck className="mr-2 h-4 w-4" />
          ) : (
            <ArrowRight className="mr-2 h-4 w-4" />
          )}
          {acao?.rotulo ?? `Avançar para ${proxima.label}`}
        </Button>
      )}

      {/* Cada etapa aparece com a cor dela, aqui e no quadro. A cor é a mesma
          coisa que o Kanban usa, então a pessoa reconhece a etapa pelo tom
          antes de ler o nome — que é o ponto de ter cor. */}
      <Select value={statusAtual} onValueChange={irPara} disabled={salvando}>
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
          {etapasSelecionaveis.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              <span className="flex items-center gap-2">
                <Check
                  className={`h-3.5 w-3.5 ${s.key === statusAtual ? '' : 'opacity-0'}`}
                />
                <Badge className={`${s.color} border-0`}>{s.label}</Badge>
              </span>
            </SelectItem>
          ))}
          {!decisaoDeOrcamentoBloqueada && (
            <SelectItem value={OS_CANCELADO}>
              <span className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 opacity-0" />
                <Badge variant="destructive">Cancelar OS</Badge>
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {decisaoDeOrcamentoBloqueada && (
        <p className="w-full text-xs text-muted-foreground">
          Aprovar ou recusar orçamento é decisão de quem fala com o cliente —
          peça pra um vendedor ou gerente decidir esta.
        </p>
      )}

      <EntregarOSDialog
        open={dialogEntregaAberto}
        onOpenChange={setDialogEntregaAberto}
        osId={osId}
        numeroOs={numeroOs}
        totalOrcamento={totalOrcamento}
        onEntregue={() => {
          setDialogEntregaAberto(false);
          onMudou();
        }}
      />
    </div>
  );
}
