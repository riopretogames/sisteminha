import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { moeda as formatCurrency } from '@/lib/format';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { OS_ETAPAS } from '@/config/osStatus';
import { mensagemDoErro } from '@/lib/mensagemDoErro';

type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;

/**
 * Forma de pagamento cadastrada em Cadastros > Formas de Pagamento — mesma
 * ficha que o PDV usa. `forma_enum` é a categoria ampla (pix/dinheiro/
 * cartao_credito/...) que preenche `os_pagamentos.forma`.
 */
interface FormaPagamentoCadastro {
  id: string;
  descricao: string;
  forma_enum: FormaPagamento;
  max_parcelas: number;
  contem_taxa: boolean;
  taxa_percent: number;
}

interface PagamentoOS {
  formaPagamentoId: string;
  descricao: string;
  forma: FormaPagamento;
  parcelas: number;
  valor: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  osId: string;
  numeroOs: string;
  /**
   * O valor que a tela que abriu o diálogo conhecia. É só o ponto de partida:
   * ao abrir, o diálogo relê o valor do BANCO e cobra o de lá — ver `atual`.
   */
  totalOrcamento: number;
  onEntregue: () => void;
}

/** O que o diálogo relê da OS ao abrir. */
interface OSNoBanco {
  total_orcamento: number | null;
  tipo: string | null;
  status: string | null;
}

const NOVO_PAGAMENTO_VAZIO = { formaPagamentoId: '', parcelas: '1', valor: '' };

/**
 * Captura o pagamento na hora de entregar uma OS paga — espelha a UX de
 * pagamento do PDV (ver `src/pages/PDV.tsx`): suporta mais de uma forma de
 * pagamento numa entrega só (ex.: metade dinheiro, metade cartão), com
 * total pago / falta / troco calculados ao vivo. Pedido do Felipe: "todo
 * detalhamento completo" e "isso entra pra contabilidade, tudo certinho" —
 * por isso não é um campo único simplificado.
 *
 * O banco tranca a mesma regra (migration 20260818100000, gatilho
 * `conferir_pagamento_ao_entregar`): sem `os_pagamentos` suficiente pra
 * cobrir `total_orcamento`, o UPDATE de status pra 'entregue' é recusado.
 * Este diálogo só existe pra a loja não precisar descobrir isso pelo erro
 * cru do banco — o fluxo correto é sempre inserir os_pagamentos primeiro,
 * só depois mudar o status (feito aqui em sequência, nessa ordem).
 *
 * Os dois passos acima NÃO são uma transação só — são duas chamadas
 * separadas ao Supabase. Se a primeira gravar e a segunda falhar (erro de
 * rede, ou o usuário simplesmente tentar de novo depois de um erro), o
 * pagamento fica gravado numa OS que ainda não está "entregue" — e
 * `os_pagamentos` não tem UPDATE/DELETE, então ele não desaparece sozinho.
 * Por isso o diálogo busca no banco, toda vez que abre para uma OS, quanto
 * JÁ foi gravado (`jaPago`) e soma isso ao que for adicionado agora — em vez
 * de recomeçar do zero e arriscar lançar (e cobrar) o mesmo pagamento em
 * dobro na segunda tentativa.
 */
export function EntregarOSDialog({
  open,
  onOpenChange,
  osId,
  numeroOs,
  totalOrcamento,
  onEntregue,
}: Props) {
  const { toast } = useToast();
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoCadastro[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoOS[]>([]);
  const [novoPagamento, setNovoPagamento] = useState(NOVO_PAGAMENTO_VAZIO);
  const [confirmando, setConfirmando] = useState(false);
  // Quanto já está gravado em os_pagamentos pra esta OS ANTES de abrir o
  // diálogo agora. Existe pra cobrir uma tentativa anterior que inseriu o
  // pagamento mas não chegou a confirmar a entrega (ex.: erro de rede entre
  // os dois passos, ou o usuário tentou de novo depois de um erro) — os
  // pagamentos daquela tentativa continuam gravados (não tem UPDATE/DELETE em
  // os_pagamentos), então sem isso o vendedor recomeçaria do zero e acabaria
  // lançando o pagamento em dobro. Ver o efeito logo abaixo que busca isso.
  const [jaPago, setJaPago] = useState(0);
  const [carregandoJaPago, setCarregandoJaPago] = useState(false);
  /**
   * A OS como está NO BANCO agora, relida toda vez que o diálogo abre.
   *
   * Achado na revisão de 24/09: o quadro de OS carrega a lista uma vez e não
   * se atualiza sozinho. Com o quadro aberto no balcão, a OS de R$ 450 era
   * recusada na ficha em outro computador e passava a valer R$ 80 (a taxa) —
   * e arrastar o cartão para Entregue abria este diálogo cobrando R$ 450. O
   * banco aceitava (só confere se o pago COBRE o valor), o título saía de R$ 80
   * e os R$ 370 viravam "troco" que ninguém via. O cliente pagava R$ 450 no
   * cartão por uma OS de R$ 80. Cobrar o valor do banco, e não o da tela, é o
   * que fecha isso — em qualquer tela que abra este diálogo.
   */
  const [atual, setAtual] = useState<OSNoBanco | null>(null);

  // Busca as formas de pagamento ativas assim que o diálogo abre — mesmo
  // padrão de fetchFormasPagamento em PDV.tsx.
  useEffect(() => {
    if (!open) return;
    supabase
      .from('formas_pagamento')
      .select('id, descricao, forma_enum, max_parcelas, contem_taxa, taxa_percent')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .order('descricao', { ascending: true })
      .then(({ data }) => setFormasPagamento((data ?? []) as FormaPagamentoCadastro[]));
  }, [open]);

  // Busca pagamento já gravado pra esta OS assim que o diálogo abre — cobre o
  // caso de uma tentativa anterior ter inserido os_pagamentos sem chegar a
  // confirmar a entrega (ver comentário do estado `jaPago` acima).
  useEffect(() => {
    if (!open || !osId) {
      setJaPago(0);
      setAtual(null);
      return;
    }
    let cancelado = false;
    setCarregandoJaPago(true);
    Promise.all([
      supabase.from('os_pagamentos').select('valor').eq('os_id', osId),
      supabase
        .from('service_orders')
        .select('total_orcamento, tipo, status')
        .eq('id', osId)
        .maybeSingle(),
    ]).then(([pagos, os]) => {
      if (cancelado) return;
      if (pagos.error) {
        // Não trava o diálogo por isso — só assume 0 e deixa o gatilho do
        // banco ser a rede de segurança final, como sempre foi.
        console.error('Erro ao buscar pagamentos já registrados desta OS:', pagos.error);
        setJaPago(0);
      } else {
        setJaPago((pagos.data ?? []).reduce((acc, p) => acc + Number(p.valor), 0));
      }
      if (os.error) {
        // Sem a releitura, fica o valor da tela — o banco continua conferindo
        // que o pagamento cobre o valor de verdade.
        console.error('Erro ao reler a OS antes da entrega:', os.error);
        setAtual(null);
      } else {
        setAtual((os.data as OSNoBanco | null) ?? null);
      }
      setCarregandoJaPago(false);
    });
    return () => {
      cancelado = true;
    };
  }, [open, osId]);

  // Pré-seleciona a primeira forma (por ordem) assim que a lista carrega, em
  // vez de deixar o Select vazio.
  useEffect(() => {
    if (formasPagamento.length > 0 && !novoPagamento.formaPagamentoId) {
      setNovoPagamento((f) => ({ ...f, formaPagamentoId: formasPagamento[0].id }));
    }
  }, [formasPagamento, novoPagamento.formaPagamentoId]);

  // O valor a cobrar é o do banco (ver `atual`); o da tela só vale enquanto a
  // releitura não chega, e aí o botão de confirmar fica travado.
  const totalAtual = atual ? Number(atual.total_orcamento ?? 0) : totalOrcamento;
  const valorMudou = atual !== null && Math.abs(totalAtual - totalOrcamento) >= 0.005;
  const jaEntregue = atual?.status === OS_ETAPAS.ENTREGUE;
  // Paga que ficou sem valor enquanto a tela estava aberta: não é mais uma
  // entrega com pagamento — é "sair sem cobrança", que tem confirmação própria
  // na ficha. Aqui só avisa e não deixa confirmar.
  const ficouSemValor = atual !== null && atual.tipo === 'paga' && totalAtual <= 0;

  const totalPagoNesteDialogo = pagamentos.reduce((acc, p) => acc + p.valor, 0);
  // Inclui o que já estava gravado de uma tentativa anterior — é o que de
  // fato cobre (ou não) o orçamento, e é o que decide se falta mais alguma
  // coisa ou se já dá pra confirmar a entrega sem adicionar nada agora.
  const totalPago = jaPago + totalPagoNesteDialogo;
  const falta = totalAtual - totalPago;
  const troco = totalPago - totalAtual;
  const podeConfirmar =
    !confirmando && !carregandoJaPago && !jaEntregue && !ficouSemValor && totalPago >= totalAtual;

  const selecionarFormaPagamento = (formaPagamentoId: string) => {
    const forma = formasPagamento.find((f) => f.id === formaPagamentoId);
    setNovoPagamento((f) => ({
      ...f,
      formaPagamentoId,
      // Se a forma nova não permitir tantas parcelas quanto a anterior,
      // volta pra 1 em vez de mandar um valor de parcela inválido.
      parcelas: forma && Number(f.parcelas) > forma.max_parcelas ? '1' : f.parcelas,
    }));
  };

  const addPagamento = () => {
    const valor = parseFloat(novoPagamento.valor);
    if (!valor || valor <= 0) return;

    const forma = formasPagamento.find((f) => f.id === novoPagamento.formaPagamentoId);
    if (!forma) {
      toast({ title: 'Escolha uma forma de pagamento', variant: 'destructive' });
      return;
    }

    const parcelas = Math.max(1, Math.min(forma.max_parcelas, parseInt(novoPagamento.parcelas, 10) || 1));

    setPagamentos((atuais) => [
      ...atuais,
      { formaPagamentoId: forma.id, descricao: forma.descricao, forma: forma.forma_enum, parcelas, valor },
    ]);
    setNovoPagamento({ formaPagamentoId: forma.id, parcelas: '1', valor: '' });
  };

  const removePagamento = (index: number) => {
    setPagamentos((atuais) => atuais.filter((_, i) => i !== index));
  };

  /** Limpa o estado interno — pra não vazar pagamento de uma OS pra outra
   * na próxima vez que o diálogo abrir. `jaPago` não entra aqui: ele é
   * refeito do banco pelo efeito acima toda vez que o diálogo abre. */
  const limparEstado = () => {
    setPagamentos([]);
    setNovoPagamento(NOVO_PAGAMENTO_VAZIO);
  };

  const fecharDialogo = (v: boolean) => {
    if (!v) limparEstado();
    onOpenChange(v);
  };

  const confirmarEntrega = async () => {
    if (!podeConfirmar) return;

    setConfirmando(true);
    // Guarda se o passo 1 gravou algo NESTA tentativa, para o aviso de erro
    // dizer a verdade sobre o dinheiro.
    let gravouPagamentoAgora = 0;
    try {
      // 1) Insere as linhas NOVAS de os_pagamentos numa única chamada — igual
      // o PDV insere todos os pagamentos_venda de uma vez. Se `jaPago` já
      // cobre o orçamento sozinho (sobrou de uma tentativa anterior que
      // parou antes do passo 2), não insere nada de novo — só confirma a
      // entrega com o que já estava gravado.
      if (pagamentos.length > 0) {
        const linhas = pagamentos.map((p) => ({
          os_id: osId,
          forma_pagamento_id: p.formaPagamentoId,
          forma: p.forma,
          valor: p.valor,
          parcelas: p.parcelas,
        }));

        const { error: pagamentoError } = await supabase.from('os_pagamentos').insert(linhas);
        if (pagamentoError) throw pagamentoError;

        // Gravou: a partir daqui esses pagamentos são "já registrados", não
        // "a lançar". Sem isto, se o passo 2 falhasse, eles continuavam na
        // lista do diálogo — e apertar "Confirmar" de novo os gravava OUTRA
        // VEZ (os_pagamentos não aceita apagar). Achado da revisão de 24/09.
        gravouPagamentoAgora = totalPagoNesteDialogo;
        setJaPago((j) => j + totalPagoNesteDialogo);
        setPagamentos([]);
      }

      // 2) Só depois do pagamento gravado é que o status pode virar
      // 'entregue' — o gatilho do banco conta com essa ordem.
      const { error: statusError } = await supabase
        .from('service_orders')
        .update({ status: 'entregue' })
        .eq('id', osId);
      if (statusError) throw statusError;

      toast({
        title: 'OS entregue!',
        description: `OS ${numeroOs} entregue e pagamento registrado.`,
        variant: 'success',
      });
      onEntregue();
      limparEstado();
    } catch (error) {
      // As mensagens dos gatilhos da entrega ("O cliente Fulano está
      // bloqueado para venda…", "Registre o pagamento… falta R$ 50") já são
      // escritas para o balcão e aparecem inteiras. Até 24/09 sumiam atrás de
      // "Tente novamente" — ver mensagemDoErro.
      const motivo = mensagemDoErro(error);
      toast({
        title: 'Não foi possível confirmar a entrega',
        description:
          gravouPagamentoAgora > 0
            ? `${motivo} O pagamento de ${formatCurrency(gravouPagamentoAgora)} ficou registrado: ao tentar de novo, ele já conta como pago — não lance outra vez.`
            : motivo,
        variant: 'destructive',
      });
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={fecharDialogo}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Confirmar entrega — OS {numeroOs}</DialogTitle>
          <DialogDescription>
            Total a receber: {formatCurrency(totalAtual)}
          </DialogDescription>
        </DialogHeader>

        {/* O que mudou desde que a tela foi aberta — sem isto, o vendedor
            cobraria o número que viu no quadro, não o que vale. */}
        {valorMudou && !ficouSemValor && (
          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-sm text-amber-700 dark:text-amber-500">
            O valor desta OS mudou desde que a tela foi aberta (alguém mexeu nela em outro lugar): era{' '}
            {formatCurrency(totalOrcamento)}, agora é <strong>{formatCurrency(totalAtual)}</strong>. Cobre o
            valor novo.
          </p>
        )}
        {jaEntregue && (
          <p className="rounded-md border border-border bg-muted/40 p-2.5 text-sm">
            Esta OS já foi entregue por outra pessoa. Feche este aviso e atualize a tela.
          </p>
        )}
        {ficouSemValor && !jaEntregue && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-sm text-destructive">
            Esta OS ficou sem valor (R$ 0,00) desde que a tela foi aberta. Feche este aviso e confira a
            ficha da OS antes de entregar.
          </p>
        )}

        <div className="space-y-4">
          {/* Payment methods — vem do cadastro de Formas de Pagamento,
              mesmo padrão do checkout do PDV. */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Adicionar pagamento</label>
            <div className="flex gap-2">
              <Select value={novoPagamento.formaPagamentoId} onValueChange={selecionarFormaPagamento}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Forma" />
                </SelectTrigger>
                <SelectContent>
                  {formasPagamento.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.descricao}
                      {f.contem_taxa ? ` (taxa ${f.taxa_percent}%)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.01"
                placeholder="Valor"
                value={novoPagamento.valor}
                onChange={(e) => setNovoPagamento({ ...novoPagamento, valor: e.target.value })}
                className="flex-1"
              />
              <Button onClick={addPagamento}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {(() => {
              const formaSelecionada = formasPagamento.find((f) => f.id === novoPagamento.formaPagamentoId);
              if (!formaSelecionada || formaSelecionada.max_parcelas <= 1) return null;
              return (
                <div className="flex items-center gap-2">
                  <label htmlFor="parcelas-entrega-os" className="text-sm text-muted-foreground">
                    Parcelas
                  </label>
                  <Input
                    id="parcelas-entrega-os"
                    type="number"
                    min={1}
                    max={formaSelecionada.max_parcelas}
                    value={novoPagamento.parcelas}
                    onChange={(e) => setNovoPagamento({ ...novoPagamento, parcelas: e.target.value })}
                    className="w-20 h-8"
                  />
                  <span className="text-xs text-muted-foreground">
                    até {formaSelecionada.max_parcelas}x
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Pagamento de uma tentativa anterior que não chegou a confirmar a
              entrega — já está gravado no banco (os_pagamentos não permite
              apagar), então mostra em vez de deixar o vendedor lançar de
              novo por cima e pagar em dobro. */}
          {jaPago > 0 && (
            <div className="flex items-center justify-between rounded bg-muted p-2 text-sm">
              <span>Já registrado em uma tentativa anterior</span>
              <span className="font-medium">{formatCurrency(jaPago)}</span>
            </div>
          )}

          {/* Payment list */}
          {pagamentos.length > 0 && (
            <div className="space-y-2">
              {pagamentos.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-muted">
                  <span>
                    {p.descricao}
                    {p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatCurrency(p.valor)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removePagamento(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Summary */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Total a receber</span>
              <span className="font-medium">{formatCurrency(totalAtual)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total pago</span>
              <span className="font-medium">{formatCurrency(totalPago)}</span>
            </div>
            {troco > 0 && (
              <div className="flex justify-between text-success">
                <span>Troco</span>
                <span className="font-bold">{formatCurrency(troco)}</span>
              </div>
            )}
            {falta > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Falta</span>
                <span className="font-bold">{formatCurrency(falta)}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => fecharDialogo(false)}>
            Cancelar
          </Button>
          <Button
            onClick={confirmarEntrega}
            disabled={!podeConfirmar}
          >
            {confirmando ? (
              'Confirmando…'
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Confirmar entrega
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
