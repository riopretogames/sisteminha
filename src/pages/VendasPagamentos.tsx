import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { useState } from 'react';
import { RelatorioShell, usePeriodo, type Coluna } from './relatorios/RelatorioShell';
import { FichaDaVenda } from '@/components/vendas/FichaDaVenda';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import { emCentavos, emReais } from '@/lib/dinheiro';
import { acertoDaVenda } from '@/lib/valoresDaVenda';
import { intervaloDoDia } from '@/lib/filtrosVenda';

/**
 * Vendas > Pagamentos — conferência de caixa por FORMA de pagamento, não por
 * venda. Uma venda pode ter sido paga parte em dinheiro, parte no cartão; quem
 * bate o caixa com a maquininha/PIX precisa ver linha de PAGAMENTO, não linha
 * de venda. Por isso a consulta traz `vendas` com `pagamentos_venda` aninhado
 * e o client "achata" isso: uma linha por pagamento recebido.
 *
 * Filtro de período é sempre pelo `created_at` da venda (tabela pai) — já
 * tivemos problema tentando filtrar por coluna aninhada de pagamentos_venda,
 * então a regra aqui é: período recorta vendas, e os pagamentos daquelas
 * vendas aparecem inteiros, sem recorte próprio.
 *
 * O que mudou em 24/09 (achado da revisão): a tela se apresenta como
 * conferência de caixa, mas somava o valor ENTREGUE pelo cliente. O PDV grava
 * R$ 100 quando o cliente paga R$ 80 com uma nota de cem; o troco só era
 * descontado no caixa. O card "Dinheiro na gaveta" mostrava R$ 20 a mais do
 * que a gaveta tinha, e o aparelho recebido na troca entrava no "Total
 * recebido" como se fosse dinheiro. Agora a tela mostra, em linhas próprias:
 *
 *   - o TROCO de cada venda, saindo da gaveta;
 *   - a DEVOLUÇÃO de dinheiro ao cliente feita no período, saindo pela forma
 *     em que foi devolvida;
 *   - o APARELHO recebido na troca, fora do dinheiro, num card só dele.
 *
 * Tela só de leitura (permissão `sales.view`); sem criar/editar/excluir aqui.
 */

type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;

interface VendaComPagamentos {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
  total: number | null;
  clientes: { nome: string } | null;
  pagamentos_venda: Array<{
    id: string;
    forma: FormaPagamento;
    forma_pagamento_id: string | null;
    parcelas: number | null;
    valor: number;
    gateway_id: string | null;
  }>;
}

interface DevolucaoDoPeriodo {
  id: string;
  numero_devolucao: string | null;
  created_at: string;
  valor_devolvido_cliente: number;
  forma_pagamento_id: string | null;
  venda_original_id: string;
  venda_original: { numero_venda: string | null; clientes: { nome: string } | null } | null;
}

/**
 * O que a linha é. `pagamento` é o que o cliente entregou; `troco` e
 * `devolucao` são dinheiro que SAIU (valor negativo); `aparelho` é o produto
 * usado aceito como parte do pagamento — entra na venda, mas não é dinheiro.
 */
type TipoLinha = 'pagamento' | 'troco' | 'devolucao' | 'aparelho';

interface LinhaPagamento {
  /** Chave única da linha (um pagamento, um troco ou uma devolução). */
  chave: string;
  tipo: TipoLinha;
  vendaId: string;
  numeroVenda: string | null;
  data: string;
  cliente: string;
  forma: FormaPagamento;
  // Achado na revisão de 18/08: "Detalhe por forma" só agrupava pela
  // categoria ampla do enum (7 valores), então "Cartão Crédito", "Cartão
  // Crédito - Taxa", "Link de Pagamento" e "Shopee" — 4 formas cadastradas
  // diferentes — apareciam somadas numa linha só ("Cartão Crédito"). Guarda
  // o id da forma cadastrada específica pra poder desagrupar por ela.
  formaPagamentoId: string | null;
  parcelas: number | null;
  /** Positivo = entrou; negativo = saiu (troco, devolução). */
  valor: number;
  /** O que a coluna "Forma" escreve para troco e devolução. */
  rotulo?: string;
  // Guardado para uma futura tela de conciliação com o gateway (bandeira,
  // NSU etc.); esta versão não exibe `gatewayId` em nenhuma coluna — corte
  // de escopo deliberado, não esquecimento.
  gatewayId: string | null;
}

function rotuloForma(linha: LinhaPagamento): string {
  if (linha.rotulo) return linha.rotulo;
  if (linha.tipo === 'aparelho') return 'Aparelho recebido na troca';
  const base = FORMAS_PAGAMENTO[linha.forma]?.label ?? linha.forma;
  return linha.parcelas && linha.parcelas > 1 ? `${base} (${linha.parcelas}x)` : base;
}

/** O aparelho da troca não é dinheiro: fica fora de todo total de dinheiro. */
const ehDinheiroDeVerdade = (l: LinhaPagamento) => l.tipo !== 'aparelho';

const COLUNAS: Coluna<LinhaPagamento>[] = [
  {
    chave: 'venda',
    titulo: 'Venda',
    render: (l) => <span className="font-medium">{l.numeroVenda ?? '—'}</span>,
    texto: (l) => l.numeroVenda ?? '',
  },
  {
    chave: 'data',
    titulo: 'Data',
    render: (l) => fmtData(l.data),
    texto: (l) => fmtData(l.data),
  },
  {
    chave: 'cliente',
    titulo: 'Cliente',
    render: (l) => l.cliente,
    texto: (l) => l.cliente,
  },
  {
    chave: 'forma',
    titulo: 'Forma',
    render: (l) => rotuloForma(l),
    texto: (l) => rotuloForma(l),
  },
  {
    chave: 'valor',
    titulo: 'Valor',
    alinhar: 'direita',
    render: (l) => (
      <span
        className={
          l.valor < 0
            ? 'font-medium text-red-600'
            : l.tipo === 'aparelho'
              ? 'font-medium text-muted-foreground'
              : 'font-medium'
        }
      >
        {moeda(l.valor)}
      </span>
    ),
    texto: (l) => l.valor.toFixed(2).replace('.', ','),
    // O rodapé soma só DINHEIRO: o aparelho da troca fica de fora, e troco e
    // devolução entram negativos. Assim o total do rodapé é o mesmo do card
    // "Total recebido".
    somar: (l) => (ehDinheiroDeVerdade(l) ? l.valor : 0),
    formatarTotal: moeda,
  },
];

interface FormaCadastro {
  id: string;
  descricao: string;
  forma_enum: FormaPagamento | null;
  entra_no_caixa: boolean | null;
}

export default function VendasPagamentos() {
  const [periodo, setPeriodo] = usePeriodo();
  // Cada linha é um PAGAMENTO, mas a ficha que abre é a da VENDA inteira
  // — numa venda paga em duas formas, as duas linhas levam à mesma ficha,
  // e é lá que dá para ver por que o valor da linha não é o total.
  const [vendaAberta, setVendaAberta] = useState<string | null>(null);

  // Nomes e tipos das formas cadastradas (Cadastros > Formas de Pagamento):
  // rotulam o "Detalhe por forma" pela forma específica usada, e dizem em que
  // forma cada devolução foi paga.
  const { data: formasCadastro } = useQuery({
    queryKey: ['formas-pagamento-cadastro'],
    queryFn: async (): Promise<FormaCadastro[]> => {
      const { data, error } = await supabase
        .from('formas_pagamento')
        .select('id, descricao, forma_enum, entra_no_caixa');
      if (error) throw error;
      return (data ?? []) as FormaCadastro[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['vendas-pagamentos', periodo.de, periodo.ate],
    queryFn: async (): Promise<{ vendas: VendaComPagamentos[]; devolucoes: DevolucaoDoPeriodo[] }> => {
      // O dia no horário da loja, com fim exclusivo — ver `intervaloDoDia`.
      // Até 24/09 o período ia sem fuso e o banco o lia como horário de
      // Londres: a venda das 21h36 caía no dia seguinte.
      const { inicio, fimExclusivo } = intervaloDoDia(periodo.de, periodo.ate);

      // Em páginas de mil: o Supabase corta calado no milésimo (lib/
      // buscarEmPaginas.ts), e um período longo somava só parte das vendas.
      const [vendas, devolucoes] = await Promise.all([
        buscarEmPaginas<VendaComPagamentos>(() => {
          let q = supabase
            .from('vendas')
            .select(
              'id, numero_venda, created_at, status, total, clientes(nome), pagamentos_venda(id, forma, forma_pagamento_id, parcelas, valor, gateway_id)',
            )
            .neq('status', 'cancelado');
          if (inicio) q = q.gte('created_at', inicio);
          if (fimExclusivo) q = q.lt('created_at', fimExclusivo);
          return q.order('created_at', { ascending: false }).order('id');
        }),
        // Devolução pesa no dia em que aconteceu, não no dia da venda — a
        // mesma régua do Caixa e dos painéis (lib/faturamento.ts).
        buscarEmPaginas<DevolucaoDoPeriodo>(() => {
          let q = supabase
            .from('devolucoes')
            .select(
              'id, numero_devolucao, created_at, valor_devolvido_cliente, forma_pagamento_id, venda_original_id, venda_original:vendas!devolucoes_venda_original_id_fkey(numero_venda, clientes(nome))',
            )
            .gt('valor_devolvido_cliente', 0);
          if (inicio) q = q.gte('created_at', inicio);
          if (fimExclusivo) q = q.lt('created_at', fimExclusivo);
          return q.order('created_at').order('id');
        }),
      ]);
      return { vendas, devolucoes };
    },
  });

  const formaPorId = new Map((formasCadastro ?? []).map((f) => [f.id, f]));
  const formaDinheiro = (formasCadastro ?? []).find(
    (f) => f.entra_no_caixa || f.forma_enum === 'dinheiro',
  );

  // Achata: uma linha por PAGAMENTO, não por venda. Uma venda paga parte
  // em PIX e parte no cartão vira duas linhas aqui.
  const linhas: LinhaPagamento[] = [];
  for (const venda of data?.vendas ?? []) {
    const cliente = venda.clientes?.nome ?? 'Consumidor final';
    for (const pagamento of venda.pagamentos_venda ?? []) {
      linhas.push({
        chave: pagamento.id,
        tipo: pagamento.forma === 'vale_troca' ? 'aparelho' : 'pagamento',
        vendaId: venda.id,
        numeroVenda: venda.numero_venda,
        data: venda.created_at,
        cliente,
        forma: pagamento.forma,
        formaPagamentoId: pagamento.forma_pagamento_id,
        parcelas: pagamento.parcelas,
        valor: Number(pagamento.valor),
        gatewayId: pagamento.gateway_id,
      });
    }

    // Troco: o que o cliente entregou além do total, e que voltou para ele
    // em dinheiro da gaveta. Mesma conta do gatilho do caixa.
    const { trocoCentavos } = acertoDaVenda({
      total: venda.total,
      pagamentos: venda.pagamentos_venda ?? [],
      veioDeTroca: false,
    });
    if (trocoCentavos > 0) {
      linhas.push({
        chave: `troco-${venda.id}`,
        tipo: 'troco',
        vendaId: venda.id,
        numeroVenda: venda.numero_venda,
        data: venda.created_at,
        cliente,
        forma: 'dinheiro',
        formaPagamentoId: formaDinheiro?.id ?? null,
        parcelas: 1,
        valor: -emReais(trocoCentavos),
        rotulo: 'Troco devolvido (dinheiro)',
        gatewayId: null,
      });
    }
  }

  for (const d of data?.devolucoes ?? []) {
    // Sem forma informada, a devolução foi em dinheiro — é como o caixa a
    // lança desde 17/08.
    const forma = d.forma_pagamento_id ? formaPorId.get(d.forma_pagamento_id) : undefined;
    const enumDaForma: FormaPagamento = forma?.forma_enum ?? 'dinheiro';
    const nomeDaForma = forma?.descricao ?? FORMAS_PAGAMENTO[enumDaForma]?.label ?? 'Dinheiro';
    linhas.push({
      chave: `devolucao-${d.id}`,
      tipo: 'devolucao',
      vendaId: d.venda_original_id,
      numeroVenda: d.venda_original?.numero_venda ?? null,
      data: d.created_at,
      cliente: d.venda_original?.clientes?.nome ?? 'Consumidor final',
      forma: enumDaForma,
      formaPagamentoId: d.forma_pagamento_id ?? formaDinheiro?.id ?? null,
      parcelas: 1,
      valor: -Number(d.valor_devolvido_cliente),
      rotulo: `Devolução ${d.numero_devolucao ?? ''} (${nomeDaForma})`,
      gatewayId: null,
    });
  }

  // Ordem por data, mais recente primeiro. As devoluções entram no meio, no
  // dia em que aconteceram.
  linhas.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));


  const nomeFormaCadastro = new Map((formasCadastro ?? []).map((f) => [f.id, f.descricao]));

  // Tudo somado em centavos inteiros (lib/dinheiro.ts): somar reais quebrados
  // deixa resíduo, e esta tela existe para bater com a gaveta no centavo.
  const somar = (filtro: (l: LinhaPagamento) => boolean) =>
    emReais(linhas.filter(filtro).reduce((s, l) => s + emCentavos(l.valor), 0));
  const daForma = (...formas: FormaPagamento[]) => (l: LinhaPagamento) =>
    ehDinheiroDeVerdade(l) && formas.includes(l.forma);

  // "Detalhe por forma" — pela forma CADASTRADA específica (Cartão Crédito,
  // Cartão Crédito - Taxa, Link de Pagamento, Shopee etc.), não pela
  // categoria ampla do enum. Pagamento sem `formaPagamentoId` (de antes da
  // migration que ligou pagamentos_venda ao cadastro) cai agrupado pelo enum
  // mesmo, como fallback. Troco e devolução entram negativos na forma deles;
  // o aparelho da troca não entra (não é dinheiro — tem card próprio).
  const totaisPorFormaCadastro = new Map<string, { rotulo: string; centavos: number }>();
  for (const linha of linhas.filter(ehDinheiroDeVerdade)) {
    const chave = linha.formaPagamentoId ?? `enum:${linha.forma}`;
    const rotulo = linha.formaPagamentoId
      ? (nomeFormaCadastro.get(linha.formaPagamentoId) ?? FORMAS_PAGAMENTO[linha.forma]?.label ?? linha.forma)
      : (FORMAS_PAGAMENTO[linha.forma]?.label ?? linha.forma);
    const atual = totaisPorFormaCadastro.get(chave);
    totaisPorFormaCadastro.set(chave, {
      rotulo,
      centavos: (atual?.centavos ?? 0) + emCentavos(linha.valor),
    });
  }
  const detalheFormaCadastro = [...totaisPorFormaCadastro.entries()].sort((a, b) =>
    a[1].rotulo.localeCompare(b[1].rotulo),
  );

  /**
   * Os números que a conferência de caixa realmente usa.
   *
   * A tela mostrava só o total por forma. Isso responde "quanto entrou em PIX",
   * mas quem fecha o caixa precisa de três montes separados, porque cada um
   * confere contra um lugar diferente:
   *
   *   dinheiro  → a gaveta, contada na mão
   *   cartões   → o extrato da maquininha
   *   PIX       → o extrato do banco
   *
   * Somar tudo num número só obriga a pessoa a refazer a conta no papel.
   */
  const total = somar(ehDinheiroDeVerdade);
  const emEspecie = somar(daForma('dinheiro'));
  const emCartao = somar(daForma('cartao_credito', 'cartao_debito'));
  const emPix = somar(daForma('pix'));
  // Boleto e crediário não entram em nenhum dos três montes: não caem na
  // gaveta hoje nem aparecem no extrato do dia.
  const aPrazo = somar(daForma('boleto', 'crediario'));
  const recebidoEmAparelho = somar((l) => l.tipo === 'aparelho');
  const trocoDado = -somar((l) => l.tipo === 'troco');
  const devolvido = -somar((l) => l.tipo === 'devolucao');

  const vendasDistintas = new Set(
    linhas.filter((l) => l.tipo !== 'devolucao').map((l) => l.vendaId),
  ).size;
  // O ticket é por venda: devolução (que é de outra venda, talvez de outro
  // mês) não entra nele.
  const recebidoDasVendas = somar((l) => l.tipo === 'pagamento' || l.tipo === 'troco');
  const parcelados = linhas.filter((l) => l.tipo === 'pagamento' && (l.parcelas ?? 1) > 1);
  const valorParcelado = emReais(parcelados.reduce((soma, l) => soma + emCentavos(l.valor), 0));

  // Média por dia usa os dias do PERÍODO escolhido, não os dias com venda:
  // dividir só pelos dias que venderam esconde justamente os dias parados.
  const diasNoPeriodo = Math.max(
    1,
    Math.round(
      (new Date(periodo.ate).getTime() - new Date(periodo.de).getTime()) / 86_400_000
    ) + 1
  );

  const pagamentosNoPeriodo = linhas.filter((l) => l.tipo === 'pagamento').length;

  return (
    <>
    <RelatorioShell
      titulo="Vendas — Pagamentos"
      hint="Conferência de caixa: cada pagamento recebido no período em uma linha (não cada venda), pra bater com a maquininha e o PIX. Troco e devolução aparecem em linhas próprias, saindo."
      arquivo="vendas_pagamentos"
      colunas={COLUNAS}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      vazio="Nenhum pagamento recebido neste período."
      rotuloTotal="Total em dinheiro (sem o aparelho da troca)"
      aoClicarLinha={(l) => setVendaAberta(l.vendaId)}
      indicadores={
        <>
          <Indicador
            rotulo="Total recebido"
            valor={moeda(total)}
            detalhe={`${pagamentosNoPeriodo} pagamento${pagamentosNoPeriodo === 1 ? '' : 's'} em ${vendasDistintas} venda${vendasDistintas === 1 ? '' : 's'} — já sem troco e sem devolução`}
            tom="positivo"
          />
          <Indicador
            rotulo="Dinheiro na gaveta"
            valor={moeda(emEspecie)}
            detalhe={
              trocoDado > 0 || devolvido > 0
                ? `Confere contando a gaveta — já tirado o troco${devolvido > 0 ? ' e a devolução em dinheiro' : ''}`
                : 'Confere contando a gaveta'
            }
            tom={emEspecie > 0 ? 'alerta' : 'neutro'}
          />
          <Indicador
            rotulo="Cartões"
            valor={moeda(emCartao)}
            detalhe="Confere com a maquininha"
          />
          <Indicador rotulo="PIX" valor={moeda(emPix)} detalhe="Confere com o extrato" />

          <Indicador
            rotulo="Ticket médio"
            valor={moeda(vendasDistintas ? recebidoDasVendas / vendasDistintas : 0)}
            detalhe="Por venda, não por pagamento"
          />
          <Indicador
            rotulo="Média por dia"
            valor={moeda(total / diasNoPeriodo)}
            detalhe={`${diasNoPeriodo} dia${diasNoPeriodo === 1 ? '' : 's'} no período`}
          />
          <Indicador
            rotulo="Parcelado"
            valor={moeda(valorParcelado)}
            detalhe={`${parcelados.length} pagamento${parcelados.length === 1 ? '' : 's'} em mais de 1x`}
          />
          {aPrazo !== 0 && (
            <Indicador
              rotulo="A prazo"
              valor={moeda(aPrazo)}
              detalhe="Boleto e crediário — não entra no caixa de hoje"
              tom="alerta"
            />
          )}
          {/* O aparelho usado aceito como parte do pagamento. Até 24/09 ele
              entrava no "Total recebido" e no card "A prazo", como se fosse
              dinheiro a receber — não é nem uma coisa nem outra. */}
          {recebidoEmAparelho > 0 && (
            <Indicador
              rotulo="Recebido em aparelho"
              valor={moeda(recebidoEmAparelho)}
              detalhe="Produto usado aceito na troca — não é dinheiro, fica fora dos totais"
            />
          )}
          {devolvido > 0 && (
            <Indicador
              rotulo="Devolvido a clientes"
              valor={moeda(devolvido)}
              detalhe="Troca e devolução feitas no período — já tirado dos totais"
              tom="negativo"
            />
          )}

          {/* Detalhe por forma CADASTRADA: é o que bate linha a linha com
              cada extrato específico (ex.: Shopee separado de Cartão
              Crédito normal, mesmo os dois sendo "cartão de crédito" no
              enum amplo). */}
          {detalheFormaCadastro.map(([chave, { rotulo, centavos }]) => (
            <Indicador key={chave} rotulo={rotulo} valor={moeda(emReais(centavos))} />
          ))}
        </>
      }
    />
    <FichaDaVenda vendaId={vendaAberta} aoFechar={() => setVendaAberta(null)} />
    </>
  );
}
