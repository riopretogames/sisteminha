import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHAVE_ENTROU_COMO,
  gravarEntrouComo,
  lerEntrouComo,
  limparEntrouComo,
  montarLinkDeAcesso,
  primeiroNomeDe,
} from './entrarComo';

describe('Entrar como esta pessoa', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('grava, lê e limpa a marca desta aba', () => {
    expect(lerEntrouComo()).toBeNull();
    gravarEntrouComo({ nome: 'Richard Sanches', por: 'Felipe Bottaro', quando: '2026-09-24T15:00:00Z' });
    expect(lerEntrouComo()).toEqual({
      nome: 'Richard Sanches',
      por: 'Felipe Bottaro',
      quando: '2026-09-24T15:00:00Z',
    });
    limparEntrouComo();
    expect(lerEntrouComo()).toBeNull();
  });

  it('marca estragada no armazenamento vira "sem marca", não erro', () => {
    sessionStorage.setItem(CHAVE_ENTROU_COMO, '{isso nao e json');
    expect(lerEntrouComo()).toBeNull();
    sessionStorage.setItem(CHAVE_ENTROU_COMO, JSON.stringify({ por: 'x' }));
    expect(lerEntrouComo()).toBeNull();
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
