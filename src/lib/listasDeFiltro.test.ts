import { describe, it, expect } from 'vitest';
import { unirOpcoes, categoriasDeProduto } from './listasDeFiltro';

/**
 * A regra das listas de filtro, escrita depois do defeito que o Felipe achou
 * em 23/09/2026: a Luana, vendedora ativa, não aparecia no filtro de vendedor
 * porque não tinha venda no período — e era justamente ela que ele queria
 * procurar.
 *
 * A lista vem do CADASTRO; o movimento só acrescenta.
 */

describe('unirOpcoes', () => {
  it('mantém todo o cadastro, mesmo quem não aparece no movimento', () => {
    const cadastro = [
      { id: 'ana', nome: 'Ana' },
      { id: 'luana', nome: 'Luana' },
    ];
    const movimento = [{ id: 'ana', nome: 'Ana' }];

    const lista = unirOpcoes(cadastro, movimento);

    expect(lista.map((o) => o.id)).toEqual(['ana', 'luana']);
  });

  it('acrescenta quem aparece no movimento e não está mais no cadastro', () => {
    // O caso real: vendedor desligado e arquivado sai do cadastro, mas as
    // vendas dele continuam dentro do período. Sem isto, o painel mostraria um
    // faturamento que nenhum filtro alcança.
    const lista = unirOpcoes(
      [{ id: 'ana', nome: 'Ana' }],
      [{ id: 'ex', nome: 'Ex-funcionário (fora da equipe)' }],
    );

    expect(lista).toHaveLength(2);
    expect(lista[1].nome).toContain('fora da equipe');
  });

  it('não repete quem está nos dois lados', () => {
    const lista = unirOpcoes(
      [{ id: 'ana', nome: 'Ana' }],
      [
        { id: 'ana', nome: 'Ana' },
        { id: 'ana', nome: 'Ana' },
      ],
    );

    expect(lista).toHaveLength(1);
  });

  it('o nome do cadastro manda sobre o nome que veio do movimento', () => {
    // Quem renomeia um cadastro espera ver o nome novo na tela, não o que
    // ficou gravado no movimento antigo.
    const lista = unirOpcoes(
      [{ id: 'eq1', nome: 'Video game' }],
      [{ id: 'eq1', nome: 'Videogame (nome velho)' }],
    );

    expect(lista).toHaveLength(1);
    expect(lista[0].nome).toBe('Video game');
  });

  it('ignora entrada sem identificação vinda do movimento', () => {
    const lista = unirOpcoes([{ id: 'ana', nome: 'Ana' }], [{ id: '', nome: 'Sem id' }]);
    expect(lista).toHaveLength(1);
  });

  it('o cadastro vazio não apaga o que veio do movimento', () => {
    // Enquanto a lista do cadastro não carregou, a tela ainda mostra o que os
    // dados conhecem — melhor que um filtro vazio.
    const lista = unirOpcoes([], [{ id: 'ana', nome: 'Ana' }]);
    expect(lista).toHaveLength(1);
  });
});

describe('categoriasDeProduto', () => {
  it('traz as quatro categorias do sistema, sempre, com o nome de tela', () => {
    const lista = categoriasDeProduto();

    expect(lista.map((c) => c.id).sort()).toEqual(['acessorio', 'celular', 'peca', 'servico']);
    // Na tela aparece "Acessório", não "acessorio" — foi assim que o filtro
    // apareceu para o Felipe na primeira versão.
    expect(lista.find((c) => c.id === 'acessorio')?.nome).toBe('Acessório');
  });
});
