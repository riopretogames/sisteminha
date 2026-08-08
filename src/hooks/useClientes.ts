import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { soDigitos, telefoneIdentifica } from '@/lib/documento';
import type { Database } from '@/integrations/supabase/types';

/**
 * Acesso a clientes.
 *
 * Primeiro hook de entidade central do projeto (não existia `useProdutos`,
 * `useVendas` nem este) — as telas falavam com o banco direto, cada uma do seu
 * jeito. Aqui a razão de existir é mais forte que arrumação: a regra de
 * "cliente repetido" precisa ser a MESMA no cadastro completo e no cadastro
 * rápido do PDV, senão uma das duas portas deixa passar.
 */

export type Cliente = Database['public']['Tables']['clientes']['Row'];

/** O que a tela preenche. Tudo texto — conversão para o banco fica aqui. */
export interface ClienteFormData {
  tipo_pessoa: 'fisica' | 'juridica';
  nome: string;
  cpf_cnpj: string;
  rg: string;
  inscricao_estadual: string;
  data_nascimento: string;
  genero: string;
  telefone: string;
  telefone_extra: string;
  email: string;
  instagram: string;
  site: string;
  cep: string;
  estado: string;
  municipio: string;
  bairro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  origem_id: string;
  motivo_compra_id: string;
  tags: string[];
  liberado_venda: boolean;
  observacoes: string;
}

export const CLIENTE_FORM_VAZIO: ClienteFormData = {
  tipo_pessoa: 'fisica',
  nome: '',
  cpf_cnpj: '',
  rg: '',
  inscricao_estadual: '',
  data_nascimento: '',
  genero: '',
  telefone: '',
  telefone_extra: '',
  email: '',
  instagram: '',
  site: '',
  cep: '',
  estado: '',
  municipio: '',
  bairro: '',
  logradouro: '',
  numero: '',
  complemento: '',
  origem_id: '',
  motivo_compra_id: '',
  tags: [],
  liberado_venda: true,
  observacoes: '',
};

/** Cadastro já existente que a tela oferece antes de deixar criar outro. */
export interface ClienteSemelhante {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefones: string[] | null;
  /** Falso = bloqueado para venda. Quem for reusar o cadastro precisa saber. */
  liberado_venda: boolean;
  /** 'documento' e 'telefone' são recusa do banco; 'nome' é só aviso. */
  motivo: 'documento' | 'telefone' | 'nome';
}

type OrigemEnum = Database['public']['Enums']['cliente_origem'];

/**
 * A origem de verdade passou a ser o catálogo editável (Listas do Sistema),
 * mas a coluna `origem` (lista fixa antiga) continua existindo e é o que
 * relatório antigo lê. Mesmo tratamento que a migration 20260807060000 deu às
 * formas de pagamento: o cadastro manda, e o campo velho segue preenchido
 * sozinho, para nada quebrar.
 */
function origemEnumPelaDescricao(descricao: string | undefined): OrigemEnum {
  const d = (descricao ?? '').toLowerCase();
  if (d.includes('instagram')) return 'instagram';
  if (d.includes('whats')) return 'whatsapp';
  if (d.includes('google')) return 'google';
  if (d.includes('face')) return 'facebook';
  if (d.includes('indica')) return 'indicacao';
  if (d.includes('loja') || d.includes('balc')) return 'loja';
  return 'outro';
}

/** Texto vazio vira nulo — coluna com string vazia atrapalha busca e relatório. */
function ouNulo(valor: string): string | null {
  const t = valor.trim();
  return t === '' ? null : t;
}

export function formDataParaBanco(
  form: ClienteFormData,
  origemDescricao?: string
): Omit<Database['public']['Tables']['clientes']['Insert'], 'tenant_id'> {
  const telefones = [form.telefone, form.telefone_extra]
    .map((t) => t.trim())
    .filter((t) => t !== '');

  const pessoaFisica = form.tipo_pessoa === 'fisica';

  return {
    tipo_pessoa: form.tipo_pessoa,
    nome: form.nome.trim(),
    cpf_cnpj: ouNulo(form.cpf_cnpj),
    // RG é de pessoa física, Inscrição Estadual é de empresa. Guardar os dois
    // ao trocar o tipo deixaria dado fantasma na ficha.
    rg: pessoaFisica ? ouNulo(form.rg) : null,
    inscricao_estadual: pessoaFisica ? null : ouNulo(form.inscricao_estadual),
    data_nascimento: pessoaFisica ? ouNulo(form.data_nascimento) : null,
    genero: pessoaFisica ? ouNulo(form.genero) : null,
    telefones,
    email: ouNulo(form.email),
    instagram: ouNulo(form.instagram),
    site: ouNulo(form.site),
    cep: ouNulo(form.cep),
    estado: ouNulo(form.estado),
    municipio: ouNulo(form.municipio),
    bairro: ouNulo(form.bairro),
    logradouro: ouNulo(form.logradouro),
    numero: ouNulo(form.numero),
    complemento: ouNulo(form.complemento),
    origem_id: ouNulo(form.origem_id),
    origem: origemEnumPelaDescricao(origemDescricao),
    motivo_compra_id: ouNulo(form.motivo_compra_id),
    tags: form.tags as Database['public']['Enums']['cliente_tag'][],
    liberado_venda: form.liberado_venda,
    observacoes: ouNulo(form.observacoes),
  };
}

export function bancoParaFormData(cliente: Cliente): ClienteFormData {
  return {
    tipo_pessoa: cliente.tipo_pessoa === 'juridica' ? 'juridica' : 'fisica',
    nome: cliente.nome,
    cpf_cnpj: cliente.cpf_cnpj ?? '',
    rg: cliente.rg ?? '',
    inscricao_estadual: cliente.inscricao_estadual ?? '',
    data_nascimento: cliente.data_nascimento ?? '',
    genero: cliente.genero ?? '',
    telefone: cliente.telefones?.[0] ?? '',
    telefone_extra: cliente.telefones?.[1] ?? '',
    email: cliente.email ?? '',
    instagram: cliente.instagram ?? '',
    site: cliente.site ?? '',
    cep: cliente.cep ?? '',
    estado: cliente.estado ?? '',
    municipio: cliente.municipio ?? '',
    bairro: cliente.bairro ?? '',
    logradouro: cliente.logradouro ?? '',
    numero: cliente.numero ?? '',
    complemento: cliente.complemento ?? '',
    origem_id: cliente.origem_id ?? '',
    motivo_compra_id: cliente.motivo_compra_id ?? '',
    tags: (cliente.tags ?? []) as string[],
    liberado_venda: cliente.liberado_venda ?? true,
    observacoes: cliente.observacoes ?? '',
  };
}

/**
 * Procura cadastro que já exista, ANTES de tentar gravar.
 *
 * O banco recusa duplicado por conta própria (índice de documento e gatilho de
 * telefone, migration 20260808150000). Isto aqui existe para a recusa não
 * chegar como erro na cara de quem está atendendo: a tela mostra o cadastro
 * encontrado e deixa usar aquele.
 *
 * `ignorarId` é para a edição — um cliente não é duplicata de si mesmo.
 */
export async function buscarClientesSemelhantes(params: {
  documento?: string;
  telefone?: string;
  nome?: string;
  ignorarId?: string;
}): Promise<ClienteSemelhante[]> {
  const documento = soDigitos(params.documento);
  const telefone = telefoneIdentifica(params.telefone ?? '') ? soDigitos(params.telefone) : '';
  const nome = (params.nome ?? '').trim();

  // Sem nada comparável, não vale ida ao banco.
  if (!documento && !telefone && nome.length < 3) return [];

  const { data, error } = await supabase.rpc('buscar_clientes_semelhantes', {
    _documento: documento || undefined,
    _telefone: telefone || undefined,
    _nome: nome.length >= 3 ? nome : undefined,
  });

  if (error) {
    // Falhar a busca não pode travar o cadastro: o banco ainda tem a trava de
    // verdade. Registra e segue — no pior caso, o erro aparece ao salvar.
    console.error('Erro ao buscar clientes semelhantes:', error);
    return [];
  }

  return ((data ?? []) as ClienteSemelhante[]).filter((c) => c.id !== params.ignorarId);
}

/** Traduz a recusa do banco para o que de fato aconteceu na tela. */
export function traduzirErroCliente(error: unknown): string {
  const msg = error instanceof Error ? error.message : 'Tente novamente.';

  if (/clientes_documento_unico/i.test(msg)) {
    return 'Já existe um cliente cadastrado com este CPF/CNPJ. Use o cadastro que já existe.';
  }
  // O gatilho de telefone já devolve texto pronto em português.
  if (/telefone .* já está no cadastro/i.test(msg)) return msg;
  if (/row-level security|policy/i.test(msg)) {
    return 'Seu perfil de acesso não permite fazer isso.';
  }
  return msg;
}

export function useClientes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.profile?.tenant_id ?? null;

  const chave = ['clientes'];

  const query = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: chave });

  const aoFalhar = (error: unknown) => {
    console.error('Erro no cadastro de cliente:', error);
    toast({
      title: 'Não foi possível salvar',
      description: traduzirErroCliente(error),
      variant: 'destructive',
    });
  };

  const criar = useMutation({
    mutationFn: async ({
      form,
      origemDescricao,
    }: {
      form: ClienteFormData;
      origemDescricao?: string;
    }): Promise<Cliente> => {
      if (!tenantId) throw new Error('Usuário sem loja vinculada.');

      const { data, error } = await supabase
        .from('clientes')
        .insert({ ...formDataParaBanco(form, origemDescricao), tenant_id: tenantId })
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  const atualizar = useMutation({
    mutationFn: async ({
      id,
      form,
      origemDescricao,
    }: {
      id: string;
      form: ClienteFormData;
      origemDescricao?: string;
    }): Promise<Cliente> => {
      const { data, error } = await supabase
        .from('clientes')
        .update(formDataParaBanco(form, origemDescricao))
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  /**
   * Exclusão lógica. Cliente antigo está referenciado em venda e OS: apagar de
   * verdade reescreveria o histórico da loja.
   */
  const inativar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').update({ ativo: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoFalhar,
  });

  return {
    clientes: query.data ?? [],
    carregando: query.isLoading,
    erro: query.error,
    recarregar: invalidar,
    criar,
    atualizar,
    inativar,
  };
}
