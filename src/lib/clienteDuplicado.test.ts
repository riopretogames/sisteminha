import { describe, it, expect } from 'vitest';
import {
  podeGravarClienteNovo,
  temDadoQueDistingue,
  normalizarNome,
  juntarSemelhantes,
  separarRepetidosPorNome,
} from './clienteDuplicado';

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


/**
 * Achados de 24/09 na regra de cliente único.
 */
describe('nome como a regra compara', () => {
  it('"Joao Silva" e "João  Silva" são o mesmo nome', () => {
    expect(normalizarNome('Joao Silva')).toBe(normalizarNome('João  Silva'));
    expect(normalizarNome('  JOÃO SILVA ')).toBe('joao silva');
  });

  it('ç e acentos somem, o resto fica', () => {
    expect(normalizarNome('Conceição Aparecida')).toBe('conceicao aparecida');
  });
});

describe('juntar as procuras por telefone principal e extra', () => {
  it('não repete o cliente e fica com o motivo mais forte', () => {
    const r = juntarSemelhantes(
      [{ id: 'c1', motivo: 'nome' }],
      [{ id: 'c1', motivo: 'telefone' }, { id: 'c2', motivo: 'telefone' }],
    );
    expect(r).toHaveLength(2);
    expect(r.find((c) => c.id === 'c1')!.motivo).toBe('telefone');
  });
});

describe('importação respeita a regra do nome repetido', () => {
  const linha = (nome: string, telefone = '', cpfCnpj = '') => ({ nome, telefone, cpfCnpj });

  it('nome que já existe na base, sem telefone nem CPF, não é gravado', () => {
    const r = separarRepetidosPorNome([linha('João Silva')], ['Joao Silva']);
    expect(r.paraGravar).toHaveLength(0);
    expect(r.repetidos.map((l) => l.nome)).toEqual(['João Silva']);
  });

  it('o mesmo nome duas vezes na planilha: o segundo é repetido', () => {
    const r = separarRepetidosPorNome([linha('Maria Souza'), linha('maria  souza')], []);
    expect(r.paraGravar.map((l) => l.nome)).toEqual(['Maria Souza']);
    expect(r.repetidos).toHaveLength(1);
  });

  it('com telefone, o homônimo de verdade entra — o banco confere o telefone', () => {
    const r = separarRepetidosPorNome([linha('João Silva', '(17) 99262-4169')], ['João Silva']);
    expect(r.paraGravar).toHaveLength(1);
  });

  it('nome novo sem telefone entra normalmente', () => {
    const r = separarRepetidosPorNome([linha('Cliente Novo')], ['Outro Cliente']);
    expect(r.paraGravar).toHaveLength(1);
  });
});
