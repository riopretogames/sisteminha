import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, dataHora } from '@/lib/format';
import { OS_PRIORITY } from '@/lib/constants';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

/**
 * Detalhe de uma OS.
 *
 * As duas visões de OS (Kanban e tabela) já tentavam navegar pra
 * `/os/:id` — a rota simplesmente não existia (clicar num card caía em
 * "Página não encontrada"). Esta tela resolve isso e, junto, guarda o
 * "Valor do orçamento": até agora não havia NENHUM lugar pra editar esse
 * campo depois que a OS era criada, então ele sempre ficava zerado — e é
 * dele que a conta a receber (Passo 4) precisa pra existir de verdade.
 *
 * Diagnóstico técnico, constatação, peças usadas e outros campos do laudo
 * completo continuam fora desta primeira versão — ver Passo 5.
 */

interface OSCompleta {
  id: string;
  numero_os: string;
  status: string;
  tipo: 'paga' | 'garantia' | 'cortesia';
  prioridade: keyof typeof OS_PRIORITY;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  defeito_cliente: string;
  observacoes: string | null;
  total_orcamento: number;
  valor_final_pago: number | null;
  data_finalizacao: string | null;
  created_at: string;
  clientes: { nome: string; telefones: string[] } | null;
}

export default function OSDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const podeEditar = can(PERMISSIONS.ORDERS_EDIT);
  const { getStatusConfig } = useOsStatuses();

  const [orcamento, setOrcamento] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { data: os, isLoading } = useQuery({
    queryKey: ['os-detalhe', id],
    queryFn: async (): Promise<OSCompleta | null> => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(
          'id, numero_os, status, tipo, prioridade, marca, modelo, numero_serie, defeito_cliente, observacoes, total_orcamento, valor_final_pago, data_finalizacao, created_at, clientes(nome, telefones)'
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as OSCompleta | null;
    },
    enabled: !!id,
  });

  const valorAtual = orcamento ?? (os ? String(os.total_orcamento) : '');
  const mudou = os && parseFloat(valorAtual || '0') !== Number(os.total_orcamento);

  const salvarOrcamento = async () => {
    if (!os) return;
    const valor = parseFloat(valorAtual);
    if (isNaN(valor) || valor < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ total_orcamento: valor })
        .eq('id', os.id);
      if (error) throw error;

      toast({ title: 'Orçamento salvo!' });
      setOrcamento(null);
      queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] });
    } catch (error: unknown) {
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!os) {
    return <Vazio titulo="OS não encontrada" descricao="Ela pode ter sido excluída." />;
  }

  const statusCfg = getStatusConfig(os.status);
  const jaFoiEntregue = os.status === 'entregue';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        titulo={`OS ${os.numero_os}`}
        hint={`Aberta em ${dataHora(os.created_at)}`}
        acoes={
          <Button variant="outline" onClick={() => navigate('/os')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge className={statusCfg?.color ?? ''}>{statusCfg?.label ?? os.status}</Badge>
        <Badge variant="outline">{OS_PRIORITY[os.prioridade]?.label ?? os.prioridade}</Badge>
        <Badge variant="outline" className="capitalize">{os.tipo}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{os.clientes?.nome ?? '—'}</p>
            <p className="text-muted-foreground">{os.clientes?.telefones?.[0] ?? '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aparelho</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">
              {[os.marca, os.modelo].filter(Boolean).join(' ') || '—'}
            </p>
            <p className="text-muted-foreground">
              {os.numero_serie ? `Nº série/IMEI: ${os.numero_serie}` : 'Sem nº de série informado'}
            </p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Defeito relatado</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{os.defeito_cliente}</p>
            {os.observacoes && (
              <p className="mt-2 text-muted-foreground">{os.observacoes}</p>
            )}
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Valor do orçamento</CardTitle>
          </CardHeader>
          <CardContent>
            {os.tipo !== 'paga' && (
              <p className="mb-3 text-sm text-muted-foreground">
                OS do tipo <span className="font-medium capitalize">{os.tipo}</span> — não gera
                cobrança quando entregue.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="orcamento">Valor (R$)</Label>
                <Input
                  id="orcamento"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-40"
                  value={valorAtual}
                  onChange={(e) => setOrcamento(e.target.value)}
                  disabled={!podeEditar || jaFoiEntregue}
                />
              </div>
              {podeEditar && !jaFoiEntregue && (
                <Button onClick={salvarOrcamento} disabled={salvando || !mudou}>
                  <Save className="mr-2 h-4 w-4" />
                  {salvando ? 'Salvando…' : 'Salvar'}
                </Button>
              )}
            </div>
            {jaFoiEntregue && (
              <p className="mt-3 text-sm text-muted-foreground">
                Esta OS já foi entregue
                {os.data_finalizacao ? ` em ${dataHora(os.data_finalizacao)}` : ''} — valor
                travado
                {os.valor_final_pago != null ? `: ${moeda(Number(os.valor_final_pago))}` : ''}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
