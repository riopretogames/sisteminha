import { describe, it, expect } from 'vitest';
import {
  soDigitos,
  mascaraCpfCnpj,
  mascaraTelefone,
  mascaraCep,
  cpfValido,
  cnpjValido,
  conferirCpfCnpj,
  telefoneIdentifica,
} from './documento';

/**
 * Conta de dígito verificador é o tipo de coisa que ninguém confere de olho —
 * e que, se estiver errada, recusa cliente de verdade no balcão. Por isso tem
 * teste, mesmo o projeto ainda quase não tendo.
 *
 * Os documentos abaixo são números válidos pela conta, não de pessoas reais.
 */

describe('soDigitos', () => {
  it('tira pontuação de documento e telefone', () => {
    expect(soDigitos('123.456.789-09')).toBe('12345678909');
    expect(soDigitos('(17) 99999-1234')).toBe('17999991234');
  });

  it('aguenta vazio e nulo sem quebrar', () => {
    expect(soDigitos('')).toBe('');
    expect(soDigitos(null)).toBe('');
    expect(soDigitos(undefined)).toBe('');
  });
});

describe('cpfValido', () => {
  it('aceita CPF com dígito verificador correto', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
  });

  it('recusa erro de digitação', () => {
    expect(cpfValido('529.982.247-24')).toBe(false);
  });

  it('recusa número repetido, que passa na conta mas não existe', () => {
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('000.000.000-00')).toBe(false);
  });

  it('recusa tamanho errado', () => {
    expect(cpfValido('529.982.247')).toBe(false);
  });
});

describe('cnpjValido', () => {
  it('aceita CNPJ com dígito verificador correto', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
  });

  it('recusa erro de digitação e número repetido', () => {
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('11.111.111/1111-11')).toBe(false);
  });
});

describe('conferirCpfCnpj', () => {
  it('deixa passar campo vazio — documento é opcional no cadastro', () => {
    expect(conferirCpfCnpj('')).toBeNull();
    expect(conferirCpfCnpj('   ')).toBeNull();
  });

  it('não reclama de documento correto', () => {
    expect(conferirCpfCnpj('529.982.247-25')).toBeNull();
    expect(conferirCpfCnpj('11.222.333/0001-81')).toBeNull();
  });

  it('explica o que está errado', () => {
    expect(conferirCpfCnpj('529.982.247-24')).toMatch(/CPF inválido/);
    expect(conferirCpfCnpj('11.222.333/0001-82')).toMatch(/CNPJ inválido/);
    expect(conferirCpfCnpj('1234')).toMatch(/incompleto/);
  });
});

describe('máscaras', () => {
  it('formata CPF enquanto digita', () => {
    expect(mascaraCpfCnpj('529')).toBe('529');
    expect(mascaraCpfCnpj('529982')).toBe('529.982');
    expect(mascaraCpfCnpj('52998224725')).toBe('529.982.247-25');
  });

  it('vira CNPJ quando passa de 11 dígitos', () => {
    expect(mascaraCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('não deixa digitar além do tamanho do documento', () => {
    expect(soDigitos(mascaraCpfCnpj('1122233300018199999'))).toHaveLength(14);
  });

  it('formata celular e fixo', () => {
    expect(mascaraTelefone('17999991234')).toBe('(17) 99999-1234');
    expect(mascaraTelefone('1733334444')).toBe('(17) 3333-4444');
  });

  it('formata CEP', () => {
    expect(mascaraCep('15015000')).toBe('15015-000');
    expect(mascaraCep('15015')).toBe('15015');
  });
});

describe('telefoneIdentifica', () => {
  it('exige 8 dígitos, igual à trava do banco', () => {
    expect(telefoneIdentifica('17999991234')).toBe(true);
    expect(telefoneIdentifica('33334444')).toBe(true);
    expect(telefoneIdentifica('9999')).toBe(false);
    expect(telefoneIdentifica('')).toBe(false);
  });
});
