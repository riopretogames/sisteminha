import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search, Package, ShoppingCart, Plus, Minus, Trash2, ArrowLeftRight, ArrowLeft, FileText,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, dataHora } from '@/lib/format';
import { emCentavos, emReais } from '@/lib/dinheiro';
import { pagoPorLinha, valorDaDevolucao } from '@/lib/valoresDaVenda';
import { faltandoParaFecharVenda } from '@/lib/vendaObrigatorios';
import { mensagemDoErro } from '@/lib/mensagemDoErro';
import { useCamposObrigatorios } from '@/hooks/useCamposObrigatorios';
import { useCatalogo } from '@/hooks/useCatalogos';
import { CampoCatalogo } from '@/components/CampoCatalogo';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { FichaDaVenda } from '@/components/vendas/FichaDaVenda';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/**
 * Troca e Devolução de produto.
 *
 * Feature nova (não existia rascunho nenhum antes) — desenhada com o
 * Felipe em 08/08 (ver PLANO-DE-ACAO.md). Duas decisões de negócio
 * que moldam esta tela:
 * - Devolução é sempre em DINHEIRO de verdade — a loja não trabalha com
 *   crédito de loja nem crediário, então não existe "fica devendo" nem
 *   "vira saldo pra usar depois".
 * - Cobre os dois casos numa tela só: devolução pura (cliente só devolve,
 *   não leva nada) e troca (devolve um produto, leva outro no lugar).
 *
 * Como funciona por baixo:
 * - Itens devolvidos da venda original entram em `devolucao_itens`, que
 *   dispara um gatilho no banco devolvendo o estoque (espelha o gatilho de
 *   baixa da venda, no sentido contrário).
 * - Se teve troca, os itens novos viram uma VENDA de verdade (`vendas` +
 *   `itens_venda`) — reaproveita a baixa de estoque que já existe pra
 *   venda normal, não duplica essa lógica aqui.
 * - A diferença entre o que voltou e o que saiu de novo é acertada em
 *   dinheiro: ou devolve pro cliente, ou o cliente paga a mais — nunca os
 *   dois ao mesmo tempo (o banco tem um CHECK garantindo isso).
 *
 * Permissão: `sales.cancel` — já existia cadastrada, mas era decorativa
 * (nenhuma tela usava). Troca/devolução é exatamente o tipo de ação que
 * essa permissão deveria gatear.
 *
 * As 2 pendências abaixo (achadas na revisão adversarial de 08/08,
 * registradas no PLANO-DE-ACAO.md) foram corrigidas em 17/08:
 *
 * 1. ✅ O dinheiro devolvido agora entra na conferência de Caixa: o
 *    gatilho `registrar_devolucao_no_caixa` (migration `20260817120000`)
 *    lança `devolucoes.valor_devolvido_cliente` como saída no caixa
 *    aberto do momento. Desde 24/09 (migration `20260924163000`) ele abre o
 *    caixa sozinho quando não há nenhum aberto, igual a venda e a OS já
 *    faziam desde 21/08 — antes, a devolução em dinheiro feita antes da
 *    primeira venda do dia saía da gaveta sem aparecer na conferência.
 * 2. ✅ A venda nova continua gravando o preço CHEIO do produto novo em
 *    `vendas.total` (precisa disso pra contagem de vendas por produto nos
 *    dashboards), mas agora também grava `valor_faturamento_real` — quanto
 *    entrou de dinheiro NOVO de verdade (a diferença cobrada do cliente,
 *    ou 0). Quem soma `vendas.total` pra "faturamento" (VendasHistorico,
 *    DashboardVenda, Dashboard Home, RelatorioVendas) passou a somar
 *    `COALESCE(valor_faturamento_real, total)` em vez de `total` sozinho —
 *    não conta mais o produto trocado duas vezes.
 *
 * A trava contra devolver mais unidades do que foi vendido mora no banco desde
 * 21/08 (gatilho `trg_quantidade_devolvida`), inclusive no caso de dois
 * terminais devolvendo a mesma venda ao mesmo tempo.
 *
 * **O valor devolvido é o que o cliente PAGOU, não o preço de tabela** (achado
 * de 24/09). O PDV dá o desconto na venda inteira e grava o preço cheio em
 * cada item; esta tela multiplicava quantidade × preço do item e mandava
 * devolver R$ 2.000,00 a quem tinha pago R$ 1.500 (VD-202608-0003). Agora o
 * desconto é rateado entre os itens (`lib/valoresDaVenda.ts`) e toda a conta
 * é feita em centavos inteiros (`lib/dinheiro.ts`), como no PDV.
 */

interface VendaResumo {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
  total: number | null;
  /** De onde a venda veio. A venda nova de uma troca herda a mesma origem. */
  origem_venda_id: string | null;
  clientes: { id: string; nome: string } | null;
  vendedor: { nome: string } | null;
  itens_venda: Array<{
    quantidade: number;
    produtos: { nome: string; imei_serial: string | null } | null;
  }>;
  devolucoes: Array<{ devolucao_itens: Array<{ quantidade: number }> }>;
}

/**
 * Quantas vendas a lista traz quando ninguém está procurando nada.
 *
 * A busca NÃO fica presa a elas: com texto digitado, a procura vai ao banco
 * inteiro (ver `buscarVendas`). Até 24/09 a busca filtrava só estas 200 já
 * carregadas, e uma venda mais antiga — ainda dentro da garantia de 90 dias —
 * simplesmente não existia para esta tela, que é a única porta da devolução.
 */
const LIMITE_LISTA = 200;

/** Quantas linhas a tabela desenha; o resto se alcança pela busca. */
const LINHAS_NA_TABELA = 50;

const SELECT_VENDA = `id, numero_venda, created_at, status, total, origem_venda_id,
   clientes(id, nome),
   vendedor:profiles!vendas_vendedor_id_fkey(nome),
   itens_venda(quantidade, produtos:vw_produtos(nome, imei_serial)),
   devolucoes!venda_original_id(devolucao_itens(quantidade))`;

/**
 * Tira do texto digitado o que a linguagem de filtro do banco usa como
 * separador (vírgula, parênteses, aspas) ou como curinga (% e _). Sem isso,
 * uma vírgula no nome do cliente quebraria a consulta inteira.
 */
function limparTermo(texto: string): string {
  return texto.replace(/[%_,()*\\"]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * As vendas que a tela oferece para devolver.
 *
 * Sem termo: as `LIMITE_LISTA` mais recentes. Com termo: procura NO BANCO pelo
 * número da venda, pelo nome do cliente, pelo nome ou IMEI/série do produto e
 * pelo nome do vendedor — cada caminho numa consulta, juntando o resultado. É
 * mais consultas do que uma busca só, mas o banco de dados não deixa combinar
 * "OU" entre tabelas diferentes numa consulta só, e é exatamente essa
 * combinação que o balcão pede ("é do João, um controle, lá de julho").
 */
async function buscarVendas(termo: string): Promise<VendaResumo[]> {
  const base = () =>
    supabase.from('vendas').select(SELECT_VENDA).neq('status', 'cancelado');

  if (!termo) {
    const { data, error } = await base()
      .order('created_at', { ascending: false })
      .limit(LIMITE_LISTA);
    if (error) throw error;
    return (data ?? []) as unknown as VendaResumo[];
  }

  const padrao = `%${termo}%`;
  const ids = (linhas: Array<{ id: string }> | null) => (linhas ?? []).map((l) => l.id);

  const [clientesRes, produtosRes, pessoasRes] = await Promise.all([
    supabase.from('clientes').select('id').ilike('nome', padrao).limit(100),
    // Produto vem por `vw_produtos` (regra de custo protegido). IMEI entra junto
    // com o nome: é o que está escrito no aparelho que o cliente trouxe.
    supabase
      .from('vw_produtos')
      .select('id')
      .or(`nome.ilike."${padrao}",imei_serial.ilike."${padrao}"`)
      .limit(100),
    supabase.from('profiles').select('id').ilike('nome', padrao).limit(50),
  ]);
  if (clientesRes.error) throw clientesRes.error;
  if (produtosRes.error) throw produtosRes.error;
  if (pessoasRes.error) throw pessoasRes.error;

  const clienteIds = ids(clientesRes.data as Array<{ id: string }> | null);
  const produtoIds = ids(produtosRes.data as Array<{ id: string }> | null);
  const pessoaIds = ids(pessoasRes.data as Array<{ id: string }> | null);

  let vendaIdsDoProduto: string[] = [];
  if (produtoIds.length > 0) {
    const { data, error } = await supabase
      .from('itens_venda')
      .select('venda_id')
      .in('produto_id', produtoIds)
      .limit(500);
    if (error) throw error;
    // Um produto muito vendido traria centenas de vendas; 150 cabem no
    // endereço da consulta e sobram para o que o balcão procura.
    vendaIdsDoProduto = [
      ...new Set(((data ?? []) as Array<{ venda_id: string }>).map((i) => i.venda_id)),
    ].slice(0, 150);
  }

  const consultas = [
    base().ilike('numero_venda', padrao).order('created_at', { ascending: false }).limit(LIMITE_LISTA),
  ];
  if (clienteIds.length > 0) {
    consultas.push(
      base().in('cliente_id', clienteIds).order('created_at', { ascending: false }).limit(LIMITE_LISTA),
    );
  }
  if (pessoaIds.length > 0) {
    consultas.push(
      base().in('vendedor_id', pessoaIds).order('created_at', { ascending: false }).limit(LIMITE_LISTA),
    );
  }
  if (vendaIdsDoProduto.length > 0) {
    consultas.push(
      base().in('id', vendaIdsDoProduto).order('created_at', { ascending: false }).limit(LIMITE_LISTA),
    );
  }

  const resultados = await Promise.all(consultas);
  const porId = new Map<string, VendaResumo>();
  for (const { data, error } of resultados) {
    if (error) throw error;
    for (const v of (data ?? []) as unknown as VendaResumo[]) porId.set(v.id, v);
  }
  return [...porId.values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, LIMITE_LISTA);
}

/**
 * O que a linha da lista precisa dizer ANTES de a pessoa clicar.
 *
 * Pedido do Felipe em 02/09, olhando a tela: *"falta muita informação. Só tem
 * a OV, não sei qual é o produto, não sei qual é o valor. Eu tenho que clicar
 * para saber"*. A lista tinha número, data e cliente — e três vendas do mesmo
 * cliente no mesmo dia ficam idênticas, então achar a certa era clicar em cada
 * uma e voltar.
 *
 * O aviso de devolução vale ainda mais: na tela dele, a OV0006 estava toda
 * devolvida, e isso só aparecia DEPOIS de entrar ("nada disponível pra
 * devolver"). Agora aparece na linha.
 */
interface LinhaDaLista {
  venda: VendaResumo;
  /** "Carregador + 2 itens", para reconhecer a venda de relance. */
  produtos: string;
  /** null = nada devolvido; 'parte' e 'tudo' viram selo na linha. */
  devolucao: 'parte' | 'tudo' | null;
  /**
   * Tudo que a busca na tela compara: TODOS os produtos da venda e os IMEIs.
   * O texto `produtos` mostra só o primeiro ("Carregador + 2 itens"), e a
   * busca comparava só ele — procurar o segundo produto da venda não achava.
   */
  textoDeBusca: string;
}

function montarLinha(venda: VendaResumo): LinhaDaLista {
  const itens = venda.itens_venda ?? [];
  const nomes = itens.map((i) => i.produtos?.nome).filter(Boolean) as string[];
  const primeiro = nomes[0] ?? '—';
  const resto = nomes.length - 1;
  const produtos = resto > 0 ? `${primeiro} + ${resto} ${resto === 1 ? 'item' : 'itens'}` : primeiro;
  const imeis = itens.map((i) => i.produtos?.imei_serial).filter(Boolean) as string[];
  const textoDeBusca = [
    venda.numero_venda ?? '',
    venda.clientes?.nome ?? '',
    venda.vendedor?.nome ?? '',
    ...nomes,
    ...imeis,
  ]
    .join(' ')
    .toLowerCase();

  // Compara em PEÇAS, não em número de linhas: devolver 1 de 3 unidades do
  // mesmo produto é devolução parcial, e contar linhas diria "tudo devolvido".
  const vendido = itens.reduce((soma, i) => soma + Number(i.quantidade ?? 0), 0);
  const devolvido = (venda.devolucoes ?? []).reduce(
    (soma, d) => soma + (d.devolucao_itens ?? []).reduce((s, i) => s + Number(i.quantidade ?? 0), 0),
    0,
  );

  return {
    venda,
    produtos,
    devolucao: devolvido <= 0 ? null : devolvido >= vendido && vendido > 0 ? 'tudo' : 'parte',
    textoDeBusca,
  };
}

interface ItemVendaOriginal {
  id: string;
  produto_id: string;
  /** Quanto AINDA dá para devolver (vendido − já devolvido antes). */
  quantidade: number;
  /** Quanto a venda teve deste item, sem descontar devolução nenhuma. */
  quantidadeVendida: number;
  /** Quanto já voltou em devoluções anteriores. */
  jaDevolvida: number;
  /** Preço de tabela gravado no item (sem o desconto da venda). */
  preco_unitario: number;
  /** Centavos que esta linha recebeu de verdade, com o desconto rateado. */
  pagoCentavos: number;
  produtos: { nome: string } | null;
}

interface ProdutoOpcao {
  id: string;
  nome: string;
  preco: number;
  estoque_atual: number;
}

interface FormaPagamentoOpcao {
  id: string;
  descricao: string;
  forma_enum: 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'crediario' | 'vale_troca';
}

interface ItemNovo {
  produto: ProdutoOpcao;
  quantidade: number;
}

export default function TrocaDevolucao() {
  const { toast } = useToast();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [parametros] = useSearchParams();
  const podeRegistrar = can(PERMISSIONS.SALES_CANCEL);
  /**
   * Ver a ficha completa é outra permissão, não a de devolver.
   *
   * A ficha mostra o comercial inteiro da venda — CPF e telefone do cliente,
   * o que foi pago e como, quanto de desconto. Quem só devolve produto no
   * balcão não precisa disso, e a regra já vale no Relatório de Vendas desde
   * a revisão de 28/08 (era por lá que o Gerente Técnico via dado comercial
   * sem ter `sales.view`). Mesma trava, mesmo motivo.
   */
  const podeVerFicha = can(PERMISSIONS.SALES_VIEW);
  const [fichaAberta, setFichaAberta] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaResumo | null>(null);
  const [quantidadesDevolvidas, setQuantidadesDevolvidas] = useState<Record<string, string>>({});
  const [itensNovos, setItensNovos] = useState<ItemNovo[]>([]);
  const [buscaProdutoNovo, setBuscaProdutoNovo] = useState('');
  const [formaAcertoId, setFormaAcertoId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  /**
   * De onde veio a venda NOVA de uma troca. Herda a da venda original; se ela
   * não tinha, começa no item marcado como padrão (Balcão), igual ao PDV.
   *
   * A troca grava uma venda de verdade, então passa pelas mesmas exigências
   * de Cadastros > Campos Obrigatórios que o PDV cobra (achado de 24/09: era
   * uma segunda porta de gravação de venda com meia regra).
   */
  const [origemVendaId, setOrigemVendaId] = useState('');
  const catalogoOrigemVenda = useCatalogo('origem_venda');
  const { exige: exigeNaVenda, exigencias: exigenciasDaVenda } = useCamposObrigatorios('venda');

  /**
   * O texto da busca vai ao banco com um pequeno atraso: sem isso, cada letra
   * digitada dispararia uma rodada de consultas. A lista na tela, porém,
   * filtra na hora pelo que já está carregado — quem digita vê a resposta
   * andando junto.
   */
  const [termoNoBanco, setTermoNoBanco] = useState('');
  useEffect(() => {
    const termo = limparTermo(busca);
    const espera = setTimeout(() => setTermoNoBanco(termo.length >= 2 ? termo : ''), 300);
    return () => clearTimeout(espera);
  }, [busca]);

  const { data: vendas, isLoading: carregandoVendas } = useQuery({
    queryKey: ['troca-devolucao-vendas', termoNoBanco],
    // Produto vem por `vw_produtos` (regra de custo protegido), com apelido
    // para o JSON manter a chave `produtos`. As devoluções anteriores vêm
    // junto para a linha poder avisar o que já voltou — ver `montarLinha`.
    queryFn: () => buscarVendas(termoNoBanco),
    // Enquanto a busca nova não volta, a lista anterior continua na tela (e
    // filtrada pelo que foi digitado), em vez de piscar "Carregando…".
    placeholderData: keepPreviousData,
  });

  /**
   * Chegou aqui pelo botão "Trocar ou devolver" da ficha da venda
   * (Histórico, Pagamentos, Relatório). A ficha manda o id no endereço, e a
   * tela já abre com a venda escolhida — sem precisar achá-la de novo na
   * lista, que é justamente onde uma venda antiga podia não estar.
   */
  const vendaDoEndereco = parametros.get('venda');
  const { data: vendaPedida } = useQuery({
    queryKey: ['troca-devolucao-venda', vendaDoEndereco],
    enabled: Boolean(vendaDoEndereco),
    queryFn: async (): Promise<VendaResumo | null> => {
      const { data, error } = await supabase
        .from('vendas')
        .select(SELECT_VENDA)
        .eq('id', vendaDoEndereco!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as VendaResumo | null) ?? null;
    },
  });
  const jaAbriuAVendaPedida = useRef(false);
  useEffect(() => {
    if (!vendaPedida || jaAbriuAVendaPedida.current) return;
    jaAbriuAVendaPedida.current = true;
    if (vendaPedida.status === 'cancelado') {
      toast({
        title: 'Esta venda foi cancelada',
        description: 'Venda cancelada não tem o que devolver: o estoque já voltou no cancelamento.',
        variant: 'destructive',
      });
      return;
    }
    selecionarVenda(vendaPedida);
    // `selecionarVenda` só mexe em estado desta tela; não precisa ser dependência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendaPedida]);

  // Itens da venda original + quanto já foi devolvido antes (pra não
  // deixar devolver mais do que foi vendido, mesmo em devoluções
  // parciais anteriores) + quanto cada linha recebeu de verdade, com o
  // desconto da venda rateado (ver `pagoPorLinha`).
  const { data: itensOriginais, isLoading: carregandoItens } = useQuery({
    queryKey: ['troca-devolucao-itens', vendaSelecionada?.id, vendaSelecionada?.total],
    queryFn: async (): Promise<ItemVendaOriginal[]> => {
      const [itensRes, devolvidosRes] = await Promise.all([
        supabase
          .from('itens_venda')
          .select('id, produto_id, quantidade, preco_unitario, total, produtos:vw_produtos(nome)')
          .eq('venda_id', vendaSelecionada!.id),
        supabase
          .from('devolucoes')
          .select('id, devolucao_itens(produto_id, quantidade)')
          .eq('venda_original_id', vendaSelecionada!.id),
      ]);
      if (itensRes.error) throw itensRes.error;
      if (devolvidosRes.error) throw devolvidosRes.error;

      const jaDevolvidoPorProduto = new Map<string, number>();
      for (const dev of (devolvidosRes.data ?? []) as unknown as Array<{
        devolucao_itens: Array<{ produto_id: string; quantidade: number }>;
      }>) {
        for (const item of dev.devolucao_itens ?? []) {
          jaDevolvidoPorProduto.set(
            item.produto_id,
            (jaDevolvidoPorProduto.get(item.produto_id) ?? 0) + item.quantidade
          );
        }
      }

      const itens = (itensRes.data ?? []) as unknown as Array<{
        id: string;
        produto_id: string;
        quantidade: number;
        preco_unitario: number;
        total: number | null;
        produtos: { nome: string } | null;
      }>;

      // O rateio usa TODOS os itens da venda, inclusive os que já voltaram
      // inteiros: o desconto foi dado sobre a venda toda, não sobre o que sobrou.
      const pago = pagoPorLinha(
        vendaSelecionada!.total,
        itens.map((i) => ({ id: i.id, total: i.total ?? Number(i.preco_unitario) * i.quantidade })),
      );

      return itens.map((item) => {
        const jaDevolvida = Math.min(item.quantidade, jaDevolvidoPorProduto.get(item.produto_id) ?? 0);
        return {
          id: item.id,
          produto_id: item.produto_id,
          produtos: item.produtos,
          preco_unitario: Number(item.preco_unitario),
          quantidadeVendida: item.quantidade,
          jaDevolvida,
          // Desconta o que já voltou antes — não é do banco, é calculado aqui
          // pra limitar o campo de quantidade na tela.
          quantidade: item.quantidade - jaDevolvida,
          pagoCentavos: pago.get(item.id) ?? 0,
        };
      });
    },
    enabled: !!vendaSelecionada,
  });

  const { data: produtos } = useQuery({
    queryKey: ['troca-devolucao-produtos'],
    queryFn: async (): Promise<ProdutoOpcao[]> => {
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('id, nome, preco, estoque_atual')
        .eq('ativo', true)
        .gt('estoque_atual', 0)
        .order('nome');
      if (error) throw error;
      return (data ?? []) as ProdutoOpcao[];
    },
    enabled: !!vendaSelecionada,
  });

  const { data: formasPagamento } = useQuery({
    queryKey: ['troca-devolucao-formas-pagamento'],
    queryFn: async (): Promise<FormaPagamentoOpcao[]> => {
      const { data, error } = await supabase
        .from('formas_pagamento')
        .select('id, descricao, forma_enum')
        .eq('ativo', true)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FormaPagamentoOpcao[];
    },
    enabled: !!vendaSelecionada,
  });

  const buscaLower = busca.trim().toLowerCase();
  // Procurar pelo PRODUTO é o caminho natural de quem está com o cliente na
  // frente e o aparelho na mão — ele lembra do que comprou, não do número da
  // venda. Vendedor entra junto porque agora está na tela: campo que se lê e
  // não se busca vira pergunta ("e como eu acho as vendas da Ana?").
  //
  // A busca de verdade vai ao banco (`buscarVendas`); este filtro refina o que
  // voltou pelas mesmas regras, e responde na hora enquanto a consulta anda.
  const linhas = (vendas ?? []).map(montarLinha);
  const linhasFiltradas = linhas.filter(({ textoDeBusca }) =>
    !buscaLower ? true : textoDeBusca.includes(buscaLower),
  );
  // Bateu no teto sem ninguém procurar nada: há vendas mais antigas fora da
  // lista. A tela precisa dizer isso — e dizer como achá-las.
  const listaCortada = !termoNoBanco && (vendas ?? []).length >= LIMITE_LISTA;

  const selecionarVenda = (venda: VendaResumo) => {
    setVendaSelecionada(venda);
    setQuantidadesDevolvidas({});
    setItensNovos([]);
    setFormaAcertoId('');
    setMotivo('');
    const padrao = catalogoOrigemVenda.data?.find((i) => i.padrao);
    setOrigemVendaId(venda.origem_venda_id ?? padrao?.id ?? '');
  };

  /** Quantas unidades deste item o vendedor marcou para voltar. */
  const quantidadeMarcada = (item: ItemVendaOriginal) =>
    Math.min(item.quantidade, Math.max(0, parseInt(quantidadesDevolvidas[item.id] ?? '0', 10) || 0));

  /** Centavos a devolver por este item, com o desconto da venda já rateado. */
  const devolverDoItem = (item: ItemVendaOriginal) =>
    valorDaDevolucao({
      pagoDaLinha: item.pagoCentavos,
      vendida: item.quantidadeVendida,
      jaDevolvida: item.jaDevolvida,
      agora: quantidadeMarcada(item),
    });

  // Tudo em centavos inteiros — ver lib/dinheiro.ts. Com número quebrado, uma
  // troca "sem diferença" podia sobrar R$ 0,00000000001 e obrigar a escolher
  // forma de pagamento para acertar nada.
  const devolvidoCentavos = (itensOriginais ?? []).reduce((acc, item) => acc + devolverDoItem(item), 0);
  const novosItensCentavos = itensNovos.reduce(
    (acc, item) => acc + emCentavos(item.produto.preco) * item.quantidade,
    0
  );
  // Positivo = devolve pro cliente. Negativo = cliente paga a diferença.
  const diferencaCentavos = devolvidoCentavos - novosItensCentavos;

  // Em reais só para mostrar e gravar.
  const valorDevolvido = emReais(devolvidoCentavos);
  const valorNovosItens = emReais(novosItensCentavos);
  const diferenca = emReais(diferencaCentavos);
  const temDevolucaoOuTroca = (itensOriginais ?? []).some(
    (item) => (parseInt(quantidadesDevolvidas[item.id] ?? '0', 10) || 0) > 0
  );

  const produtosNovosFiltrados = (produtos ?? []).filter((p) =>
    p.nome.toLowerCase().includes(buscaProdutoNovo.toLowerCase())
  );

  const adicionarItemNovo = (produto: ProdutoOpcao) => {
    const existente = itensNovos.find((i) => i.produto.id === produto.id);
    if (existente) {
      if (existente.quantidade >= produto.estoque_atual) {
        toast({ title: 'Estoque insuficiente', variant: 'destructive' });
        return;
      }
      setItensNovos(
        itensNovos.map((i) =>
          i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
        )
      );
    } else {
      setItensNovos([...itensNovos, { produto, quantidade: 1 }]);
    }
  };

  const removerItemNovo = (produtoId: string) => {
    setItensNovos(itensNovos.filter((i) => i.produto.id !== produtoId));
  };

  const confirmar = async () => {
    if (!vendaSelecionada || !user?.profile?.tenant_id) return;

    if (!temDevolucaoOuTroca) {
      toast({ title: 'Marque ao menos um item pra devolver', variant: 'destructive' });
      return;
    }

    if (diferencaCentavos !== 0 && !formaAcertoId) {
      toast({
        title: 'Escolha a forma de pagamento',
        description: diferencaCentavos > 0 ? 'Como o dinheiro será devolvido ao cliente.' : 'Como o cliente vai pagar a diferença.',
        variant: 'destructive',
      });
      return;
    }

    // A troca grava uma VENDA nova — então cobra o mesmo que o PDV cobra.
    // Devolução pura não grava venda nenhuma e não passa por aqui.
    if (itensNovos.length > 0) {
      const falta = faltandoParaFecharVenda(
        { cliente_id: vendaSelecionada.clientes?.id ?? '', origem_venda_id: origemVendaId },
        exigenciasDaVenda,
      );
      if (falta.length > 0) {
        const primeiro = falta[0];
        toast({
          title: primeiro.titulo,
          // O "como resolver" da regra fala do botão do PDV, que não existe
          // aqui. O cliente da troca é o da venda original e não se troca.
          description:
            primeiro.campo === 'cliente_id'
              ? 'Esta loja exige cliente na venda, e a venda original foi feita sem cliente. ' +
                'Registre aqui só a devolução e lance o produto novo pelo PDV, com o cliente.'
              : 'Escolha a origem da venda no passo 4, logo acima do motivo.',
          variant: 'destructive',
        });
        return;
      }
    }

    const tenantId = user.profile.tenant_id;
    setSalvando(true);

    let vendaNovaId: string | null = null;

    try {
      // 1) Se teve troca (itens novos), cria uma venda de verdade primeiro
      // — reaproveita a baixa de estoque que já existe pra venda normal.
      if (itensNovos.length > 0) {
        const { data: vendaNova, error: vendaNovaError } = await supabase
          .from('vendas')
          .insert({
            tenant_id: tenantId,
            cliente_id: vendaSelecionada.clientes?.id ?? null,
            vendedor_id: user.id,
            status: 'pago',
            subtotal: valorNovosItens,
            descontos: 0,
            total: valorNovosItens,
            // Preço cheio em `total` (contagem de vendas por produto), mas
            // só a diferença cobrada do cliente conta como faturamento
            // novo de verdade — ver comentário no topo do arquivo.
            valor_faturamento_real: diferencaCentavos < 0 ? emReais(-diferencaCentavos) : 0,
            origem_venda_id: origemVendaId || null,
            observacoes: `Produto(s) novo(s) de troca — devolução da venda ${vendaSelecionada.numero_venda ?? vendaSelecionada.id}.`,
          })
          .select()
          .single();
        if (vendaNovaError) throw vendaNovaError;
        vendaNovaId = vendaNova.id;

        try {
          const { error: itensError } = await supabase.from('itens_venda').insert(
            itensNovos.map((i) => ({
              venda_id: vendaNovaId,
              produto_id: i.produto.id,
              quantidade: i.quantidade,
              preco_unitario: emReais(emCentavos(i.produto.preco)),
              total: emReais(emCentavos(i.produto.preco) * i.quantidade),
            }))
          );
          if (itensError) throw itensError;

          // Cliente paga a diferença: registra como pagamento da venda nova.
          if (diferencaCentavos < 0) {
            const forma = (formasPagamento ?? []).find((f) => f.id === formaAcertoId);
            const { error: pagamentoError } = await supabase.from('pagamentos_venda').insert({
              venda_id: vendaNovaId,
              forma: forma?.forma_enum ?? 'dinheiro',
              forma_pagamento_id: formaAcertoId,
              parcelas: 1,
              valor: emReais(-diferencaCentavos),
            });
            if (pagamentoError) throw pagamentoError;
          }
        } catch (innerError) {
          // Mesma cautela do PDV: se itens/pagamento da venda nova
          // falharem, não deixa ela "pago" sem nada dentro — cancela (o
          // que também estorna o estoque que já tinha sido descontado,
          // via o gatilho de cancelamento que já existe).
          await supabase
            .from('vendas')
            .update({ status: 'cancelado', observacoes: 'Cancelada automaticamente: falha ao registrar troca.' })
            .eq('id', vendaNovaId);
          throw innerError;
        }
      }

      // 2) e 3) Registra a devolução em si e os itens devolvidos, num bloco
      // próprio: se qualquer um dos dois falhar DEPOIS que a venda nova (1)
      // já tinha sido criada com sucesso (itens + pagamento gravados), essa
      // venda nova não pode ficar "pago" órfã, sem devolução nenhuma
      // atrelada — senão o usuário tenta de novo e gera uma segunda venda
      // nova (cobrando/baixando estoque em dobro). Cancelar aqui é seguro:
      // o gatilho de cancelamento de venda mexe só no estoque dos itens
      // DESSA venda nova, é totalmente separado do gatilho de devolução.
      try {
        const { data: devolucao, error: devolucaoError } = await supabase
          .from('devolucoes')
          .insert({
            tenant_id: tenantId,
            venda_original_id: vendaSelecionada.id,
            venda_nova_id: vendaNovaId,
            valor_devolvido_cliente: diferencaCentavos > 0 ? diferenca : 0,
            valor_cliente_pagou_a_mais: diferencaCentavos < 0 ? emReais(-diferencaCentavos) : 0,
            forma_pagamento_id: diferencaCentavos !== 0 ? formaAcertoId : null,
            motivo: motivo.trim() || null,
            usuario_id: user.id,
          })
          .select()
          .single();
        if (devolucaoError) throw devolucaoError;

        // Itens devolvidos — dispara o estorno de estoque automático.
        //
        // O preço gravado é o que o cliente PAGOU por unidade, com o desconto
        // da venda rateado, e não o de tabela. Os painéis de Inteligência tiram
        // da receita `quantidade × preco_unitario` desta tabela
        // (`devolvidosPorProdutoNoPeriodo`): com o preço de tabela, devolver
        // um item vendido com desconto tirava da receita mais do que entrou.
        const itensParaDevolver = (itensOriginais ?? [])
          .map((item) => {
            const quantidade = quantidadeMarcada(item);
            return {
              produto_id: item.produto_id,
              quantidade,
              preco_unitario:
                quantidade > 0 ? emReais(Math.round(devolverDoItem(item) / quantidade)) : 0,
            };
          })
          .filter((item) => item.quantidade > 0);

        const { error: itensDevolucaoError } = await supabase.from('devolucao_itens').insert(
          itensParaDevolver.map((item) => ({ ...item, devolucao_id: devolucao.id }))
        );
        if (itensDevolucaoError) {
          // Devolução sem item nenhum não faz sentido — desfaz o registro
          // (não tem efeito colateral próprio, só a numeração gerada).
          await supabase.from('devolucoes').delete().eq('id', devolucao.id);
          throw itensDevolucaoError;
        }

        // O produto que voltou entra DIRETO no estoque de venda (gatilho
        // `estornar_estoque_devolucao`) — inclusive o que voltou com defeito.
        // Um seminovo com IMEI, que é uma linha única, reaparece no PDV pronto
        // para ser vendido a outro cliente. Separar "volta para venda" de "vai
        // para revisão" é decisão do Felipe (achado de 24/09); até lá, a tela
        // lembra de conferir e leva direto ao produto.
        const primeiroDevolvido = itensParaDevolver[0]?.produto_id;
        toast({
          title: 'Devolução registrada!',
          description: `${devolucao.numero_devolucao} — ${
            diferencaCentavos > 0
              ? `devolver ${moeda(diferenca)} ao cliente.`
              : diferencaCentavos < 0
                ? `cliente pagou ${moeda(emReais(-diferencaCentavos))} a mais.`
                : 'troca sem diferença a acertar.'
          } O produto voltou para o estoque de venda: se veio com defeito, tire da venda no Estoque.`,
          variant: 'success',
          action: primeiroDevolvido ? (
            <ToastAction
              altText="Abrir no estoque o produto que voltou"
              onClick={() => navigate(`/estoque/${primeiroDevolvido}`)}
            >
              Ver no estoque
            </ToastAction>
          ) : undefined,
        });

        queryClient.invalidateQueries({ queryKey: ['troca-devolucao-vendas'] });
        setVendaSelecionada(null);
        setBusca('');
      } catch (devolucaoStepError) {
        if (vendaNovaId) {
          await supabase
            .from('vendas')
            .update({ status: 'cancelado', observacoes: 'Cancelada automaticamente: falha ao registrar devolução.' })
            .eq('id', vendaNovaId);
        }
        throw devolucaoStepError;
      }
    } catch (error) {
      toast({
        title: 'Erro ao registrar devolução',
        // mensagemDoErro: o erro do banco chega como objeto comum, não como
        // `Error` — sem isso o motivo em português dos gatilhos sumia.
        description: mensagemDoErro(error),
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  // Mais largo desde 02/09 (era `max-w-4xl`): a lista de vendas passou a
  // mostrar produto, vendedor e valor, e na largura antiga as colunas se
  // espremiam a ponto de o nome do produto virar reticências — que era
  // justamente o que faltava ler.
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        titulo="Troca e Devolução"
        hint="Devolve produto de uma venda já fechada — sozinho (devolução) ou trocando por outro produto (troca). O acerto é sempre em dinheiro de verdade, a loja não trabalha com crédito de loja nem crediário."
      />

      {!podeRegistrar && (
        <Vazio
          titulo="Sem permissão"
          descricao="Seu perfil de acesso não permite registrar troca ou devolução."
        />
      )}

      {podeRegistrar && !vendaSelecionada && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Encontre a venda original</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, cliente, produto, IMEI ou vendedor…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            {listaCortada && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm text-amber-800">
                Aqui estão as <strong>{LIMITE_LISTA} vendas mais recentes</strong>. Venda mais
                antiga? Digite o número, o cliente, o produto, o IMEI ou o vendedor — a busca
                procura em todas as vendas da loja.
              </p>
            )}
            {carregandoVendas ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : linhasFiltradas.length === 0 ? (
              <Vazio titulo="Nenhuma venda encontrada" />
            ) : (
              <div className="max-h-[28rem] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Venda</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="hidden lg:table-cell">Vendedor</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-10 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasFiltradas.slice(0, LINHAS_NA_TABELA).map(({ venda: v, produtos, devolucao }) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* O número abre a FICHA; o botão à direita começa
                                a devolução. Antes a linha inteira era um clique
                                só, que devolvia — e o Felipe pediu em 02/09
                                justamente o contrário: *"quando clicar na
                                OV0003, abrir todas as informações que a gente
                                consegue consultar, inclusive os históricos de
                                movimentações"*. Duas ações no mesmo lugar
                                viravam adivinhação; agora cada uma tem o seu, e
                                o que o clique faz está escrito nele. */}
                            {podeVerFicha ? (
                              <button
                                type="button"
                                className="font-medium text-primary underline-offset-4 hover:underline"
                                onClick={() => setFichaAberta(v.id)}
                              >
                                {v.numero_venda ?? '—'}
                              </button>
                            ) : (
                              (v.numero_venda ?? '—')
                            )}
                            {/* O aviso na LINHA, não depois de entrar: a venda
                                toda devolvida não tem o que devolver de novo, e
                                descobrir isso só lá dentro custa dois cliques
                                e a dúvida de "cliquei na errada?". */}
                            {devolucao === 'tudo' && (
                              <Badge variant="outline" className="font-normal">
                                Já devolvida
                              </Badge>
                            )}
                            {devolucao === 'parte' && (
                              <Badge variant="outline" className="font-normal">
                                Devolvida em parte
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{dataHora(v.created_at)}</TableCell>
                        <TableCell>{v.clientes?.nome ?? 'Consumidor final'}</TableCell>
                        <TableCell className="max-w-[16rem] truncate" title={produtos}>
                          {produtos}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {v.vendedor?.nome ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium">
                          {moeda(Number(v.total ?? 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="whitespace-nowrap"
                            onClick={() => selecionarVenda(v)}
                          >
                            <ArrowLeftRight className="mr-2 h-4 w-4" />
                            Devolver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {linhasFiltradas.length > LINHAS_NA_TABELA && (
                  <p className="border-t p-2.5 text-center text-xs text-muted-foreground">
                    Mostrando {LINHAS_NA_TABELA} de {linhasFiltradas.length} vendas. Digite na busca
                    para achar a que você procura.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {podeRegistrar && vendaSelecionada && (
        <>
          {/* Voltar fica à ESQUERDA, com seta, e diz para onde volta.
              Pedido do Felipe em 02/09: *"quando eu clico numa devolução, não
              consigo voltar para trás"*. O botão existia — dizia "Trocar de
              venda", no canto direito, e ninguém o leu como o caminho de
              volta. Nome de botão é instrução, não descrição do código. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setVendaSelecionada(null)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para a lista de vendas
              </Button>
              {/* Consultar a venda no meio da devolução, sem desfazer o que já
                  foi preenchido: a ficha abre por cima e fecha no lugar. É a
                  pergunta que aparece com o cliente na frente — "isso foi pago
                  como?", "quem vendeu?", "já teve devolução?". */}
              {podeVerFicha && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFichaAberta(vendaSelecionada.id)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Ver ficha completa
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Venda <span className="font-medium text-foreground">{vendaSelecionada.numero_venda}</span>
              {' — '}
              {vendaSelecionada.clientes?.nome ?? 'Consumidor final'}
              {vendaSelecionada.vendedor?.nome ? ` — vendeu ${vendaSelecionada.vendedor.nome}` : ''}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. O que está voltando?</CardTitle>
            </CardHeader>
            <CardContent>
              {carregandoItens ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
              ) : (itensOriginais ?? []).every((i) => i.quantidade <= 0) ? (
                <Vazio
                  titulo="Nada disponível pra devolver"
                  descricao="Todos os itens desta venda já foram devolvidos antes."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Vendido</TableHead>
                      <TableHead className="text-right">Pago por unidade</TableHead>
                      <TableHead className="text-right w-32">Devolver</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(itensOriginais ?? [])
                      .filter((item) => item.quantidade > 0)
                      .map((item) => {
                        // O que o cliente pagou por unidade, com o desconto da
                        // venda já rateado — é isso que ele tem de volta.
                        const pagoPorUnidade = emReais(
                          Math.round(item.pagoCentavos / Math.max(1, item.quantidadeVendida)),
                        );
                        const teveDesconto =
                          emCentavos(pagoPorUnidade) !== emCentavos(item.preco_unitario);
                        return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.produtos?.nome ?? '—'}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.quantidade}</TableCell>
                          <TableCell className="text-right">
                            {moeda(pagoPorUnidade)}
                            {/* Sem esta linha, o vendedor vê um valor menor que
                                o preço da etiqueta e acha que o sistema errou. */}
                            {teveDesconto && (
                              <span className="block text-xs text-muted-foreground">
                                tabela {moeda(item.preco_unitario)} — a venda teve desconto
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={item.quantidade}
                              value={quantidadesDevolvidas[item.id] ?? ''}
                              placeholder="0"
                              onChange={(e) =>
                                setQuantidadesDevolvidas({ ...quantidadesDevolvidas, [item.id]: e.target.value })
                              }
                              className="w-20 ml-auto text-right"
                            />
                          </TableCell>
                        </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                3. Vai levar produto novo no lugar? <span className="font-normal text-muted-foreground">(opcional — só em troca)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto…"
                  value={buscaProdutoNovo}
                  onChange={(e) => setBuscaProdutoNovo(e.target.value)}
                  className="pl-9"
                />
              </div>
              {buscaProdutoNovo && (
                <div className="max-h-48 overflow-auto rounded-lg border">
                  {produtosNovosFiltrados.slice(0, 20).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        adicionarItemNovo(p);
                        setBuscaProdutoNovo('');
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted"
                    >
                      <span className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        {p.nome}
                      </span>
                      <span className="text-muted-foreground">{moeda(p.preco)}</span>
                    </button>
                  ))}
                  {produtosNovosFiltrados.length === 0 && (
                    <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                  )}
                </div>
              )}
              {itensNovos.length > 0 && (
                <div className="space-y-2">
                  {itensNovos.map((item) => (
                    <div key={item.produto.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-sm font-medium">{item.produto.nome}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() =>
                            setItensNovos(
                              itensNovos
                                .map((i) => (i.produto.id === item.produto.id ? { ...i, quantidade: i.quantidade - 1 } : i))
                                .filter((i) => i.quantidade > 0)
                            )
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{item.quantidade}</span>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => adicionarItemNovo(item.produto)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="w-20 text-right text-sm font-medium">
                        {moeda(item.produto.preco * item.quantidade)}
                      </span>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => removerItemNovo(item.produto.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Acerto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor devolvido (itens que voltam)</span>
                  <span>{moeda(valorDevolvido)}</span>
                </div>
                {itensNovos.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor dos itens novos</span>
                    <span>-{moeda(valorNovosItens)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>
                    {diferenca > 0 ? 'Devolver ao cliente' : diferenca < 0 ? 'Cliente paga a mais' : 'Diferença'}
                  </span>
                  <span className={diferenca > 0 ? 'text-emerald-600' : diferenca < 0 ? 'text-destructive' : ''}>
                    {moeda(Math.abs(diferenca))}
                  </span>
                </div>
              </div>

              {/* Só na troca: é ela que grava uma venda nova. Nasce com a
                  origem da venda original — o cliente que comprou pelo
                  Instagram e volta para trocar continua sendo do Instagram. */}
              {itensNovos.length > 0 && (
                <CampoCatalogo
                  tipo="origem_venda"
                  label="Origem da venda nova"
                  obrigatorio={exigeNaVenda('origem_venda_id')}
                  valor={origemVendaId}
                  onChange={setOrigemVendaId}
                  placeholder="Balcão"
                  permiteCriar={false}
                />
              )}

              {diferencaCentavos !== 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Forma de pagamento {diferenca > 0 ? '(da devolução)' : '(que o cliente vai pagar)'}
                  </label>
                  <Select value={formaAcertoId} onValueChange={setFormaAcertoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a forma" />
                    </SelectTrigger>
                    <SelectContent>
                      {(formasPagamento ?? []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Motivo (opcional)</label>
                <Textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: produto com defeito, cliente não gostou, tamanho errado..."
                  rows={2}
                />
              </div>

              <Button className="w-full" size="lg" disabled={salvando || !temDevolucaoOuTroca} onClick={confirmar}>
                {salvando ? 'Registrando…' : 'Confirmar devolução'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* A mesma ficha do Histórico de Vendas, do Relatório e de Pagamentos —
          ela recebe só o id e busca o resto sozinha, então ligar mais uma tela
          custa esta linha. Traz cliente com contato, itens com número de série,
          pagamentos, aparelho recebido em troca e a linha do tempo com cada
          movimentação e quem fez. Ver components/vendas/FichaDaVenda. */}
      <FichaDaVenda vendaId={fichaAberta} aoFechar={() => setFichaAberta(null)} />
    </div>
  );
}
