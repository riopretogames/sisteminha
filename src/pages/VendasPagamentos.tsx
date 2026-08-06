import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as fmtData } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { RelatorioShell, usePeriodo, type Coluna } from './relatorios/RelatorioShell';

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

  const { data, isLoading } = useQuery({
    queryKey: ['vendas-pagamentos', periodo.de, periodo.ate],
    queryFn: async (): Promise<LinhaPagamento[]> => {
      const { data, error } = await supabase
        .from('vendas')
        .select(
          'id, numero_venda, created_at, status, clientes(nome), pagamentos_venda(id, forma, parcelas, valor, gateway_id)',
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

  // Resumo por forma de pagamento — o que ajuda a bater com o extrato da
  // maquininha (por bandeira/tipo) e do PIX.
  const totaisPorForma = new Map<FormaPagamento, number>();
  for (const linha of linhas) {
    totaisPorForma.set(linha.forma, (totaisPorForma.get(linha.forma) ?? 0) + linha.valor);
  }

  const formasComMovimento = (Object.keys(FORMAS_PAGAMENTO) as FormaPagamento[]).filter((forma) =>
    totaisPorForma.has(forma),
  );

  return (
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
      indicadores={
        <>
          {formasComMovimento.map((forma) => (
            <Indicador
              key={forma}
              rotulo={FORMAS_PAGAMENTO[forma].label}
              valor={moeda(totaisPorForma.get(forma) ?? 0)}
            />
          ))}
        </>
      }
    />
  );
}
