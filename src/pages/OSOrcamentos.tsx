import { useState } from 'react';
import { DecisaoDoLaudo } from '@/components/os/DecisaoDoLaudo';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, diasAte } from '@/lib/format';
import { soDigitos } from '@/lib/documento';
import { FiltrosOS } from '@/components/os/FiltrosOS';
import {
  FILTROS_OS_VAZIO,
  aplicarFiltrosOS,
  type FiltrosOSValores,
} from '@/lib/filtrosOS';
import { OS_PRIORITY } from '@/lib/constants';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { OS_ETAPAS, OS_CANCELADO } from '@/config/osStatus';

/**
 * OS Orçamentos — fila de quem está esperando o cliente aprovar (ou
 * recusar) o valor do reparo. Ação rápida aqui evita ter que entrar no
 * Kanban e arrastar o card manualmente.
 */

interface OSOrcamento {
  id: string;
  numero_os: string;
  modelo: string | null;
  marca: string | null;
  prioridade: keyof typeof OS_PRIORITY;
  total_orcamento: number;
  /** A decisão do laudo precisa dos dois: o tipo decide se cobra taxa de
   *  análise na recusa, e o status é a guarda da própria decisão. */
  status: string;
  tipo: 'paga' | 'garantia' | 'cortesia';
  /** Serviço tabelado (false) não cobra taxa de análise na recusa. */
  laudo_eletronico: boolean | null;
  created_at: string;
  numero_serie: string | null;
  equipamento_id: string | null;
  marca_id: string | null;
  modelo_id: string | null;
  tecnico_id: string | null;
  clientes: { nome: string; telefones: string[] } | null;
}

export default function OSOrcamentos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  // orders.approve, não orders.edit — aprovar/recusar orçamento é decisão de
  // negócio (quem fala com o cliente), separada de editar a OS. O técnico
  // tem orders.edit mas não orders.approve; antes desta correção (17/08) via
  // esses botões do mesmo jeito que vendedor/gerente. A trava real também
  // está no banco (migration 20260817140000), não só aqui na tela.
  const podeAprovar = can(PERMISSIONS.ORDERS_APPROVE);
  const [filtros, setFiltros] = useState<FiltrosOSValores>(FILTROS_OS_VAZIO);

  const { data, isLoading } = useQuery({
    queryKey: ['os-orcamentos'],
    queryFn: async (): Promise<OSOrcamento[]> => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(
          'id, numero_os, modelo, marca, prioridade, total_orcamento, status, tipo, laudo_eletronico, created_at, numero_serie, equipamento_id, marca_id, modelo_id, tecnico_id, clientes(nome, telefones)'
        )
        .eq('status', OS_ETAPAS.AGUARDANDO_APROVACAO)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OSOrcamento[];
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

  // A função `decidir` que ficava aqui foi APAGADA em 31/08. Ela dava um
  // `update` direto no status: aprovar mandava para "Aprovado", recusar
  // mandava para "Cancelado" — sem motivo, sem taxa de análise e sem devolver
  // as peças ao estoque, que é o que a decisão de verdade faz.
  //
  // Deixar a função aqui "por precaução" seria o pior dos dois mundos: uma
  // segunda regra viva, pronta para alguém religar num botão e voltar a
  // divergir. Quem decide agora é <DecisaoDoLaudo>, o mesmo componente da
  // ficha da OS.

  const orcamentos = aplicarFiltrosOS(data ?? [], filtros, soDigitos);
  const valorTotal = orcamentos.reduce((acc, o) => acc + Number(o.total_orcamento), 0);
  const semValor = orcamentos.filter((o) => Number(o.total_orcamento) <= 0).length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="OS Orçamentos"
        hint="Ordens de serviço aguardando o cliente aprovar o valor do reparo, da mais antiga para a mais recente."
      />

      <FiltrosOS
        valores={filtros}
        onChange={setFiltros}
        tecnicos={tecnicos ?? []}
        resultados={orcamentos.length}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Aguardando aprovação" valor={String(orcamentos.length)} tom={orcamentos.length > 0 ? 'alerta' : 'positivo'} />
        <Indicador rotulo="Valor somado" valor={moeda(valorTotal)} />
        <Indicador
          rotulo="Sem valor definido"
          valor={String(semValor)}
          detalhe={semValor > 0 ? 'Preencha o orçamento antes de aprovar' : undefined}
          tom={semValor > 0 ? 'alerta' : 'positivo'}
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Carregando…</div>
      ) : orcamentos.length === 0 ? (
        <Vazio titulo="Nenhum orçamento esperando aprovação" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Aparelho</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead className="text-right">Orçamento</TableHead>
                <TableHead>Esperando há</TableHead>
                {podeAprovar && <TableHead className="w-[1%]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orcamentos.map((o) => {
                const dias = Math.abs(diasAte(o.created_at.slice(0, 10)));
                return (
                  <TableRow key={o.id}>
                    <TableCell
                      className="cursor-pointer font-medium"
                      onClick={() => navigate(`/os/${o.id}`)}
                    >
                      {o.numero_os}
                    </TableCell>
                    <TableCell>{o.clientes?.nome ?? '—'}</TableCell>
                    <TableCell>{[o.marca, o.modelo].filter(Boolean).join(' ') || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{OS_PRIORITY[o.prioridade]?.label ?? o.prioridade}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(o.total_orcamento) > 0 ? moeda(Number(o.total_orcamento)) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {dias === 0 ? 'hoje' : `${dias} dia(s)`}
                      </span>
                    </TableCell>
                    {podeAprovar && (
                      <TableCell>
                        {/* A MESMA decisão da ficha da OS, e não uma cópia.
                            Até 31/08 esta tela tinha botões próprios: recusar
                            aqui cancelava a OS, sem pedir motivo, sem cobrar a
                            taxa de análise e sem devolver as peças ao estoque —
                            enquanto a ficha fazia as três coisas. Duas telas
                            decidindo o mesmo com resultados diferentes é como o
                            histórico da loja passa a mentir. */}
                        <div className="flex gap-2">
                          <DecisaoDoLaudo
                            osId={o.id}
                            status={o.status}
                            tipo={o.tipo}
                            totalOrcamento={Number(o.total_orcamento)}
                            laudoEletronico={o.laudo_eletronico}
                            compacto
                            onMudou={() =>
                              queryClient.invalidateQueries({ queryKey: ['os-orcamentos'] })
                            }
                          />
                        </div>
                      </TableCell>
                    )}
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
