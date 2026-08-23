import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Printer, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCatalogo } from '@/hooks/useCatalogos';
import { useToast } from '@/hooks/use-toast';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { moeda, data as fmtData, dataHora } from '@/lib/format';
import { soDigitos } from '@/lib/documento';
import { FORMAS_PAGAMENTO } from '@/lib/constants';

/**
 * Comprovante de Venda — reproduz o formato que a loja já usa em papel
 * (sulfite/PDF, pedido do Felipe em 10/08 com "Nota de Venda Nº 5579.pdf"
 * como referência exata) e uma segunda via pensada para impressora térmica
 * de 80mm, formato que a loja também usa mas do qual não veio exemplo —
 * desenhado do zero aqui, condensado, sem os 8 parágrafos de garantia por
 * extenso (a via de papel é que carrega os termos completos).
 *
 * Rota de drill-down (mesmo mecanismo de OSDetalhe/ClienteFicha/
 * EstoqueDetalhe): montada direto em App.tsx, fora do registry.
 */

const N8N_WEBHOOK_COMPROVANTE = ''; // TODO: preencher com a URL do webhook n8n
// que vai receber { telefone, texto } e mandar pelo WuzAPI (mesmo mecanismo
// já usado em LAUDOS · Envio, aprovação e avisos). Enquanto vazio, o botão
// "Enviar por WhatsApp" mostra aviso de que o envio ainda não foi ligado.

interface Cliente {
  nome: string;
  cpf_cnpj: string | null;
  telefones: string[] | null;
}

interface Vendedor {
  nome: string;
}

interface VendaComprovante {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
  subtotal: number;
  descontos: number;
  total: number;
  observacoes: string | null;
  clientes: Cliente | null;
  vendedor: Vendedor | null;
}

interface ProdutoItem {
  nome: string;
  imei_serial: string | null;
  marca_id: string | null;
  cor_id: string | null;
  condicao_id: string | null;
}

interface ItemComprovante {
  id: string;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  total: number;
  defeito_declarado: boolean;
  produtos: ProdutoItem | null;
}

interface FormaPagamentoCadastro {
  descricao: string;
  contem_taxa: boolean;
  taxa_percent: number;
}

interface PagamentoComprovante {
  id: string;
  forma: keyof typeof FORMAS_PAGAMENTO;
  parcelas: number;
  valor: number;
  created_at: string;
  formas_pagamento: FormaPagamentoCadastro | null;
}

interface TenantInfo {
  nome_loja: string;
  endereco: string | null;
  telefone: string | null;
  cnpj: string | null;
}

type Formato = 'sulfite' | 'termica';

export default function ComprovanteVenda() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [formato, setFormato] = useState<Formato>('sulfite');
  const [enviando, setEnviando] = useState(false);

  const marcas = useCatalogo('marca');
  const cores = useCatalogo('cor');
  const condicoes = useCatalogo('condicao');

  const { data: venda, isLoading: carregandoVenda } = useQuery({
    queryKey: ['venda-comprovante', id],
    queryFn: async (): Promise<VendaComprovante | null> => {
      const { data, error } = await supabase
        .from('vendas')
        .select(
          `id, numero_venda, created_at, status, subtotal, descontos, total, observacoes,
           clientes(nome, cpf_cnpj, telefones),
           vendedor:profiles!vendas_vendedor_id_fkey(nome)`
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as VendaComprovante | null;
    },
    enabled: !!id,
  });

  const { data: detalhe, isLoading: carregandoDetalhe } = useQuery({
    queryKey: ['venda-comprovante-detalhe', id],
    queryFn: async (): Promise<{ itens: ItemComprovante[]; pagamentos: PagamentoComprovante[] }> => {
      const [itensRes, pagamentosRes] = await Promise.all([
        supabase
          .from('itens_venda')
          .select(
            `id, quantidade, preco_unitario, desconto, total, defeito_declarado,
             produtos:vw_produtos(nome, imei_serial, marca_id, cor_id, condicao_id)`
          )
          .eq('venda_id', id!),
        supabase
          .from('pagamentos_venda')
          .select(
            `id, forma, parcelas, valor, created_at,
             formas_pagamento(descricao, contem_taxa, taxa_percent)`
          )
          .eq('venda_id', id!),
      ]);
      if (itensRes.error) throw itensRes.error;
      if (pagamentosRes.error) throw pagamentosRes.error;
      return {
        itens: (itensRes.data ?? []) as unknown as ItemComprovante[],
        pagamentos: (pagamentosRes.data ?? []) as unknown as PagamentoComprovante[],
      };
    },
    enabled: !!id,
  });

  const tenantId = user?.profile?.tenant_id ?? null;
  const { data: tenant } = useQuery({
    queryKey: ['tenant-comprovante', tenantId],
    queryFn: async (): Promise<TenantInfo | null> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('nome_loja, endereco, telefone, cnpj')
        .eq('id', tenantId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  // Nome de marca/cor/condição a partir do catálogo — mesma fonte que a
  // ficha do produto (EstoqueDetalhe) usa. `produtos` guarda só o ID; quem
  // resolve pra texto legível é sempre o catálogo, nunca as colunas antigas
  // `marca`/`modelo` (essas só existem para os 2 relatórios que ainda não
  // migraram, não fazem parte da leitura nova).
  const nomeCatalogo = (
    lista: { id: string; descricao: string }[] | undefined,
    catalogoId: string | null
  ): string | null => {
    if (!catalogoId) return null;
    return lista?.find((c) => c.id === catalogoId)?.descricao ?? null;
  };

  const descricaoProduto = (item: ItemComprovante): string => {
    const nome = item.produtos?.nome ?? '—';
    const marca = nomeCatalogo(marcas.data, item.produtos?.marca_id ?? null);
    const cor = nomeCatalogo(cores.data, item.produtos?.cor_id ?? null);
    const condicao = nomeCatalogo(condicoes.data, item.produtos?.condicao_id ?? null);

    let desc = nome;
    if (marca) desc += ` (${marca})`;
    if (cor) desc += ` - ${cor}`;
    if (condicao) desc += ` - ${condicao}`;
    return desc;
  };

  /**
   * Taxa por pagamento: simplificação assumida (mesma da tela de cadastro
   * de Formas de Pagamento, FormasPagamento.tsx) — taxa "flat" do
   * `taxa_percent`, sem olhar `formas_pagamento_parcelas` (tabela de taxa
   * por parcela individual existe no banco mas nenhuma tela do sistema
   * ainda edita ou lê ela; fica pra v2 se a operação pedir). `valor` em
   * `pagamentos_venda` é o valor sem taxa (o que compõe o total da venda);
   * a taxa é só informativa de quanto aquele meio de pagamento custou.
   */
  const calcularPagamento = (p: PagamentoComprovante) => {
    const contemTaxa = p.formas_pagamento?.contem_taxa ?? false;
    const taxaPercent = contemTaxa ? Number(p.formas_pagamento?.taxa_percent ?? 0) : 0;
    const semTaxa = Number(p.valor);
    const taxaValor = semTaxa * (taxaPercent / 100);
    const comTaxa = semTaxa + taxaValor;
    const parcelas = p.parcelas || 1;
    return {
      descricao: p.formas_pagamento?.descricao ?? FORMAS_PAGAMENTO[p.forma]?.label ?? p.forma,
      parcelas,
      semTaxa,
      taxaValor,
      comTaxa,
      valorParcela: comTaxa / parcelas,
    };
  };

  const itens = detalhe?.itens ?? [];
  const pagamentos = detalhe?.pagamentos ?? [];

  const textoWhatsApp = useMemo(() => {
    if (!venda) return '';
    const linhas: string[] = [];
    linhas.push(`*Rio Preto Games* — Comprovante da venda ${venda.numero_venda ?? ''}`.trim());
    linhas.push(dataHora(venda.created_at));
    linhas.push('');
    (detalhe?.itens ?? []).forEach((item) => {
      linhas.push(`${item.quantidade}x ${item.produtos?.nome ?? '—'} — ${moeda(Number(item.total))}`);
    });
    linhas.push('');
    linhas.push(`*Total: ${moeda(Number(venda.total))}*`);
    if (Number(venda.descontos) > 0) linhas.push(`Desconto: ${moeda(Number(venda.descontos))}`);
    linhas.push('');
    linhas.push('Agradecemos a preferência, volte sempre! 🎮');
    return linhas.join('\n');
  }, [venda, detalhe]);

  const enviarWhatsApp = async () => {
    const telefoneCliente = venda?.clientes?.telefones?.[0];
    if (!telefoneCliente) {
      toast({
        title: 'Cliente sem telefone cadastrado',
        description: 'Não é possível enviar o comprovante por WhatsApp sem um telefone.',
        variant: 'destructive',
      });
      return;
    }
    if (!N8N_WEBHOOK_COMPROVANTE) {
      toast({
        title: 'Envio por WhatsApp ainda não está configurado',
        description: 'Falta ligar o robô no n8n que manda a mensagem pelo WuzAPI.',
        variant: 'destructive',
      });
      return;
    }

    let digitos = soDigitos(telefoneCliente);
    if (digitos.length <= 11) digitos = `55${digitos}`;

    setEnviando(true);
    try {
      const resposta = await fetch(N8N_WEBHOOK_COMPROVANTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: `${digitos}@s.whatsapp.net`, texto: textoWhatsApp }),
      });
      if (!resposta.ok) throw new Error(`Falha no envio (${resposta.status})`);
      toast({ title: 'Comprovante enviado por WhatsApp!', variant: 'success' });
    } catch (error) {
      toast({
        title: 'Erro ao enviar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setEnviando(false);
    }
  };

  const carregando = carregandoVenda || carregandoDetalhe;

  if (carregando) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!venda) {
    return <Vazio titulo="Venda não encontrada" descricao="Ela pode ter sido excluída." />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print:hidden">
        <PageHeader
          titulo={`Comprovante — Venda ${venda.numero_venda ?? ''}`}
          hint="Formato de papel (sulfite) ou térmica 80mm. Os dois seguem para impressão pelo navegador."
          acoes={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => navigate('/vendas/historico')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            </div>
          }
        />

        {venda.status === 'cancelado' && (
          <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            Esta venda foi cancelada. O comprovante abaixo mostra os dados de quando ela foi feita, mas não vale como venda válida — confira antes de imprimir ou enviar.
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-1">
            <button
              type="button"
              onClick={() => setFormato('sulfite')}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                formato === 'sulfite' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              Folha (sulfite)
            </button>
            <button
              type="button"
              onClick={() => setFormato('termica')}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                formato === 'termica' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              Térmica 80mm
            </button>
          </div>
          <Button variant="neutra" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={enviarWhatsApp} disabled={enviando}>
            {enviando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="mr-2 h-4 w-4" />
            )}
            Enviar por WhatsApp
          </Button>
        </div>
      </div>

      {/* `@page` muda conforme o formato: A4 com margem normal pra folha,
          80mm de largura com altura automática pra térmica. Só o formato
          selecionado é renderizado (abaixo), então só ele aparece na
          impressão — não precisa esconder o outro via CSS. */}
      <style>
        {formato === 'termica'
          ? '@page { size: 80mm auto; margin: 2mm; }'
          : '@page { size: A4; margin: 15mm; }'}
      </style>

      {formato === 'sulfite' ? (
        <ComprovanteSulfite venda={venda} itens={itens} pagamentos={pagamentos} tenant={tenant ?? null}
          descricaoProduto={descricaoProduto} calcularPagamento={calcularPagamento} />
      ) : (
        <ComprovanteTermica venda={venda} itens={itens} pagamentos={pagamentos} tenant={tenant ?? null}
          descricaoProduto={descricaoProduto} calcularPagamento={calcularPagamento} />
      )}
    </div>
  );
}

interface FormatoProps {
  venda: VendaComprovante;
  itens: ItemComprovante[];
  pagamentos: PagamentoComprovante[];
  tenant: TenantInfo | null;
  descricaoProduto: (item: ItemComprovante) => string;
  calcularPagamento: (p: PagamentoComprovante) => {
    descricao: string;
    parcelas: number;
    semTaxa: number;
    taxaValor: number;
    comTaxa: number;
    valorParcela: number;
  };
}

/**
 * Via de sulfite/PDF — reproduz "Nota de Venda Nº 5579.pdf" campo a campo,
 * inclusive os 8 parágrafos de garantia (texto verbatim do formato antigo).
 * Sem o logo do urso: não temos o arquivo da imagem aqui, só o texto.
 */
function ComprovanteSulfite({
  venda, itens, pagamentos, tenant, descricaoProduto, calcularPagamento,
}: FormatoProps) {
  // Só faz sentido gastar uma coluna do papel com desconto se houver algum.
  const temDescontoPorItem = itens.some((i) => Number(i.desconto ?? 0) > 0);

  return (
    <div className="relative rounded-lg border bg-white p-8 text-sm text-black print:border-0 print:p-0">
      {venda.status === 'cancelado' && (
        <p className="mb-4 border-2 border-red-600 py-1 text-center text-lg font-bold text-red-600">
          VENDA CANCELADA
        </p>
      )}
      <div className="mb-4 flex items-start justify-between border-b pb-3">
        <div>
          <p className="text-lg font-bold">{tenant?.nome_loja ?? 'RIO PRETO GAMES'}</p>
          {tenant?.endereco && <p>{tenant.endereco}</p>}
          {tenant?.telefone && <p>{tenant.telefone}</p>}
          {tenant?.cnpj && <p>CNPJ: {tenant.cnpj}</p>}
        </div>
        <div className="text-right">
          <p className="font-bold">Venda N°: {venda.numero_venda ?? '—'}</p>
          <p>{dataHora(venda.created_at)}</p>
        </div>
      </div>

      <div className="mb-4 space-y-0.5">
        <p><span className="font-semibold">Vendedor:</span> {venda.vendedor?.nome ?? '—'}</p>
        <p><span className="font-semibold">Cliente:</span> {venda.clientes?.nome ?? 'Consumidor final'}</p>
        <p>
          <span className="font-semibold">CPF/CNPJ:</span> {venda.clientes?.cpf_cnpj ?? '—'}
          {'  '}
          <span className="font-semibold">Telefone:</span> {venda.clientes?.telefones?.[0] ?? '—'}
        </p>
        <p><span className="font-semibold">Observações Gerais:</span> {venda.observacoes || '-'}</p>
      </div>

      <p className="mb-1 font-semibold">Descrição dos Produtos: {itens.length} no Total</p>
      {/*
        A coluna Desconto só aparece se ALGUM item tiver desconto de verdade.

        Hoje o PDV grava desconto só no total da venda (`vendas.descontos`),
        nunca por item — então a coluna aparecia em todo comprovante mostrando
        R$ 0,00 em todas as linhas, mesmo numa venda que teve desconto. Para
        quem recebe o papel, coluna zerada não diz "não houve desconto neste
        item": diz "o sistema não sabe calcular". O desconto real continua no
        rodapé, onde sempre esteve certo.

        Condicional em vez de removida de propósito: no dia em que o PDV
        passar a dar desconto por produto, a coluna volta sozinha, sem
        ninguém precisar lembrar de reativá-la.
      */}
      <table className="mb-4 w-full border-collapse border text-xs">
        <thead>
          <tr className="border bg-gray-50">
            <th className="border px-2 py-1 text-left">IMEI</th>
            <th className="border px-2 py-1 text-left">Produto</th>
            <th className="border px-2 py-1">Defeito?</th>
            <th className="border px-2 py-1 text-right">Valor.Unit.</th>
            {temDescontoPorItem && <th className="border px-2 py-1 text-right">Desconto</th>}
            <th className="border px-2 py-1">QTD</th>
            <th className="border px-2 py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id} className="border">
              <td className="border px-2 py-1">{item.produtos?.imei_serial ?? '—'}</td>
              <td className="border px-2 py-1">{descricaoProduto(item)}</td>
              <td className="border px-2 py-1 text-center">{item.defeito_declarado ? 'Sim' : 'Não'}</td>
              <td className="border px-2 py-1 text-right">{moeda(Number(item.preco_unitario))}</td>
              {temDescontoPorItem && (
                <td className="border px-2 py-1 text-right">{moeda(Number(item.desconto))}</td>
              )}
              <td className="border px-2 py-1 text-center">{item.quantidade}</td>
              <td className="border px-2 py-1 text-right">{moeda(Number(item.total))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mb-1 font-semibold">Forma de Pagamentos</p>
      <table className="mb-4 w-full border-collapse border text-xs">
        <thead>
          <tr className="border bg-gray-50">
            <th className="border px-2 py-1 text-left">Pagamento</th>
            <th className="border px-2 py-1">Nº Parcela</th>
            <th className="border px-2 py-1">Data Lançamento</th>
            <th className="border px-2 py-1 text-right">Taxa</th>
            <th className="border px-2 py-1 text-right">Valor Pago Sem Taxa</th>
            <th className="border px-2 py-1 text-right">Total Cm. Taxas</th>
            <th className="border px-2 py-1 text-right">Valor Parcela</th>
          </tr>
        </thead>
        <tbody>
          {pagamentos.map((p) => {
            const c = calcularPagamento(p);
            return (
              <tr key={p.id} className="border">
                <td className="border px-2 py-1">{c.descricao}</td>
                <td className="border px-2 py-1 text-center">{c.parcelas}X</td>
                <td className="border px-2 py-1 text-center">{fmtData(p.created_at)}</td>
                <td className="border px-2 py-1 text-right">{moeda(c.taxaValor)}</td>
                <td className="border px-2 py-1 text-right">{moeda(c.semTaxa)}</td>
                <td className="border px-2 py-1 text-right">{moeda(c.comTaxa)}</td>
                <td className="border px-2 py-1 text-right">{moeda(c.valorParcela)}</td>
              </tr>
            );
          })}
          {!pagamentos.length && (
            <tr><td className="border px-2 py-1 text-center text-gray-500" colSpan={7}>Nenhum pagamento registrado.</td></tr>
          )}
        </tbody>
      </table>

      <p className="mb-4 flex flex-wrap gap-6 border-y py-2 font-semibold">
        <span>VALOR: {moeda(Number(venda.subtotal))}</span>
        <span>DESCONTO: {moeda(Number(venda.descontos))}</span>
        <span>TOTAL: {moeda(Number(venda.total))}</span>
        {/* PRAZO sempre é a própria data da venda: a loja não trabalha com
            crediário/parcelamento com vencimento futuro, então não existe
            uma data de vencimento diferente do dia da venda. */}
        <span>PRAZO: {fmtData(venda.created_at)}</span>
      </p>

      <ol className="mb-6 space-y-1 text-xs leading-snug">
        <li>1 - Aparelhos novos possuem 1 ano de garantia pelo fabricante.</li>
        <li>2 - Aparelhos de marca Xiaomi possuem 90 dias de garantia.</li>
        <li>3 - Aparelhos seminovos possuem 90 dias de garantia com nossa loja.</li>
        <li>4 - Não é dada garantia para aparelhos que apresentem sinal de queda, molhado ou riscados.</li>
        <li>5 - Não é dada garantia para aparelhos que tenham sido aberto por técnicos terceiros.</li>
        <li>6 - Não cobrimos mau uso do usuário.</li>
        <li>7 - Cliente declara estar ciente de que a empresa Rio Preto Games é uma revendedora, e por isto, revende os produtos conforme a fabricante envia.</li>
        <li>8 - Cliente declara estar ciente dos termos acima.</li>
      </ol>

      <p className="mb-10 text-center font-semibold">AGRADECEMOS A PREFERÊNCIA, VOLTE SEMPRE!</p>

      <div className="mx-auto w-2/3 border-t pt-1 text-center text-xs">
        Assinatura do(a) cliente
      </div>
    </div>
  );
}

/**
 * Via térmica 80mm — desenho próprio (sem exemplo dado, pedido explícito do
 * Felipe: "desenha um padrão"). Condensada: sem tabela com borda, sem os 8
 * parágrafos por extenso (papel térmico é caro e a via de sulfite já cobre
 * os termos completos) — só um resumo de 2 linhas remetendo à via de papel.
 */
function ComprovanteTermica({
  venda, itens, pagamentos, tenant, descricaoProduto, calcularPagamento,
}: FormatoProps) {
  const linha = '-'.repeat(32);
  return (
    <div className="mx-auto w-[80mm] bg-white p-2 font-mono text-[11px] leading-tight text-black print:w-full">
      {venda.status === 'cancelado' && (
        <p className="mb-1 text-center font-bold">*** VENDA CANCELADA ***</p>
      )}
      <div className="text-center">
        <p className="font-bold">{(tenant?.nome_loja ?? 'RIO PRETO GAMES').toUpperCase()}</p>
        {tenant?.endereco && <p>{tenant.endereco}</p>}
        {tenant?.telefone && <p>{tenant.telefone}</p>}
        {tenant?.cnpj && <p>CNPJ: {tenant.cnpj}</p>}
      </div>
      <p>{linha}</p>
      <p>Venda: {venda.numero_venda ?? '—'}</p>
      <p>{dataHora(venda.created_at)}</p>
      <p>Vendedor: {venda.vendedor?.nome ?? '—'}</p>
      <p>Cliente: {venda.clientes?.nome ?? 'Consumidor final'}</p>
      {venda.clientes?.cpf_cnpj && <p>CPF/CNPJ: {venda.clientes.cpf_cnpj}</p>}
      <p>{linha}</p>
      {itens.map((item) => (
        <div key={item.id} className="mb-1">
          <p>{descricaoProduto(item)}</p>
          {item.produtos?.imei_serial && <p>IMEI/Série: {item.produtos.imei_serial}</p>}
          <p>
            {item.quantidade}x {moeda(Number(item.preco_unitario))}
            {Number(item.desconto) > 0 ? ` (-${moeda(Number(item.desconto))})` : ''}
            {'  '}= {moeda(Number(item.total))}
          </p>
          {item.defeito_declarado && <p>*** DEFEITO DECLARADO ***</p>}
        </div>
      ))}
      <p>{linha}</p>
      {pagamentos.map((p) => {
        const c = calcularPagamento(p);
        return (
          <p key={p.id}>
            {c.descricao} {c.parcelas}X — {moeda(c.comTaxa)}
          </p>
        );
      })}
      <p>{linha}</p>
      <p>VALOR: {moeda(Number(venda.subtotal))}</p>
      {Number(venda.descontos) > 0 && <p>DESCONTO: {moeda(Number(venda.descontos))}</p>}
      <p className="font-bold">TOTAL: {moeda(Number(venda.total))}</p>
      <p>{linha}</p>
      <p className="text-center">
        Seminovo: 90 dias de garantia com a loja. Novo: garantia do fabricante. Termos completos na via de papel.
      </p>
      <p className="mt-2 text-center font-bold">Obrigado pela preferência, volte sempre!</p>
      <p className="mt-4 text-center">x_______________________</p>
      <p className="text-center">Assinatura do(a) cliente</p>
    </div>
  );
}
