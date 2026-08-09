import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as formatarData } from '@/lib/format';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/**
 * Aparelhos prontos que o cliente ainda não buscou.
 *
 * Pedido do Felipe em 09/08, com a regra da loja junto: aparelho parado há mais
 * de 6 meses é tratado como abandonado — descartado ou vendido para cobrar o
 * custo do reparo.
 *
 * Antes disso não havia como saber há quanto tempo cada aparelho estava na
 * prateleira. Na prática, quem lembrava de cobrar o cliente era a memória de
 * quem atendeu — e prateleira cheia de aparelho velho é dinheiro parado e
 * espaço ocupado.
 *
 * A conta de dias e as faixas vêm da view `vw_os_aguardando_retirada`, e não
 * daqui: a automação do n8n vai cobrar o cliente lendo a mesma view, e duas
 * contas separadas divergiriam no primeiro ajuste.
 */

interface AguardandoRetirada {
  id: string;
  numero_os: string;
  marca: string | null;
  modelo: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  total_orcamento: number | null;
  pronto_desde: string | null;
  dias_parado: number;
  faixa: 'normal' | 'atencao' | 'critico' | 'abandonado';
}

const FAIXAS = {
  normal: { label: 'No prazo', cor: 'bg-emerald-500/10 text-emerald-600' },
  atencao: { label: 'Mais de 30 dias', cor: 'bg-amber-500/10 text-amber-600' },
  critico: { label: 'Mais de 90 dias', cor: 'bg-orange-500/10 text-orange-600' },
  abandonado: { label: 'Abandonado (6 meses)', cor: 'bg-red-500/10 text-red-600' },
} as const;

export default function OSAguardandoRetirada() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['os-aguardando-retirada'],
    queryFn: async (): Promise<AguardandoRetirada[]> => {
      const { data, error } = await supabase
        .from('vw_os_aguardando_retirada')
        .select(
          'id, numero_os, marca, modelo, cliente_nome, cliente_telefone, total_orcamento, pronto_desde, dias_parado, faixa'
        )
        .order('dias_parado', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AguardandoRetirada[];
    },
  });

  const lista = data ?? [];
  const abandonados = lista.filter((o) => o.faixa === 'abandonado');
  const criticos = lista.filter((o) => o.faixa === 'critico');
  const aReceber = lista.reduce((soma, o) => soma + Number(o.total_orcamento ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        titulo="Aguardando retirada"
        hint="Aparelhos prontos que o cliente ainda não buscou. Passou de 6 meses, a loja trata como abandonado."
      />

      {abandonados.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-medium text-red-600">
              {abandonados.length}{' '}
              {abandonados.length === 1 ? 'aparelho passou' : 'aparelhos passaram'} de 6 meses na
              prateleira
            </p>
            <p className="text-sm text-muted-foreground">
              Pela regra da loja já contam como abandonados — podem ser descartados ou vendidos
              para cobrir o custo do reparo. Antes disso, vale uma última tentativa de contato.
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Indicador rotulo="Na prateleira" valor={String(lista.length)} />
        <Indicador
          rotulo="Mais de 90 dias"
          valor={String(criticos.length)}
          tom={criticos.length > 0 ? 'alerta' : 'positivo'}
        />
        <Indicador
          rotulo="Abandonados"
          valor={String(abandonados.length)}
          tom={abandonados.length > 0 ? 'negativo' : 'positivo'}
        />
        <Indicador
          rotulo="Valor parado"
          valor={moeda(aReceber)}
          detalhe="Serviço feito e ainda não recebido"
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Carregando…</div>
      ) : lista.length === 0 ? (
        <Vazio
          titulo="Nenhum aparelho esperando"
          descricao="Tudo que ficou pronto já foi entregue."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Aparelho</TableHead>
                <TableHead>Pronto desde</TableHead>
                <TableHead>Parado há</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((o) => {
                const faixa = FAIXAS[o.faixa] ?? FAIXAS.normal;
                return (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/os/${o.id}`)}
                  >
                    <TableCell className="font-medium">{o.numero_os}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{o.cliente_nome ?? '—'}</span>
                        {o.cliente_telefone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {o.cliente_telefone}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{[o.marca, o.modelo].filter(Boolean).join(' ') || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {o.pronto_desde ? formatarData(o.pronto_desde) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${faixa.cor} border-0`}>
                        {o.dias_parado} dia{o.dias_parado === 1 ? '' : 's'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {moeda(Number(o.total_orcamento ?? 0))}
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
