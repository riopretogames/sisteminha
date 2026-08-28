import { describe, it, expect } from 'vitest';
import { lerOrigem } from './origemMovimento';

/**
 * A etiqueta de origem é escrita pelo BANCO, por seis gatilhos diferentes
 * criados em datas diferentes. Estes testes são a lista do que existe lá —
 * se um gatilho novo inventar um formato, é aqui que a falta aparece.
 */

describe('De onde veio o movimento de estoque', () => {
  it('venda: vira link com o número que a loja fala em voz alta', () => {
    const o = lerOrigem('venda:OV0006');
    expect(o.tipo).toBe('venda');
    expect(o.referencia).toBe('OV0006');
    expect(o.rotulo).toBe('Venda OV0006');
    expect(o.navegavel).toBe(true);
    expect(o.estorno).toBe(false);
  });

  it('OS: também abre ficha', () => {
    const o = lerOrigem('os:OS0001');
    expect(o.tipo).toBe('os');
    expect(o.referencia).toBe('OS0001');
    expect(o.rotulo).toBe('OS OS0001');
    expect(o.navegavel).toBe(true);
  });

  it('estorno de venda: diz que foi estorno e continua levando à venda', () => {
    const o = lerOrigem('estorno:venda:OV0006');
    expect(o.tipo).toBe('venda');
    expect(o.estorno).toBe(true);
    expect(o.referencia).toBe('OV0006');
    expect(o.rotulo).toBe('Estorno de Venda OV0006');
    expect(o.navegavel).toBe(true);
  });

  it('estorno de OS: idem', () => {
    const o = lerOrigem('estorno:os:OS0001');
    expect(o.tipo).toBe('os');
    expect(o.estorno).toBe(true);
    expect(o.rotulo).toBe('Estorno de OS OS0001');
  });

  it('entrada de mercadoria: rótulo bonito, mas sem ficha para abrir hoje', () => {
    const o = lerOrigem('entrada:EM0003');
    expect(o.tipo).toBe('entrada');
    expect(o.rotulo).toBe('Entrada EM0003');
    expect(o.navegavel).toBe(false);
  });

  describe('quando o banco grava o id em vez do número', () => {
    // Todos os gatilhos usam COALESCE(numero, id::text): se o número ainda não
    // existia no instante do movimento, sobra o UUID.
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

    it('reconhece que é id, não número de documento', () => {
      const o = lerOrigem(`venda:${uuid}`);
      expect(o.pareceId).toBe(true);
      expect(o.referencia).toBe(uuid);
      expect(o.navegavel).toBe(true);
    });

    it('não mostra o id na tela — ninguém lê UUID', () => {
      expect(lerOrigem(`venda:${uuid}`).rotulo).toBe('Venda (sem número)');
    });

    it('número de documento não é confundido com id', () => {
      expect(lerOrigem('venda:OV0006').pareceId).toBe(false);
    });
  });

  describe('origens que não levam a lugar nenhum', () => {
    it('cadastro do produto (estoque inicial)', () => {
      const o = lerOrigem('cadastro:3f2504e0-4f89-41d3-9a0c-0305e82c3301');
      expect(o.tipo).toBe('cadastro');
      expect(o.navegavel).toBe(false);
      // Sem "(sem número)": cadastro nunca teve número de documento, então
      // apontar a falta seria inventar um problema.
      expect(o.rotulo).toBe('Cadastro do produto');
    });

    it('devolução', () => {
      expect(lerOrigem('devolucao:3f2504e0-4f89-41d3-9a0c-0305e82c3301').navegavel).toBe(false);
    });

    it('ajuste manual, nas duas grafias que existem no banco', () => {
      // `ajuste_manual` veio da função de 05/08; `ajuste:manual` da de 18/08.
      expect(lerOrigem('ajuste_manual').rotulo).toBe('Ajuste manual');
      expect(lerOrigem('ajuste:manual').rotulo).toBe('Ajuste manual');
      expect(lerOrigem('ajuste_manual').navegavel).toBe(false);
    });
  });

  describe('o que não se conhece não vira link', () => {
    it('etiqueta desconhecida aparece como está', () => {
      const o = lerOrigem('importacao:XPTO');
      expect(o.tipo).toBe(null);
      expect(o.navegavel).toBe(false);
      expect(o.rotulo).toBe('importacao:XPTO');
    });

    it('vazio e nulo viram tracinho', () => {
      expect(lerOrigem(null).rotulo).toBe('—');
      expect(lerOrigem('').rotulo).toBe('—');
      expect(lerOrigem('   ').navegavel).toBe(false);
    });

    it('prefixo certo sem referência não vira link', () => {
      expect(lerOrigem('venda:').navegavel).toBe(false);
    });
  });
});
