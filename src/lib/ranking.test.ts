import { describe, it, expect } from 'vitest';
import {
  agrupar,
  porValor,
  porQuantidade,
  lider,
  participacao,
  horarioDePico,
  descontar,
  chaveDeTexto,
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

describe('descontar', () => {
  const linhas: LinhaRanking[] = [
    { chave: 'a', nome: 'Ana', quantidade: 8, valor: 1500 },
    { chave: 'b', nome: 'Bruno', quantidade: 3, valor: 600 },
  ];

  it('abate o valor de quem fez a venda original', () => {
    const r = descontar(linhas, [{ chave: 'a', nome: 'Ana', valor: 300 }]);
    expect(r.find((l) => l.chave === 'a')!.valor).toBe(1200);
    expect(r.find((l) => l.chave === 'b')!.valor).toBe(600);
  });

  it('não mexe na quantidade: a venda aconteceu, o dinheiro é que voltou', () => {
    const r = descontar(linhas, [{ chave: 'a', nome: 'Ana', valor: 300 }]);
    expect(r.find((l) => l.chave === 'a')!.quantidade).toBe(8);
  });

  it('inclui quem só teve devolução, com quantidade 0 e valor negativo', () => {
    // Vendeu na semana passada, devolveram agora. Deixar de fora esconderia
    // a saída de dinheiro do ranking.
    const r = descontar(linhas, [{ chave: 'c', nome: 'Carla', valor: 200 }]);
    const carla = r.find((l) => l.chave === 'c')!;
    expect(carla.quantidade).toBe(0);
    expect(carla.valor).toBe(-200);
  });

  it('soma várias devoluções da mesma pessoa', () => {
    const r = descontar(linhas, [
      { chave: 'a', nome: 'Ana', valor: 100 },
      { chave: 'a', nome: 'Ana', valor: 250 },
    ]);
    expect(r.find((l) => l.chave === 'a')!.valor).toBe(1150);
  });

  it('deixa o valor negativo quando devolveram mais do que a pessoa vendeu', () => {
    const r = descontar(linhas, [{ chave: 'b', nome: 'Bruno', valor: 1000 }]);
    expect(r.find((l) => l.chave === 'b')!.valor).toBe(-400);
  });

  it('ignora desconto sem chave, em vez de criar linha fantasma', () => {
    const r = descontar(linhas, [{ chave: '', nome: '', valor: 999 }]);
    expect(r).toHaveLength(2);
  });

  it('não altera a lista original', () => {
    const copia = JSON.parse(JSON.stringify(linhas));
    descontar(linhas, [{ chave: 'a', nome: 'Ana', valor: 300 }]);
    expect(linhas).toEqual(copia);
  });

  it('sem devolução nenhuma, devolve o mesmo ranking', () => {
    expect(descontar(linhas, [])).toEqual(linhas);
  });
});

describe('chaveDeTexto', () => {
  it('junta variações de digitação do mesmo serviço', () => {
    const iguais = ['Troca de tela', 'troca de tela ', 'TROCA DE TELA', '  Troca  de  tela'];
    const chaves = new Set(iguais.map(chaveDeTexto));
    expect(chaves.size).toBe(1);
  });

  it('ignora acento', () => {
    expect(chaveDeTexto('Manutenção')).toBe(chaveDeTexto('manutencao'));
    expect(chaveDeTexto('Reparo elétrico')).toBe(chaveDeTexto('REPARO ELETRICO'));
  });

  it('não junta serviços que só são parecidos', () => {
    // Corrigir digitação por semelhança erra, e ninguém entende por quê.
    expect(chaveDeTexto('troca de tela')).not.toBe(chaveDeTexto('trocar tela'));
    expect(chaveDeTexto('limpeza')).not.toBe(chaveDeTexto('limpeza profunda'));
  });

  it('devolve vazio para nulo, vazio ou só espaço', () => {
    expect(chaveDeTexto(null)).toBe('');
    expect(chaveDeTexto(undefined)).toBe('');
    expect(chaveDeTexto('   ')).toBe('');
  });

  it('serve como chave no agrupar, juntando as variações numa linha só', () => {
    const linhas = agrupar(
      [
        { desc: 'Troca de tela', preco: 300 },
        { desc: 'troca de tela ', preco: 250 },
        { desc: 'Limpeza', preco: 80 },
      ],
      {
        chave: (i: { desc: string; preco: number }) => chaveDeTexto(i.desc),
        nome: (i) => i.desc,
        valor: (i) => i.preco,
      },
    );
    expect(linhas).toHaveLength(2);
    const tela = linhas.find((l) => l.chave === 'troca de tela')!;
    expect(tela.quantidade).toBe(2);
    expect(tela.valor).toBe(550);
    // Mostra a primeira forma encontrada, com a acentuação de quem digitou.
    expect(tela.nome).toBe('Troca de tela');
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
