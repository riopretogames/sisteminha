import { describe, it, expect } from 'vitest';
import { montarSerie, melhorPonto, nomeDoGrao } from './serie';
import { resolverPeriodo } from './periodo';

const AGORA = new Date(2026, 8, 22, 16, 21); // terça, 22/09/2026

const extrair = {
  data: (v: { quando: string; total: number }) => v.quando,
  valor: (v: { quando: string; total: number }) => v.total,
};

describe('montarSerie', () => {
  it('cria um ponto por dia do período, mesmo nos dias sem venda', () => {
    // O ponto do teste: sem o dia vazio, o gráfico liga 21 direto em 23 e
    // desenha uma queda que não existe.
    const periodo = resolverPeriodo({ atalho: 'personalizado', de: '2026-09-21', ate: '2026-09-23' }, AGORA);
    const serie = montarSerie(periodo, [{ quando: '2026-09-21T10:00:00', total: 100 }], extrair);
    expect(serie).toHaveLength(3);
    expect(serie.map((p) => p.rotulo)).toEqual(['21/09', '22/09', '23/09']);
    expect(serie[0].valor).toBe(100);
    expect(serie[1].valor).toBe(0);
  });

  it('soma várias vendas no mesmo dia e conta a quantidade', () => {
    const periodo = resolverPeriodo({ atalho: 'personalizado', de: '2026-09-22', ate: '2026-09-22' }, AGORA);
    const serie = montarSerie(
      periodo,
      [
        { quando: '2026-09-22T09:00:00', total: 100 },
        { quando: '2026-09-22T18:30:00', total: 250 },
      ],
      extrair,
    );
    expect(serie[0].valor).toBe(350);
    expect(serie[0].quantidade).toBe(2);
  });

  it('ignora o que está fora do período', () => {
    const periodo = resolverPeriodo({ atalho: 'personalizado', de: '2026-09-22', ate: '2026-09-22' }, AGORA);
    const serie = montarSerie(
      periodo,
      [
        { quando: '2026-09-21T23:59:00', total: 999 },
        { quando: '2026-09-22T08:00:00', total: 10 },
      ],
      extrair,
    );
    expect(serie[0].valor).toBe(10);
  });

  it('inclui venda das 23h do último dia — o fim do período é exclusivo', () => {
    const periodo = resolverPeriodo({ atalho: 'personalizado', de: '2026-09-22', ate: '2026-09-22' }, AGORA);
    const serie = montarSerie(periodo, [{ quando: '2026-09-22T23:40:00', total: 80 }], extrair);
    expect(serie[0].valor).toBe(80);
  });

  it('desconta a devolução no dia em que ela aconteceu', () => {
    const periodo = resolverPeriodo({ atalho: 'personalizado', de: '2026-09-21', ate: '2026-09-22' }, AGORA);
    const serie = montarSerie(
      periodo,
      [{ quando: '2026-09-21T10:00:00', total: 500 }],
      extrair,
      { itens: [{ quando: '2026-09-22T11:00:00', total: 200 }], extrair },
    );
    expect(serie[0].valor).toBe(500); // dia da venda, intacto
    expect(serie[1].valor).toBe(-200); // dia da devolução
  });

  it('agrupa por semana quando o período passa de um mês', () => {
    const periodo = resolverPeriodo({ atalho: 'este-trimestre' }, AGORA); // jul-set
    const serie = montarSerie(periodo, [], extrair);
    // 1º de julho é quarta; a primeira semana começa na segunda, 29/06.
    expect(serie[0].rotulo).toBe('29/06');
    expect(serie.length).toBeGreaterThan(10);
    expect(serie.length).toBeLessThan(15);
  });

  it('agrupa por mês quando o período é um ano', () => {
    const periodo = resolverPeriodo({ atalho: 'ano-passado' }, AGORA);
    const serie = montarSerie(periodo, [], extrair);
    expect(serie).toHaveLength(12);
    expect(serie[0].rotulo).toBe('jan/25');
    expect(serie[8].rotulo).toBe('set');
  });
});

describe('melhorPonto', () => {
  it('encontra o dia de maior faturamento', () => {
    const periodo = resolverPeriodo({ atalho: 'personalizado', de: '2026-09-21', ate: '2026-09-23' }, AGORA);
    const serie = montarSerie(
      periodo,
      [
        { quando: '2026-09-21T10:00:00', total: 100 },
        { quando: '2026-09-23T10:00:00', total: 900 },
      ],
      extrair,
    );
    expect(melhorPonto(serie)?.rotulo).toBe('23/09');
  });

  it('devolve null quando não houve faturamento nenhum', () => {
    const periodo = resolverPeriodo({ atalho: 'hoje' }, AGORA);
    expect(melhorPonto(montarSerie(periodo, [], extrair))).toBeNull();
  });
});

describe('nomeDoGrao', () => {
  it('diz como chamar o ponto na tela', () => {
    expect(nomeDoGrao(resolverPeriodo({ atalho: 'esta-semana' }, AGORA))).toBe('dia');
    expect(nomeDoGrao(resolverPeriodo({ atalho: 'este-trimestre' }, AGORA))).toBe('semana');
    expect(nomeDoGrao(resolverPeriodo({ atalho: 'ano-passado' }, AGORA))).toBe('mês');
  });
});
