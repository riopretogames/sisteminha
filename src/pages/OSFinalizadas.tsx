import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { moeda, dataHora } from '@/lib/format';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/**
 * OS Finalizadas — o "arquivo morto" do Kanban: entregues e canceladas.
 * O Kanban mostra só o fluxo ativo (por isso `mainStatuses` em
 * OrdensServico.tsx nem lista essas duas); aqui é pra consultar o que já
 * terminou, sem precisar rolar o quadro inteiro pra achar.
 */

interface OSFinalizada {
  id: string;
  numero_os: string;
  status: string;
  modelo: string | null;
  marca: string | null;
  valor_final_pago: number | null;
  data_finalizacao: string | null;
  created_at: string;
  clientes: { nome: string } | null;
}

export default function OSFinalizadas() {
  const navigate = useNavigate();
  const { getStatusConfig } = useOsStatuses();
  const [busca, setBusca] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['os-finalizadas'],
    queryFn: async (): Promise<OSFinalizada[]> => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(
          'id, numero_os, status, modelo, marca, valor_final_pago, data_finalizacao, created_at, clientes(nome)'
        )
        .in('status', ['entregue', 'cancelado'])
        .order('data_finalizacao', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as OSFinalizada[];
    },
  });

  const os = data ?? [];
  const buscaLower = busca.toLowerCase();
  const filtradas = os.filter(
    (o) =>
      o.numero_os.toLowerCase().includes(buscaLower) ||
      (o.clientes?.nome ?? '').toLowerCase().includes(buscaLower) ||
      (o.modelo ?? '').toLowerCase().includes(buscaLower)
  );

  const entregues = os.filter((o) => o.status === 'entregue');
  const receita = entregues.reduce((acc, o) => acc + Number(o.valor_final_pago ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="OS Finalizadas"
        hint="Ordens de serviço entregues ou canceladas. Clique numa linha para ver o detalhe completo."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Entregues" valor={String(entregues.length)} tom="positivo" />
        <Indicador
          rotulo="Canceladas"
          valor={String(os.filter((o) => o.status === 'cancelado').length)}
        />
        <Indicador rotulo="Receita de OS entregues" valor={moeda(receita)} />
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por OS, cliente ou modelo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Carregando…</div>
      ) : filtradas.length === 0 ? (
        <Vazio titulo="Nenhuma OS finalizada encontrada" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Aparelho</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor pago</TableHead>
                <TableHead>Finalizada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((o) => {
                const cfg = getStatusConfig(o.status);
                return (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/os/${o.id}`)}
                  >
                    <TableCell className="font-medium">{o.numero_os}</TableCell>
                    <TableCell>{o.clientes?.nome ?? '—'}</TableCell>
                    <TableCell>{[o.marca, o.modelo].filter(Boolean).join(' ') || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`${cfg.color} border-0`}>{cfg.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.valor_final_pago != null ? moeda(Number(o.valor_final_pago)) : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {o.data_finalizacao ? dataHora(o.data_finalizacao) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
