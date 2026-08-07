import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { RelatorioShell, usePeriodo, type Coluna } from './relatorios/RelatorioShell';

/**
 * IE Estoque — giro de produto: o que vende rápido vs. o que fica parado.
 *
 * Mesma ideia do IE Comercial (cruzar dados no client, RelatorioShell com
 * período + CSV), mas aqui o cruzamento é venda × estoque atual, não
 * venda × custo. O ponto central é que "parado" só existe olhando TODOS os
 * produtos ativos, não só quem apareceu em `itens_venda` no período — um
 * produto com estoque e zero vendas não aparece na consulta de vendas, mas é
 * exatamente ele que precisa aparecer aqui.
 *
 * Por isso a tela faz duas consultas e faz merge no client:
 * 1) vendas do período → quantidade vendida por produto;
 * 2) todos os produtos ativos → estoque atual, categoria, custo.
 *
 * "Valor parado" (estoque_atual × custo) usa o custo ATUAL do produto, não
 * o custo de quando cada unidade entrou — mesma limitação assumida em
 * IeComercial.tsx.
 */

interface LinhaProduto {
  produtoId: string;
  nome: string;
  categoria: string;
  quantidadeVendida: number;
  estoqueAtual: number;
  custo: number;
}

type Giro = 'girando' | 'parado' | 'sem-estoque';

function calcularGiro(l: LinhaProduto): Giro {
  if (l.quantidadeVendida > 0) return 'girando';
  if (l.estoqueAtual > 0) return 'parado';
  return 'sem-estoque';
}

export default function IeEstoque() {
  const [periodo, setPeriodo] = usePeriodo();
  const { can } = useAuth();
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);

  const { data, isLoading } = useQuery({
    queryKey: ['ie-estoque', periodo.de, periodo.ate],
    queryFn: async (): Promise<LinhaProduto[]> => {
      const [vendasRes, produtosRes] = await Promise.all([
        supabase
          .from('vendas')
          .select(
            'id, created_at, status, itens_venda(quantidade, total, produtos:vw_produtos(id, nome, categoria, custo, estoque_atual))'
          )
          .gte('created_at', periodo.de)
          .lte('created_at', `${periodo.ate}T23:59:59`)
          .neq('status', 'cancelado'),
        supabase
          .from('vw_produtos')
          .select('id, nome, categoria, custo, estoque_atual')
          .eq('ativo', true),
      ]);

      if (vendasRes.error) throw vendasRes.error;
      if (produtosRes.error) throw produtosRes.error;

      // Começa pela base de TODOS os produtos ativos — é o único jeito de
      // pegar quem tem estoque e não vendeu nada (não aparece em itens_venda).
      const porProduto = new Map<string, LinhaProduto>();
      for (const produto of produtosRes.data ?? []) {
        porProduto.set(produto.id, {
          produtoId: produto.id,
          nome: produto.nome,
          categoria: produto.categoria ?? 'sem categoria',
          quantidadeVendida: 0,
          estoqueAtual: Number(produto.estoque_atual ?? 0),
          custo: Number(produto.custo ?? 0),
        });
      }

      // Soma a quantidade vendida no período por cima da base de produtos.
      for (const venda of (vendasRes.data ?? []) as unknown as Array<{
        itens_venda: Array<{
          quantidade: number;
          total: number;
          produtos: { id: string; nome: string; categoria: string | null; custo: number; estoque_atual: number } | null;
        }>;
      }>) {
        for (const item of venda.itens_venda ?? []) {
          const produto = item.produtos;
          if (!produto) continue; // item órfão (produto excluído) — ignora

          const atual = porProduto.get(produto.id) ?? {
            produtoId: produto.id,
            nome: produto.nome,
            categoria: produto.categoria ?? 'sem categoria',
            quantidadeVendida: 0,
            estoqueAtual: Number(produto.estoque_atual ?? 0),
            custo: Number(produto.custo ?? 0),
          };
          atual.quantidadeVendida += item.quantidade;
          porProduto.set(produto.id, atual);
        }
      }

      // "Parado primeiro, maior valor parado primeiro" — é o que mais
      // precisa de atenção (dinheiro empatado em produto que não sai).
      return Array.from(porProduto.values()).sort((a, b) => {
        const giroA = calcularGiro(a);
        const giroB = calcularGiro(b);
        const parA = giroA === 'parado' ? 0 : 1;
        const parB = giroB === 'parado' ? 0 : 1;
        if (parA !== parB) return parA - parB;
        return b.estoqueAtual * b.custo - a.estoqueAtual * a.custo;
      });
    },
  });

  const linhas = data ?? [];
  const parados = linhas.filter((l) => calcularGiro(l) === 'parado');
  const valorTotalParado = parados.reduce((acc, l) => acc + l.estoqueAtual * l.custo, 0);

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
      chave: 'quantidadeVendida',
      titulo: 'Qtd. vendida no período',
      alinhar: 'direita',
      render: (l) => l.quantidadeVendida,
      texto: (l) => l.quantidadeVendida,
      somar: (l) => l.quantidadeVendida,
      formatarTotal: (t) => String(t),
    },
    {
      chave: 'estoqueAtual',
      titulo: 'Estoque atual',
      alinhar: 'direita',
      render: (l) => l.estoqueAtual,
      texto: (l) => l.estoqueAtual,
      somar: (l) => l.estoqueAtual,
      formatarTotal: (t) => String(t),
    },
    ...(veCusto
      ? ([
          {
            chave: 'valorParado',
            titulo: 'Valor parado',
            alinhar: 'direita',
            render: (l) => {
              const giro = calcularGiro(l);
              const valor = l.estoqueAtual * l.custo;
              return (
                <span className={giro === 'parado' ? 'font-medium text-red-600' : 'text-muted-foreground'}>
                  {moeda(valor)}
                </span>
              );
            },
            texto: (l) => (l.estoqueAtual * l.custo).toFixed(2).replace('.', ','),
            somar: (l) => (calcularGiro(l) === 'parado' ? l.estoqueAtual * l.custo : 0),
            formatarTotal: moeda,
          },
        ] as Coluna<LinhaProduto>[])
      : []),
    {
      chave: 'giro',
      titulo: 'Giro',
      render: (l) => {
        const giro = calcularGiro(l);
        if (giro === 'girando') {
          return <span className="font-medium text-emerald-600">Girando</span>;
        }
        if (giro === 'parado') {
          return <span className="font-medium text-red-600">Parado</span>;
        }
        return <span className="text-muted-foreground">—</span>;
      },
      texto: (l) => {
        const giro = calcularGiro(l);
        if (giro === 'girando') return 'Girando';
        if (giro === 'parado') return 'Parado';
        return '—';
      },
    },
  ];

  return (
    <RelatorioShell
      titulo="IE Estoque — Giro de Produto"
      hint="Cruza vendas do período com o estoque atual de cada produto: o que vende rápido e o que fica parado, com dinheiro empatado."
      arquivo="ie_estoque_giro_por_produto"
      colunas={colunas}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      vazio="Nenhum produto ativo cadastrado."
      indicadores={
        <>
          {veCusto && (
            <Indicador
              rotulo="Valor total parado"
              valor={moeda(valorTotalParado)}
              tom={valorTotalParado > 0 ? 'negativo' : 'positivo'}
            />
          )}
          <Indicador
            rotulo="Produtos parados"
            valor={String(parados.length)}
            tom={parados.length > 0 ? 'alerta' : 'positivo'}
          />
        </>
      }
    />
  );
}
