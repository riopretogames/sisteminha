import { useEffect, useMemo, useRef, useState } from 'react';
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
import { emReais } from '@/lib/dinheiro';
import { acertoDaVenda } from '@/lib/valoresDaVenda';
import { mensagemDoErro } from '@/lib/mensagemDoErro';

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
  /** Endereço do arquivo da logo, cadastrado em Minha Empresa (bucket público
   *  `logos`). Vazio enquanto a loja não anexou nenhuma — e aí o comprovante
   *  sai só com o nome escrito, como saía antes. */
  logo_url: string | null;
  inscricao_estadual: string | null;
  email: string | null;
  /** Cor da marca, cadastrada em Minha Empresa. Entra como detalhe fino no
   *  comprovante (a régua do topo e o total), nunca como fundo chapado —
   *  impressora térmica é preto e branco, e sulfite colorida gasta tinta. */
  cor_primaria: string | null;
  /** Condições de garantia, uma por linha, cadastradas em Cadastros >
   *  Comprovantes. A numeração é feita na hora de imprimir. */
  termos_comprovante: string | null;
  mensagem_comprovante: string | null;
}

type Formato = 'sulfite' | 'termica';

export default function ComprovanteVenda() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [formato, setFormato] = useState<Formato>('sulfite');
  const [enviando, setEnviando] = useState(false);

  /**
   * Altura do papel da via térmica, em milímetros.
   *
   * Por que isto existe: a bobina térmica tem largura fixa (80mm) e altura
   * variável — o papel é cortado no fim do cupom. O jeito natural de escrever
   * isso é `@page { size: 80mm auto }`, e era assim que estava. Só que o
   * navegador **descarta a regra inteira** quando a altura é `auto`: em vez de
   * 80mm de largura, ele imprime no papel padrão (Carta/A4). Conferido em
   * 23/09/2026 imprimindo os dois jeitos: com `auto` saiu 216mm de largura,
   * com uma altura escrita saiu os 80mm certos.
   *
   * Então a altura é medida aqui, no cupom já montado, e escrita no `@page`.
   */
  const refTermica = useRef<HTMLDivElement>(null);
  const [alturaTermicaMm, setAlturaTermicaMm] = useState<number | null>(null);

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
    queryFn: async (): Promise<{
      itens: ItemComprovante[];
      pagamentos: PagamentoComprovante[];
      devolucaoDeOrigem: string | null;
    }> => {
      const [itensRes, pagamentosRes, devolucaoRes] = await Promise.all([
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
        // Esta venda é a venda NOVA de uma troca? Então parte dela foi paga com
        // o crédito do produto devolvido, e o papel precisa dizer isso.
        supabase
          .from('devolucoes')
          .select('numero_devolucao')
          .eq('venda_nova_id', id!)
          .limit(1),
      ]);
      if (itensRes.error) throw itensRes.error;
      if (pagamentosRes.error) throw pagamentosRes.error;
      if (devolucaoRes.error) throw devolucaoRes.error;
      const devolucao = (devolucaoRes.data ?? [])[0] as { numero_devolucao: string | null } | undefined;
      return {
        itens: (itensRes.data ?? []) as unknown as ItemComprovante[],
        pagamentos: (pagamentosRes.data ?? []) as unknown as PagamentoComprovante[],
        // Texto vazio (e não nulo) quando a devolução existe sem número ainda:
        // o que importa é saber que ELA existe.
        devolucaoDeOrigem: devolucao ? (devolucao.numero_devolucao ?? '') : null,
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
        .select('nome_loja, endereco, telefone, cnpj, logo_url, inscricao_estadual, email, cor_primaria, termos_comprovante, mensagem_comprovante')
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

  /**
   * Troco e crédito da devolução (achado de 24/09). O pagamento é gravado
   * pelo valor ENTREGUE: sem estas linhas o papel mostrava "Dinheiro R$ 100"
   * numa venda de R$ 80, e na venda nova de uma troca, "Total R$ 429,90" com
   * pagamento de R$ 80,90 — parecia que o cliente ficou devendo.
   */
  const acerto: AcertoDoComprovante = {
    ...acertoDaVenda({
      total: venda?.total ?? 0,
      pagamentos,
      veioDeTroca: detalhe?.devolucaoDeOrigem != null,
    }),
    numeroDevolucao: detalhe?.devolucaoDeOrigem ?? null,
  };

  /**
   * Mede o cupom e guarda a altura do papel (ver a nota lá em cima).
   *
   * A medição é feita com a largura que o cupom terá NO PAPEL (76mm: os 80mm
   * da bobina menos 2mm de margem de cada lado), não com a largura que ele
   * tem na tela. Mais estreito, o texto quebra em mais linhas e o cupom fica
   * mais alto — medir pela tela cortaria as últimas linhas na impressão.
   *
   * A troca de largura acontece e volta dentro da mesma passada, antes de o
   * navegador desenhar, então ninguém vê o cupom "piscar".
   *
   * 96 pixels equivalem a uma polegada (25,4mm) — é a régua que o navegador
   * usa. Os 4mm de sobra no fim são para a faca do corte não comer a última
   * linha.
   */
  useEffect(() => {
    if (formato !== 'termica') return;
    const el = refTermica.current;
    if (!el) return;

    const larguraOriginal = el.style.width;
    el.style.width = '76mm';
    const alturaPx = el.scrollHeight;
    el.style.width = larguraOriginal;

    const mm = Math.ceil((alturaPx * 25.4) / 96) + 4;
    setAlturaTermicaMm((atual) => (atual === mm ? atual : mm));
  }, [formato, venda, itens, pagamentos]);

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
        description: mensagemDoErro(error),
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
          80mm de largura por a altura medida do cupom pra térmica (ver a nota
          sobre o `auto` no topo do arquivo). Só o formato selecionado é
          renderizado (abaixo), então só ele aparece na impressão — não precisa
          esconder o outro via CSS.

          Os 200mm de reserva valem só no instante entre a tela montar e a
          medição acontecer; na prática ninguém imprime nessa fresta, mas um
          valor escrito é melhor que `auto`, que faz o navegador ignorar a
          regra e voltar para o papel de carta. */}
      <style>
        {formato === 'termica'
          ? `@page { size: 80mm ${alturaTermicaMm ?? 200}mm; margin: 2mm; }`
          : '@page { size: A4; margin: 15mm; }'}
      </style>

      {formato === 'sulfite' ? (
        <ComprovanteSulfite acerto={acerto} venda={venda} itens={itens} pagamentos={pagamentos} tenant={tenant ?? null}
          descricaoProduto={descricaoProduto} calcularPagamento={calcularPagamento} />
      ) : (
        <ComprovanteTermica acerto={acerto} refCupom={refTermica} venda={venda} itens={itens} pagamentos={pagamentos} tenant={tenant ?? null}
          descricaoProduto={descricaoProduto} calcularPagamento={calcularPagamento} />
      )}
    </div>
  );
}

/**
 * A logo da loja no comprovante, vinda do cadastro em Minha Empresa.
 *
 * Some sozinha em dois casos, e os dois são de propósito:
 *
 * - **Loja sem logo cadastrada:** o comprovante sai com o nome escrito, como
 *   saía antes. Ninguém fica com um quadrado vazio no papel.
 * - **Arquivo que não abre** (foi apagado do servidor, endereço quebrado, a
 *   loja está sem internet na hora de imprimir): a imagem se apaga em vez de
 *   virar aquele ícone de foto quebrada no meio do comprovante do cliente.
 */
function LogoDaLoja({ url, className }: { url: string | null | undefined; className: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!url || falhou) return null;
  return (
    // `alt` vazio de propósito: o nome da loja já está escrito do lado, e um
    // texto alternativo repetiria a informação para quem usa leitor de tela.
    <img src={url} alt="" className={className} onError={() => setFalhou(true)} />
  );
}

/** Troco e crédito da troca, já calculados, para as duas vias. */
interface AcertoDoComprovante {
  trocoCentavos: number;
  creditoCentavos: number;
  numeroDevolucao: string | null;
}

interface FormatoProps {
  acerto: AcertoDoComprovante;
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

/** Hora no formato do comprovante (14:35:07). */
function hora(valor: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(valor));
}

/**
 * As condições de garantia, na ordem cadastrada em Cadastros > Comprovantes.
 * Loja que apagou todas imprime o comprovante sem essa parte — é escolha dela.
 */
function condicoesDaLoja(tenant: TenantInfo | null): string[] {
  return (tenant?.termos_comprovante ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** A cor da marca, com um preto de reserva para loja que não cadastrou nenhuma. */
function corDaMarca(tenant: TenantInfo | null): string {
  return tenant?.cor_primaria?.trim() || '#111111';
}

/**
 * Via de folha (sulfite/PDF) — o documento que fica com o cliente.
 *
 * Traz os mesmos campos da nota que a loja já usava no sistema antigo (pedido
 * do Felipe, com a "Nota de Venda Nº 5669" como referência), mas desenhado
 * como documento e não como planilha impressa:
 *
 * - **Hierarquia por peso e tamanho, não por moldura.** A grade de linhas em
 *   volta de cada célula fazia todo campo gritar no mesmo volume. Aqui só o
 *   que separa de fato tem linha, e ela é fina.
 * - **Número tabular em tudo que é dinheiro**, para os valores alinharem na
 *   casa decimal — coluna de preço desalinhada é o que faz uma nota parecer
 *   amadora.
 * - **A cor da marca entra como detalhe** (a régua do topo e o total), nunca
 *   como fundo chapado: o comprovante precisa continuar legível impresso em
 *   preto e branco, que é como a maioria vai sair.
 */
function ComprovanteSulfite({
  acerto, venda, itens, pagamentos, tenant, descricaoProduto, calcularPagamento,
}: FormatoProps) {
  // Só faz sentido gastar uma coluna do papel com desconto se houver algum.
  const temDescontoPorItem = itens.some((i) => Number(i.desconto ?? 0) > 0);
  const cor = corDaMarca(tenant);
  const condicoes = condicoesDaLoja(tenant);
  const telefoneCliente = venda.clientes?.telefones?.[0];

  return (
    <div className="relative rounded-lg border bg-white p-10 text-black print:rounded-none print:border-0 print:p-0">
      {venda.status === 'cancelado' && (
        <p className="mb-6 border-2 border-red-600 py-1.5 text-center text-lg font-bold tracking-[0.2em] text-red-600">
          VENDA CANCELADA
        </p>
      )}

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          {/* Altura travada (não largura): logo quadrada e logo comprida ficam
              do mesmo tamanho no papel, e `object-contain` não deixa nenhuma
              das duas esticar. */}
          <LogoDaLoja
            url={tenant?.logo_url}
            className="h-16 w-auto max-w-[45mm] shrink-0 object-contain"
          />
          <div className="leading-snug">
            {/* Tracking negativo no nome: letra grande lida com espaçamento
                normal parece solta. */}
            <p className="text-[19px] font-bold tracking-[-0.01em]">
              {tenant?.nome_loja ?? 'RIO PRETO GAMES'}
            </p>
            <div className="mt-1 space-y-px text-[11px] text-neutral-600">
              {tenant?.cnpj && <p>CNPJ {tenant.cnpj}</p>}
              {tenant?.inscricao_estadual && <p>IE {tenant.inscricao_estadual}</p>}
              {tenant?.endereco && <p>{tenant.endereco}</p>}
              <p>
                {[tenant?.telefone, tenant?.email].filter(Boolean).join('  ·  ')}
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
            Comprovante de venda
          </p>
          {/* O maior número da página: é por ele que alguém acha este papel
              dentro de uma pilha. Tracking negativo porque letra grande com
              espaçamento normal parece solta. */}
          <p className="mt-1 text-[44px] font-bold leading-[0.95] tracking-[-0.03em] tabular-nums">
            {venda.numero_venda ?? '—'}
          </p>
          <p className="mt-2 text-[12px] text-neutral-600">{dataHora(venda.created_at)}</p>
        </div>
      </header>

      {/* A régua com a cor da loja: um fio, não uma tarja. */}
      <div className="mt-6 h-[3px] w-full" style={{ backgroundColor: cor }} />

      {/* ── Quem vende, quem compra ────────────────────────────────────────── */}
      {/* Cliente e vendedor são o que mais se consulta depois do total — quem
          comprou e quem atendeu. Nome em corpo grande, o resto em corpo de
          apoio: a diferença de tamanho é o que faz o olho achar sem procurar. */}
      <section className="mt-8 grid grid-cols-2 gap-10 text-[13px]">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            Cliente
          </p>
          <p className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">
            {venda.clientes?.nome ?? 'Consumidor final'}
          </p>
          <div className="mt-1.5 space-y-0.5 text-neutral-700">
            {venda.clientes?.cpf_cnpj && <p>CPF/CNPJ {venda.clientes.cpf_cnpj}</p>}
            {telefoneCliente && <p>{telefoneCliente}</p>}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            Vendedor
          </p>
          <p className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">
            {venda.vendedor?.nome ?? '—'}
          </p>
          <p className="mt-1.5 text-neutral-700">Prazo {fmtData(venda.created_at)}</p>
        </div>
      </section>

      {venda.observacoes && (
        <p className="mt-6 rounded border-l-2 border-neutral-300 bg-neutral-50 px-4 py-2.5 text-[12px] text-neutral-700 print:bg-transparent">
          <span className="font-semibold">Observações:</span> {venda.observacoes}
        </p>
      )}

      {/* ── Produtos ───────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
          Produtos · {itens.length} {itens.length === 1 ? 'item' : 'itens'}
        </p>
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
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-[0.08em] text-neutral-600">
              <th className="pb-2 text-left font-medium">Produto</th>
              <th className="pb-2 pl-3 text-right font-medium">Unitário</th>
              {temDescontoPorItem && <th className="pb-2 pl-3 text-right font-medium">Desc.</th>}
              <th className="pb-2 pl-3 text-right font-medium">Qtd</th>
              <th className="pb-2 pl-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.id} className="border-b border-neutral-200 align-top">
                <td className="py-2.5 pr-3">
                  <span className="font-medium">{descricaoProduto(item)}</span>
                  {/* IMEI e defeito viram linha secundária: são informação de
                      conferência, não a identidade do produto. */}
                  {(item.produtos?.imei_serial || item.defeito_declarado) && (
                    <span className="mt-1 block text-[10px] text-neutral-500">
                      {item.produtos?.imei_serial && <>IMEI/Série {item.produtos.imei_serial}</>}
                      {item.produtos?.imei_serial && item.defeito_declarado && '  ·  '}
                      {item.defeito_declarado && (
                        <span className="font-semibold text-neutral-700">Com defeito declarado</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pl-3 text-right tabular-nums">{moeda(Number(item.preco_unitario))}</td>
                {temDescontoPorItem && (
                  <td className="py-2.5 pl-3 text-right tabular-nums">{moeda(Number(item.desconto))}</td>
                )}
                <td className="py-2.5 pl-3 text-right tabular-nums">{item.quantidade}</td>
                <td className="py-2.5 pl-3 text-right font-medium tabular-nums">{moeda(Number(item.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── Pagamento e totais, lado a lado ────────────────────────────────── */}
      <section className="mt-8 flex flex-wrap items-start justify-between gap-10">
        <div className="min-w-[95mm] flex-1">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            Pagamento
          </p>
          {pagamentos.length === 0 ? (
            <p className="text-[12px] text-neutral-500">Nenhum pagamento registrado.</p>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-neutral-300 text-[10px] uppercase tracking-[0.08em] text-neutral-600">
                  <th className="pb-1 text-left font-medium">Forma</th>
                  <th className="pb-1 pl-2 text-center font-medium">Parc.</th>
                  <th className="pb-1 pl-2 text-right font-medium">Taxa</th>
                  <th className="pb-1 pl-2 text-right font-medium">Parcela</th>
                  <th className="pb-1 pl-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {pagamentos.map((p) => {
                  const c = calcularPagamento(p);
                  return (
                    <tr key={p.id} className="border-b border-neutral-100">
                      <td className="py-1.5">
                        {c.descricao}
                        <span className="ml-1 text-neutral-500">{fmtData(p.created_at)}</span>
                      </td>
                      <td className="py-1.5 pl-2 text-center tabular-nums">{c.parcelas}x</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{moeda(c.taxaValor)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{moeda(c.valorParcela)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{moeda(c.comTaxa)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="ml-auto w-[68mm] shrink-0 text-[13px]">
          <div className="flex justify-between py-1.5 text-neutral-700">
            <span>Valor</span>
            <span className="tabular-nums">{moeda(Number(venda.subtotal))}</span>
          </div>
          <div className="flex justify-between py-1.5 text-neutral-700">
            <span>Desconto</span>
            <span className="tabular-nums">{moeda(Number(venda.descontos))}</span>
          </div>
          {acerto.creditoCentavos > 0 && (
            <div className="flex justify-between gap-3 py-1.5 text-neutral-700">
              <span>
                Crédito da devolução{acerto.numeroDevolucao ? ` ${acerto.numeroDevolucao}` : ''}
              </span>
              <span className="tabular-nums">{moeda(emReais(acerto.creditoCentavos))}</span>
            </div>
          )}
          {/* O total é a única coisa desta página que alguém procura de longe:
              maior, mais pesado, e com a cor da loja na linha de cima. */}
          <div
            className="mt-2 flex items-baseline justify-between border-t-2 pt-3"
            style={{ borderColor: cor }}
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
              Total
            </span>
            <span className="text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums">
              {moeda(Number(venda.total))}
            </span>
          </div>
          {/* O pagamento acima é o valor ENTREGUE; o troco explica a diferença. */}
          {acerto.trocoCentavos > 0 && (
            <div className="mt-2 flex justify-between py-1.5 text-neutral-700">
              <span>Troco</span>
              <span className="tabular-nums">{moeda(emReais(acerto.trocoCentavos))}</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Condições e assinatura ─────────────────────────────────────────── */}
      {condicoes.length > 0 && (
        <section className="mt-8 border-t border-neutral-200 pt-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            Condições de garantia
          </p>
          {/* Letra miúda de propósito: é o contrato, não a informação que a
              pessoa veio buscar. Leading folgado para continuar legível. */}
          <ol className="space-y-1 text-[10px] leading-snug text-neutral-700">
            {condicoes.map((texto, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-neutral-400">{i + 1}.</span>
                <span>{texto}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {tenant?.mensagem_comprovante && (
        <p className="mt-7 text-center text-[14px] font-semibold tracking-[0.04em]">
          {tenant.mensagem_comprovante}
        </p>
      )}

      <div className="mx-auto mt-10 w-2/3 border-t border-neutral-400 pt-2 text-center text-[11px] text-neutral-600">
        Assinatura do(a) cliente
      </div>
    </div>
  );
}

/**
 * Via térmica 80mm — o cupom da bobina.
 *
 * Segue o modelo que a loja já usa no sistema antigo (o Felipe mandou um
 * exemplo em 23/09/2026): topo com a loja, o bloco do cupom, os produtos em
 * uma linha cada, os totais, o pagamento, a hora da saída e as condições de
 * garantia por extenso. As condições saem completas aqui também — no modelo
 * elas estão, e o cliente que leva só o cupom não pode ficar sem elas.
 *
 * Tudo em texto de largura fixa e alinhamento por espaço, do jeito que
 * impressora térmica imprime melhor, com os separadores marcando os blocos.
 */
function ComprovanteTermica({
  acerto, venda, itens, pagamentos, tenant, descricaoProduto, calcularPagamento, refCupom,
}: FormatoProps & { refCupom?: React.Ref<HTMLDivElement> }) {
  const linha = '-'.repeat(32);
  const condicoes = condicoesDaLoja(tenant);
  const telefoneCliente = venda.clientes?.telefones?.[0];

  return (
    // Na tela o cupom aparece com a largura real do papel (80mm), para dar a
    // noção de como vai sair. Na impressão a largura passa a ser a da própria
    // bobina (`@page size: 80mm`) e a margem do papel já vem do `@page` — o
    // recuo de tela aqui só roubaria caracteres de cada linha.
    <div ref={refCupom} className="mx-auto w-[80mm] bg-white p-2 font-mono text-[11px] leading-tight text-black print:mx-0 print:w-full print:p-0">
      {venda.status === 'cancelado' && (
        <p className="mb-1 text-center font-bold">*** VENDA CANCELADA ***</p>
      )}

      <div className="text-center">
        {/* Em preto e branco de propósito: impressora térmica não tem cor, e
            uma logo colorida vira um borrão cinza sem contraste. */}
        <LogoDaLoja
          url={tenant?.logo_url}
          className="mx-auto mb-1 h-12 w-auto max-w-[40mm] object-contain grayscale contrast-125"
        />
        <p className="font-bold">{(tenant?.nome_loja ?? 'RIO PRETO GAMES').toUpperCase()}</p>
        {tenant?.telefone && <p>{tenant.telefone}</p>}
        {tenant?.cnpj && <p>{tenant.cnpj}</p>}
        {tenant?.endereco && <p>{tenant.endereco}</p>}
      </div>

      <p>{linha}</p>
      {/* Mesma ideia da via de folha: cupom, cliente, vendedor e total um
          degrau acima do resto. No papel estreito o degrau é menor — letra
          grande demais quebra linha e come bobina. */}
      <p className="text-[15px] font-bold leading-tight">CUPOM {venda.numero_venda ?? '—'}</p>
      <p>{hora(venda.created_at)} {fmtData(venda.created_at)}</p>
      <p className="text-[12px] font-bold">VENDEDOR: {(venda.vendedor?.nome ?? '—').toUpperCase()}</p>
      <p className="text-[12px] font-bold">CLIENTE: {(venda.clientes?.nome ?? 'CONSUMIDOR FINAL').toUpperCase()}</p>
      {telefoneCliente && <p>{telefoneCliente}</p>}
      {venda.clientes?.cpf_cnpj && <p>{venda.clientes.cpf_cnpj}</p>}

      <p>{linha}</p>
      <p>Descricao dos produtos {itens.length}x</p>
      {itens.map((item) => (
        <div key={item.id} className="mb-1">
          <p>
            {item.quantidade}X - {descricaoProduto(item)} - {moeda(Number(item.total))}
          </p>
          {item.produtos?.imei_serial && <p>IMEI/Serie: {item.produtos.imei_serial}</p>}
          {item.defeito_declarado && <p>*** DEFEITO DECLARADO ***</p>}
        </div>
      ))}

      <p>{linha}</p>
      <p className="text-[15px] font-bold leading-tight">VALOR TOTAL: {moeda(Number(venda.total))}</p>
      {Number(venda.descontos) > 0 && <p>VALOR DESCONTO: {moeda(Number(venda.descontos))}</p>}
      {pagamentos.map((p) => {
        const c = calcularPagamento(p);
        return (
          <p key={p.id}>
            {c.parcelas}X - {c.descricao} - {moeda(c.comTaxa)} - {fmtData(p.created_at)}
          </p>
        );
      })}
      {acerto.creditoCentavos > 0 && (
        <p>
          CREDITO DA DEVOLUCAO{acerto.numeroDevolucao ? ` ${acerto.numeroDevolucao}` : ''}:{' '}
          {moeda(emReais(acerto.creditoCentavos))}
        </p>
      )}
      {acerto.trocoCentavos > 0 && <p>TROCO: {moeda(emReais(acerto.trocoCentavos))}</p>}
      <p>Data Saida: {fmtData(venda.created_at)}</p>
      <p>Hora Saida: {hora(venda.created_at)}</p>

      {condicoes.length > 0 && (
        <>
          <p>{linha}</p>
          <div className="space-y-1">
            {condicoes.map((texto, i) => (
              <p key={i}>{i + 1} - {texto.toUpperCase()}</p>
            ))}
          </div>
        </>
      )}

      {tenant?.mensagem_comprovante && (
        <p className="mt-2 text-center font-bold">{tenant.mensagem_comprovante}</p>
      )}

      <p className="mt-4 text-center">x_______________________</p>
      <p className="text-center">Assinatura do(a) cliente</p>
    </div>
  );
}
