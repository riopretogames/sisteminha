import { describe, it, expect } from 'vitest';
import {
  colunaDaTarefa,
  corDaLista,
  ehIdDeLista,
  ehIdDeTarefa,
  idDeLista,
  idDeTarefa,
  idReal,
  mesmaSequencia,
  moverEntreColunas,
  ordemNaPosicao,
  podeMarcarTarefa,
} from '@/components/tarefas/kanban/regrasDoKanban';

/**
 * As contas do arrastar e soltar. É aqui que um erro faria o cartão cair na
 * posição vizinha, voltar para a coluna de onde saiu, ou a bolinha de feito
 * ser oferecida para quem o banco vai recusar.
 */

describe('identificadores do tabuleiro', () => {
  it('distinguem coluna de cartão e devolvem o id do banco', () => {
    expect(ehIdDeLista(idDeLista('abc'))).toBe(true);
    expect(ehIdDeTarefa(idDeLista('abc'))).toBe(false);
    expect(ehIdDeTarefa(idDeTarefa('abc'))).toBe(true);
    expect(idReal(idDeLista('abc'))).toBe('abc');
    expect(idReal(idDeTarefa('xyz'))).toBe('xyz');
    expect(idReal('sem-prefixo')).toBe('sem-prefixo');
  });
});

describe('colunaDaTarefa', () => {
  it('acha a coluna do cartão, e nada quando ele não está no quadro', () => {
    const colunas = { a: ['1', '2'], b: ['3'] };
    expect(colunaDaTarefa(colunas, '3')).toBe('b');
    expect(colunaDaTarefa(colunas, '9')).toBeUndefined();
  });
});

describe('moverEntreColunas', () => {
  const base = { a: ['1', '2', '3'], b: ['4', '5'] };

  it('tira da coluna de origem e põe na posição pedida do destino', () => {
    expect(moverEntreColunas(base, '2', 'b', 1)).toEqual({ a: ['1', '3'], b: ['4', '2', '5'] });
  });

  it('posição além do fim vira "no fim"; negativa vira "no começo"', () => {
    expect(moverEntreColunas(base, '1', 'b', 99).b).toEqual(['4', '5', '1']);
    expect(moverEntreColunas(base, '1', 'b', -3).b).toEqual(['1', '4', '5']);
  });

  it('coluna vazia recebe o cartão', () => {
    expect(moverEntreColunas({ a: ['1'], b: [] }, '1', 'b', 0)).toEqual({ a: [], b: ['1'] });
  });

  it('dentro da mesma coluna, só reposiciona', () => {
    expect(moverEntreColunas(base, '1', 'a', 2)).toEqual({ a: ['2', '3', '1'], b: ['4', '5'] });
  });

  it('não mexe nas colunas recebidas', () => {
    const copia = JSON.parse(JSON.stringify(base));
    moverEntreColunas(base, '2', 'b', 0);
    expect(base).toEqual(copia);
  });

  it('cartão ou coluna desconhecidos: devolve o mesmo quadro', () => {
    expect(moverEntreColunas(base, '9', 'b', 0)).toBe(base);
    expect(moverEntreColunas(base, '1', 'z', 0)).toBe(base);
  });
});

describe('ordemNaPosicao', () => {
  const ordens: Record<string, number> = { a: 1024, b: 2048, c: 3072 };
  const ordemDe = (id: string) => ordens[id];

  it('entre dois vizinhos: a média', () => {
    expect(ordemNaPosicao(['a', 'x', 'b'], 'x', ordemDe)).toBe(1536);
  });

  it('no topo: 1024 antes do primeiro', () => {
    expect(ordemNaPosicao(['x', 'a', 'b'], 'x', ordemDe)).toBe(0);
  });

  it('no fim: 1024 depois do último', () => {
    expect(ordemNaPosicao(['a', 'b', 'c', 'x'], 'x', ordemDe)).toBe(4096);
  });

  it('sozinho na coluna: 1024', () => {
    expect(ordemNaPosicao(['x'], 'x', ordemDe)).toBe(1024);
  });
});

describe('mesmaSequencia', () => {
  it('só é igual com os mesmos ids na mesma ordem', () => {
    expect(mesmaSequencia(['1', '2'], ['1', '2'])).toBe(true);
    expect(mesmaSequencia(['2', '1'], ['1', '2'])).toBe(false);
    expect(mesmaSequencia(['1'], ['1', '2'])).toBe(false);
    expect(mesmaSequencia(undefined, ['1'])).toBe(false);
  });
});

describe('podeMarcarTarefa', () => {
  const pedro = { id: 'pedro', nome: 'Pedro', avatar_url: null };
  const tarefaDoPedro = { responsaveis: [pedro] };
  const tarefaSemNinguem = { responsaveis: [] };

  it('quem edita o quadro marca qualquer tarefa', () => {
    expect(podeMarcarTarefa(tarefaSemNinguem, { responsavel_id: null }, true, 'gabriel')).toBe(true);
  });

  it('sem editar: marca se é responsável pela tarefa', () => {
    expect(podeMarcarTarefa(tarefaDoPedro, { responsavel_id: null }, false, 'pedro')).toBe(true);
  });

  it('sem editar: marca se a coluna é dele, mesmo sem estar na tarefa', () => {
    expect(podeMarcarTarefa(tarefaSemNinguem, { responsavel_id: 'pedro' }, false, 'pedro')).toBe(true);
  });

  it('sem editar e sem ser responsável: não marca (o banco recusaria)', () => {
    expect(podeMarcarTarefa(tarefaDoPedro, { responsavel_id: 'pedro' }, false, 'gabriel')).toBe(false);
    expect(podeMarcarTarefa(tarefaDoPedro, { responsavel_id: 'pedro' }, false, null)).toBe(false);
  });
});

describe('corDaLista', () => {
  it('usa a cor escolhida; sem cor, uma fixa pelo nome', () => {
    expect(corDaLista({ cor: 'bg-pink-500 text-white', nome: 'Pedro' })).toBe('bg-pink-500 text-white');
    const automatica = corDaLista({ cor: null, nome: 'Pedro' });
    expect(automatica).toMatch(/^bg-/);
    expect(corDaLista({ cor: null, nome: 'Pedro' })).toBe(automatica);
  });
});
