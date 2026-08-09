// OS Status configuration
export const OS_STATUS = {
  recebido: { label: 'Recebido', color: 'status-recebido', icon: 'inbox' },
  diagnostico: { label: 'Diagnóstico', color: 'status-diagnostico', icon: 'search' },
  aguardando_peca: { label: 'Aguardando Peça', color: 'status-aguardando-peca', icon: 'clock' },
  aguardando_aprovacao: { label: 'Aguardando Aprovação', color: 'status-aguardando-aprovacao', icon: 'hourglass' },
  em_reparo: { label: 'Em Reparo', color: 'status-em-reparo', icon: 'wrench' },
  pronto: { label: 'Pronto', color: 'status-pronto', icon: 'check' },
  entregue: { label: 'Entregue', color: 'status-entregue', icon: 'check-circle' },
  cancelado: { label: 'Cancelado', color: 'status-cancelado', icon: 'x' },
} as const;

// OS Priority configuration
export const OS_PRIORITY = {
  baixa: { label: 'Baixa', color: 'bg-slate-100 text-slate-600' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-600' },
  alta: { label: 'Alta', color: 'bg-orange-100 text-orange-600' },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-600' },
} as const;

// As marcações de cliente saíram daqui em 08/08: eram 3 fixas no código e
// agora vêm do catálogo `tag_cliente`, editável em Listas do Sistema.

// Cliente origem
export const CLIENTE_ORIGEM = {
  instagram: { label: 'Instagram', icon: 'instagram' },
  indicacao: { label: 'Indicação', icon: 'users' },
  google: { label: 'Google', icon: 'search' },
  facebook: { label: 'Facebook', icon: 'facebook' },
  whatsapp: { label: 'WhatsApp', icon: 'message-circle' },
  loja: { label: 'Loja', icon: 'store' },
  outro: { label: 'Outro', icon: 'more-horizontal' },
} as const;

// Produto categorias
export const PRODUTO_CATEGORIAS = {
  celular: { label: 'Celular', icon: 'smartphone' },
  acessorio: { label: 'Acessório', icon: 'headphones' },
  peca: { label: 'Peça', icon: 'cpu' },
  servico: { label: 'Serviço', icon: 'wrench' },
} as const;

// Produto localizações
export const PRODUTO_LOCALIZACOES = {
  vitrine: { label: 'Vitrine', icon: 'eye' },
  deposito: { label: 'Depósito', icon: 'warehouse' },
  bancada: { label: 'Bancada', icon: 'tool' },
  sucata: { label: 'Sucata', icon: 'trash' },
} as const;

// Tipos de movimentação de estoque
export const MOVIMENTO_TIPOS = {
  entrada: { label: 'Entrada', cor: 'bg-emerald-100 text-emerald-700' },
  saida: { label: 'Saída', cor: 'bg-red-100 text-red-700' },
  ajuste: { label: 'Ajuste', cor: 'bg-blue-100 text-blue-700' },
  inventario: { label: 'Inventário', cor: 'bg-slate-100 text-slate-600' },
} as const;

// Formas de pagamento
export const FORMAS_PAGAMENTO = {
  pix: { label: 'PIX', icon: 'qr-code' },
  dinheiro: { label: 'Dinheiro', icon: 'banknote' },
  cartao_credito: { label: 'Crédito', icon: 'credit-card' },
  cartao_debito: { label: 'Débito', icon: 'credit-card' },
  boleto: { label: 'Boleto', icon: 'file-text' },
  crediario: { label: 'Crediário', icon: 'calendar' },
  vale_troca: { label: 'Vale Troca', icon: 'repeat' },
} as const;

// Card fields configuration for Kanban view
export const CARD_FIELDS = {
  numero_os: { label: 'Número da OS', icon: 'hash' },
  cliente_nome: { label: 'Nome do Cliente', icon: 'user' },
  modelo: { label: 'Modelo do Aparelho', icon: 'smartphone' },
  numero_serie: { label: 'Nº de Série / IMEI', icon: 'fingerprint' },
  defeito: { label: 'Defeito', icon: 'alert-circle' },
  status: { label: 'Status', icon: 'circle' },
  valor_orcamento: { label: 'Valor do Orçamento', icon: 'dollar-sign' },
  data_entrada: { label: 'Data de Entrada', icon: 'calendar' },
  tecnico: { label: 'Técnico Responsável', icon: 'wrench' },
  prioridade: { label: 'Prioridade', icon: 'flag' },
} as const;
