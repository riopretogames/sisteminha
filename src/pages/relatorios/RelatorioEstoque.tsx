import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda } from '@/lib/format';
import { Indicador } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { RelatorioShell, usePeriodo, type Coluna } from './RelatorioShell';

interface LinhaProduto {
  id: string;
  nome: string;
  marca: string | null;
  categoria: string;
  estoque_atual: number;
  estoque_minimo: number;
  estoque_maximo: number;
  custo: number;
  preco: number;
}

export default function RelatorioEstoque() {
  const [periodo, setPeriodo] = usePeriodo();
  const { can } = useAuth();
  const vecusto = can(PERMISSIONS.INVENTORY_COST_VIEW);

  const { data, isLoading } = useQuery({
    queryKey: ['rel-estoque'],
    queryFn: async (): Promise<LinhaProduto[]> => {
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('id, nome, marca, categoria, estoque_atual, estoque_minimo, estoque_maximo, custo, preco')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return (data ?? []) as LinhaProduto[];
    },
  });

  const linhas = data ?? [];

  // Colunas de custo e margem só existem para quem tem inventory.cost.view.
  // Vendedor não precisa saber quanto a loja pagou no produto.
  const colunas: Coluna<LinhaProduto>[] = [
    {
      chave: 'nome',
      titulo: 'Produto',
      render: (p) => <span className="font-medium">{p.nome}</span>,
      texto: (p) => p.nome,
    },
    {
      chave: 'marca',
      titulo: 'Marca',
      render: (p) => p.marca ?? '—',
      texto: (p) => p.marca ?? '',
    },
    {
      chave: 'categoria',
      titulo: 'Categoria',
      render: (p) => <span className="capitalize text-muted-foreground">{p.categoria}</span>,
      texto: (p) => p.categoria,
    },
    {
      chave: 'saldo',
      titulo: 'Saldo',
      alinhar: 'direita',
      render: (p) => {
        const critico = p.estoque_atual <= p.estoque_minimo;
        return (
          <span className="inline-flex items-center gap-2">
            {critico && (
              <Badge variant="secondary" className="bg-red-500/10 text-[10px] text-red-600">
                Crítico
              </Badge>
            )}
            <span className={critico ? 'font-medium text-red-600' : ''}>{p.estoque_atual}</span>
          </span>
        );
      },
      texto: (p) => p.estoque_atual,
      somar: (p) => p.estoque_atual,
      formatarTotal: (t) => String(t),
    },
    {
      chave: 'preco',
      titulo: 'Preço de venda',
      alinhar: 'direita',
      render: (p) => moeda(Number(p.preco)),
      texto: (p) => Number(p.preco).toFixed(2).replace('.', ','),
    },
    ...(vecusto
      ? ([
          {
            chave: 'custo',
            titulo: 'Custo unit.',
            alinhar: 'direita',
            render: (p) => moeda(Number(p.custo)),
            texto: (p) => Number(p.custo).toFixed(2).replace('.', ','),
          },
          {
            chave: 'imobilizado',
            titulo: 'Valor em estoque',
            alinhar: 'direita',
            render: (p) => (
              <span className="font-medium">{moeda(Number(p.custo) * p.estoque_atual)}</span>
            ),
            texto: (p) => (Number(p.custo) * p.estoque_atual).toFixed(2).replace('.', ','),
            somar: (p) => Number(p.custo) * p.estoque_atual,
            formatarTotal: moeda,
          },
        ] as Coluna<LinhaProduto>[])
      : []),
  ];

  const criticos = linhas.filter((p) => p.estoque_atual <= p.estoque_minimo);
  const imobilizado = linhas.reduce((acc, p) => acc + Number(p.custo) * p.estoque_atual, 0);
  const potencial = linhas.reduce((acc, p) => acc + Number(p.preco) * p.estoque_atual, 0);

  const pecasEmEstoque = linhas.reduce((acc, p) => acc + p.estoque_atual, 0);
  // Item zerado é diferente de item crítico: o crítico ainda vende, o zerado é
  // venda perdida acontecendo agora.
  const zerados = linhas.filter((p) => p.estoque_atual === 0);
  const semGiro = linhas.filter((p) => p.estoque_atual > p.estoque_maximo);
  const lucroPotencial = potencial - imobilizado;
  const margemMedia = imobilizado > 0 ? (lucroPotencial / imobilizado) * 100 : 0;

  return (
    <RelatorioShell
      titulo="Relatório de Estoque"
      hint="Posição atual do estoque. Diferente dos outros relatórios, este é uma fotografia de agora — por isso não tem filtro de período."
      arquivo="relatorio_estoque"
      colunas={colunas}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      ocultarPeriodo
      vazio="Nenhum produto ativo cadastrado."
      indicadores={
        <>
          <Indicador
            rotulo="Itens cadastrados"
            valor={String(linhas.length)}
            detalhe="Somente produtos ativos"
          />
          <Indicador
            rotulo="Em estoque crítico"
            valor={String(criticos.length)}
            detalhe="Saldo no mínimo ou abaixo"
            tom={criticos.length > 0 ? 'negativo' : 'positivo'}
          />
          <Indicador
            rotulo="Itens zerados"
            valor={String(zerados.length)}
            detalhe="Venda perdida acontecendo agora"
            tom={zerados.length > 0 ? 'negativo' : 'positivo'}
          />
          <Indicador
            rotulo="Peças na prateleira"
            valor={String(pecasEmEstoque)}
            detalhe="Somando todas as unidades"
          />

          {vecusto ? (
            <>
              <Indicador
                rotulo="Valor imobilizado"
                valor={moeda(imobilizado)}
                detalhe="Dinheiro parado em mercadoria"
              />
              <Indicador
                rotulo="Valor a preço de venda"
                valor={moeda(potencial)}
                detalhe="Se vender tudo pelo preço de tabela"
              />
              <Indicador
                rotulo="Lucro potencial"
                valor={moeda(lucroPotencial)}
                detalhe={`Margem média de ${margemMedia.toFixed(0)}%`}
                tom="positivo"
              />
            </>
          ) : (
            <Indicador rotulo="Valor a preço de venda" valor={moeda(potencial)} />
          )}

          <Indicador
            rotulo="Acima do máximo"
            valor={String(semGiro.length)}
            detalhe="Comprado demais ou parado"
            tom={semGiro.length > 0 ? 'alerta' : 'neutro'}
          />
        </>
      }
    />
  );
}
