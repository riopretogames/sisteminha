import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { moeda, dataHora } from '@/lib/format';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  clientes: { nome: string } | null;
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

const STATUS_COR: Record<string, string> = {
  pago: 'bg-emerald-100 text-emerald-700',
  faturado: 'bg-blue-100 text-blue-700',
  rascunho: 'bg-slate-100 text-slate-600',
  cancelado: 'bg-red-100 text-red-700',
};

export default function VendasHistorico() {
  const [busca, setBusca] = useState('');
  const [vendaAberta, setVendaAberta] = useState<Venda | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vendas-historico'],
    queryFn: async (): Promise<Venda[]> => {
      const { data, error } = await supabase
        .from('vendas')
        .select('id, numero_venda, created_at, status, total, clientes(nome)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Venda[];
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
  const buscaLower = busca.toLowerCase();
  const filtradas = vendas.filter(
    (v) =>
      (v.numero_venda ?? '').toLowerCase().includes(buscaLower) ||
      (v.clientes?.nome ?? '').toLowerCase().includes(buscaLower)
  );

  const validas = vendas.filter((v) => v.status !== 'cancelado');
  const faturamento = validas.reduce((acc, v) => acc + Number(v.total), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Histórico de Vendas"
        hint="Últimas 200 vendas. Clique numa linha para ver os produtos e pagamentos daquela venda."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Vendas listadas" valor={String(vendas.length)} />
        <Indicador rotulo="Faturamento" valor={moeda(faturamento)} tom="positivo" detalhe="Sem contar canceladas" />
        <Indicador
          rotulo="Ticket médio"
          valor={moeda(validas.length ? faturamento / validas.length : 0)}
        />
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por número da venda ou cliente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
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
