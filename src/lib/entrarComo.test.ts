import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHAVE_ENTROU_COMO,
  gravarEntrouComo,
  lerEntrouComo,
  limparEntrouComo,
  marcaValePara,
  mensagemDoAcesso,
  montarLinkDeAcesso,
  primeiroNomeDe,
} from './entrarComo';

const MARCA = {
  alvoId: 'u-richard',
  nome: 'Richard Sanches',
  por: 'Felipe Bottaro',
  quando: '2026-09-24T15:00:00Z',
};

describe('Entrar como esta pessoa', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('grava, lê e limpa a marca, com o id da pessoa', () => {
    expect(lerEntrouComo()).toBeNull();
    gravarEntrouComo(MARCA);
    expect(lerEntrouComo()).toEqual(MARCA);
    limparEntrouComo();
    expect(lerEntrouComo()).toBeNull();
  });

  it('a marca mora no mesmo lugar da sessão de login (o navegador inteiro), não só na aba', () => {
    // Achado 16 da revisão de 24/09: marca na aba e sessão no navegador
    // deixavam as outras abas como o Richard, sem faixa.
    gravarEntrouComo(MARCA);
    expect(localStorage.getItem(CHAVE_ENTROU_COMO)).not.toBeNull();
    expect(sessionStorage.getItem(CHAVE_ENTROU_COMO)).toBeNull();
  });

  it('a faixa só vale para a pessoa da marca', () => {
    // Achado 20: o Felipe saiu pelo menu e entrou com a própria senha — a
    // faixa não pode dizer que ele é o Richard.
    expect(marcaValePara(MARCA, 'u-richard')).toEqual(MARCA);
    expect(marcaValePara(MARCA, 'u-felipe')).toBeNull();
    expect(marcaValePara(MARCA, null)).toBeNull();
    expect(marcaValePara(null, 'u-richard')).toBeNull();
  });

  it('marca estragada, ou da versão antiga (sem o id), vira "sem marca", não erro', () => {
    localStorage.setItem(CHAVE_ENTROU_COMO, '{isso nao e json');
    expect(lerEntrouComo()).toBeNull();
    localStorage.setItem(CHAVE_ENTROU_COMO, JSON.stringify({ por: 'x' }));
    expect(lerEntrouComo()).toBeNull();
    localStorage.setItem(CHAVE_ENTROU_COMO, JSON.stringify({ nome: 'Richard', por: 'Felipe' }));
    expect(lerEntrouComo()).toBeNull();
  });

  it('limpar também apaga a marca que a versão antiga deixou na aba', () => {
    sessionStorage.setItem(CHAVE_ENTROU_COMO, JSON.stringify({ nome: 'Richard' }));
    limparEntrouComo();
    expect(sessionStorage.getItem(CHAVE_ENTROU_COMO)).toBeNull();
  });

  it('monta o link de acesso no dia a dia e no ar', () => {
    // No ar o sistema mora em /sisteminha/; no dia a dia a base é "/".
    expect(montarLinkDeAcesso('https://riopretogames.com.br', '/sisteminha/', 'abc123')).toBe(
      'https://riopretogames.com.br/sisteminha/login?acesso=abc123',
    );
    expect(montarLinkDeAcesso('http://localhost:8080', '/', 'a b')).toBe(
      'http://localhost:8080/login?acesso=a%20b',
    );
  });

  it('o botão usa só o primeiro nome', () => {
    expect(primeiroNomeDe('Richard Sanches')).toBe('Richard');
    expect(primeiroNomeDe('  Leo  ')).toBe('Leo');
  });
});

describe('mensagemDoAcesso — nada em inglês na tela (achado 23)', () => {
  it('traduz o acesso vencido do login', () => {
    expect(mensagemDoAcesso(new Error('Email link is invalid or has expired'))).toBe(
      'Esse acesso não vale mais (ele vale por uma hora e só uma vez). Peça outro.',
    );
    expect(mensagemDoAcesso({ message: 'Token has expired or is invalid' })).toMatch(/não vale mais/);
  });

  it('traduz a recusa da área de transferência', () => {
    const recusa = new Error('Document is not focused.');
    recusa.name = 'NotAllowedError';
    expect(mensagemDoAcesso(recusa)).toBe('O navegador não deixou copiar o link sozinho.');
  });

  it('traduz a falta de internet', () => {
    expect(mensagemDoAcesso(new TypeError('Failed to fetch'))).toMatch(/Sem conexão/);
  });

  it('a frase da nossa função de servidor passa como está', () => {
    expect(mensagemDoAcesso(new Error('Esse usuário não é da sua loja.'))).toBe('Esse usuário não é da sua loja.');
  });

  it('o resto em inglês vira a frase padrão', () => {
    expect(mensagemDoAcesso(new Error('Edge Function returned a non-2xx status code'))).toMatch(
      /Algo deu errado no sistema/,
    );
  });
});
