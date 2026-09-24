import { describe, it, expect } from 'vitest';
import type { ItemDeConferencia } from '@/types/tarefas';
import {
  agruparPorDia,
  diaDoFeito,
  fraseDoCabecalho,
  horaDoFeito,
  rotuloDoDia,
  textoDoDevolver,
} from './gruposDaConferencia';

/**
 * As regras da aba Conferência que não precisam de tela: em que dia cada
 * feito cai, como o dia se chama e o que o gerente lê antes de devolver.
 *
 * 24/09/2026 é uma quinta-feira — as datas daqui partem dela.
 */

const HOJE = '2026-09-24';

/** Um momento no relógio da loja (e não em UTC), para o dia não "voltar" no fuso do Brasil. */
function local(ano: number, mes: number, dia: number, hora = 10, minuto = 0): string {
  return new Date(ano, mes - 1, dia, hora, minuto).toISOString();
}

function item(parcial: Partial<ItemDeConferencia> = {}): ItemDeConferencia {
  return {
    tarefa_id: 't1',
    dia: HOJE,
    titulo: 'Repor os copos',
    prioridade: 'normal',
    dias_semana: [1, 3, 5],
    horario: null,
    quadro_id: 'q-loja',
    quadro_nome: 'Loja',
    lista_id: 'l-pedro',
    lista_nome: 'Vendedor sênior',
    lista_cor: null,
    feita_por: 'u-pedro',
    feita_em: local(2026, 9, 24),
    ...parcial,
  };
}

describe('rotuloDoDia', () => {
  it('hoje e ontem pelo nome', () => {
    expect(rotuloDoDia('2026-09-24', HOJE)).toBe('Hoje');
    expect(rotuloDoDia('2026-09-23', HOJE)).toBe('Ontem');
  });

  it('"ontem" atravessa a virada do mês', () => {
    expect(rotuloDoDia('2026-09-30', '2026-10-01')).toBe('Ontem');
  });

  it('antes disso, o dia da semana e a data', () => {
    expect(rotuloDoDia('2026-09-22', HOJE)).toBe('Ter, 22/09');
    expect(rotuloDoDia('2026-09-20', HOJE)).toBe('Dom, 20/09');
  });

  it('de outro ano leva o ano junto', () => {
    expect(rotuloDoDia('2025-12-30', '2026-01-02')).toBe('Ter, 30/12/2025');
  });
});

describe('diaDoFeito', () => {
  it('recorrente: o dia da conclusão, mesmo marcada depois da meia-noite', () => {
    expect(diaDoFeito({ dia: '2026-09-23', feita_em: local(2026, 9, 24, 0, 30) })).toBe('2026-09-23');
  });

  it('avulsa: o dia (no fuso da loja) em que foi concluída', () => {
    expect(diaDoFeito({ dia: null, feita_em: local(2026, 9, 23, 23, 50) })).toBe('2026-09-23');
  });
});

describe('agruparPorDia', () => {
  it('lista vazia não tem grupo', () => {
    expect(agruparPorDia([], HOJE)).toEqual([]);
  });

  it('o dia mais recente primeiro; dentro dele, o último marcado primeiro', () => {
    const grupos = agruparPorDia(
      [
        item({ tarefa_id: 'cedo', feita_em: local(2026, 9, 24, 8) }),
        item({ tarefa_id: 'segunda', dia: '2026-09-21', feita_em: local(2026, 9, 21, 9) }),
        item({ tarefa_id: 'avulsa', dia: null, feita_em: local(2026, 9, 23, 17) }),
        item({ tarefa_id: 'tarde', feita_em: local(2026, 9, 24, 16) }),
      ],
      HOJE,
    );

    expect(grupos.map((g) => g.rotulo)).toEqual(['Hoje', 'Ontem', 'Seg, 21/09']);
    expect(grupos[0].itens.map((i) => i.tarefa_id)).toEqual(['tarde', 'cedo']);
    expect(grupos[1].itens.map((i) => i.tarefa_id)).toEqual(['avulsa']);
  });

  it('o que é de antes de hoje ficou sem conferir', () => {
    const grupos = agruparPorDia([item(), item({ tarefa_id: 't2', dia: '2026-09-23' })], HOJE);
    expect(grupos.map((g) => [g.rotulo, g.atrasado])).toEqual([
      ['Hoje', false],
      ['Ontem', true],
    ]);
  });

  it('o mesmo feito de dois dias vira dois itens, um em cada dia', () => {
    const grupos = agruparPorDia([item({ dia: '2026-09-23' }), item({ dia: HOJE })], HOJE);
    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.itens.length === 1)).toBe(true);
  });
});

describe('textos da aba', () => {
  it('o cabeçalho conta no singular e no plural', () => {
    expect(fraseDoCabecalho(0)).toBe('Nada aguardando conferência');
    expect(fraseDoCabecalho(1)).toBe('1 feita aguardando conferência');
    expect(fraseDoCabecalho(3)).toBe('3 feitas aguardando conferência');
  });

  it('a hora do feito sai no relógio da loja', () => {
    expect(horaDoFeito(local(2026, 9, 24, 10, 32))).toBe('10:32');
  });
});

describe('textoDoDevolver', () => {
  it('feito de hoje: volta pendente hoje para a pessoa', () => {
    const t = textoDoDevolver(item(), 'Pedro', HOJE);
    expect(t.titulo).toBe('Devolver para Pedro?');
    expect(t.descricao).toContain('volta a aparecer pendente para Pedro hoje');
  });

  it('avulsa (sem dia): volta pendente, mesmo concluída ontem', () => {
    const t = textoDoDevolver(item({ dia: null, feita_em: local(2026, 9, 23) }), null, HOJE);
    expect(t.titulo).toBe('Devolver esta tarefa?');
    expect(t.descricao).toContain('volta a aparecer pendente hoje');
  });

  it('feito de um dia que passou: desfaz o registro daquele dia, a tarefa de hoje não muda', () => {
    expect(textoDoDevolver(item({ dia: '2026-09-23' }), 'Pedro', HOJE).descricao).toBe(
      'O feito de ontem é desfeito: fica registrado que "Repor os copos" não foi feita nesse dia. A tarefa de hoje não muda.',
    );
    expect(textoDoDevolver(item({ dia: '2026-09-21' }), 'Pedro', HOJE).descricao).toContain(
      'O feito de Seg, 21/09 é desfeito',
    );
  });
});
