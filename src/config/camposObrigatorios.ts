/**
 * Quais campos cada loja pode exigir — e o que já vem exigido de fábrica.
 *
 * Pedido do Felipe em 27 e 28/08: *"quero poder escolher quais campos exijo,
 * porque quero vender esse sistema para várias pessoas. Tem loja para quem é
 * importante ter o Instagram; para mim não é."*
 *
 * Esta lista é o CATÁLOGO: diz o que existe e qual é o padrão. O que cada loja
 * decidiu diferente mora na tabela `campos_obrigatorios` (migration
 * 20260830100000), e só as exceções são gravadas — sem linha, vale o padrão
 * daqui. Assim, campo criado daqui a seis meses nasce valendo para todas as
 * lojas, sem migration de correção.
 *
 * O padrão é o comportamento de hoje da Rio Preto Games: no cliente, só o
 * nome; na OS, a lista que o Felipe ditou em 27/08. Ligar a configuração não
 * muda nada para ele até que mexa numa chavinha.
 */

export type Formulario = 'cliente' | 'os';

/**
 * Quando o campo nem aparece na tela, não pode ser cobrado.
 *
 * `pessoa_fisica` e `pessoa_juridica` existem porque o cadastro de cliente
 * troca metade dos campos conforme o tipo: CPF vira CNPJ, RG vira Inscrição
 * Estadual, e data de nascimento e gênero somem. Exigir "data de nascimento"
 * de uma empresa seria cobrar um campo que a pessoa não está vendo.
 */
export type Condicao = 'sempre' | 'pessoa_fisica' | 'pessoa_juridica';

export interface CampoConfiguravel {
  /** Nome do campo no formulário. É o que vai para a coluna `campo` do banco. */
  chave: string;
  /** Como o campo aparece na tela de configuração. */
  rotulo: string;
  /** Seção do formulário, para agrupar na tela de configuração. */
  grupo: string;
  /** Exigido quando a loja não configurou nada. */
  padrao: boolean;
  /**
   * Não pode ser desligado. São os campos que o BANCO recusa vazios — deixar
   * a loja desmarcar criaria um botão que produz erro técnico em inglês no
   * lugar de um aviso em português.
   */
  fixo?: boolean;
  /** Em que situação o campo aparece na tela. Padrão: sempre. */
  condicao?: Condicao;
  /** Aviso mostrado na tela de configuração, quando a escolha tem pegadinha. */
  alerta?: string;
}

const CLIENTE: CampoConfiguravel[] = [
  {
    chave: 'nome',
    rotulo: 'Nome completo (ou razão social)',
    grupo: 'Identificação',
    padrao: true,
    fixo: true,
    alerta: 'O banco recusa cliente sem nome, e a busca por cliente repetido se apoia nele.',
  },
  {
    chave: 'cpf_cnpj',
    rotulo: 'CPF',
    grupo: 'Identificação',
    padrao: false,
    condicao: 'pessoa_fisica',
  },
  {
    chave: 'cpf_cnpj_empresa',
    rotulo: 'CNPJ',
    grupo: 'Identificação',
    padrao: false,
    condicao: 'pessoa_juridica',
    alerta: 'É o mesmo campo do CPF, que troca de rótulo — por isso são duas chavinhas.',
  },
  { chave: 'rg', rotulo: 'RG', grupo: 'Identificação', padrao: false, condicao: 'pessoa_fisica' },
  {
    chave: 'inscricao_estadual',
    rotulo: 'Inscrição Estadual',
    grupo: 'Identificação',
    padrao: false,
    condicao: 'pessoa_juridica',
  },
  {
    chave: 'data_nascimento',
    rotulo: 'Data de nascimento',
    grupo: 'Identificação',
    padrao: false,
    condicao: 'pessoa_fisica',
  },
  {
    chave: 'genero',
    rotulo: 'Gênero',
    grupo: 'Identificação',
    padrao: false,
    condicao: 'pessoa_fisica',
    alerta: 'A opção "Não informado" passa a não valer como resposta.',
  },

  { chave: 'telefone', rotulo: 'Telefone / WhatsApp', grupo: 'Contato', padrao: false },
  {
    chave: 'telefone_extra',
    rotulo: 'Telefone extra',
    grupo: 'Contato',
    padrao: false,
    alerta: 'Exigir dois telefones de todo cliente costuma travar o balcão.',
  },
  { chave: 'email', rotulo: 'E-mail', grupo: 'Contato', padrao: false },
  { chave: 'instagram', rotulo: 'Instagram', grupo: 'Contato', padrao: false },
  { chave: 'site', rotulo: 'Link / site / outra rede', grupo: 'Contato', padrao: false },

  {
    chave: 'cep',
    rotulo: 'CEP',
    grupo: 'Endereço',
    padrao: false,
    alerta: 'É o mais barato do endereço: digitar o CEP já traz rua, bairro, cidade e estado.',
  },
  { chave: 'logradouro', rotulo: 'Rua', grupo: 'Endereço', padrao: false },
  {
    chave: 'numero',
    rotulo: 'Número',
    grupo: 'Endereço',
    padrao: false,
    alerta: 'É o único do endereço que o CEP nunca preenche. Casa sem número vira "S/N".',
  },
  { chave: 'bairro', rotulo: 'Bairro', grupo: 'Endereço', padrao: false },
  { chave: 'municipio', rotulo: 'Município', grupo: 'Endereço', padrao: false },
  { chave: 'estado', rotulo: 'Estado', grupo: 'Endereço', padrao: false },

  {
    chave: 'origem_id',
    rotulo: 'Como conheceu a loja',
    grupo: 'Relacionamento',
    padrao: false,
    alerta: 'Se a loja marcou uma origem como padrão, ela já vem escolhida e a exigência nunca dispara.',
  },
  { chave: 'motivo_compra_id', rotulo: 'Motivo da compra', grupo: 'Relacionamento', padrao: false },
];

const OS: CampoConfiguravel[] = [
  {
    chave: 'cliente_id',
    rotulo: 'Cliente',
    grupo: 'Quem',
    padrao: true,
    fixo: true,
    alerta: 'O banco recusa OS sem cliente — sem ele o aparelho fica na bancada sem dono.',
  },
  { chave: 'equipamento_id', rotulo: 'Equipamento', grupo: 'Aparelho', padrao: true },
  {
    chave: 'numero_serie',
    rotulo: 'IMEI / Nº de série',
    grupo: 'Aparelho',
    padrao: true,
    alerta: 'Cabo, fonte e controle antigo podem não ter número. Se isso travar o balcão, desligue aqui.',
  },
  { chave: 'marca_id', rotulo: 'Marca', grupo: 'Aparelho', padrao: true },
  { chave: 'modelo_id', rotulo: 'Modelo', grupo: 'Aparelho', padrao: true },
  { chave: 'cor_id', rotulo: 'Cor', grupo: 'Aparelho', padrao: false },
  { chave: 'memoria_id', rotulo: 'Memória / capacidade', grupo: 'Aparelho', padrao: false },
  {
    chave: 'defeito_cliente',
    rotulo: 'Problema informado pelo cliente',
    grupo: 'Check-in',
    padrao: true,
    fixo: true,
    alerta: 'O banco recusa OS sem defeito. Marcar um sintoma no checklist também vale como resposta.',
  },
  {
    chave: 'tem_senha',
    rotulo: 'Perguntar se o aparelho tem senha',
    grupo: 'Check-in',
    padrao: true,
    alerta: 'A PERGUNTA é que fica obrigatória. "Não tem senha" é resposta válida — o que não pode é ninguém perguntar.',
  },
  { chave: 'acessorios', rotulo: 'Acessórios que vieram junto', grupo: 'Check-in', padrao: false },
  { chave: 'condicoes', rotulo: 'Condição de entrada do aparelho', grupo: 'Check-in', padrao: false },
  { chave: 'vendedor_id', rotulo: 'Quem recebeu', grupo: 'Atendimento', padrao: true },
  {
    chave: 'tecnico_id',
    rotulo: 'Técnico responsável',
    grupo: 'Atendimento',
    padrao: false,
    alerta: 'Quem atende no balcão quase nunca sabe quem vai consertar — exigir aqui faz escolherem qualquer um.',
  },
  { chave: 'prazo_previsto', rotulo: 'Prazo prometido', grupo: 'Atendimento', padrao: true },
];

export const CAMPOS_POR_FORMULARIO: Record<Formulario, CampoConfiguravel[]> = {
  cliente: CLIENTE,
  os: OS,
};

export const NOME_DO_FORMULARIO: Record<Formulario, string> = {
  cliente: 'Cadastro de cliente',
  os: 'Abertura de Ordem de Serviço',
};

/** O padrão de fábrica, para o caso de a loja não ter configurado nada. */
export function padraoDoFormulario(formulario: Formulario): Record<string, boolean> {
  return Object.fromEntries(
    CAMPOS_POR_FORMULARIO[formulario].map((c) => [c.chave, c.padrao]),
  );
}

/**
 * Junta o padrão do código com o que a loja escolheu.
 *
 * Campo `fixo` ignora a configuração de propósito: é o que o banco recusa
 * vazio, e uma loja que o desligasse veria erro técnico no lugar de aviso.
 */
export function exigenciasDaLoja(
  formulario: Formulario,
  escolhas: Array<{ campo: string; obrigatorio: boolean }> | undefined,
): Record<string, boolean> {
  const resultado = padraoDoFormulario(formulario);
  const fixos = new Set(
    CAMPOS_POR_FORMULARIO[formulario].filter((c) => c.fixo).map((c) => c.chave),
  );

  for (const escolha of escolhas ?? []) {
    if (fixos.has(escolha.campo)) continue;
    if (!(escolha.campo in resultado)) continue; // campo que não existe mais
    resultado[escolha.campo] = escolha.obrigatorio;
  }
  return resultado;
}
