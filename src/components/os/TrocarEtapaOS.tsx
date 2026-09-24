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
import {
  acaoParaAvancar,
  AVISO_REPARO_NUNCA_INICIADO,
  AVISO_ENTREGA_SEM_COBRANCA_SEM_PERMISSAO,
  entregaSemCobranca,
  textoDeEntregaSemCobranca,
} from '@/lib/acaoDaEtapa';
import {
  bloqueioDaPassagem,
  ehServicoTabelado,
  passagemDesfazRecusa,
  textoDeDesfazerRecusa,
} from '@/lib/decisaoDoLaudo';
import { mensagemDoErro } from '@/lib/mensagemDoErro';
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
  /** O cliente já respondeu o orçamento? TRUE aprovou, FALSE recusou, NULL ainda não. */
  laudoAprovado: boolean | null;
  /**
   * A OS foi aberta com laudo eletrônico? FALSE = serviço tabelado, que vai da
   * Entrada direto para a execução (PROCESSO-ORDEM-DE-SERVICO.md, passo 9).
   * Vazio conta como "tem laudo", igual ao banco.
   */
  laudoEletronico?: boolean | null;
  /** Na OS recusada: quanto era o orçamento recusado e por quê — para a
   *  confirmação de "desfazer a recusa" dizer o que vai mudar. */
  valorOrcadoRecusado?: number | null;
  motivoRecusa?: string | null;
  /**
   * Quando alguém apertou "Iniciar a execução". Nulo = o reparo nunca começou
   * oficialmente — ver `AVISO_REPARO_NUNCA_INICIADO`.
   */
  execucaoIniciadaEm: string | null;
  onMudou: () => void;
}

export function TrocarEtapaOS({
  osId,
  numeroOs,
  statusAtual,
  tipo,
  totalOrcamento,
  laudoAprovado,
  laudoEletronico = null,
  valorOrcadoRecusado = null,
  motivoRecusa = null,
  execucaoIniciadaEm,
  onMudou,
}: Props) {
  const { can } = useAuth();
  const { statuses } = useOsStatuses();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);
  // OS paga com orçamento > 0 precisa capturar o pagamento antes de virar
  // "entregue" — o banco já tranca essa regra (migration 20260818100000),
  // este diálogo só existe pra não deixar o vendedor descobrir isso pelo
  // erro cru do gatilho. Garantia/cortesia seguem direto; a paga em R$ 0 pede
  // confirmação de quem aprova orçamento (ver `irPara`).
  const [dialogEntregaAberto, setDialogEntregaAberto] = useState(false);

  const podeEditar = can(PERMISSIONS.ORDERS_EDIT);
  const podeAprovar = can(PERMISSIONS.ORDERS_APPROVE);

  if (!podeEditar) return null;

  // O texto de ajuda embaixo do seletor: em "Aguardando aprovação", quem não
  // aprova orçamento fica sabendo de quem é a vez.
  const decisaoDeOrcamentoBloqueada =
    statusAtual === OS_ETAPAS.AGUARDANDO_APROVACAO && !podeAprovar;

  /**
   * Quem pode levar esta OS para qual etapa. A regra inteira — aprovar,
   * recusar, pular a resposta do cliente, desfazer a recusa, o serviço
   * tabelado — mora em lib/decisaoDoLaudo.ts, e é a mesma do quadro, da lista
   * e do banco. Cada tela com a sua cópia foi como a trava de 20/08 ficou
   * consertada "numa porta de três" (revisão de 01/09), e como o técnico
   * recebia do banco um "não" para uma opção que a tela oferecia (24/09).
   */
  const situacao = { status: statusAtual, laudoAprovado, laudoEletronico };
  const bloqueio = (para: string) => bloqueioDaPassagem(situacao, para, podeAprovar);

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
   * O desvio continua alcançável pelo seletor ao lado.
   *
   * A exceção é o SERVIÇO TABELADO na Entrada (24/09): não há laudo para o
   * cliente aprovar, então o passo seguinte é executar — "Ir para a execução".
   */
  const proximaBruta =
    statusAtual === OS_ETAPAS.AGUARDANDO_ANALISE && ehServicoTabelado(laudoEletronico)
      ? etapas.find((s) => s.key === OS_ETAPAS.APROVADO)
      : etapas.find((s) => s.sistema && s.ordem > (atual?.ordem ?? -1));
  const proxima =
    // Em "Aguardando aprovação" quem move a OS é o par de botões da decisão do
    // laudo (components/os/DecisaoDoLaudo), que registra a resposta do cliente
    // e o motivo da recusa. Dois caminhos para a mesma decisão, um deles sem
    // registrar nada, faria o registro valer só quando alguém lembrasse.
    statusAtual === OS_ETAPAS.AGUARDANDO_APROVACAO
      ? undefined
      : proximaBruta && !bloqueio(proximaBruta.key)
        ? proximaBruta
        : undefined;

  // O seletor oferece só o que esta pessoa PODE fazer com esta OS. O seletor
  // era o caminho de fora da decisão do laudo: tirar o botão e deixar a lista
  // é não ter tirado nada.
  const etapasSelecionaveis = etapas.filter((s) => s.key === statusAtual || !bloqueio(s.key));
  const podeCancelar = statusAtual !== OS_CANCELADO && !bloqueio(OS_CANCELADO);

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
      // O motivo que o banco escreveu ("O cliente ainda não respondeu…",
      // "Reponha o estoque antes de reabrir a OS") chega inteiro na tela. Até
      // 24/09 ele sumia atrás de "Tente novamente" — ver mensagemDoErro.
      toast({
        title: 'Não foi possível mudar a etapa',
        description: mensagemDoErro(error, { semAcesso: 'Seu acesso não permite esta mudança.' }),
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  /**
   * O nome do passo, como o processo o chama (ver lib/acaoDaEtapa.ts). Quando
   * a passagem não tem nome próprio — etapa extra que a loja criou —, volta
   * para "Avançar para <etapa>", que é o certo ali.
   */
  const acao = proxima ? acaoParaAvancar(statusAtual, proxima.key) : undefined;

  /**
   * Ponto único de decisão antes de mudar de etapa, nesta ordem:
   *
   *   - passagem barrada (lib/decisaoDoLaudo) não acontece;
   *   - REABRIR uma OS já entregue pede confirmação (lib/reabrirOS);
   *   - DESFAZER a recusa do cliente pede confirmação, dizendo o que volta a
   *     ser cobrado;
   *   - ENTREGAR uma OS paga abre o diálogo de pagamento — e, se ela estiver
   *     em R$ 0, confirma que vai sair sem cobrança (só quem aprova);
   *   - concluir reparo nunca iniciado avisa; o passo com nome que marca hora
   *     confirma.
   *
   * Qualquer outra transição segue direto pro `mudar` de sempre.
   */

  const irPara = (novoStatus: string) => {
    if (novoStatus === statusAtual) return;

    // O seletor já não oferece o que está barrado; conferir aqui de novo é o
    // que garante que o aviso certo apareça se alguma porta nova surgir.
    const barrado = bloqueio(novoStatus);
    if (barrado) {
      toast({ title: barrado.titulo, description: barrado.descricao, variant: 'destructive' });
      return;
    }

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

    // Voltar uma OS recusada para a análise desfaz a recusa (o banco faz
    // sozinho). Quem pode, confirma lendo o que muda — ver lib/decisaoDoLaudo.
    if (passagemDesfazRecusa(situacao, novoStatus)) {
      const seguir = window.confirm(
        textoDeDesfazerRecusa({
          numeroOs,
          destino: statuses.find((s) => s.key === novoStatus)?.label ?? novoStatus,
          valorRecusado: valorOrcadoRecusado,
          valorAtual: totalOrcamento,
          motivo: motivoRecusa,
        }),
      );
      if (!seguir) return;
    }

    if (novoStatus === OS_ETAPAS.ENTREGUE) {
      // OS paga esquecida em R$ 0: sairia sem cobrança e sem pergunta nenhuma
      // (achado de 24/09). Ver lib/acaoDaEtapa.ts.
      if (entregaSemCobranca(tipo, totalOrcamento)) {
        if (!podeAprovar) {
          toast({
            title: AVISO_ENTREGA_SEM_COBRANCA_SEM_PERMISSAO.titulo,
            description: AVISO_ENTREGA_SEM_COBRANCA_SEM_PERMISSAO.descricao,
            variant: 'destructive',
          });
          return;
        }
        if (!window.confirm(textoDeEntregaSemCobranca(numeroOs))) return;
        mudar(novoStatus);
        return;
      }
      if (tipo === 'paga') {
        setDialogEntregaAberto(true);
        return;
      }
    }

    // Concluir um reparo que ninguém marcou como iniciado: avisa, não barra.
    // O porquê da escolha está junto do texto, em lib/acaoDaEtapa.ts.
    if (
      statusAtual === OS_ETAPAS.APROVADO &&
      novoStatus === OS_ETAPAS.FINALIZADO &&
      laudoAprovado !== false &&
      !execucaoIniciadaEm
    ) {
      if (!window.confirm(AVISO_REPARO_NUNCA_INICIADO)) return;
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
          {podeCancelar && (
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
