import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
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
  vendedor_id: string | null;
  clientes: { nome: string } | null;
  vendedor: { nome: string } | null;
  /** Só o necessário para os filtros de produto e número de série. O detalhe
   *  completo dos itens continua sendo buscado ao abrir a venda. */
  itens_venda: { produtos: { nome: string; imei_serial: string | null } | null }[] | null;
  pagamentos_venda: { forma: string | null }[] | null;
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
  const [filtros, setFiltros] = useState<FiltrosVendaValores>(FILTROS_VENDA_VAZIO);
  const [vendaAberta, setVendaAberta] = useState<Venda | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vendas-historico'],
    queryFn: async (): Promise<Venda[]> => {
      const { data, error } = await supabase
        .from('vendas')
        // Traz vendedor, itens e pagamentos junto: sao eles que os filtros de
        // produto, numero de serie e forma de pagamento consultam. Produto vem
        // por `vw_produtos` (regra de custo protegido), com apelido para o JSON
        // manter a chave `produtos`.
        .select(
          `id, numero_venda, created_at, status, total, vendedor_id,
           clientes(nome),
           vendedor:profiles!vendas_vendedor_id_fkey(nome),
           itens_venda(produtos:vw_produtos(nome, imei_serial)),
           pagamentos_venda(forma)`
        )
        .order('created_at', { ascending: false })
        .limit(500);
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
  const filtradas = aplicarFiltrosVenda(vendas, filtros);

  const validas = filtradas.filter((v) => v.status !== 'cancelado');
  const faturamento = validas.reduce((acc, v) => acc + Number(v.total), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Histórico de Vendas"
        hint="Últimas 500 vendas. Clique numa linha para ver os produtos e pagamentos daquela venda."
      />

      <FiltrosVenda
        valores={filtros}
        onChange={setFiltros}
        vendedores={vendedores ?? []}
        resultados={filtradas.length}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Vendas listadas" valor={String(filtradas.length)} />
        <Indicador rotulo="Faturamento" valor={moeda(faturamento)} tom="positivo" detalhe="Sem contar canceladas" />
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
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {moeda(Number(v.total))}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <Receipt className="h-4 w-4" />
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
