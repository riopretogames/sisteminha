import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, PackageX, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';

/**
 * Aviso no painel: aparelho pronto parado na prateleira.
 *
 * Pedido do Felipe em 09/08: "gera avisos recorrentes no painel, de alguma
 * maneira você tem que sinalizar isso no sistema para a gente poder cobrar os
 * clientes, porque produtos abandonados mais de seis meses são descartados ou
 * vendidos para cobrar o custo dos reparos".
 *
 * "Recorrente" aqui é literal: o aviso aparece toda vez que alguém abre o
 * painel, enquanto houver aparelho parado. Não tem botão de dispensar, e é de
 * propósito — aviso que se dispensa é aviso que some no dia em que importa. Ele
 * desaparece sozinho quando o último aparelho for entregue.
 *
 * Só aparece a partir de 30 dias: prateleira com aparelho de ontem é operação
 * normal, e alertar sobre isso ensinaria a equipe a ignorar o alerta.
 */

interface Resumo {
  faixa: string;
  dias_parado: number;
}

export function AvisoAguardandoRetirada() {
  const navigate = useNavigate();
  const { can } = useAuth();

  const { data } = useQuery({
    queryKey: ['aviso-aguardando-retirada'],
    enabled: can(PERMISSIONS.ORDERS_VIEW),
    queryFn: async (): Promise<Resumo[]> => {
      const { data, error } = await supabase
        .from('vw_os_aguardando_retirada')
        .select('faixa, dias_parado')
        .neq('faixa', 'normal');
      if (error) throw error;
      return (data ?? []) as unknown as Resumo[];
    },
  });

  const lista = data ?? [];
  if (lista.length === 0) return null;

  const abandonados = lista.filter((o) => o.faixa === 'abandonado').length;
  const criticos = lista.filter((o) => o.faixa === 'critico').length;
  const atencao = lista.filter((o) => o.faixa === 'atencao').length;

  // Abandonado manda no tom do aviso: é o caso que tem consequência de verdade.
  const grave = abandonados > 0;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
        grave ? 'border-red-500/50 bg-red-500/10' : 'border-amber-500/50 bg-amber-500/10'
      }`}
    >
      <div className="flex items-start gap-3">
        {grave ? (
          <PackageX className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        )}
        <div>
          <p className={`font-medium ${grave ? 'text-red-600' : 'text-amber-700 dark:text-amber-500'}`}>
            {grave
              ? `${abandonados} aparelho${abandonados === 1 ? '' : 's'} passou de 6 meses na prateleira`
              : `${lista.length} aparelho${lista.length === 1 ? '' : 's'} pronto${lista.length === 1 ? '' : 's'} esperando o cliente buscar`}
          </p>
          <p className="text-sm text-muted-foreground">
            {grave
              ? 'Pela regra da loja já contam como abandonados. Vale uma última cobrança antes de descartar ou vender.'
              : [
                  criticos > 0 ? `${criticos} há mais de 90 dias` : null,
                  atencao > 0 ? `${atencao} há mais de 30 dias` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </div>
      </div>

      <Button
        variant={grave ? 'destructive' : 'outline'}
        onClick={() => navigate('/os/aguardando-retirada')}
      >
        Ver quem cobrar
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
