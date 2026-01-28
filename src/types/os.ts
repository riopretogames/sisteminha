import { OS_PRIORITY } from '@/lib/constants';

export interface StatusConfig {
  id: string;
  tenant_id: string;
  key: string;
  label: string;
  color: string;
  icon: string;
  ordem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export type OsPrioridade = keyof typeof OS_PRIORITY;

export interface ServiceOrder {
  id: string;
  numero_os: string;
  cliente_id: string;
  cliente_nome: string;
  marca: string | null;
  modelo: string | null;
  imei: string | null;
  defeito_cliente: string;
  status: string;
  prioridade: OsPrioridade;
  total_orcamento: number;
  tecnico_id: string | null;
  tecnico_nome?: string | null;
  created_at: string;
}
