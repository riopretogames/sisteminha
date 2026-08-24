import { describe, it, expect } from 'vitest';
import { podeGravarClienteNovo, temDadoQueDistingue } from './clienteDuplicado';

/**
 * A regra que o Felipe pediu em 23/08, depois de testar e achar a falha:
 * *"dá para criar quantos quiser com o mesmo nome"*.
 */

const SO_NOME = {};
const COM_TELEFONE = { telefone: '(17) 99262-4169' };
const COM_CPF = { cpf_cnpj: '123.456.789-00' };

describe('cadastro de cliente com nome repetido', () => {
  it('NÃO grava quando só tem o nome — era a falha relatada', () => {
    expect(podeGravarClienteNovo(SO_NOME, true)).toBe(false);
  });

  it('grava quando o nome é novo, mesmo sem telefone', () => {
    // O cadastro de balcão em dois segundos continua funcionando: só nome é
    // suficiente enquanto ninguém mais tiver aquele nome.
    expect(podeGravarClienteNovo(SO_NOME, false)).toBe(true);
  });

  it('grava com nome repetido SE tiver telefone — o João Silva de verdade', () => {
    // Recusar sempre faria a equipe escrever "Joao Silva 2", que é pior:
    // ninguém acha depois, nem por nome nem por telefone.
    expect(podeGravarClienteNovo(COM_TELEFONE, true)).toBe(true);
  });

  it('grava com nome repetido SE tiver CPF', () => {
    expect(podeGravarClienteNovo(COM_CPF, true)).toBe(true);
  });

  it('telefone pela metade NÃO libera', () => {
    // Menos de 10 dígitos não distingue ninguém, então não é prova de nada.
    expect(podeGravarClienteNovo({ telefone: '(17) 9926' }, true)).toBe(false);
    expect(podeGravarClienteNovo({ telefone: '17' }, true)).toBe(false);
  });

  it('o telefone extra também vale como prova', () => {
    expect(podeGravarClienteNovo({ telefone_extra: '1732345678' }, true)).toBe(true);
  });

  it('EDITAR ficha existente nunca é travado', () => {
    // Senão não daria para corrigir o nome de quem já está cadastrado — a
    // pessoa não está criando nada, está arrumando o que existe.
    expect(podeGravarClienteNovo(SO_NOME, true, true)).toBe(true);
  });

  it('campo vazio, nulo ou com máscara não confunde a conta', () => {
    expect(temDadoQueDistingue({})).toBe(false);
    expect(temDadoQueDistingue({ telefone: '', cpf_cnpj: null })).toBe(false);
    expect(temDadoQueDistingue({ telefone: '(  )      -    ' })).toBe(false);
    expect(temDadoQueDistingue({ telefone: '(17) 3234-5678' })).toBe(true);
  });
});
