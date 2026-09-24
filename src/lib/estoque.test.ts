import { describe, it, expect } from 'vitest';
import {
  estoqueCritico,
  estoqueZerado,
  faltaParaOMinimo,
  numeroDoCampo,
  inteiroOu,
  quantidadeValida,
  precoValido,
  aguardandoRevisao,
} from './estoque';

describe('estoque crítico', () => {
  it('abaixo do mínimo é crítico', () => {
    expect(estoqueCritico({ estoque_atual: 1, estoque_minimo: 3 })).toBe(true);
  });

  it('exatamente no mínimo também é crítico — é o momento de repor', () => {
    expect(estoqueCritico({ estoque_atual: 3, estoque_minimo: 3 })).toBe(true);
  });

  it('acima do mínimo não é', () => {
    expect(estoqueCritico({ estoque_atual: 4, estoque_minimo: 3 })).toBe(false);
  });

  it('mínimo 0 é "não se repõe": seminovo vendido (estoque 0) sai do alerta', () => {
    // O caso real de 24/09: "Ps5 slim" e "PS4 TESTE", peças únicas de troca,
    // ficavam para sempre como "Zerado" no Estoque Crítico.
    expect(estoqueCritico({ estoque_atual: 0, estoque_minimo: 0 })).toBe(false);
    expect(estoqueCritico({ estoque_atual: 1, estoque_minimo: 0 })).toBe(false);
  });

  it('mínimo 0 com estoque NEGATIVO volta ao alerta — vendeu o que não tinha', () => {
    expect(estoqueCritico({ estoque_atual: -1, estoque_minimo: 0 })).toBe(true);
  });

  it('produto sem mínimo cadastrado vale como mínimo 0', () => {
    expect(estoqueCritico({ estoque_atual: 5, estoque_minimo: null })).toBe(false);
    expect(estoqueCritico({ estoque_atual: 0, estoque_minimo: null })).toBe(false);
    expect(estoqueCritico({ estoque_atual: -2, estoque_minimo: null })).toBe(true);
  });

  it('mínimo 1 com estoque 0 continua crítico (o padrão de todo produto novo)', () => {
    expect(estoqueCritico({ estoque_atual: 0, estoque_minimo: 1 })).toBe(true);
  });

  it('nulo não vira NaN', () => {
    expect(estoqueCritico({ estoque_atual: null, estoque_minimo: null })).toBe(false);
    expect(estoqueCritico({ estoque_atual: null, estoque_minimo: 2 })).toBe(true);
  });
});

describe('estoque zerado', () => {
  it('zero é zerado, um não é', () => {
    expect(estoqueZerado({ estoque_atual: 0, estoque_minimo: 3 })).toBe(true);
    expect(estoqueZerado({ estoque_atual: 1, estoque_minimo: 3 })).toBe(false);
  });

  it('negativo conta como zerado', () => {
    expect(estoqueZerado({ estoque_atual: -2, estoque_minimo: 3 })).toBe(true);
  });
});

describe('falta para o mínimo', () => {
  it('conta quanto falta', () => {
    expect(faltaParaOMinimo({ estoque_atual: 1, estoque_minimo: 5 })).toBe(4);
  });

  it('já acima do mínimo não falta nada', () => {
    expect(faltaParaOMinimo({ estoque_atual: 9, estoque_minimo: 5 })).toBe(0);
  });
});

describe('número digitado num campo numérico', () => {
  it('ponto é DECIMAL — é assim que o navegador entrega o campo numérico', () => {
    // O defeito de 24/09: "12.50" virava 1250 e "12.5" virava 125.
    expect(numeroDoCampo('12.50')).toBe(12.5);
    expect(numeroDoCampo('12.5')).toBe(12.5);
    expect(numeroDoCampo('1.48')).toBe(1.48);
  });

  it('vírgula sozinha também vale como decimal', () => {
    expect(numeroDoCampo('12,50')).toBe(12.5);
  });

  it('vazio é "não digitou", não zero', () => {
    expect(numeroDoCampo('')).toBeNaN();
    expect(numeroDoCampo('   ')).toBeNaN();
  });

  it('inteiroOu aceita o ZERO digitado (o antigo `|| 1` trocava por 1)', () => {
    expect(inteiroOu('0', 1)).toBe(0);
    expect(inteiroOu('', 1)).toBe(1);
    expect(inteiroOu('abc', 100)).toBe(100);
    expect(inteiroOu('7', 1)).toBe(7);
  });

  it('quantidade tem que ser inteira e maior que zero', () => {
    expect(quantidadeValida('3')).toBe(true);
    // "1.5" virava 15 unidades com a conversão antiga.
    expect(quantidadeValida('1.5')).toBe(false);
    expect(quantidadeValida('0')).toBe(false);
    expect(quantidadeValida('')).toBe(false);
  });

  it('preço aceita centavos e zero, recusa vazio e negativo', () => {
    expect(precoValido('12.50')).toBe(true);
    expect(precoValido('0')).toBe(true);
    expect(precoValido('')).toBe(false);
    expect(precoValido('-1')).toBe(false);
  });
});

describe('aguardando revisão (aparelho recebido em troca)', () => {
  const troca = new Set(['troca-1']);

  it('troca desligada da venda COM preço também está esperando revisão', () => {
    // Desde 25/08 o PDV manda o preço de revenda; com a regra antiga (preço
    // zero) este aparelho ganhava etiqueta "Inativo" e sumia.
    expect(
      aguardandoRevisao({ id: 'troca-1', ativo: false, preco: 900, estoque_atual: 1 }, troca),
    ).toBe(true);
  });

  it('troca sem preço continua esperando revisão', () => {
    expect(
      aguardandoRevisao({ id: 'troca-1', ativo: false, preco: 0, estoque_atual: 1 }, troca),
    ).toBe(true);
  });

  it('produto excluído que não veio de troca NÃO está esperando ninguém, mesmo com preço zero', () => {
    expect(
      aguardandoRevisao({ id: 'outro', ativo: false, preco: 0, estoque_atual: 3 }, troca),
    ).toBe(false);
  });

  it('troca já vendida (estoque 0) e tirada de linha não volta ao aviso', () => {
    expect(
      aguardandoRevisao({ id: 'troca-1', ativo: false, preco: 900, estoque_atual: 0 }, troca),
    ).toBe(false);
  });

  it('produto à venda nunca está aguardando revisão', () => {
    expect(
      aguardandoRevisao({ id: 'troca-1', ativo: true, preco: 900, estoque_atual: 1 }, troca),
    ).toBe(false);
  });

  it('sem a lista de trocas, volta ao palpite antigo do preço zero', () => {
    expect(aguardandoRevisao({ id: 'x', ativo: false, preco: 0, estoque_atual: 1 }, null)).toBe(true);
    expect(aguardandoRevisao({ id: 'x', ativo: false, preco: 50, estoque_atual: 1 }, null)).toBe(false);
  });
});
