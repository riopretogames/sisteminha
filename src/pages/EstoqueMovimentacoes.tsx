import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, dataHora } from '@/lib/format';
import { MOVIMENTO_TIPOS } from '@/lib/constants';
import {
  sentidoDoMovimento,
  quantidadeComSinal,
  corDaQuantidade,
} from '@/lib/movimentoEstoque';
import { Indicador } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { RelatorioShell, usePeriodo, type Coluna } from './relatorios/RelatorioShell';
import { FichaDaVenda } from '@/components/vendas/FichaDaVenda';
import { lerOrigem } from '@/lib/origemMovimento';
import { useToast } from '@/hooks/use-toast';

/**
 * Movimentações de Estoque — o histórico de auditoria que os gatilhos dos
 * Passos 1 e 2 (venda, ajuste manual, entrada de cadastro, peça de OS)
 * gravam em `movimentos_estoque`. Antes desses gatilhos, mudar estoque não
 * deixava rastro nenhum; esta tela é a primeira que mostra esse rastro.
 */

type MovimentoTipo = keyof typeof MOVIMENTO_TIPOS;

interface LinhaMovimento {
  id: string;
  produto_id: string;
  tipo: MovimentoTipo;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
  motivo: string | null;
  origem: string | null;
  saldo_anterior: number;
  saldo_depois: number;
  created_at: string;
  /** Quem mexeu no estoque. Aponta para `auth.users`, não para `profiles`,
   *  então o nome vem de uma consulta separada (ver `perfis` abaixo). */
  usuario_id: string | null;
  produtos: { nome: string } | null;
}

export default function EstoqueMovimentacoes() {
  const [periodo, setPeriodo] = usePeriodo();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);
  const podeVerVenda = can(PERMISSIONS.SALES_VIEW);
  const podeVerOS = can(PERMISSIONS.ORDERS_VIEW);
  const [vendaAberta, setVendaAberta] = useState<string | null>(null);

  /**
   * Nome de quem fez cada movimento.
   *
   * Todos os perfis, inclusive os inativos: movimento de meses atrás pode ter
   * sido feito por quem já saiu da loja, e o histórico não pode virar "—" por
   * causa disso. Mesmo raciocínio da ficha da venda e do detalhe da OS.
   */
  const { data: perfis } = useQuery({
    queryKey: ['profiles-todos'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nome');
      return data ?? [];
    },
  });
  const nomeDoUsuario = (id: string | null) =>
    (id && (perfis ?? []).find((p) => p.id === id)?.nome) || '—';

  /**
   * Abre o documento que gerou o movimento.
   *
   * A etiqueta de origem guarda o NÚMERO do documento ("venda:OV0006"), não a
   * chave — então falta um passo: procurar a venda (ou a OS) por esse número
   * para descobrir o id. Quando o banco gravou o id direto (acontece quando o
   * número ainda não existia no instante do movimento), pula a busca.
   */
  const abrirOrigem = async (origem: string | null) => {
    const lida = lerOrigem(origem);
    if (!lida.navegavel) return;

    const semAcesso = (lida.tipo === 'venda' && !podeVerVenda) || (lida.tipo === 'os' && !podeVerOS);
    if (semAcesso) {
      toast({
        title: 'Seu acesso não permite abrir este documento',
        description: 'Peça a um administrador da loja se você precisar ver esta tela.',
        variant: 'destructive',
      });
      return;
    }

    if (lida.pareceId) {
      if (lida.tipo === 'venda') setVendaAberta(lida.referencia);
      else navigate(`/os/${lida.referencia}`);
      return;
    }

    const { data, error } =
      lida.tipo === 'venda'
        ? await supabase.from('vendas').select('id').eq('numero_venda', lida.referencia).maybeSingle()
        : await supabase.from('service_orders').select('id').eq('numero_os', lida.referencia).maybeSingle();

    if (error || !data) {
      toast({
        title: 'Não encontrei este documento',
        description: `${lida.rotulo} não está mais no sistema, ou foi renumerado.`,
        variant: 'destructive',
      });
      return;
    }

    if (lida.tipo === 'venda') setVendaAberta(data.id);
    else navigate(`/os/${data.id}`);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['estoque-movimentacoes', periodo.de, periodo.ate],
    queryFn: async (): Promise<LinhaMovimento[]> => {
      const { data, error } = await supabase
        .from('vw_movimentos_estoque')
        .select('*, produtos:vw_produtos(nome)')
        .gte('created_at', periodo.de)
        .lte('created_at', `${periodo.ate}T23:59:59`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaMovimento[];
    },
  });

  const linhas = data ?? [];
  // Conta pelo sentido de verdade, não pelo sinal do número. Antes de 18/08
  // `entradas` incluía "quantidade > 0", o que somava as SAÍDAS de venda
  // junto (elas vêm positivas do banco) — o mesmo movimento entrava nos dois
  // contadores e o total de entradas ficava inflado.
  const entradas = linhas.filter((m) => sentidoDoMovimento(m) === 'entrada').length;
  const saidas = linhas.filter((m) => sentidoDoMovimento(m) === 'saida').length;

  const colunas: Coluna<LinhaMovimento>[] = [
    {
      chave: 'data',
      titulo: 'Quando',
      render: (m) => <span className="whitespace-nowrap">{dataHora(m.created_at)}</span>,
      texto: (m) => dataHora(m.created_at),
    },
    {
      chave: 'produto',
      titulo: 'Produto',
      render: (m) => <span className="font-medium">{m.produtos?.nome ?? '—'}</span>,
      texto: (m) => m.produtos?.nome ?? '',
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      render: (m) => {
        const cfg = MOVIMENTO_TIPOS[m.tipo];
        return <Badge className={`${cfg?.cor ?? ''} border-0`}>{cfg?.label ?? m.tipo}</Badge>;
      },
      texto: (m) => MOVIMENTO_TIPOS[m.tipo]?.label ?? m.tipo,
    },
    {
      chave: 'quantidade',
      titulo: 'Quantidade',
      alinhar: 'direita',
      render: (m) => (
        <span className={corDaQuantidade(m)}>{quantidadeComSinal(m)}</span>
      ),
      // O CSV leva o mesmo sinal que a tela mostra — senão a planilha
      // exportada volta a dizer que a venda foi uma entrada.
      texto: (m) => quantidadeComSinal(m),
    },
    {
      chave: 'motivo',
      titulo: 'Motivo',
      render: (m) => m.motivo ?? '—',
      texto: (m) => m.motivo ?? '',
    },
    {
      chave: 'origem',
      titulo: 'Origem',
      // "venda:OV0006" era o que aparecia aqui — texto de banco de dados na
      // tela de quem atende. Agora vira "Venda OV0006", e quando há ficha do
      // outro lado ela abre no clique.
      render: (m) => {
        const lida = lerOrigem(m.origem);
        // Sem permissão para o destino, o texto continua legível mas NÃO vira
        // link: oferecer um clique que termina em recusa é pior do que não
        // oferecer — a pessoa tenta, leva um aviso vermelho e fica achando
        // que o sistema está com problema.
        const podeAbrir =
          lida.navegavel && (lida.tipo === 'venda' ? podeVerVenda : podeVerOS);
        if (!podeAbrir) {
          return <span className="text-muted-foreground">{lida.rotulo}</span>;
        }
        return (
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={(e) => {
              // A linha inteira também é clicável (abre o produto). Sem isto,
              // um clique aqui dispararia as duas coisas.
              e.stopPropagation();
              void abrirOrigem(m.origem);
            }}
          >
            {lida.rotulo}
          </button>
        );
      },
      // No CSV, linha sem origem continua vazia. O traço é enfeite de tela:
      // numa planilha ele vira um caractere que atrapalha filtro e soma.
      texto: (m) => (m.origem ? lerOrigem(m.origem).rotulo : ''),
    },
    {
      chave: 'quem',
      titulo: 'Quem fez',
      render: (m) => <span className="text-muted-foreground">{nomeDoUsuario(m.usuario_id)}</span>,
      texto: (m) => (m.usuario_id ? nomeDoUsuario(m.usuario_id) : ''),
    },
    {
      chave: 'saldo',
      titulo: 'Saldo depois',
      alinhar: 'direita',
      render: (m) => m.saldo_depois,
      texto: (m) => m.saldo_depois,
    },
    ...(veCusto
      ? ([
          {
            chave: 'valor_total',
            titulo: 'Valor',
            alinhar: 'direita',
            render: (m) => moeda(Number(m.valor_total)),
            texto: (m) => Number(m.valor_total).toFixed(2).replace('.', ','),
            somar: (m) => Number(m.valor_total),
            formatarTotal: moeda,
          },
        ] as Coluna<LinhaMovimento>[])
      : []),
  ];

  return (
    <>
    <RelatorioShell
      titulo="Movimentações de Estoque"
      hint="Auditoria de tudo que mexeu no estoque no período: vendas, ajustes manuais, cadastro de produto novo e peças usadas em OS."
      arquivo="movimentacoes_estoque"
      colunas={colunas}
      dados={linhas}
      isLoading={isLoading}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      vazio="Nenhuma movimentação de estoque neste período."
      aoClicarLinha={
        can(PERMISSIONS.INVENTORY_VIEW) ? (m) => navigate(`/estoque/${m.produto_id}`) : undefined
      }
      indicadores={
        <>
          <Indicador rotulo="Movimentações" valor={String(linhas.length)} detalhe="No período" />
          <Indicador rotulo="Entradas" valor={String(entradas)} tom="positivo" />
          <Indicador rotulo="Saídas" valor={String(saidas)} tom="negativo" />
        </>
      }
    />
    <FichaDaVenda vendaId={vendaAberta} aoFechar={() => setVendaAberta(null)} />
    </>
  );
}
