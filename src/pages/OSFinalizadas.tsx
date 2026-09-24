import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { moeda, dataHora } from '@/lib/format';
import { soDigitos } from '@/lib/documento';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { FiltrosOS } from '@/components/os/FiltrosOS';
import {
  FILTROS_OS_VAZIO,
  aplicarFiltrosOS,
  type FiltrosOSValores,
} from '@/lib/filtrosOS';
import { OS_STATUS_ENCERRADOS } from '@/config/osStatus';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/**
 * OS Finalizadas — o "arquivo morto" do Kanban: entregues e canceladas.
 * O Kanban mostra só o fluxo ativo (por isso `mainStatuses` em
 * OrdensServico.tsx nem lista essas duas); aqui é pra consultar o que já
 * terminou, sem precisar rolar o quadro inteiro pra achar.
 *
 * Ganhou o painel de filtros em 09/08: consultar OS antiga por um campo de
 * busca só funciona pra quem já sabe o número. Quem liga perguntando "e o meu
 * console?" traz telefone, marca ou data — não o número da OS.
 */

interface OSFinalizada {
  id: string;
  numero_os: string;
  status: string;
  modelo: string | null;
  marca: string | null;
  numero_serie: string | null;
  equipamento_id: string | null;
  marca_id: string | null;
  modelo_id: string | null;
  tecnico_id: string | null;
  valor_final_pago: number | null;
  data_finalizacao: string | null;
  created_at: string;
  /** Quando a OS mexeu pela última vez — na cancelada, é quando ela parou
   *  (a cancelada não tem data de finalização: essa só a entrega preenche). */
  updated_at: string | null;
  clientes: { nome: string; telefones: string[] | null } | null;
}

/** A data que ordena a lista: a da entrega, ou, na cancelada, a do cancelamento. */
function quandoTerminou(o: OSFinalizada): string {
  return o.data_finalizacao ?? o.updated_at ?? o.created_at;
}

export default function OSFinalizadas() {
  const navigate = useNavigate();
  const { getStatusConfig } = useOsStatuses();
  const [filtros, setFiltros] = useState<FiltrosOSValores>(FILTROS_OS_VAZIO);

  const { data, isLoading } = useQuery({
    queryKey: ['os-finalizadas'],
    /**
     * TODAS as encerradas, em páginas.
     *
     * Achado na revisão de 24/09: a consulta parava em 500, ordenada pela data
     * de finalização — que a cancelada não tem. Com mais de 500 entregas,
     * nenhuma cancelada aparecia, e a "Receita de OS entregues" somava só as
     * 500 carregadas, mesmo com o filtro de período apontando para meses
     * antigos. Os filtros desta tela rodam sobre a lista carregada, então a
     * lista tem que ser a inteira.
     */
    queryFn: async (): Promise<OSFinalizada[]> => {
      const data = await buscarEmPaginas<OSFinalizada>(() =>
        supabase
          .from('service_orders')
          .select(
            'id, numero_os, status, modelo, marca, numero_serie, equipamento_id, marca_id, modelo_id, tecnico_id, valor_final_pago, data_finalizacao, created_at, updated_at, clientes(nome, telefones)'
          )
          .in('status', OS_STATUS_ENCERRADOS)
          .order('created_at')
          .order('id'),
      );
      // Da que terminou por último para a mais antiga — entregue e cancelada
      // na mesma régua.
      return [...data].sort((a, b) => quandoTerminou(b).localeCompare(quandoTerminou(a)));
    },
  });

  const { data: tecnicos } = useQuery({
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

  const os = data ?? [];
  const filtradas = aplicarFiltrosOS(os, filtros, soDigitos);

  // Os indicadores acompanham o filtro: mostrar o total geral enquanto a lista
  // está recortada faria a pessoa somar coisas que não estão na tela.
  const entregues = filtradas.filter((o) => o.status === 'entregue');
  const canceladas = filtradas.filter((o) => o.status === 'cancelado');
  const receita = entregues.reduce((acc, o) => acc + Number(o.valor_final_pago ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        titulo="OS Finalizadas"
        hint="Ordens de serviço entregues ou canceladas. Clique numa linha para ver o detalhe completo."
      />

      <FiltrosOS
        valores={filtros}
        onChange={setFiltros}
        tecnicos={tecnicos ?? []}
        resultados={filtradas.length}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Entregues" valor={String(entregues.length)} tom="positivo" />
        <Indicador rotulo="Canceladas" valor={String(canceladas.length)} tom="negativo" />
        <Indicador rotulo="Receita de OS entregues" valor={moeda(receita)} />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Carregando…</div>
      ) : filtradas.length === 0 ? (
        <Vazio
          titulo="Nenhuma OS finalizada encontrada"
          descricao="Tente limpar o filtro ou alargar o período."
        />
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
