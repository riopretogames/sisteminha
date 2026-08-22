import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { moeda, dataHora } from '@/lib/format';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FiltrosVenda } from '@/components/vendas/FiltrosVenda';
import {
  FILTROS_VENDA_VAZIO,
  aplicarFiltrosVenda,
  type FiltrosVendaValores,
} from '@/lib/filtrosVenda';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/**
 * Histórico de Vendas — diferente do Relatório de Vendas (que é uma
 * fotografia com totais e exportação CSV): aqui é pra achar UMA venda
 * específica e ver o que tinha dentro dela (produtos e pagamentos), tipo
 * "essa venda de ontem, o que o cliente levou mesmo?".
 */

interface Venda {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
  total: number;
  /** NULL em toda venda comum (usa `total`). Só a venda nova de uma troca
   *  preenche — quanto entrou de dinheiro novo de verdade, pra não contar
   *  o produto trocado duas vezes no faturamento. Ver TrocaDevolucao.tsx. */
  valor_faturamento_real: number | null;
  vendedor_id: string | null;
  clientes: { nome: string } | null;
  vendedor: { nome: string } | null;
  /** Só o necessário para os filtros de produto e número de série. O detalhe
   *  completo dos itens continua sendo buscado ao abrir a venda. */
  itens_venda: { produtos: { nome: string; imei_serial: string | null } | null }[] | null;
  pagamentos_venda: { forma: string | null }[] | null;
  /** Devoluções desta venda. Vem presa à linha, e não somada por período,
   *  porque esta tela filtra no cliente por critério livre — assim o
   *  desconto acompanha qualquer filtro que o usuário aplicar. */
  devolucoes: { valor_devolvido_cliente: number | null }[] | null;
}

interface ItemVenda {
  id: string;
  quantidade: number;
  preco_unitario: number;
  total: number;
  produtos: { nome: string } | null;
}

interface PagamentoVenda {
  id: string;
  forma: keyof typeof FORMAS_PAGAMENTO;
  valor: number;
  parcelas: number;
}

// Segue os tons de `lib/acoes.ts`: verde terminou bem, vermelho foi desfeito,
// azul está andando, cinza ainda não é nada.
const STATUS_COR: Record<string, string> = {
  pago: 'bg-emerald-500 text-white',
  faturado: 'bg-blue-500 text-white',
  rascunho: 'bg-slate-400 text-white',
  cancelado: 'bg-red-500 text-white',
};

export default function VendasHistorico() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState<FiltrosVendaValores>(FILTROS_VENDA_VAZIO);
  const [vendaAberta, setVendaAberta] = useState<Venda | null>(null);

  /**
   * O período vai para o BANCO, não para a memória.
   *
   * Achado em 18/08: a consulta trazia sempre as últimas 500 vendas e os
   * filtros de data eram aplicados só sobre essas 500 já carregadas. Passando
   * de 500 vendas no intervalo, as mais antigas do período sumiam **sem
   * aviso** — e a mesma pergunta ("quanto o vendedor X vendeu esse mês")
   * respondia diferente aqui e no Relatório de Vendas, que sempre filtrou no
   * banco. Número que muda conforme a tela destrói a confiança nos dois.
   *
   * Os outros filtros (vendedor, forma de pagamento, produto, texto) seguem
   * em memória de propósito: eles refinam DENTRO do período, e o período já
   * limita o volume.
   */
  const { data, isLoading } = useQuery({
    queryKey: ['vendas-historico', filtros.de, filtros.ate],
    queryFn: async (): Promise<Venda[]> => {
      let q = supabase
        .from('vendas')
        // Traz vendedor, itens e pagamentos junto: sao eles que os filtros de
        // produto, numero de serie e forma de pagamento consultam. Produto vem
        // por `vw_produtos` (regra de custo protegido), com apelido para o JSON
        // manter a chave `produtos`.
        .select(
          `id, numero_venda, created_at, status, total, valor_faturamento_real, vendedor_id,
           clientes(nome),
           vendedor:profiles!vendas_vendedor_id_fkey(nome),
           itens_venda(produtos:vw_produtos(nome, imei_serial)),
           pagamentos_venda(forma),
           devolucoes!venda_original_id(valor_devolvido_cliente)`
        )
        .order('created_at', { ascending: false })
        .limit(500);

      if (filtros.de) q = q.gte('created_at', filtros.de);
      // O `ate` é data pura; sem o T23:59:59 o último dia ficaria de fora —
      // mesma régua do Relatório de Vendas.
      if (filtros.ate) q = q.lte('created_at', `${filtros.ate}T23:59:59`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Venda[];
    },
  });

  const { data: vendedores } = useQuery({
    queryKey: ['profiles-ativos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      return data ?? [];
    },
  });

  const { data: detalhe, isLoading: carregandoDetalhe } = useQuery({
    queryKey: ['venda-detalhe', vendaAberta?.id],
    queryFn: async (): Promise<{ itens: ItemVenda[]; pagamentos: PagamentoVenda[] }> => {
      const [itensRes, pagamentosRes] = await Promise.all([
        supabase
          .from('itens_venda')
          .select('id, quantidade, preco_unitario, total, produtos:vw_produtos(nome)')
          .eq('venda_id', vendaAberta!.id),
        supabase
          .from('pagamentos_venda')
          .select('id, forma, valor, parcelas')
          .eq('venda_id', vendaAberta!.id),
      ]);
      if (itensRes.error) throw itensRes.error;
      if (pagamentosRes.error) throw pagamentosRes.error;
      return {
        itens: (itensRes.data ?? []) as unknown as ItemVenda[],
        pagamentos: (pagamentosRes.data ?? []) as unknown as PagamentoVenda[],
      };
    },
    enabled: !!vendaAberta,
  });

  const vendas = data ?? [];
  // Bateu exatamente no teto: quase certo que há mais fora da lista.
  const atingiuOLimite = vendas.length === 500;
  const filtradas = aplicarFiltrosVenda(vendas, filtros);

  const validas = filtradas.filter((v) => v.status !== 'cancelado');
  // COALESCE, não `total` sozinho: a venda nova de uma troca grava o preço
  // cheio do produto em `total` (pra não perder a contagem de vendas por
  // produto), mas só `valor_faturamento_real` reflete o dinheiro novo de
  // verdade — ver TrocaDevolucao.tsx.
  //
  // Achado em 18/08, resolvido em 21/08: o rodapé não descontava devolução.
  // O desconto por período usado nos painéis não servia aqui, porque esta
  // tela filtra no cliente por critério livre (vendedor, forma, texto) e não
  // dá pra casar uma devolução com um filtro arbitrário. A saída foi trazer
  // a devolução PRESA À LINHA da venda: aí ela acompanha qualquer filtro,
  // aparece na própria linha, e o total fecha com o que está na tela.
  const devolvidoDaVenda = (v: Venda) =>
    (v.devolucoes ?? []).reduce(
      (acc, d) => acc + Number(d.valor_devolvido_cliente ?? 0),
      0
    );

  const faturamento = validas.reduce(
    (acc, v) => acc + Number(v.valor_faturamento_real ?? v.total) - devolvidoDaVenda(v),
    0
  );
  const totalDevolvido = validas.reduce((acc, v) => acc + devolvidoDaVenda(v), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Histórico de Vendas"
        hint={
          filtros.de || filtros.ate
            ? 'Vendas do período escolhido. Clique numa linha para ver os produtos e pagamentos daquela venda.'
            : 'Últimas 500 vendas. Use o filtro de período para ver um intervalo específico. Clique numa linha para ver os produtos e pagamentos daquela venda.'
        }
      />

      {/*
        O limite de 500 continua existindo — o que mudou é que agora ele se
        aplica DENTRO do período pedido, não sobre "as últimas 500 de todas".
        Quando bate no teto, a tela precisa dizer: um total que parece completo
        e não está é pior do que um total assumidamente parcial.
      */}
      {atingiuOLimite && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-800">
            Esta lista mostra <strong>as 500 vendas mais recentes</strong> do
            período escolhido, e existem mais. Os totais abaixo contam só o que
            está na lista — para o número fechado do mês, use o{' '}
            <strong>Relatório de Vendas</strong>, que soma direto no banco.
            Reduzir o período também resolve.
          </p>
        </div>
      )}

      <FiltrosVenda
        valores={filtros}
        onChange={setFiltros}
        vendedores={vendedores ?? []}
        resultados={filtradas.length}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Vendas listadas" valor={String(filtradas.length)} />
        <Indicador
          rotulo="Faturamento"
          valor={moeda(faturamento)}
          tom="positivo"
          detalhe={
            totalDevolvido > 0
              ? `Sem canceladas, menos ${moeda(totalDevolvido)} devolvido`
              : 'Sem contar canceladas'
          }
        />
        <Indicador
          rotulo="Ticket médio"
          valor={moeda(validas.length ? faturamento / validas.length : 0)}
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Carregando…</div>
      ) : filtradas.length === 0 ? (
        <Vazio titulo="Nenhuma venda encontrada" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venda</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((v) => (
                <TableRow
                  key={v.id}
                  className="cursor-pointer"
                  onClick={() => setVendaAberta(v)}
                >
                  <TableCell className="font-medium">{v.numero_venda ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{dataHora(v.created_at)}</TableCell>
                  <TableCell>{v.clientes?.nome ?? 'Consumidor final'}</TableCell>
                  {/* Agora que dá para filtrar por vendedor, o nome precisa
                      estar visível: filtrar por algo que a lista não mostra
                      obriga a confiar no filtro sem poder conferir. */}
                  <TableCell className="text-muted-foreground">
                    {v.vendedor?.nome ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${STATUS_COR[v.status] ?? ''} border-0 capitalize`}>
                      {v.status}
                    </Badge>
                    {/* Venda com devolução fica marcada na própria linha: sem
                        isso, o total do rodapé (que agora desconta) não batia
                        com a soma que a pessoa faz de cabeça olhando a
                        coluna, e parecia erro de conta. */}
                    {devolvidoDaVenda(v) > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 border border-amber-500 bg-amber-500/10 text-amber-700"
                      >
                        Devolvida
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {moeda(Number(v.total))}
                    {devolvidoDaVenda(v) > 0 && (
                      <span className="block text-xs font-normal text-amber-700">
                        −{moeda(devolvidoDaVenda(v))} devolvido
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* Pedido do Felipe (10/08): sempre ter um botão
                        Imprimir na gestão de vendas, igual ao sistema
                        antigo. stopPropagation pra não abrir também o
                        Dialog de detalhe da linha (o clique nele já navega
                        pra outro lugar). */}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Imprimir comprovante"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/vendas/${v.id}/comprovante`);
                      }}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!vendaAberta} onOpenChange={(open) => !open && setVendaAberta(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Venda {vendaAberta?.numero_venda}</DialogTitle>
          </DialogHeader>
          {carregandoDetalhe ? (
            <div className="py-8 text-center text-muted-foreground">Carregando…</div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Produtos</p>
                <div className="space-y-1.5">
                  {detalhe?.itens.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>
                        {item.quantidade}× {item.produtos?.nome ?? '—'}
                      </span>
                      <span className="font-medium">{moeda(Number(item.total))}</span>
                    </div>
                  ))}
                  {!detalhe?.itens.length && (
                    <p className="text-sm text-muted-foreground">Nenhum item.</p>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Pagamentos</p>
                <div className="space-y-1.5">
                  {detalhe?.pagamentos.map((p) => (
                    <div key={p.id} className="flex justify-between text-sm">
                      <span>
                        {FORMAS_PAGAMENTO[p.forma]?.label ?? p.forma}
                        {p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}
                      </span>
                      <span className="font-medium">{moeda(Number(p.valor))}</span>
                    </div>
                  ))}
                  {!detalhe?.pagamentos.length && (
                    <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
