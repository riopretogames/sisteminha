import { describe, it, expect } from 'vitest';
import { enterDeveConfirmar, escDeveFechar, ehCampoDeTexto } from './atalhos';

const campo = { tag: 'input', tipo: 'text' };
const ok = { podeConfirmar: true };

describe('enterDeveConfirmar', () => {
  it('confirma quando o foco está num campo comum e dá para confirmar', () => {
    expect(enterDeveConfirmar(campo, ok)).toBe(true);
  });

  it('NÃO confirma dentro de texto de várias linhas', () => {
    // Roubar o Enter ali impede de escrever a segunda linha da observação.
    expect(enterDeveConfirmar({ tag: 'textarea' }, ok)).toBe(false);
    expect(enterDeveConfirmar({ tag: 'div', editavel: true }, ok)).toBe(false);
  });

  it('NÃO confirma com o foco num botão', () => {
    // O navegador já clica no botão focado. Confirmar por cima dispararia
    // duas ações, e a do botão focado pode ser "Cancelar".
    expect(enterDeveConfirmar({ tag: 'button' }, ok)).toBe(false);
    expect(enterDeveConfirmar({ tag: 'a' }, ok)).toBe(false);
  });

  it('NÃO confirma com lista suspensa aberta', () => {
    // Escolher um produto no PDV fecharia a venda inteira.
    expect(enterDeveConfirmar(campo, { ...ok, listaAberta: true })).toBe(false);
  });

  it('NÃO confirma quando o botão está desabilitado', () => {
    // Enter não pode passar por cima de validação que o clique respeita.
    expect(enterDeveConfirmar(campo, { podeConfirmar: false })).toBe(false);
  });

  it('NÃO confirma ação sem volta', () => {
    // Apagar usuário não é coisa para acontecer de raspão.
    expect(enterDeveConfirmar(campo, { ...ok, perigoso: true })).toBe(false);
  });

  it('NÃO confirma se outro diálogo por cima já tratou', () => {
    expect(enterDeveConfirmar(campo, { ...ok, jaTratado: true })).toBe(false);
  });

  it('na dúvida, recusa: cada motivo sozinho já basta', () => {
    const motivos = [
      { ...ok, listaAberta: true },
      { ...ok, perigoso: true },
      { ...ok, jaTratado: true },
      { podeConfirmar: false },
    ];
    for (const ctx of motivos) {
      expect(enterDeveConfirmar(campo, ctx)).toBe(false);
    }
  });
});

describe('escDeveFechar', () => {
  it('fecha por padrão — cancelar é seguro', () => {
    expect(escDeveFechar({})).toBe(true);
  });

  it('NÃO fecha com lista suspensa aberta', () => {
    // Ali o Esc fecha a LISTA. Fechar o diálogo junto perderia tudo que a
    // pessoa digitou, por ela ter desistido de escolher um item.
    expect(escDeveFechar({ listaAberta: true })).toBe(false);
  });

  it('NÃO fecha se outro já tratou', () => {
    expect(escDeveFechar({ jaTratado: true })).toBe(false);
  });
});

describe('ehCampoDeTexto', () => {
  it('reconhece onde a pessoa está digitando', () => {
    expect(ehCampoDeTexto('input', 'text')).toBe(true);
    expect(ehCampoDeTexto('input', 'email')).toBe(true);
    expect(ehCampoDeTexto('input', 'number')).toBe(true);
    expect(ehCampoDeTexto('input', undefined)).toBe(true);
    expect(ehCampoDeTexto('textarea')).toBe(true);
  });

  it('não confunde caixa de marcar e botão com campo de texto', () => {
    expect(ehCampoDeTexto('input', 'checkbox')).toBe(false);
    expect(ehCampoDeTexto('input', 'radio')).toBe(false);
    expect(ehCampoDeTexto('input', 'submit')).toBe(false);
    expect(ehCampoDeTexto('button')).toBe(false);
    expect(ehCampoDeTexto('div')).toBe(false);
  });
});
