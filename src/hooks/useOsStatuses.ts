import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StatusConfig } from '@/types/os';

/**
 * Status de OS são customizáveis por loja (tabela `os_status_config`,
 * editada em "Gerenciar Status" na tela de Ordens de Serviço) — não é um
 * enum fixo. Qualquer tela que mostre o rótulo/cor de um status precisa
 * ler daqui, não de uma lista estática, senão mostra nome/cor errados
 * assim que alguém personalizar um status.
 */
export function useOsStatuses() {
  const { data } = useQuery({
    queryKey: ['os-status-config'],
    queryFn: async (): Promise<StatusConfig[]> => {
      const { data, error } = await supabase
        .from('os_status_config')
        .select('*')
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as StatusConfig[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const statuses = data ?? [];

  const getStatusConfig = (key: string): { label: string; color: string } =>
    statuses.find((s) => s.key === key) ?? { label: key, color: 'bg-gray-100 text-gray-600' };

  return { statuses, getStatusConfig };
}
