import { describe, it, expect } from 'vitest';
import {
  agrupar,
  porValor,
  porQuantidade,
  lider,
  participacao,
  horarioDePico,
  faixaDeHora,
  type LinhaRanking,
} from './ranking';

interface VendaFalsa {
  vendedorId: string | null;
  vendedorNome: string | null;
  total: number;
}

const extrator = {
  chave: (v: VendaFalsa) => v.vendedorId,
  nome: (v: VendaFalsa) => v.vendedorNome,
  valor: (v: VendaFalsa) => v.total,
};

describe('agrupar', () => {
  it('soma quantidade e valor de quem aparece mais de uma vez', () => {
    const linhas = agrupar(
      [
        { vendedorId: 'a', vendedorNome: 'Ana', total: 100 },
        { vendedorId: 'a', vendedorNome: 'Ana', total: 50 },
        { vendedorId: 'b', vendedorNome: 'Bruno', total: 70 },
      ],
      extrator,
    );
    expect(linhas).toHaveLength(2);
    const ana = linhas.find((l) => l.chave === 'a')!;
    expect(ana.quantidade).toBe(2);
    expect(ana.valor).toBe(150);
  });

  it('ignora item sem chave em vez de criar um "sem nome" no ranking', () => {
    // Venda sem vendedor é real (importação antiga, balcão sem atribuição).
    // Agrupar todas viraria um funcionário fantasma disputando o topo.
    const linhas = agrupar(
      [
        { vendedorId: null, vendedorNome: null, total: 900 },
        { vendedorId: 'a', vendedorNome: 'Ana', total: 10 },
      ],
      extrator,
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].nome).toBe('Ana');
  });

  it('usa "Sem nome" quando tem chave mas o nome não veio', () => {
    const linhas = agrupar([{ vendedorId: 'a', vendedorNome: null, total: 10 }], extrator);
    expect(linhas[0].nome).toBe('Sem nome');
  });

  it('usa a quantidade informada quando existe, em vez de contar 1', () => {
    const linhas = agrupar(
      [
        { produtoId: 'p', nome: 'Controle', qtd: 3, receita: 300 },
        { produtoId: 'p', nome: 'Controle', qtd: 2, receita: 200 },
      ],
      {
        chave: (i: { produtoId: string; nome: string; qtd: number; receita: number }) => i.produtoId,
        nome: (i) => i.nome,
        quantidade: (i) => i.qtd,
        valor: (i) => i.receita,
      },
    );
    expect(linhas[0].quantidade).toBe(5);
    expect(linhas[0].valor).toBe(500);
  });

  it('devolve lista vazia sem itens', () => {
    expect(agrupar([], extrator)).toEqual([]);
  });
});

describe('ordenação', () => {
  const linhas: LinhaRanking[] = [
    { chave: 'b', nome: 'Bruno', quantidade: 1, valor: 100 },
    { chave: 'a', nome: 'Ana', quantidade: 5, valor: 100 },
    { chave: 'c', nome: 'Carla', quantidade: 2, valor: 300 },
  ];

  it('porValor põe o maior faturamento na frente', () => {
    expect(porValor(linhas).map((l) => l.nome)).toEqual(['Carla', 'Ana', 'Bruno']);
  });

  it('empate de valor cai para a quantidade', () => {
    // Ana e Bruno empatam em 100; Ana fez 5 vendas contra 1.
    const ordenado = porValor(linhas);
    expect(ordenado[1].nome).toBe('Ana');
  });

  it('empate total cai para o nome, para a ordem não mudar sozinha', () => {
    const empatados: LinhaRanking[] = [
      { chave: 'z', nome: 'Zeca', quantidade: 1, valor: 10 },
      { chave: 'a', nome: 'Ana', quantidade: 1, valor: 10 },
    ];
    expect(porValor(empatados).map((l) => l.nome)).toEqual(['Ana', 'Zeca']);
    // Duas chamadas seguidas dão o mesmo resultado.
    expect(porValor(empatados)).toEqual(porValor(empatados));
  });

  it('não altera a lista original', () => {
    const copia = [...linhas];
    porValor(linhas);
    expect(linhas).toEqual(copia);
  });

  it('porQuantidade usa a contagem como critério principal', () => {
    expect(porQuantidade(linhas).map((l) => l.nome)).toEqual(['Ana', 'Carla', 'Bruno']);
  });
});

describe('lider', () => {
  it('devolve o primeiro por valor', () => {
    const l = lider([
      { chave: 'a', nome: 'Ana', quantidade: 1, valor: 10 },
      { chave: 'b', nome: 'Bruno', quantidade: 1, valor: 90 },
    ]);
    expect(l?.nome).toBe('Bruno');
  });

  it('devolve null quando não houve movimento no período', () => {
    expect(lider([])).toBeNull();
  });
});

describe('participacao', () => {
  it('calcula a fatia sobre o total', () => {
    const linhas: LinhaRanking[] = [
      { chave: 'a', nome: 'Ana', quantidade: 1, valor: 75 },
      { chave: 'b', nome: 'Bruno', quantidade: 1, valor: 25 },
    ];
    expect(participacao(linhas[0], linhas)).toBe(75);
  });

  it('devolve 0 com total zerado, em vez de dividir por zero', () => {
    const linhas: LinhaRanking[] = [{ chave: 'a', nome: 'Ana', quantidade: 1, valor: 0 }];
    expect(participacao(linhas[0], linhas)).toBe(0);
  });

  it('aguenta total negativo (dia com mais devolução que venda)', () => {
    const linhas: LinhaRanking[] = [{ chave: 'a', nome: 'Ana', quantidade: 1, valor: -50 }];
    expect(participacao(linhas[0], linhas)).toBe(0);
  });
});

describe('horarioDePico', () => {
  it('encontra a hora com mais movimento', () => {
    const pico = horarioDePico([
      '2026-08-23T09:10:00',
      '2026-08-23T14:05:00',
      '2026-08-23T14:40:00',
      '2026-08-23T14:55:00',
      '2026-08-23T18:00:00',
    ]);
    expect(pico).toEqual({ hora: 14, quantidade: 3 });
  });

  it('no empate fica a hora mais cedo', () => {
    const pico = horarioDePico(['2026-08-23T10:00:00', '2026-08-23T16:00:00']);
    expect(pico?.hora).toBe(10);
  });

  it('devolve null sem movimento', () => {
    expect(horarioDePico([])).toBeNull();
  });
});

describe('faixaDeHora', () => {
  it('escreve do jeito que se fala', () => {
    expect(faixaDeHora(14)).toBe('14h às 15h');
    expect(faixaDeHora(9)).toBe('9h às 10h');
  });
});
