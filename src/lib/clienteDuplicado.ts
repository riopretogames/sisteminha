import { soDigitos } from '@/lib/documento';

/**
 * Quando um cadastro de cliente com nome repetido pode nascer.
 *
 * A regra de cliente único é do Felipe (08/08) e foi REVISTA por ele em 23/08,
 * depois de testar e escrever: *"dá para criar quantos quiser com o mesmo
 * nome"*. Até ali, nome igual só avisava.
 *
 * O que mudou, e o que NÃO mudou:
 *
 *   • Documento e telefone continuam sendo recusados pelo BANCO — isso nunca
 *     dependeu da tela e segue igual.
 *   • Nome repetido agora TRAVA o cadastro cru: nome e mais nada.
 *   • Informar telefone ou CPF libera.
 *
 * A última linha é o ponto todo. Recusar nome repetido sempre pareceria mais
 * seguro e seria pior: dois "João Silva" de verdade existem, e uma loja que
 * não consegue cadastrar o segundo acaba com "Joao Silva 2" no sistema — o que
 * é pior que duas fichas, porque ninguém acha depois nem por nome nem por
 * telefone.
 *
 * Exigir um dado que distingue resolve os dois casos com uma regra só: o
 * cadastro de balcão feito com pressa é barrado, e o homônimo de verdade passa
 * assim que alguém digita o telefone dele.
 */

/** O mínimo do formulário que esta regra precisa enxergar. */
export interface DadosParaDuplicidade {
  cpf_cnpj?: string | null;
  telefone?: string | null;
  telefone_extra?: string | null;
}

/**
 * Telefone com menos de 10 dígitos (DDD + número) não distingue ninguém, então
 * não vale como prova de que é outra pessoa.
 */
const TELEFONE_MINIMO = 10;

export function temDadoQueDistingue(form: DadosParaDuplicidade): boolean {
  if (soDigitos(form.cpf_cnpj || '').length > 0) return true;
  if (soDigitos(form.telefone || '').length >= TELEFONE_MINIMO) return true;
  if (soDigitos(form.telefone_extra || '').length >= TELEFONE_MINIMO) return true;
  return false;
}

/**
 * Pode gravar este cadastro novo?
 *
 * @param achouNomeIgual já existe alguém com o mesmo nome
 * @param editando estamos editando uma ficha que já existe (aí a regra não se
 *   aplica: a pessoa não está criando nada, e travar impediria de corrigir o
 *   nome de quem já está cadastrado)
 */
export function podeGravarClienteNovo(
  form: DadosParaDuplicidade,
  achouNomeIgual: boolean,
  editando = false,
): boolean {
  if (editando) return true;
  if (!achouNomeIgual) return true;
  return temDadoQueDistingue(form);
}
