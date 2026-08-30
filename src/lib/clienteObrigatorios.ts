import { soDigitos } from '@/lib/documento';
import { padraoDoFormulario } from '@/config/camposObrigatorios';

/**
 * O que a loja exige no cadastro de cliente.
 *
 * Pedido do Felipe em 28/08, olhando a tela: *"aqui eu consigo criar o
 * cadastro somente com o nome completo. Quero poder escolher quais campos vou
 * ter como obrigação, porque tem loja para quem é importante ter o Instagram;
 * para mim não é."*
 *
 * A lista do que é exigido vem de Configurações > Campos Obrigatórios. Sem
 * configuração nenhuma, vale o padrão de fábrica — só o nome, exatamente como
 * o sistema sempre se comportou.
 *
 * DUAS REGRAS QUE PARECEM DETALHE E NÃO SÃO
 *
 * 1. **Campo escondido nunca é cobrado.** O cadastro troca metade dos campos
 *    conforme o tipo de pessoa: CPF vira CNPJ, RG vira Inscrição Estadual, e
 *    data de nascimento e gênero somem quando o cliente é empresa. Cobrar
 *    "data de nascimento" de uma empresa seria pedir um campo que a pessoa não
 *    está vendo — ela ficaria procurando na tela.
 *
 * 2. **"Não informado" não é resposta.** As listas de origem e motivo têm essa
 *    opção, que grava vazio. Se a loja exige o campo, escolher "não informado"
 *    não pode valer como preenchido, senão a exigência é decorativa.
 */

export interface DadosDoCliente {
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
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  estado: string;
  origem_id: string;
  motivo_compra_id: string;
}

export interface CampoFaltandoNoCliente {
  campo: string;
  titulo: string;
  comoResolver: string;
}

const PADRAO_DA_CASA: Record<string, boolean> = padraoDoFormulario('cliente');

/** Rótulo de cada campo, como o atendente lê na tela. */
const ROTULO: Record<string, string> = {
  nome: 'nome',
  cpf_cnpj: 'CPF',
  cpf_cnpj_empresa: 'CNPJ',
  rg: 'RG',
  inscricao_estadual: 'Inscrição Estadual',
  data_nascimento: 'data de nascimento',
  genero: 'gênero',
  telefone: 'telefone',
  telefone_extra: 'telefone extra',
  email: 'e-mail',
  instagram: 'Instagram',
  site: 'link / site',
  cep: 'CEP',
  logradouro: 'rua',
  numero: 'número',
  bairro: 'bairro',
  municipio: 'município',
  estado: 'estado',
  origem_id: 'como conheceu a loja',
  motivo_compra_id: 'motivo da compra',
};

export function faltandoNoCliente(
  dados: DadosDoCliente,
  exigidos: Record<string, boolean> = PADRAO_DA_CASA,
): CampoFaltandoNoCliente[] {
  const pessoaFisica = dados.tipo_pessoa === 'fisica';
  const exige = (campo: string) => exigidos[campo] === true;
  const falta: CampoFaltandoNoCliente[] = [];

  const cobrar = (campo: string, vazio: boolean, comoResolver: string) => {
    if (!vazio) return;
    falta.push({
      campo,
      titulo: `Falta o ${ROTULO[campo] ?? campo}`,
      comoResolver,
    });
  };

  // O nome não consulta a configuração: o banco recusa cliente sem nome.
  if (!dados.nome.trim()) {
    falta.push({
      campo: 'nome',
      titulo: pessoaFisica ? 'Falta o nome' : 'Falta a razão social',
      comoResolver: pessoaFisica ? 'Informe o nome do cliente.' : 'Informe a razão social.',
    });
  }

  // Documento: um campo só na memória, dois interruptores na configuração,
  // porque exigir "CPF" de uma empresa não faz sentido nenhum.
  const chaveDoDocumento = pessoaFisica ? 'cpf_cnpj' : 'cpf_cnpj_empresa';
  if (exige(chaveDoDocumento) && !soDigitos(dados.cpf_cnpj)) {
    falta.push({
      campo: 'cpf_cnpj',
      titulo: pessoaFisica ? 'Falta o CPF' : 'Falta o CNPJ',
      comoResolver: pessoaFisica
        ? 'Informe o CPF do cliente.'
        : 'Informe o CNPJ da empresa.',
    });
  }

  if (pessoaFisica) {
    if (exige('rg')) cobrar('rg', !dados.rg.trim(), 'Informe o RG do cliente.');
    if (exige('data_nascimento')) {
      cobrar('data_nascimento', !dados.data_nascimento, 'Informe a data de nascimento.');
    }
    if (exige('genero')) {
      // "Não informado" grava vazio: escolher isso não conta como resposta.
      cobrar('genero', !dados.genero, 'Escolha o gênero — "Não informado" não vale aqui.');
    }
  } else if (exige('inscricao_estadual')) {
    cobrar('inscricao_estadual', !dados.inscricao_estadual.trim(),
      'Informe a Inscrição Estadual, ou desligue a exigência em Configurações.');
  }

  if (exige('telefone')) {
    cobrar('telefone', !soDigitos(dados.telefone), 'Informe o telefone / WhatsApp.');
  }
  if (exige('telefone_extra')) {
    cobrar('telefone_extra', !soDigitos(dados.telefone_extra), 'Informe o segundo telefone.');
  }
  if (exige('email')) cobrar('email', !dados.email.trim(), 'Informe o e-mail do cliente.');
  if (exige('instagram')) cobrar('instagram', !dados.instagram.trim(), 'Informe o @ do cliente.');
  if (exige('site')) cobrar('site', !dados.site.trim(), 'Informe o link.');

  if (exige('cep')) {
    cobrar('cep', !soDigitos(dados.cep),
      'Informe o CEP — ele preenche rua, bairro, município e estado sozinho.');
  }
  if (exige('logradouro')) cobrar('logradouro', !dados.logradouro.trim(), 'Informe a rua.');
  if (exige('numero')) {
    cobrar('numero', !dados.numero.trim(), 'Informe o número. Se não tiver, escreva S/N.');
  }
  if (exige('bairro')) cobrar('bairro', !dados.bairro.trim(), 'Informe o bairro.');
  if (exige('municipio')) cobrar('municipio', !dados.municipio.trim(), 'Informe o município.');
  if (exige('estado')) cobrar('estado', !dados.estado.trim(), 'Informe o estado (duas letras).');

  if (exige('origem_id')) {
    cobrar('origem_id', !dados.origem_id, 'Escolha como o cliente conheceu a loja.');
  }
  if (exige('motivo_compra_id')) {
    cobrar('motivo_compra_id', !dados.motivo_compra_id, 'Escolha o motivo da compra.');
  }

  return falta;
}
