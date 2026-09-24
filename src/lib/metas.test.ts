import { describe, it, expect } from 'vitest';
import {
  metaIndividual,
  metaDaLojaNoRecorte,
  recortesDoMes,
  situacaoNasFaixas,
  percentualDaFaixa,
} from './metas';

/**
 * As contas das metas, conferidas contra a própria planilha "Metas RPG 2026".
 *
 * Os valores esperados abaixo foram copiados da aba META POR VENDEDOR — que é
 * toda fórmula — em 23/09/2026. Se um dia estes testes quebrarem, é porque a
 * conta do sistema deixou de bater com a da planilha, que é a fonte.
 */

describe('metaIndividual — igual à aba META POR VENDEDOR', () => {
  it('setembro, Bronze: R$ 108.000 ÷ 2 vendedores = R$ 54.000 no mês e R$ 27.000 na quinzena', () => {
    expect(metaIndividual(108000, 2, 'mes')).toBe(54000);
    expect(metaIndividual(108000, 2, 'q1')).toBe(27000);
    expect(metaIndividual(108000, 2, 'q2')).toBe(27000);
  });

  it('maio, Diamante: R$ 89.856 ÷ 2 = R$ 44.928, quinzena R$ 22.464', () => {
    expect(metaIndividual(89856, 2, 'mes')).toBe(44928);
    expect(metaIndividual(89856, 2, 'q1')).toBe(22464);
  });

  it('outubro, Ouro: R$ 165.000 ÷ 2 = R$ 82.500, quinzena R$ 41.250', () => {
    expect(metaIndividual(165000, 2, 'mes')).toBe(82500);
    expect(metaIndividual(165000, 2, 'q2')).toBe(41250);
  });

  it('novembro, Prata: R$ 145.000 ÷ 2 = R$ 72.500, quinzena R$ 36.250', () => {
    expect(metaIndividual(145000, 2, 'mes')).toBe(72500);
    expect(metaIndividual(145000, 2, 'q1')).toBe(36250);
  });

  it('com 3 vendedores o valor quebra em centavos e é arredondado, não vira dízima', () => {
    expect(metaIndividual(110000, 3, 'mes')).toBe(36666.67);
  });

  it('mês cadastrado com zero vendedores não divide por zero', () => {
    expect(metaIndividual(108000, 0)).toBeNull();
  });
});

describe('metaDaLojaNoRecorte', () => {
  it('a loja inteira na quinzena é metade do mês', () => {
    expect(metaDaLojaNoRecorte(108000, 'mes')).toBe(108000);
    expect(metaDaLojaNoRecorte(108000, 'q1')).toBe(54000);
  });
});

describe('recortesDoMes', () => {
  it('mês quinzenal oferece o mês inteiro e as duas quinzenas', () => {
    expect(recortesDoMes('quinzenal')).toEqual(['mes', 'q1', 'q2']);
  });

  it('mês de 4 períodos (janeiro a julho/2026) NÃO oferece quinzena', () => {
    // A quinzena não existia naqueles meses: mostrar "meta da 1ª quinzena de
    // março" seria inventar uma régua que ninguém usou para pagar prêmio.
    expect(recortesDoMes('quatro_periodos')).toEqual(['mes']);
  });

  it('mês sem configuração vinda da planilha só oferece o mês inteiro', () => {
    expect(recortesDoMes(null)).toEqual(['mes']);
  });
});

describe('situacaoNasFaixas', () => {
  const faixas = [
    { faixa: 'bronze' as const, alvo: 27000 },
    { faixa: 'prata' as const, alvo: 32000 },
    { faixa: 'ouro' as const, alvo: 38000 },
    { faixa: 'diamante' as const, alvo: 46000 },
  ];

  it('abaixo de tudo: nenhuma faixa alcançada, a próxima é Bronze', () => {
    const s = situacaoNasFaixas(20000, faixas);
    expect(s.alcancada).toBeNull();
    expect(s.proxima?.faixa).toBe('bronze');
    expect(s.falta).toBe(7000);
  });

  it('bateu Prata exatamente no valor: alcançou Prata, a próxima é Ouro', () => {
    const s = situacaoNasFaixas(32000, faixas);
    expect(s.alcancada?.faixa).toBe('prata');
    expect(s.proxima?.faixa).toBe('ouro');
    expect(s.falta).toBe(6000);
  });

  it('passou de Diamante: tudo batido, nada faltando', () => {
    const s = situacaoNasFaixas(52974, faixas);
    expect(s.alcancada?.faixa).toBe('diamante');
    expect(s.proxima).toBeNull();
    expect(s.falta).toBe(0);
    expect(s.percentualDaProxima).toBe(100);
  });

  it('a ordem das faixas vem do valor, não da ordem em que chegaram', () => {
    const embaralhadas = [faixas[3], faixas[0], faixas[2], faixas[1]];
    expect(situacaoNasFaixas(40000, embaralhadas).alcancada?.faixa).toBe('ouro');
  });

  it('devolução que deixou o realizado negativo não quebra a conta', () => {
    const s = situacaoNasFaixas(-500, faixas);
    expect(s.alcancada).toBeNull();
    expect(s.percentualDaProxima).toBe(0);
  });
});

describe('percentualDaFaixa', () => {
  it('fica entre 0 e 100', () => {
    expect(percentualDaFaixa(15000, 30000)).toBe(50);
    expect(percentualDaFaixa(90000, 30000)).toBe(100);
    expect(percentualDaFaixa(-10, 30000)).toBe(0);
  });
});
