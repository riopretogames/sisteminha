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

/**
 * Nome como a regra de cliente único o compara: sem acento, sem maiúscula e
 * sem espaço sobrando.
 *
 * Achado de 24/09: o banco comparava só minúscula e espaço das pontas, então
 * "Joao Silva" não batia com "João Silva", nem "João  Silva" (dois espaços) —
 * justamente o cadastro de balcão feito com pressa que a regra de 23/08 quer
 * barrar. É a MESMA normalização da função `buscar_clientes_semelhantes` no
 * banco (migration 20260924163000); se uma mudar, a outra muda junto.
 */
export function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quanto pesa cada motivo de "já existe": documento e telefone o banco recusa. */
const PESO_DO_MOTIVO: Record<string, number> = { documento: 3, telefone: 2, nome: 1 };

/**
 * Junta os cadastros parecidos achados em mais de uma procura (telefone
 * principal, telefone extra), sem repetir ninguém e ficando com o motivo mais
 * forte de cada um.
 *
 * Existe porque a procura prévia olhava só o telefone principal (achado de
 * 24/09). O banco confere TODOS os telefones, então um telefone extra de outro
 * cliente só aparecia ao salvar, como erro cru — sem o "Usar este cadastro"
 * que a regra de cliente único manda oferecer.
 */
export function juntarSemelhantes<T extends { id: string; motivo: string }>(
  ...listas: ReadonlyArray<ReadonlyArray<T>>
): T[] {
  const porId = new Map<string, T>();
  for (const lista of listas) {
    for (const c of lista) {
      const atual = porId.get(c.id);
      if (!atual || (PESO_DO_MOTIVO[c.motivo] ?? 0) > (PESO_DO_MOTIVO[atual.motivo] ?? 0)) {
        porId.set(c.id, c);
      }
    }
  }
  return [...porId.values()];
}

/** Uma linha da planilha de importação, do ponto de vista desta regra. */
export interface LinhaParaImportar {
  nome: string;
  telefone: string;
  cpfCnpj: string;
}

/**
 * Separa, numa importação, as linhas que a regra de cliente único barraria.
 *
 * A regra do Felipe ("nome igual sem telefone nem CPF não cria cadastro")
 * morava só no formulário; o banco barra CPF e telefone, mas não nome. A
 * importação grava direto, então importar a mesma planilha duas vezes — ou uma
 * planilha com clientes que já existem só pelo nome — criava fichas repetidas
 * (achado de 24/09).
 *
 * Compara com a base E com a própria planilha: o segundo "João Silva" sem
 * telefone da mesma planilha também é repetido. Linha com telefone ou CPF
 * passa — o banco confere esses dois, e é assim que o homônimo de verdade
 * entra.
 *
 * @param nomesDaBase nomes dos clientes ativos que já existem
 */
export function separarRepetidosPorNome<T extends LinhaParaImportar>(
  linhas: ReadonlyArray<T>,
  nomesDaBase: Iterable<string>,
): { paraGravar: T[]; repetidos: T[] } {
  const conhecidos = new Set<string>();
  for (const n of nomesDaBase) conhecidos.add(normalizarNome(n));

  const paraGravar: T[] = [];
  const repetidos: T[] = [];
  for (const linha of linhas) {
    const nome = normalizarNome(linha.nome);
    const distingue = temDadoQueDistingue({ telefone: linha.telefone, cpf_cnpj: linha.cpfCnpj });
    if (!distingue && conhecidos.has(nome)) {
      repetidos.push(linha);
      continue;
    }
    paraGravar.push(linha);
    conhecidos.add(nome);
  }
  return { paraGravar, repetidos };
}
