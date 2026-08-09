/**
 * Documentos e contatos brasileiros: máscara, validação e busca de endereço.
 *
 * Por que isso é um arquivo e não código solto na tela: a mesma normalização
 * ("só os dígitos") existe do lado do banco, na função `somente_digitos`, e é
 * ela que decide se dois cadastros são o mesmo cliente. Se a tela normalizasse
 * de um jeito e o banco de outro, o vendedor veria "cliente novo" e levaria um
 * erro de duplicado no momento de salvar.
 */

/** Tira tudo que não é número. Espelha `public.somente_digitos` no banco. */
export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/* ───────────────────────────── CPF / CNPJ ───────────────────────────────── */

/** Aplica a máscara conforme o tamanho: até 11 dígitos vira CPF, acima, CNPJ. */
export function mascaraCpfCnpj(valor: string): string {
  const d = soDigitos(valor).slice(0, 14);

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }

  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/**
 * Confere os dígitos verificadores do CPF.
 *
 * Não é frescura de programador: o CPF tem dois dígitos no fim que são conta
 * matemática dos outros nove. Errar um número na digitação quase sempre quebra
 * essa conta — então isso pega erro de dedo antes de virar cadastro errado que
 * ninguém mais encontra.
 */
export function cpfValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 11) return false;
  // 111.111.111-11 e afins passam na conta, mas não existem.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** Mesma ideia do CPF, com os pesos do CNPJ. */
export function cnpjValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const digito = (ate: number): number => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(d[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

/**
 * Diz o que há de errado com o documento, ou `null` se está bom.
 *
 * Campo vazio devolve `null` de propósito: documento é opcional no cadastro —
 * cliente de balcão muitas vezes não quer dar CPF, e exigir empurraria a
 * equipe a vender sem cliente nenhum.
 */
export function conferirCpfCnpj(valor: string): string | null {
  const d = soDigitos(valor);
  if (!d) return null;

  if (d.length === 11) {
    return cpfValido(d) ? null : 'CPF inválido — confira os números digitados.';
  }
  if (d.length === 14) {
    return cnpjValido(d) ? null : 'CNPJ inválido — confira os números digitados.';
  }
  return 'Documento incompleto: CPF tem 11 números e CNPJ tem 14.';
}

/* ───────────────────────────── Telefone ─────────────────────────────────── */

/** (17) 99999-1234 para celular, (17) 3333-4444 para fixo. */
export function mascaraTelefone(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Um telefone só "identifica" alguém a partir de 8 dígitos — mesmo corte que a
 * trava de duplicidade usa no banco. Abaixo disso é ramal, número pela metade
 * ou anotação, e recusar cadastro por causa disso faria a equipe perder
 * cliente legítimo.
 */
export function telefoneIdentifica(valor: string): boolean {
  return soDigitos(valor).length >= 8;
}

/* ─────────────────────────────── CEP ────────────────────────────────────── */

export function mascaraCep(valor: string): string {
  const d = soDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export interface EnderecoPorCep {
  estado: string;
  municipio: string;
  bairro: string;
  logradouro: string;
}

/**
 * Busca o endereço pelo CEP nos Correios (via ViaCEP, serviço público e
 * gratuito).
 *
 * Vale o consumo: preencher endereço à mão no balcão é o que faz a equipe
 * pular o campo. Devolve `null` em qualquer problema — CEP inexistente,
 * internet caída, serviço fora do ar — e nesse caso a tela simplesmente deixa
 * digitar normalmente. Nada aqui bloqueia o cadastro.
 */
export async function buscarEnderecoPorCep(cep: string): Promise<EnderecoPorCep | null> {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!resposta.ok) return null;

    const dados = await resposta.json();
    if (dados?.erro) return null;

    return {
      estado: dados.uf ?? '',
      municipio: dados.localidade ?? '',
      bairro: dados.bairro ?? '',
      logradouro: dados.logradouro ?? '',
    };
  } catch {
    return null;
  }
}
