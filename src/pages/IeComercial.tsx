import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import { fatorDaVenda } from '@/lib/dinheiroDaVenda';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { RelatorioShell, usePeriodo, type Coluna } from './relatorios/RelatorioShell';

/**
 * IE Comercial — "quanto é o lucro do mês, quanto vem do produto tal": o
 * pedido original que motivou o Passo 6. Nenhuma outra tela do sistema
 * cruza venda + custo do produto pra chegar em lucro por item — o
 * Relatório Financeiro olha só títulos (contas a pagar/receber), o
 * Relatório de Vendas olha só faturamento, sem custo.
 *
 * Limitação assumida: o custo usado é o `custo` ATUAL do produto, não o
 * custo de quando a venda aconteceu (a tabela não guarda isso por venda).
 * Se o preço de custo mudar com o tempo, vendas antigas recalculam com o
 * custo de hoje. Aceitável pra uma primeira versão; se virar problema,
 * a solução é gravar `custo_unitario` em `itens_venda` no momento da venda.
 *
 * DESCONTO DA VENDA (achado 62, revisão de 24/09/2026). A receita era a soma
 * do preço CHEIO de cada item, e o desconto dado na venda inteira nunca saía:
 * agosto mostrava R$ 37.371,20 de receita com R$ 36.871,20 vendidos — R$ 500
 * a mais de receita E de lucro. Agora cada item vale o seu preço vezes o
 * quanto a venda cobrou de verdade (`fatorDaVenda`, a mesma conta do painel de
 * Metas). A devolução sai com o mesmo rateio da venda original.
 */

interface VendaIE {
  total: number | null;
  itens_venda: Array<{
    quantidade: number;
    total: number | null;
    produtos: { id: string; nome: string; categoria: string; custo: number } | null;
  }> | null;
}

interface ItemDevolvidoIE {
  produto_id: string;
  quantidade: number;
  preco_unitario: number | null;
  devolucoes: {
    venda_original: { total: number | null; itens_venda: { total: number | null }[] | null } | null;
  } | null;
}

interface LinhaProduto {
  produtoId: string;
  nome: string;
  categoria: string;
  quantidade: number;
  receita: number;
  custo: number;
}

export default function IeComercial() {
  const [periodo, setPeriodo] = usePeriodo();
  const { can } = useAuth();
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);

  const { data, isLoading } = useQuery({
    queryKey: ['ie-comercial', periodo.de, periodo.ate],
    queryFn: async (): Promise<LinhaProduto[]> => {
      const ate = `${periodo.ate}T23:59:59`;
      // Em páginas: o Supabase corta calado em 1.000 linhas por pedido
      // (lib/buscarEmPaginas.ts) — um ano de vendas passa disso.
      const [vendas, itensDevolvidos] = await Promise.all([
        buscarEmPaginas<VendaIE>(() =>
          supabase
            .from('vendas')
            .select(
              'id, created_at, status, total, itens_venda(quantidade, preco_unitario, total, produtos:vw_produtos(id, nome, categoria, custo))'
            )
            .gte('created_at', periodo.de)
            .lte('created_at', ate)
            .neq('status', 'cancelado')
            .order('created_at')
            .order('id'),
        ),
        // Produto devolvido continuava contando como vendido aqui: este
        // painel agrega por PRODUTO (soma itens_venda), então o desconto por
        // período que consertou os outros painéis não alcançava ele. Vem com
        // a venda ORIGINAL junto, para a devolução sair com o mesmo desconto
        // que a venda teve.
        buscarEmPaginas<ItemDevolvidoIE>(() =>
          supabase
            .from('devolucao_itens')
            .select(
              'id, produto_id, quantidade, preco_unitario, devolucoes!inner(created_at, venda_original:vendas!devolucoes_venda_original_id_fkey(total, itens_venda(total)))'
            )
            .gte('devolucoes.created_at', periodo.de)
            .lte('devolucoes.created_at', ate)
            .order('id'),
        ),
      ]);

      // Agrupa por produto — uma venda pode ter vários itens, e o mesmo
      // produto pode aparecer em várias vendas do período.
      const porProduto = new Map<string, LinhaProduto>();

      for (const venda of vendas) {
        // Quanto de cada real de item a venda cobrou de verdade (desconto
        // rateado). Sem isto a receita somava o preço cheio.
        const fator = fatorDaVenda(venda);
        for (const item of venda.itens_venda ?? []) {
          const produto = item.produtos;
          if (!produto) continue; // item órfão (produto excluído) — ignora

          const atual = porProduto.get(produto.id) ?? {
            produtoId: produto.id,
            nome: produto.nome,
            categoria: produto.categoria,
            quantidade: 0,
            receita: 0,
            custo: 0,
          };
          atual.quantidade += item.quantidade;
          atual.receita += Number(item.total ?? 0) * fator;
          atual.custo += Number(produto.custo) * item.quantidade;
          porProduto.set(produto.id, atual);
        }
      }

      // Desconta o que voltou pela porta. A quantidade sai do ranking de mais
      // vendidos, a receita sai do faturamento por produto, e o custo sai
      // junto — senão a margem ficaria negativa por subtrair só um lado.
      const devolvidos = new Map<string, { quantidade: number; valor: number }>();
      for (const item of itensDevolvidos) {
        const original = item.devolucoes?.venda_original;
        // Devolução avulsa (sem venda de origem) sai pelo preço gravado nela.
        const fator = original ? fatorDaVenda(original) : 1;
        const atual = devolvidos.get(item.produto_id) ?? { quantidade: 0, valor: 0 };
        atual.quantidade += Number(item.quantidade ?? 0);
        atual.valor += Number(item.quantidade ?? 0) * Number(item.preco_unitario ?? 0) * fator;
        devolvidos.set(item.produto_id, atual);
      }

      for (const [produtoId, dev] of devolvidos) {
        const linha = porProduto.get(produtoId);
        if (!linha) continue; // devolução de venda de outro período
        const custoUnit = linha.quantidade > 0 ? linha.custo / linha.quantidade : 0;
        linha.quantidade = Math.max(0, linha.quantidade - dev.quantidade);
        linha.receita = Math.max(0, linha.receita - dev.valor);
        linha.custo = Math.max(0, linha.custo - custoUnit * dev.quantidade);
      }

      return Array.from(porProduto.values()).sort(
        (a, b) => (b.receita - b.custo) - (a.receita - a.custo)
      );
    },
  });

  const linhas = data ?? [];
  const receitaTotal = linhas.reduce((acc, l) => acc + l.receita, 0);
  const custoTotal = linhas.reduce((acc, l) => acc + l.custo, 0);
  const lucroTotal = receitaTotal - custoTotal;
  const margemMedia = receitaTotal > 0 ? (lucroTotal / receitaTotal) * 100 : 0;

  const colunas: Coluna<LinhaProduto>[] = [
    {
      chave: 'nome',
      titulo: 'Produto',
      render: (l) => <span className="font-medium">{l.nome}</span>,
      texto: (l) => l.nome,
    },
    {
      chave: 'categoria',
      titulo: 'Categoria',
      render: (l) => <span className="capitalize text-muted-foreground">{l.categoria}</span>,
      texto: (l) => l.categoria,
    },
    {
      chave: 'quantidade',
      titulo: 'Qtd. vendida',
      alinhar: 'direita',
      render: (l) => l.quantidade,
      texto: (l) => l.quantidade,
      somar: (l) => l.quantidade,
      formatarTotal: (t) => String(t),
    },
    {
      chave: 'receita',
      titulo: 'Receita',
      alinhar: 'direita',
      render: (l) => <span className="font-medium">{moeda(l.receita)}</span>,
      texto: (l) => l.receita.toFixed(2).replace('.', ','),
      somar: (l) => l.receita,
      formatarTotal: moeda,
    },
    ...(veCusto
      ? ([
          {
            chave: 'lucro',
            titulo: 'Lucro',
            alinhar: 'direita',
            render: (l) => {
              const lucro = l.receita - l.custo;
              return (
                <span className={lucro >= 0 ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>
                  {moeda(lucro)}
                </span>
              );
            },
            texto: (l) => (l.receita - l.custo).toFixed(2).replace('.', ','),
            somar: (l) => l.receita - l.custo,
            formatarTotal: moeda,
          },
          {
            chave: 'margem',
            titulo: 'Margem',
            alinhar: 'direita',
            render: (l) => {
              const margem = l.receita > 0 ? ((l.receita - l.custo) / l.receita) * 100 : 0;
              return (
                <span className={margem >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {margem.toFixed(1)}%
                </span>
              );
            },
            texto: (l) => {
              const margem = l.receita > 0 ? ((l.receita - l.custo) / l.receita) * 100 : 0;
              return margem.toFixed(1).replace('.', ',');
            },
          },
        ] as Coluna<LinhaProduto>[])
      : []),
  ];

  return (
    <RelatorioShell
      titulo="IE Comercial — Lucro por Produto"
      hint="Cruza vendas do período com o custo de cada produto: quanto vendeu, quanto deu de lucro e a margem, por item. A receita já vem com o desconto da venda dividido entre os itens, e sem o que foi devolvido no período."
      arquivo="ie_comercial_lucro_por_produto"
      colunas={colunas}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      vazio="Nenhuma venda com produto neste período."
      indicadores={
        <>
          <Indicador rotulo="Receita" valor={moeda(receitaTotal)} />
          {veCusto ? (
            <>
              <Indicador rotulo="Lucro do período" valor={moeda(lucroTotal)} tom={lucroTotal >= 0 ? 'positivo' : 'negativo'} />
              <Indicador rotulo="Margem média" valor={`${margemMedia.toFixed(1)}%`} tom={margemMedia >= 0 ? 'positivo' : 'negativo'} />
            </>
          ) : (
            <Indicador rotulo="Produtos vendidos" valor={String(linhas.length)} />
          )}
        </>
      }
    />
  );
}
