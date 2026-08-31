import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { useState } from 'react';
import { RelatorioShell, usePeriodo, type Coluna } from './relatorios/RelatorioShell';
import { FichaDaVenda } from '@/components/vendas/FichaDaVenda';

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
 * Tela só de leitura (permissão `sales.view`); sem criar/editar/excluir aqui.
 */

type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;

interface VendaComPagamentos {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
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

interface LinhaPagamento {
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
  valor: number;
  // Guardado para uma futura tela de conciliação com o gateway (bandeira,
  // NSU etc.); esta versão não exibe `gatewayId` em nenhuma coluna — corte
  // de escopo deliberado, não esquecimento.
  gatewayId: string | null;
}

function rotuloForma(linha: LinhaPagamento): string {
  const base = FORMAS_PAGAMENTO[linha.forma]?.label ?? linha.forma;
  return linha.parcelas && linha.parcelas > 1 ? `${base} (${linha.parcelas}x)` : base;
}

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
    render: (l) => <span className="font-medium">{moeda(l.valor)}</span>,
    texto: (l) => l.valor.toFixed(2).replace('.', ','),
    somar: (l) => l.valor,
    formatarTotal: moeda,
  },
];

export default function VendasPagamentos() {
  const [periodo, setPeriodo] = usePeriodo();
  // Cada linha é um PAGAMENTO, mas a ficha que abre é a da VENDA inteira
  // — numa venda paga em duas formas, as duas linhas levam à mesma ficha,
  // e é lá que dá para ver por que o valor da linha não é o total.
  const [vendaAberta, setVendaAberta] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vendas-pagamentos', periodo.de, periodo.ate],
    queryFn: async (): Promise<LinhaPagamento[]> => {
      const { data, error } = await supabase
        .from('vendas')
        .select(
          'id, numero_venda, created_at, status, clientes(nome), pagamentos_venda(id, forma, forma_pagamento_id, parcelas, valor, gateway_id)',
        )
        .gte('created_at', periodo.de)
        // O `ate` é uma data pura; sem o T23:59:59 o último dia ficaria de fora.
        .lte('created_at', `${periodo.ate}T23:59:59`)
        .neq('status', 'cancelado')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const vendas = (data ?? []) as unknown as VendaComPagamentos[];

      // Achata: uma linha por PAGAMENTO, não por venda. Uma venda paga parte
      // em PIX e parte no cartão vira duas linhas aqui.
      const linhas: LinhaPagamento[] = [];
      for (const venda of vendas) {
        for (const pagamento of venda.pagamentos_venda ?? []) {
          linhas.push({
            vendaId: venda.id,
            numeroVenda: venda.numero_venda,
            data: venda.created_at,
            cliente: venda.clientes?.nome ?? 'Consumidor final',
            forma: pagamento.forma,
            formaPagamentoId: pagamento.forma_pagamento_id,
            parcelas: pagamento.parcelas,
            valor: Number(pagamento.valor),
            gatewayId: pagamento.gateway_id,
          });
        }
      }

      // A consulta já ordena as vendas por created_at desc e o achatamento
      // preserva essa ordem, mas reordenamos aqui pra não depender da ordem
      // da query como contrato implícito.
      linhas.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

      return linhas;
    },
  });

  const linhas = data ?? [];

  // Nomes das formas cadastradas (Cadastros > Formas de Pagamento) — só pra
  // rotular o "Detalhe por forma" pela forma específica usada, não pela
  // categoria ampla do enum. Nulo quando o pagamento é de antes da migration
  // que ligou pagamentos_venda ao cadastro (07/08) — nesse caso cai no
  // fallback do rótulo do enum, mais abaixo.
  const { data: formasCadastro } = useQuery({
    queryKey: ['formas-pagamento-cadastro'],
    queryFn: async (): Promise<Array<{ id: string; descricao: string }>> => {
      const { data, error } = await supabase.from('formas_pagamento').select('id, descricao');
      if (error) throw error;
      return data ?? [];
    },
  });

  const nomeFormaCadastro = new Map((formasCadastro ?? []).map((f) => [f.id, f.descricao]));

  // Resumo por forma de pagamento — o que ajuda a bater com o extrato da
  // maquininha (por bandeira/tipo) e do PIX.
  const totaisPorForma = new Map<FormaPagamento, number>();
  for (const linha of linhas) {
    totaisPorForma.set(linha.forma, (totaisPorForma.get(linha.forma) ?? 0) + linha.valor);
  }

  const de = (forma: FormaPagamento) => totaisPorForma.get(forma) ?? 0;

  // "Detalhe por forma" — igual ao de cima, mas pela forma CADASTRADA
  // específica (Cartão Crédito, Cartão Crédito - Taxa, Link de Pagamento,
  // Shopee etc.), não pela categoria ampla do enum. Pagamento sem
  // `formaPagamentoId` (de antes da migration que ligou pagamentos_venda ao
  // cadastro) cai agrupado pelo enum mesmo, como fallback.
  const totaisPorFormaCadastro = new Map<string, { rotulo: string; total: number }>();
  for (const linha of linhas) {
    const chave = linha.formaPagamentoId ?? `enum:${linha.forma}`;
    const rotulo = linha.formaPagamentoId
      ? (nomeFormaCadastro.get(linha.formaPagamentoId) ?? FORMAS_PAGAMENTO[linha.forma]?.label ?? linha.forma)
      : (FORMAS_PAGAMENTO[linha.forma]?.label ?? linha.forma);
    const atual = totaisPorFormaCadastro.get(chave);
    totaisPorFormaCadastro.set(chave, { rotulo, total: (atual?.total ?? 0) + linha.valor });
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
  const total = linhas.reduce((soma, l) => soma + l.valor, 0);
  const emEspecie = de('dinheiro');
  const emCartao = de('cartao_credito') + de('cartao_debito');
  const emPix = de('pix');
  // Boleto, crediário e vale-troca não entram em nenhum dos três montes: não
  // caem na gaveta hoje nem aparecem no extrato do dia.
  const aPrazo = de('boleto') + de('crediario') + de('vale_troca');

  const vendasDistintas = new Set(linhas.map((l) => l.vendaId)).size;
  const parcelados = linhas.filter((l) => (l.parcelas ?? 1) > 1);
  const valorParcelado = parcelados.reduce((soma, l) => soma + l.valor, 0);

  // Média por dia usa os dias do PERÍODO escolhido, não os dias com venda:
  // dividir só pelos dias que venderam esconde justamente os dias parados.
  const diasNoPeriodo = Math.max(
    1,
    Math.round(
      (new Date(periodo.ate).getTime() - new Date(periodo.de).getTime()) / 86_400_000
    ) + 1
  );

  return (
    <>
    <RelatorioShell
      titulo="Vendas — Pagamentos"
      hint="Conferência de caixa: cada pagamento recebido no período em uma linha (não cada venda), pra bater com a maquininha e o PIX."
      arquivo="vendas_pagamentos"
      colunas={COLUNAS}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      vazio="Nenhum pagamento recebido neste período."
      aoClicarLinha={(l) => setVendaAberta(l.vendaId)}
      indicadores={
        <>
          <Indicador
            rotulo="Total recebido"
            valor={moeda(total)}
            detalhe={`${linhas.length} pagamento${linhas.length === 1 ? '' : 's'} em ${vendasDistintas} venda${vendasDistintas === 1 ? '' : 's'}`}
            tom="positivo"
          />
          <Indicador
            rotulo="Dinheiro na gaveta"
            valor={moeda(emEspecie)}
            detalhe="Confere contando a gaveta"
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
            valor={moeda(vendasDistintas ? total / vendasDistintas : 0)}
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
          {aPrazo > 0 && (
            <Indicador
              rotulo="A prazo"
              valor={moeda(aPrazo)}
              detalhe="Boleto, crediário e vale — não entra no caixa de hoje"
              tom="alerta"
            />
          )}

          {/* Detalhe por forma CADASTRADA: é o que bate linha a linha com
              cada extrato específico (ex.: Shopee separado de Cartão
              Crédito normal, mesmo os dois sendo "cartão de crédito" no
              enum amplo). */}
          {detalheFormaCadastro.map(([chave, { rotulo, total }]) => (
            <Indicador key={chave} rotulo={rotulo} valor={moeda(total)} />
          ))}
        </>
      }
    />
    <FichaDaVenda vendaId={vendaAberta} aoFechar={() => setVendaAberta(null)} />
    </>
  );
}
