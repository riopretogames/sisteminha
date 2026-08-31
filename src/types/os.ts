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
  /**
   * Etapa obrigatória da assistência. Nome e cor a loja muda; excluir,
   * desativar ou renomear a chave, não — código e automações do n8n dependem
   * dela. O banco recusa de qualquer jeito (migration 20260809130000).
   */
  sistema?: boolean;
  /** Posição na esteira oficial (1 a 5). Nulo em etapa extra da loja. */
  etapa?: number | null;
  /**
   * O número como a loja fala da etapa ("1", "2a", "2b"). É rótulo de tela,
   * editável junto com o nome — quem manda no código é `etapa`. Pedido do
   * Felipe em 30/08. Vazio = a etapa aparece só com o nome.
   */
  numero?: string | null;
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
  numero_serie: string | null;
  defeito_cliente: string;
  status: string;
  /** Paga cobra na entrega (exige os_pagamentos); garantia/cortesia não cobram nada. */
  tipo: 'paga' | 'garantia' | 'cortesia';
  prioridade: OsPrioridade;
  /**
   * O cliente aprovou o orçamento? TRUE sim, FALSE não, NULL ainda não
   * respondeu (ou é OS de antes de a decisão ser registrada, 31/08).
   *
   * A lista e o quadro precisam disto porque a OS RECUSADA anda pelas mesmas
   * etapas da aprovada (decisão do Felipe, 01/09: o aparelho volta para a
   * bancada para ser remontado). Sem a marca, o cartão de um aparelho que não
   * vai ser consertado fica idêntico ao de um que vai — na mesma coluna.
   */
  laudo_aprovado: boolean | null;
  total_orcamento: number;
  tecnico_id: string | null;
  tecnico_nome?: string | null;
  /** Data prometida ao cliente. Passou dela e a OS não terminou = atrasada. */
  prazo_previsto?: string | null;
  created_at: string;
}
