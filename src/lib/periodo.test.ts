import { describe, it, expect } from 'vitest';
import {
  resolverPeriodo,
  periodoAnterior,
  diasCorridos,
  variacao,
  granularidade,
  quinzenaDe,
  periodoDaQuinzena,
  paraISO,
} from './periodo';

/**
 * Data de referência de todos os testes: terça-feira, 22 de setembro de 2026,
 * às 16h21. Terça de propósito — é o meio da semana, então erro de "semana
 * começa no domingo" aparece na hora.
 */
const AGORA = new Date(2026, 8, 22, 16, 21);

describe('resolverPeriodo', () => {
  it('hoje vai da meia-noite de hoje à meia-noite de amanhã', () => {
    const p = resolverPeriodo({ atalho: 'hoje' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-22');
    expect(paraISO(p.fim)).toBe('2026-09-23');
  });

  it('ontem não inclui hoje', () => {
    const p = resolverPeriodo({ atalho: 'ontem' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-21');
    expect(paraISO(p.fim)).toBe('2026-09-22');
  });

  it('a semana começa na segunda-feira', () => {
    const p = resolverPeriodo({ atalho: 'esta-semana' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-21'); // segunda
    expect(paraISO(p.fim)).toBe('2026-09-23'); // até o fim de hoje
  });

  it('domingo ainda pertence à semana que começou na segunda anterior', () => {
    const domingo = new Date(2026, 8, 27, 10, 0);
    const p = resolverPeriodo({ atalho: 'esta-semana' }, domingo);
    expect(paraISO(p.inicio)).toBe('2026-09-21');
  });

  it('semana passada é a semana inteira, de segunda a domingo', () => {
    const p = resolverPeriodo({ atalho: 'semana-passada' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-14');
    expect(paraISO(p.fim)).toBe('2026-09-21');
    expect(diasCorridos(p)).toBe(7);
  });

  it('últimos 7 dias incluem hoje', () => {
    const p = resolverPeriodo({ atalho: 'ultimos-7-dias' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-16');
    expect(diasCorridos(p)).toBe(7);
  });

  it('este mês vai do dia 1 até o fim de hoje', () => {
    const p = resolverPeriodo({ atalho: 'este-mes' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-01');
    expect(paraISO(p.fim)).toBe('2026-09-23');
  });

  it('mês passado é o mês inteiro', () => {
    const p = resolverPeriodo({ atalho: 'mes-passado' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-08-01');
    expect(paraISO(p.fim)).toBe('2026-09-01');
  });

  it('trimestre de setembro começa em julho', () => {
    const p = resolverPeriodo({ atalho: 'este-trimestre' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-07-01');
  });

  it('trimestre passado é abril a junho', () => {
    const p = resolverPeriodo({ atalho: 'trimestre-passado' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-04-01');
    expect(paraISO(p.fim)).toBe('2026-07-01');
  });

  it('ano passado é o ano inteiro anterior', () => {
    const p = resolverPeriodo({ atalho: 'ano-passado' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2025-01-01');
    expect(paraISO(p.fim)).toBe('2026-01-01');
    expect(diasCorridos(p)).toBe(365);
  });

  it('quinta a quinta: o período personalizado inclui o último dia inteiro', () => {
    // O pedido do Felipe: "quero ver quanto vendeu de quinta a quinta".
    const p = resolverPeriodo({ atalho: 'personalizado', de: '2026-09-10', ate: '2026-09-17' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-10');
    expect(paraISO(p.fim)).toBe('2026-09-18'); // dia seguinte ao último — fim exclusivo
    expect(p.rotulo).toBe('10/09 a 17/09');
  });

  it('datas invertidas são trocadas em vez de devolver período vazio', () => {
    const p = resolverPeriodo({ atalho: 'personalizado', de: '2026-09-17', ate: '2026-09-10' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-10');
    expect(paraISO(p.fim)).toBe('2026-09-18');
  });

  it('personalizado sem datas preenchidas cai em "este mês" e não quebra', () => {
    const p = resolverPeriodo({ atalho: 'personalizado' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-01');
  });

  it('um dia só mostra a data cheia no rótulo', () => {
    const p = resolverPeriodo({ atalho: 'personalizado', de: '2026-09-11', ate: '2026-09-11' }, AGORA);
    expect(p.rotulo).toBe('11/09/2026');
    expect(diasCorridos(p)).toBe(1);
  });
});

describe('periodoAnterior', () => {
  it('ontem compara com anteontem', () => {
    const p = periodoAnterior({ atalho: 'ontem' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-20');
    expect(paraISO(p.fim)).toBe('2026-09-21');
  });

  it('esta semana compara com o MESMO pedaço da semana passada', () => {
    // Terça 22/09: esta semana é segunda e terça (21 e 22). O anterior tem de
    // ser segunda e terça da semana passada (14 e 15) — e não sábado e
    // domingo (19 e 20), que era o que o teste antigo conferia sem perceber.
    const p = periodoAnterior({ atalho: 'esta-semana' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-14');
    expect(paraISO(p.fim)).toBe('2026-09-16');
    expect(p.rotulo).toBe('semana anterior');
  });

  it('numa quarta, esta semana não compara dia útil com fim de semana', () => {
    // O caso do achado 64: quarta 23/09 comparava 21-23/09 com 18-21/09
    // (sexta a domingo).
    const quarta = new Date(2026, 8, 23, 10, 0);
    const p = periodoAnterior({ atalho: 'esta-semana' }, quarta);
    expect(paraISO(p.inicio)).toBe('2026-09-14');
    expect(paraISO(p.fim)).toBe('2026-09-17');
    expect(diasCorridos(p)).toBe(3);
  });

  it('semana passada compara com a semana inteira anterior', () => {
    const p = periodoAnterior({ atalho: 'semana-passada' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-09-07');
    expect(paraISO(p.fim)).toBe('2026-09-14');
    expect(diasCorridos(p)).toBe(7);
  });

  it('este mês compara com o mesmo pedaço do mês passado, não com o mês inteiro', () => {
    // Até o dia 22 de setembro são 22 dias. O anterior tem que ser 1 a 22 de
    // agosto — comparar com agosto inteiro (31 dias) faria o mês atual parecer
    // pior todo dia 22, sem nada ter acontecido.
    const p = periodoAnterior({ atalho: 'este-mes' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-08-01');
    expect(diasCorridos(p)).toBe(22);
  });

  it('este ano compara com o mesmo pedaço do ano passado', () => {
    // 1º de janeiro a 22 de setembro de 2026 se compara com 1º de janeiro a
    // 22 de setembro de 2025 — não com 2025 inteiro.
    const p = periodoAnterior({ atalho: 'este-ano' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2025-01-01');
    expect(diasCorridos(p)).toBe(265);
  });

  it('em 31/03, "este mês" não invade março: compara com fevereiro até o fim dele', () => {
    // Achado da revisão de 23/09: 31 dias a partir de 01/02 caíam em 03/03.
    const p = periodoAnterior({ atalho: 'este-mes' }, new Date(2026, 2, 31, 12, 0));
    expect(paraISO(p.inicio)).toBe('2026-02-01');
    expect(paraISO(p.fim)).toBe('2026-03-01');
  });

  it('em 31/10, "este mês" compara com setembro sem pegar o 1º de outubro', () => {
    const p = periodoAnterior({ atalho: 'este-mes' }, new Date(2026, 9, 31, 12, 0));
    expect(paraISO(p.inicio)).toBe('2026-09-01');
    expect(paraISO(p.fim)).toBe('2026-10-01');
  });

  it('"mês passado" compara com o mês anterior INTEIRO — setembro contra agosto até o dia 31', () => {
    const p = periodoAnterior({ atalho: 'mes-passado' }, new Date(2026, 9, 15, 12, 0));
    expect(paraISO(p.inicio)).toBe('2026-08-01');
    expect(paraISO(p.fim)).toBe('2026-09-01');
  });

  it('"trimestre passado" compara com o trimestre anterior inteiro, sem sobrepor', () => {
    // Em 23/09: trimestre passado = abril a junho; anterior = janeiro a março.
    const atual = resolverPeriodo({ atalho: 'trimestre-passado' }, AGORA);
    const p = periodoAnterior({ atalho: 'trimestre-passado' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2026-01-01');
    expect(paraISO(p.fim)).toBe('2026-04-01');
    expect(p.fim.getTime()).toBe(atual.inicio.getTime());
  });

  it('"ano passado" compara com o ano retrasado inteiro', () => {
    const p = periodoAnterior({ atalho: 'ano-passado' }, AGORA);
    expect(paraISO(p.inicio)).toBe('2024-01-01');
    expect(paraISO(p.fim)).toBe('2025-01-01');
  });

  it('período personalizado compara com o mesmo tamanho logo antes', () => {
    const p = periodoAnterior(
      { atalho: 'personalizado', de: '2026-09-10', ate: '2026-09-17' },
      AGORA,
    );
    expect(diasCorridos(p)).toBe(8);
    expect(paraISO(p.inicio)).toBe('2026-09-02');
    expect(paraISO(p.fim)).toBe('2026-09-10');
  });
});

describe('variacao', () => {
  it('calcula a diferença percentual', () => {
    expect(variacao(150, 100)).toBe(50);
    expect(variacao(80, 100)).toBeCloseTo(-20);
  });

  it('devolve null quando não há base de comparação', () => {
    // Sem isso a tela mostraria "+100%" ou "∞" em cima de um período que não
    // teve venda nenhuma — número que faz alguém comemorar à toa.
    expect(variacao(500, 0)).toBeNull();
  });
});

describe('granularidade', () => {
  it('período curto é agrupado por dia', () => {
    expect(granularidade(resolverPeriodo({ atalho: 'esta-semana' }, AGORA))).toBe('dia');
    expect(granularidade(resolverPeriodo({ atalho: 'este-mes' }, AGORA))).toBe('dia');
  });

  it('trimestre é agrupado por semana', () => {
    expect(granularidade(resolverPeriodo({ atalho: 'este-trimestre' }, AGORA))).toBe('semana');
  });

  it('ano é agrupado por mês', () => {
    expect(granularidade(resolverPeriodo({ atalho: 'ano-passado' }, AGORA))).toBe('mes');
  });
});

describe('quinzena', () => {
  it('dia 15 ainda é a primeira quinzena; dia 16 já é a segunda', () => {
    expect(quinzenaDe(new Date(2026, 8, 15))).toBe(1);
    expect(quinzenaDe(new Date(2026, 8, 16))).toBe(2);
  });

  it('a primeira quinzena vai do dia 1 ao 15', () => {
    const p = periodoDaQuinzena(2026, 9, 1);
    expect(paraISO(p.inicio)).toBe('2026-09-01');
    expect(paraISO(p.fim)).toBe('2026-09-16');
    expect(diasCorridos(p)).toBe(15);
  });

  it('a segunda quinzena vai do dia 16 até o fim do mês, inclusive em fevereiro', () => {
    const p = periodoDaQuinzena(2026, 2, 2);
    expect(paraISO(p.inicio)).toBe('2026-02-16');
    expect(paraISO(p.fim)).toBe('2026-03-01');
    expect(diasCorridos(p)).toBe(13);
  });
});
