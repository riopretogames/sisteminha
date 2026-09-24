import { describe, it, expect } from 'vitest';
import {
  FILTROS_VENDA_VAZIO,
  FORMA_PELO_TIPO,
  aplicarFiltrosVenda,
  diaLocal,
  intervaloDoDia,
  pagamentoDaForma,
  type VendaFiltravel,
} from './filtrosVenda';

/**
 * Os filtros do Histórico de Vendas.
 *
 * Achados de 24/09:
 * - o período ia ao banco sem fuso, e o banco o lia como horário de Londres —
 *   a OV0008, feita em 14/09 às 21h36, só aparecia filtrando o dia 15;
 * - a forma de pagamento era uma lista fixa do código, sem "Shopee" nem "Link
 *   de Pagamento", que são formas cadastradas pela loja.
 *
 * As datas dos testes são montadas no horário LOCAL (`new Date(ano, mês, dia,
 * hora)`), então valem em qualquer fuso em que o teste rodar — e no fuso da
 * loja reproduzem exatamente o caso real.
 */

const venda = (created_at: string, extra: Partial<VendaFiltravel> = {}): VendaFiltravel => ({
  numero_venda: 'OV0008',
  created_at,
  status: 'pago',
  total: 100,
  vendedor_id: 'v1',
  clientes: null,
  vendedor: { nome: 'Ana' },
  itens_venda: [],
  pagamentos_venda: [],
  ...extra,
});

describe('o período no horário da loja', () => {
  it('o dia começa à meia-noite LOCAL e o fim é a meia-noite do dia seguinte', () => {
    const { inicio, fimExclusivo } = intervaloDoDia('2026-09-14', '2026-09-14');
    expect(inicio).toBe(new Date(2026, 8, 14).toISOString());
    expect(fimExclusivo).toBe(new Date(2026, 8, 15).toISOString());
  });

  it('a venda das 21h36 do dia 14 está dentro do dia 14', () => {
    const vendaNoite = new Date(2026, 8, 14, 21, 36);
    const { inicio, fimExclusivo } = intervaloDoDia('2026-09-14', '2026-09-14');
    expect(vendaNoite >= new Date(inicio!)).toBe(true);
    expect(vendaNoite < new Date(fimExclusivo!)).toBe(true);
  });

  it('a venda das 23h59min59s do último dia não fica de fora', () => {
    const quaseMeiaNoite = new Date(2026, 8, 30, 23, 59, 59);
    const { fimExclusivo } = intervaloDoDia('2026-09-01', '2026-09-30');
    expect(quaseMeiaNoite < new Date(fimExclusivo!)).toBe(true);
  });

  it('virada de mês: o fim do dia 31 é o dia 1 do mês seguinte', () => {
    const { fimExclusivo } = intervaloDoDia('', '2026-08-31');
    expect(fimExclusivo).toBe(new Date(2026, 8, 1).toISOString());
  });

  it('sem datas, sem recorte', () => {
    expect(intervaloDoDia('', '')).toEqual({});
  });

  it('o dia de um instante é o da loja, não o de Londres', () => {
    expect(diaLocal(new Date(2026, 8, 14, 21, 36).toISOString())).toBe('2026-09-14');
    expect(diaLocal(null)).toBe('');
  });

  it('o filtro na tela também corta pelo dia local', () => {
    const vendas = [venda(new Date(2026, 8, 14, 21, 36).toISOString())];
    expect(aplicarFiltrosVenda(vendas, { ...FILTROS_VENDA_VAZIO, de: '2026-09-14', ate: '2026-09-14' }))
      .toHaveLength(1);
    expect(aplicarFiltrosVenda(vendas, { ...FILTROS_VENDA_VAZIO, de: '2026-09-15', ate: '2026-09-15' }))
      .toHaveLength(0);
  });
});

describe('o filtro de forma de pagamento vem do cadastro', () => {
  it('separa formas cadastradas que são do mesmo tipo', () => {
    // "Shopee" e "Cartão Crédito" são as duas cartão de crédito por baixo.
    const shopee = { forma: 'cartao_credito', forma_pagamento_id: 'f-shopee' };
    expect(pagamentoDaForma(shopee, 'f-shopee')).toBe(true);
    expect(pagamentoDaForma(shopee, 'f-credito')).toBe(false);
  });

  it('pagamento de antes do cadastro (sem forma ligada) entra pelo tipo', () => {
    const antigo = { forma: 'pix', forma_pagamento_id: null };
    expect(pagamentoDaForma(antigo, `${FORMA_PELO_TIPO}pix`)).toBe(true);
    expect(pagamentoDaForma(antigo, `${FORMA_PELO_TIPO}dinheiro`)).toBe(false);
  });

  it('o filtro pelo tipo não pega pagamento que já tem forma cadastrada', () => {
    // Senão o PIX novo apareceria duas vezes: pela forma e pelo tipo.
    const novo = { forma: 'pix', forma_pagamento_id: 'f-pix' };
    expect(pagamentoDaForma(novo, `${FORMA_PELO_TIPO}pix`)).toBe(false);
  });

  it('aplicado na lista, filtra a venda pela forma cadastrada', () => {
    const vendas = [
      venda('2026-09-10T15:00:00Z', {
        numero_venda: 'OV1',
        pagamentos_venda: [{ forma: 'cartao_credito', forma_pagamento_id: 'f-shopee' }],
      }),
      venda('2026-09-10T15:00:00Z', {
        numero_venda: 'OV2',
        pagamentos_venda: [{ forma: 'cartao_credito', forma_pagamento_id: 'f-credito' }],
      }),
    ];
    const r = aplicarFiltrosVenda(vendas, { ...FILTROS_VENDA_VAZIO, formaPagamento: 'f-shopee' });
    expect(r.map((v) => v.numero_venda)).toEqual(['OV1']);
  });
});
