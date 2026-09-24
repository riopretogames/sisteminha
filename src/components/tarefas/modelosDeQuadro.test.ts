import { describe, it, expect } from 'vitest';
import {
  MODELOS_DE_QUADRO,
  PERIODO_DO_MODELO,
  modeloPorId,
  montarDadosDoModelo,
  resumoDoModelo,
} from '@/components/tarefas/modelosDeQuadro';
import { CORES_ETIQUETA } from '@/lib/cores';
import { TAREFA_PRIORIDADES, TAREFA_STATUS } from '@/config/tarefas';

/**
 * Os modelos são o Trello do Felipe passado a limpo. Um erro aqui não quebra
 * a tela — cria um quadro torto na loja inteira, com tarefa na coluna errada
 * ou turno que não existe. Por isso o conteúdo é conferido, não só o formato.
 */

describe('modelos de quadro', () => {
  it('têm as listas e tarefas do Trello atual', () => {
    expect(resumoDoModelo(modeloPorId('loja'))).toEqual({ listas: 5, tarefas: 43 });
    expect(resumoDoModelo(modeloPorId('assistencia'))).toEqual({ listas: 6, tarefas: 22 });
    expect(resumoDoModelo(modeloPorId('em-branco'))).toEqual({ listas: 3, tarefas: 0 });
    expect(MODELOS_DE_QUADRO.map((m) => m.id)).toEqual(['em-branco', 'loja', 'assistencia']);
  });

  it('usam só cores da paleta de lib/cores (senão o Tailwind não gera a cor)', () => {
    const paleta = new Set(CORES_ETIQUETA.map((c) => c.value));
    for (const m of MODELOS_DE_QUADRO) {
      expect(paleta.has(m.cor)).toBe(true);
      for (const l of m.listas) expect(paleta.has(l.cor ?? '')).toBe(true);
    }
  });

  it('os turnos batem com o que a migration semeou no catálogo', () => {
    expect(PERIODO_DO_MODELO).toEqual({
      manha: 'Manhã (7 às 11)',
      meio: 'Meio do dia (11 às 15)',
      tarde: 'Tarde (15 às 19)',
      livre: 'Livre',
    });
  });

  it('prioridade e status de todo cartão existem no sistema', () => {
    for (const m of MODELOS_DE_QUADRO) {
      for (const l of m.listas) {
        for (const t of l.tarefas) {
          if (t.prioridade) expect(t.prioridade in TAREFA_PRIORIDADES).toBe(true);
          if (t.status) expect(t.status in TAREFA_STATUS).toBe(true);
          expect(t.titulo.trim()).toBe(t.titulo);
        }
      }
    }
  });
});

describe('montarDadosDoModelo', () => {
  const loja = modeloPorId('loja');

  it('traduz "todos os dias", dias soltos e turnos para o que o banco grava', () => {
    const dados = montarDadosDoModelo(loja);
    const porTitulo = (titulo: string) => dados.tarefas.find((t) => t.titulo === titulo)!;

    expect(porTitulo('5 fotos de produto ou serviço no status do WhatsApp').dias_semana).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Escrito [3, 1, 5] no modelo; gravado na ordem da semana.
    expect(porTitulo('4 anúncios na OLX e no Facebook (olha a bio)').dias_semana).toEqual([1, 3, 5]);
    expect(porTitulo('Responder a OLX cedo').periodo_descricao).toBe('Manhã (7 às 11)');
    expect(porTitulo('Ligar os telefones da loja ao chegar').prioridade).toBe('alta');
    // Sem prioridade no modelo = normal; sem dia = avulsa; sem turno = nenhum.
    expect(porTitulo('Cockpit')).toMatchObject({ prioridade: 'normal', dias_semana: [], periodo_descricao: null });
    expect(porTitulo('Contagem e correção do estoque')).toMatchObject({ status: 'fazendo', prioridade: 'urgente' });
  });

  it('cada tarefa aponta para a lista certa pelo índice', () => {
    const dados = montarDadosDoModelo(loja);
    expect(dados.listas.map((l) => l.nome)).toEqual([
      'Vendedor sênior',
      'Vendedor júnior',
      'Gerente',
      'Dono',
      'Anúncios OLX',
    ]);
    expect(dados.tarefas.filter((t) => t.lista === 4)).toHaveLength(13);
    expect(dados.tarefas.find((t) => t.titulo === 'Conferência do caixa')!.lista).toBe(2);
    for (const t of dados.tarefas) expect(t.lista).toBeLessThan(dados.listas.length);
  });

  it('nenhuma tarefa que se repete nasce "feita" (o banco recusaria o quadro inteiro)', () => {
    for (const m of MODELOS_DE_QUADRO) {
      for (const t of montarDadosDoModelo(m).tarefas) {
        if ((t.dias_semana ?? []).length > 0) expect(t.status).not.toBe('feito');
      }
    }
  });

  it('renomeia as listas; nome em branco fica com o do modelo', () => {
    const dados = montarDadosDoModelo(loja, ['Pedro', '  ', 'Richard ']);
    expect(dados.listas.map((l) => l.nome)).toEqual(['Pedro', 'Vendedor júnior', 'Richard', 'Dono', 'Anúncios OLX']);
  });

  it('o quadro em branco ganha um nome para não ser gravado sem nome', () => {
    const dados = montarDadosDoModelo(modeloPorId('em-branco'));
    expect(dados.nome).toBe('Novo quadro');
    expect(dados.descricao).toBeNull();
    expect(dados.tarefas).toEqual([]);
    // Nenhuma coluna com nome de andamento: mover para "Feito" não marca feito.
    expect(dados.listas.map((l) => l.nome)).toEqual(['Esta semana', 'Próxima semana', 'Ideias']);
  });
});
