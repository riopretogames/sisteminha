import { describe, it, expect } from 'vitest';
import {
  agruparPorLista,
  dataDoDiaNaSemana,
  dataLocalISO,
  descreverDias,
  ehImagem,
  ehRecorrente,
  estaFeita,
  estadoDeConferencia,
  filtrarTarefas,
  horariosDoCatalogo,
  LIMITE_DO_ANEXO,
  montarTarefa,
  nomeDeArquivoSeguro,
  normalizarHorario,
  novaTarefaApareceNoFiltro,
  ordemEntre,
  ordenarPorHorario,
  ordenarPorOrdem,
  precisaRenumerar,
  primeiroNome,
  renumerar,
  resumoDeStatus,
  saudacao,
  semAguardandoConferencia,
  statusNoDia,
  tamanhoLegivel,
  tarefaCaiNoDia,
  temFiltroAtivo,
  type LinhaTarefaDoBanco,
} from './tarefas';
import {
  aplicarCamposDoFeito,
  camposAoMudarFrequencia,
  ehEnderecoInvalido,
  mensagemLeiga,
  planoDeAlternarFeito,
  planoDeStatus,
} from './tarefasMutacoes';
import { FILTROS_TAREFAS_VAZIO, type Tarefa } from '@/types/tarefas';
import { desfazerSo, SELECT_TAREFA, type DadosDoQuadro } from '@/hooks/useQuadro';
import {
  montarItensDeConferencia,
  SELECT_AVULSA_PENDENTE,
  SELECT_CONCLUSAO_PENDENTE,
} from '@/hooks/useConferencia';

/**
 * As regras do quadro de tarefas. É aqui que mora o que substitui o "zerar o
 * status à mão todo dia" do Monday: se estas contas erram, a equipe vê tarefa
 * de ontem como feita hoje, ou atraso onde não tem.
 */

// Quarta-feira, 23/09/2026 — o dia em que o Felipe pediu o módulo.
const HOJE = '2026-09-23';
const QUARTA = 3;

function tarefa(campos: Partial<Tarefa> = {}): Tarefa {
  return {
    id: 't1',
    quadro_id: 'q1',
    lista_id: 'l1',
    titulo: 'Repor os copos',
    descricao: null,
    prioridade: 'normal',
    status: 'nao_iniciado',
    dias_semana: [],
    periodo_id: null,
    periodo: null,
    prazo: null,
    concluida_em: null,
    ordem: 1024,
    arquivada_em: null,
    criado_por: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    responsaveis: [],
    etiquetas: [],
    checklist_total: 0,
    checklist_feitos: 0,
    comentarios_total: 0,
    feita_hoje: false,
    horario: null,
    conferencia: 'nenhuma',
    anexos_total: 0,
    ...campos,
  };
}

/** Meio-dia local do dia pedido, em ISO — evita virar o dia pelo fuso. */
const meioDia = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, 12, 0, 0).toISOString();
};

describe('descreverDias', () => {
  it('lista vazia é tarefa avulsa', () => {
    expect(descreverDias([])).toBe('Avulsa');
  });

  it('os sete dias viram "Todos os dias", em qualquer ordem', () => {
    expect(descreverDias([6, 0, 1, 2, 3, 4, 5])).toBe('Todos os dias');
  });

  it('escreve na ordem da semana da loja (segunda primeiro, domingo por último)', () => {
    expect(descreverDias([5, 0, 1, 3])).toBe('Seg, Qua, Sex e Dom');
  });

  it('um dia só, sem "e"', () => {
    expect(descreverDias([2])).toBe('Ter');
  });

  it('dois dias', () => {
    expect(descreverDias([4, 2])).toBe('Ter e Qui');
  });

  it('dia repetido não conta duas vezes', () => {
    expect(descreverDias([1, 1, 3])).toBe('Seg e Qua');
  });
});

describe('ehRecorrente / estaFeita', () => {
  it('com dia = recorrente; sem dia = avulsa', () => {
    expect(ehRecorrente({ dias_semana: [1] })).toBe(true);
    expect(ehRecorrente({ dias_semana: [] })).toBe(false);
  });

  it('recorrente está feita só com o feito de hoje; concluida_em não conta', () => {
    expect(estaFeita(tarefa({ dias_semana: [1], feita_hoje: true }))).toBe(true);
    expect(estaFeita(tarefa({ dias_semana: [1], concluida_em: meioDia(HOJE) }))).toBe(false);
  });

  it('avulsa está feita com concluida_em', () => {
    expect(estaFeita(tarefa({ concluida_em: meioDia(HOJE) }))).toBe(true);
    expect(estaFeita(tarefa({ feita_hoje: true }))).toBe(false);
  });
});

describe('statusNoDia', () => {
  it('recorrente feita hoje aparece "feito", mesmo com status gravado "fazendo"', () => {
    expect(statusNoDia(tarefa({ dias_semana: [3], status: 'fazendo', feita_hoje: true }), HOJE)).toBe('feito');
  });

  it('recorrente não feita hoje mostra o status gravado — e nunca fica atrasada', () => {
    const t = tarefa({ dias_semana: [3], status: 'fazendo', prazo: '2026-09-01' });
    expect(statusNoDia(t, HOJE)).toBe('fazendo');
  });

  it('avulsa concluída é "feito", mesmo com prazo vencido', () => {
    expect(statusNoDia(tarefa({ prazo: '2026-09-01', concluida_em: meioDia('2026-09-02') }), HOJE)).toBe('feito');
  });

  it('avulsa com prazo vencido é "atrasada"', () => {
    expect(statusNoDia(tarefa({ prazo: '2026-09-22' }), HOJE)).toBe('atrasada');
  });

  it('prazo IGUAL a hoje ainda não é atraso', () => {
    expect(statusNoDia(tarefa({ prazo: HOJE, status: 'fazendo' }), HOJE)).toBe('fazendo');
  });

  it('pausada com prazo vencido NÃO é atrasada ("não fazer por enquanto" é decisão)', () => {
    expect(statusNoDia(tarefa({ prazo: '2026-09-01', status: 'pausada' }), HOJE)).toBe('pausada');
  });

  it('avulsa sem prazo mostra o status gravado', () => {
    expect(statusNoDia(tarefa({ status: 'nao_iniciado' }), HOJE)).toBe('nao_iniciado');
  });
});

describe('tarefaCaiNoDia', () => {
  it('recorrente cai nos dias dela e só neles', () => {
    const t = tarefa({ dias_semana: [1, 3, 5] });
    expect(tarefaCaiNoDia(t, 3, HOJE)).toBe(true);
    expect(tarefaCaiNoDia(t, 2, '2026-09-22')).toBe(false);
  });

  it('recorrente de todos os dias cai em qualquer dia, inclusive domingo', () => {
    const t = tarefa({ dias_semana: [0, 1, 2, 3, 4, 5, 6] });
    expect(tarefaCaiNoDia(t, 0, '2026-09-27')).toBe(true);
  });

  it('avulsa sem prazo e não feita aparece todo dia (pendência sem data)', () => {
    expect(tarefaCaiNoDia(tarefa(), QUARTA, HOJE)).toBe(true);
  });

  it('avulsa com prazo: aparece no dia do prazo e depois dele, não antes', () => {
    const t = tarefa({ prazo: HOJE });
    expect(tarefaCaiNoDia(t, QUARTA, HOJE)).toBe(true);
    expect(tarefaCaiNoDia(t, 4, '2026-09-24')).toBe(true);
    expect(tarefaCaiNoDia(t, 2, '2026-09-22')).toBe(false);
  });

  it('avulsa concluída aparece só no dia em que foi concluída', () => {
    const t = tarefa({ concluida_em: meioDia(HOJE) });
    expect(tarefaCaiNoDia(t, QUARTA, HOJE)).toBe(true);
    expect(tarefaCaiNoDia(t, 4, '2026-09-24')).toBe(false);
  });
});

describe('dataDoDiaNaSemana', () => {
  it('na quarta, "Seg" é a segunda desta semana e "Dom" é o domingo que fecha a semana', () => {
    expect(dataDoDiaNaSemana(HOJE, QUARTA, 1)).toBe('2026-09-21');
    expect(dataDoDiaNaSemana(HOJE, QUARTA, 0)).toBe('2026-09-27');
    expect(dataDoDiaNaSemana(HOJE, QUARTA, QUARTA)).toBe(HOJE);
  });

  it('no domingo, "Seg" é seis dias antes (a semana começa na segunda)', () => {
    expect(dataDoDiaNaSemana('2026-09-27', 0, 1)).toBe('2026-09-21');
  });

  it('atravessa a virada de mês', () => {
    expect(dataDoDiaNaSemana('2026-10-01', 4, 1)).toBe('2026-09-28');
  });
});

describe('dataLocalISO', () => {
  it('usa a data local, não a de Greenwich', () => {
    expect(dataLocalISO(new Date(2026, 8, 23, 23, 30))).toBe('2026-09-23');
  });
});

describe('filtrarTarefas', () => {
  const pedro = { id: 'p1', nome: 'Pedro', avatar_url: null };
  const rotina = { id: 'e1', descricao: 'Rotina', cor: null };
  const tarefas = [
    tarefa({ id: 'a', titulo: 'Conferência do caixa', dias_semana: [0, 1, 2, 3, 4, 5, 6], responsaveis: [pedro] }),
    tarefa({ id: 'b', titulo: 'Varrer a loja', dias_semana: [1, 5], prioridade: 'alta', etiquetas: [rotina] }),
    tarefa({ id: 'c', titulo: 'Pedido das sacolas', descricao: 'Fornecedor novo', prazo: '2026-09-20' }),
    tarefa({ id: 'd', titulo: 'Feedback da semana', status: 'pausada' }),
  ];
  const hoje = { iso: HOJE, diaSemana: QUARTA };
  const ids = (xs: Tarefa[]) => xs.map((t) => t.id);

  it('sem filtro, passa tudo', () => {
    expect(ids(filtrarTarefas(tarefas, FILTROS_TAREFAS_VAZIO, hoje))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lista vazia devolve vazia', () => {
    expect(filtrarTarefas([], { ...FILTROS_TAREFAS_VAZIO, dia: 'hoje' }, hoje)).toEqual([]);
  });

  it('busca ignora acento e maiúscula, e olha também a descrição', () => {
    expect(ids(filtrarTarefas(tarefas, { ...FILTROS_TAREFAS_VAZIO, busca: 'CONFERENCIA' }, hoje))).toEqual(['a']);
    expect(ids(filtrarTarefas(tarefas, { ...FILTROS_TAREFAS_VAZIO, busca: 'fornecedor' }, hoje))).toEqual(['c']);
  });

  it('pessoa, prioridade e etiqueta', () => {
    expect(ids(filtrarTarefas(tarefas, { ...FILTROS_TAREFAS_VAZIO, pessoa: 'p1' }, hoje))).toEqual(['a']);
    expect(ids(filtrarTarefas(tarefas, { ...FILTROS_TAREFAS_VAZIO, prioridade: 'alta' }, hoje))).toEqual(['b']);
    expect(ids(filtrarTarefas(tarefas, { ...FILTROS_TAREFAS_VAZIO, etiqueta: 'e1' }, hoje))).toEqual(['b']);
  });

  it('status compara o status NO DIA — "atrasada" acha a avulsa vencida', () => {
    expect(ids(filtrarTarefas(tarefas, { ...FILTROS_TAREFAS_VAZIO, status: 'atrasada' }, hoje))).toEqual(['c']);
  });

  it('"Hoje" (quarta) traz a de todos os dias e as avulsas pendentes, não a de seg/sex', () => {
    expect(ids(filtrarTarefas(tarefas, { ...FILTROS_TAREFAS_VAZIO, dia: 'hoje' }, hoje))).toEqual(['a', 'c', 'd']);
  });

  it('chip de dia da semana usa a data daquele dia nesta semana', () => {
    // Segunda desta semana = 21/09: a avulsa com prazo 20/09 já caiu.
    expect(ids(filtrarTarefas(tarefas, { ...FILTROS_TAREFAS_VAZIO, dia: 1 }, hoje))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(filtrarTarefas(tarefas, { ...FILTROS_TAREFAS_VAZIO, dia: 2 }, hoje))).toEqual(['a', 'c', 'd']);
  });
});

describe('resumoDeStatus', () => {
  it('lista vazia: todos os contadores em zero, nenhum faltando', () => {
    expect(resumoDeStatus([], HOJE)).toEqual({ nao_iniciado: 0, fazendo: 0, feito: 0, pausada: 0, atrasada: 0 });
  });

  it('conta pelo status do dia', () => {
    const r = resumoDeStatus(
      [
        tarefa({ dias_semana: [3], feita_hoje: true }),
        tarefa({ dias_semana: [3], status: 'fazendo' }),
        tarefa({ prazo: '2026-09-01' }),
        tarefa({ status: 'pausada', prazo: '2026-09-01' }),
        tarefa(),
      ],
      HOJE,
    );
    expect(r).toEqual({ nao_iniciado: 1, fazendo: 1, feito: 1, pausada: 1, atrasada: 1 });
  });
});

describe('ordemEntre', () => {
  it('coluna vazia: 1024', () => {
    expect(ordemEntre()).toBe(1024);
  });

  it('só o de cima (soltou no fim): anda 1024 para baixo', () => {
    expect(ordemEntre(2048, undefined)).toBe(3072);
  });

  it('só o de baixo (soltou no topo): anda 1024 para cima', () => {
    expect(ordemEntre(undefined, 1024)).toBe(0);
  });

  it('entre dois: a média', () => {
    expect(ordemEntre(1024, 2048)).toBe(1536);
  });

  it('zero conta como vizinho (não é "ausente")', () => {
    expect(ordemEntre(0, 1024)).toBe(512);
    expect(ordemEntre(undefined, 0)).toBe(-1024);
  });
});

describe('precisaRenumerar / renumerar', () => {
  it('vizinhos bem espaçados não precisam', () => {
    expect(precisaRenumerar([1024, 2048, 3072])).toBe(false);
  });

  it('lista vazia ou de um só não precisa', () => {
    expect(precisaRenumerar([])).toBe(false);
    expect(precisaRenumerar([5])).toBe(false);
  });

  it('dois vizinhos a menos de 0,000001 precisam — mesmo fora de ordem', () => {
    expect(precisaRenumerar([3000, 1024, 1024 + 1e-7])).toBe(true);
  });

  it('empate exato precisa', () => {
    expect(precisaRenumerar([1024, 1024])).toBe(true);
  });

  it('renumerar dá 1024, 2048... na ordem recebida', () => {
    expect(renumerar(['x', 'y', 'z'])).toEqual([
      { id: 'x', ordem: 1024 },
      { id: 'y', ordem: 2048 },
      { id: 'z', ordem: 3072 },
    ]);
    expect(renumerar([])).toEqual([]);
  });
});

describe('ordenarPorOrdem / agruparPorLista', () => {
  it('ordena sem mexer na lista original', () => {
    const xs = [{ ordem: 3 }, { ordem: 1 }, { ordem: 2 }];
    expect(ordenarPorOrdem(xs).map((x) => x.ordem)).toEqual([1, 2, 3]);
    expect(xs.map((x) => x.ordem)).toEqual([3, 1, 2]);
  });

  it('agrupa por lista, cada grupo em ordem', () => {
    const grupos = agruparPorLista([
      tarefa({ id: 'b', lista_id: 'l1', ordem: 2048 }),
      tarefa({ id: 'c', lista_id: 'l2', ordem: 1024 }),
      tarefa({ id: 'a', lista_id: 'l1', ordem: 1024 }),
    ]);
    expect(grupos.get('l1')!.map((t) => t.id)).toEqual(['a', 'b']);
    expect(grupos.get('l2')!.map((t) => t.id)).toEqual(['c']);
    expect(agruparPorLista([]).size).toBe(0);
  });
});

describe('saudacao / primeiroNome', () => {
  it('manhã, tarde e noite', () => {
    expect(saudacao(0)).toBe('Bom dia');
    expect(saudacao(11)).toBe('Bom dia');
    expect(saudacao(12)).toBe('Boa tarde');
    expect(saudacao(17)).toBe('Boa tarde');
    expect(saudacao(18)).toBe('Boa noite');
  });

  it('primeiro nome, tolerando espaço sobrando e nome vazio', () => {
    expect(primeiroNome('  Pedro Henrique Souza ')).toBe('Pedro');
    expect(primeiroNome('Richard')).toBe('Richard');
    expect(primeiroNome('')).toBe('');
  });
});

describe('montarTarefa', () => {
  const linha: LinhaTarefaDoBanco = {
    id: 't9',
    quadro_id: 'q1',
    lista_id: 'l1',
    titulo: 'Conferir o quadro',
    descricao: null,
    prioridade: 'alta',
    status: 'fazendo',
    dias_semana: [5, 1],
    periodo_id: 'per1',
    prazo: null,
    concluida_em: null,
    ordem: 1024,
    arquivada_em: null,
    criado_por: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    periodo: { id: 'per1', descricao: 'Manhã (7 às 11)' },
    tarefas_responsaveis: [
      { user_id: 'u2', profiles: { id: 'u2', nome: 'Richard', avatar_url: null } },
      { user_id: 'u1', profiles: { id: 'u1', nome: 'Leo', avatar_url: null } },
      { user_id: 'u3', profiles: null },
    ],
    tarefas_etiquetas: [{ catalogo_id: 'e1', catalogos: { id: 'e1', descricao: 'Rotina', cor: 'bg-emerald-500 text-white' } }],
    tarefas_checklist: [{ feito: true }, { feito: false }, { feito: true }],
    tarefas_comentarios: [{ id: 'c1' }, { id: 'c2' }],
  };

  it('monta contadores, pessoas em ordem de nome e o feito de hoje', () => {
    const t = montarTarefa(linha, new Map([['t9', { conferida: false }]]));
    expect(t.checklist_total).toBe(3);
    expect(t.checklist_feitos).toBe(2);
    expect(t.comentarios_total).toBe(2);
    expect(t.responsaveis.map((p) => p.nome)).toEqual(['Leo', 'Richard']);
    expect(t.etiquetas.map((e) => e.descricao)).toEqual(['Rotina']);
    expect(t.dias_semana).toEqual([1, 5]);
    expect(t.feita_hoje).toBe(true);
    expect(t.periodo?.descricao).toBe('Manhã (7 às 11)');
  });

  it('sem embeds (dublê de teste) não quebra', () => {
    const { periodo, tarefas_responsaveis, tarefas_etiquetas, tarefas_checklist, tarefas_comentarios, ...seca } = linha;
    const t = montarTarefa(seca, new Map());
    expect(t.responsaveis).toEqual([]);
    expect(t.checklist_total).toBe(0);
    expect(t.periodo).toBeNull();
    expect(t.feita_hoje).toBe(false);
  });

  it('aceita contagem de comentários no formato [{ count }]', () => {
    expect(montarTarefa({ ...linha, tarefas_comentarios: [{ count: 7 }] }, new Map()).comentarios_total).toBe(7);
  });

  it('"fazendo" de tarefa que se repete vale só no dia em que foi marcado', () => {
    // Pedro clicou "Começar" ontem e não terminou: a de hoje é outra tarefa.
    const ontem = { ...linha, status: 'fazendo', updated_at: '2026-09-22T14:00:00' };
    expect(montarTarefa(ontem, new Map(), HOJE).status).toBe('nao_iniciado');
    // Começou hoje: continua "fazendo".
    const hoje = { ...linha, status: 'fazendo', updated_at: '2026-09-23T09:00:00' };
    expect(montarTarefa(hoje, new Map(), HOJE).status).toBe('fazendo');
    // Pausada não é andamento do dia: fica como está.
    expect(montarTarefa({ ...ontem, status: 'pausada' }, new Map(), HOJE).status).toBe('pausada');
    // Avulsa "fazendo" desde ontem continua fazendo: ela não recomeça todo dia.
    expect(montarTarefa({ ...ontem, dias_semana: [] }, new Map(), HOJE).status).toBe('fazendo');
  });

  it('valor desconhecido de prioridade/status cai no padrão em vez de quebrar a tela', () => {
    const t = montarTarefa({ ...linha, prioridade: 'altissima', status: 'sei_la' }, new Map());
    expect(t.prioridade).toBe('normal');
    expect(t.status).toBe('nao_iniciado');
  });
});

/* ── A regra do "feito" (lib/tarefasMutacoes) ──────────────────────────────── */

describe('planoDeStatus — o feito de cada dia', () => {
  const AGORA = '2026-09-23T15:00:00.000Z';

  it('recorrente não iniciada + feito grava só a conclusão de hoje', () => {
    const p = planoDeStatus(tarefa({ dias_semana: [3] }), 'feito', AGORA);
    expect(p).toEqual({ linha: null, conclusaoDeHoje: 'gravar', otimista: { feita_hoje: true } });
  });

  it('recorrente "fazendo" + feito: grava o feito de hoje e fecha o "fazendo" (amanhã começa limpa)', () => {
    // Pedro clica "Começar", depois marca a bolinha. Sem isto, a tarefa de
    // todo dia amanheceria "Fazendo" e alguém teria de zerar à mão.
    const p = planoDeStatus(tarefa({ dias_semana: [3], status: 'fazendo' }), 'feito', AGORA);
    expect(p).toEqual({
      linha: { status: 'nao_iniciado' },
      conclusaoDeHoje: 'gravar',
      otimista: { status: 'nao_iniciado', feita_hoje: true },
    });
    // Pela bolinha dá no mesmo.
    expect(planoDeAlternarFeito(tarefa({ dias_semana: [3], status: 'fazendo' }), AGORA).linha).toEqual({
      status: 'nao_iniciado',
    });
  });

  it('recorrente pausada + feito não mexe no "não fazer por enquanto"', () => {
    expect(planoDeStatus(tarefa({ dias_semana: [3], status: 'pausada' }), 'feito', AGORA).linha).toBeNull();
  });

  it('recorrente já feita hoje + feito: nada a fazer', () => {
    const p = planoDeStatus(tarefa({ dias_semana: [3], feita_hoje: true }), 'feito', AGORA);
    expect(p.linha).toBeNull();
    expect(p.conclusaoDeHoje).toBeNull();
  });

  it('recorrente feita hoje que volta para "fazendo" apaga a conclusão de hoje', () => {
    const p = planoDeStatus(tarefa({ dias_semana: [3], feita_hoje: true }), 'fazendo', AGORA);
    expect(p.linha).toEqual({ status: 'fazendo' });
    expect(p.conclusaoDeHoje).toBe('apagar');
    expect(p.otimista).toEqual({ status: 'fazendo', feita_hoje: false });
  });

  it('avulsa + feito grava status e concluida_em', () => {
    const p = planoDeStatus(tarefa(), 'feito', AGORA);
    expect(p.linha).toEqual({ status: 'feito', concluida_em: AGORA });
    expect(p.conclusaoDeHoje).toBeNull();
  });

  it('avulsa concluída que volta para "fazendo" limpa concluida_em', () => {
    const p = planoDeStatus(tarefa({ status: 'feito', concluida_em: AGORA }), 'fazendo', AGORA);
    expect(p.linha).toEqual({ status: 'fazendo', concluida_em: null });
  });
});

describe('planoDeAlternarFeito — a bolinha', () => {
  const AGORA = '2026-09-23T15:00:00.000Z';

  it('recorrente pendente: marca o feito de hoje', () => {
    expect(planoDeAlternarFeito(tarefa({ dias_semana: [3] }), AGORA).conclusaoDeHoje).toBe('gravar');
  });

  it('recorrente feita hoje: desmarca só a conclusão', () => {
    const p = planoDeAlternarFeito(tarefa({ dias_semana: [3], feita_hoje: true }), AGORA);
    expect(p).toEqual({ linha: null, conclusaoDeHoje: 'apagar', otimista: { feita_hoje: false } });
  });

  it('avulsa concluída: volta a "não iniciado"', () => {
    const p = planoDeAlternarFeito(tarefa({ status: 'feito', concluida_em: AGORA }), AGORA);
    expect(p.linha).toEqual({ status: 'nao_iniciado', concluida_em: null });
  });

  it('avulsa pendente: conclui', () => {
    expect(planoDeAlternarFeito(tarefa(), AGORA).linha).toEqual({ status: 'feito', concluida_em: AGORA });
  });
});

describe('camposAoMudarFrequencia', () => {
  it('avulsa concluída que ganha dias volta a "não iniciado" (o banco recusaria)', () => {
    expect(camposAoMudarFrequencia({ status: 'feito' }, [1, 3])).toEqual({ status: 'nao_iniciado', concluida_em: null });
  });

  it('qualquer outro caso não mexe em nada', () => {
    expect(camposAoMudarFrequencia({ status: 'fazendo' }, [1])).toEqual({});
    expect(camposAoMudarFrequencia({ status: 'feito' }, [])).toEqual({});
  });
});

describe('mensagemLeiga', () => {
  it('recusa de permissão vira frase de gente, venha como Error ou como objeto do Supabase', () => {
    expect(mensagemLeiga(new Error('new row violates row-level security policy'))).toBe(
      'Seu perfil de acesso não permite isso.',
    );
    expect(mensagemLeiga({ message: 'permission denied for table tarefas', code: '42501' })).toBe(
      'Seu perfil de acesso não permite isso.',
    );
  });

  it('mensagem dos gatilhos (já em português) passa como está', () => {
    const msg = 'Seu perfil só permite marcar o andamento das suas tarefas, não editá-las.';
    expect(mensagemLeiga({ message: msg })).toBe(msg);
  });

  it('queda de rede avisa da internet', () => {
    expect(mensagemLeiga(new TypeError('Failed to fetch'))).toMatch(/internet/);
  });

  it('coisa que nem é erro não quebra', () => {
    expect(mensagemLeiga(undefined)).toBe('Erro desconhecido');
  });

  it('link errado ou cortado vira "endereço inválido", nunca o inglês do banco', () => {
    const erro = { message: 'invalid input syntax for type uuid: "abc"', code: '22P02' };
    expect(mensagemLeiga(erro)).toMatch(/Endereço inválido/);
    expect(ehEnderecoInvalido(erro)).toBe(true);
    expect(ehEnderecoInvalido({ message: 'x', code: '42501' })).toBe(false);
  });

  it('sessão expirada, repetido e valor recusado viram frase de gente', () => {
    expect(mensagemLeiga({ message: 'JWT expired', code: 'PGRST301' })).toMatch(/sessão expirou/);
    expect(mensagemLeiga({ message: 'duplicate key value violates unique constraint "x"', code: '23505' })).toBe(
      'Isso já existe.',
    );
    expect(
      mensagemLeiga({
        message: 'new row for relation "tarefas" violates check constraint "tarefas_titulo_check"',
        code: '23514',
      }),
    ).toMatch(/texto ficou vazio ou grande demais/);
  });

  it('erro do banco que não reconhecemos não chega em inglês na tela', () => {
    const msg = mensagemLeiga({ message: 'could not serialize access due to concurrent update', code: '40001' });
    expect(msg).not.toMatch(/serialize/);
    expect(msg).toMatch(/avise o Felipe/);
  });

  it('mensagem de gatilho perde o nome interno da tabela', () => {
    const erro = {
      message: 'Tarefa que se repete não fica "feita" para sempre: marque o feito de hoje (tarefas_conclusoes).',
      code: 'P0001',
    };
    expect(mensagemLeiga(erro)).toBe('Tarefa que se repete não fica "feita" para sempre: marque o feito de hoje.');
  });
});

describe('Consulta das tarefas (contrato com o banco)', () => {
  /**
   * O dublê de teste ignora o texto do select, então nenhum teste de tela
   * pega um select que o banco recusa. Este prende o que já quebrou de
   * verdade: `tarefas` chega em `catalogos` por dois caminhos (o turno e as
   * etiquetas), e o turno sem a indicação do caminho faz o banco recusar a
   * consulta inteira (PGRST201) — nenhum quadro abria. Conferido contra o
   * banco em 23/09: com a indicação, a consulta passa.
   */
  it('o turno diz por qual ligação ir', () => {
    expect(SELECT_TAREFA).toContain('periodo:catalogos!tarefas_periodo_id_fkey(');
  });

  it('nenhum outro embed de catalogos direto em tarefas sem a indicação', () => {
    // "catalogos(" dentro de tarefas_etiquetas(...) é de outra tabela, que
    // chega em catalogos por um caminho só; fora dele, não pode sobrar nenhum.
    const foraDasEtiquetas = SELECT_TAREFA.replace('tarefas_etiquetas(catalogo_id, catalogos(id, descricao, cor))', '');
    expect(foraDasEtiquetas).not.toContain('catalogos(');
  });
});

describe('Filtro e a tarefa recém-criada', () => {
  const HOJE_F = { iso: HOJE, diaSemana: QUARTA };
  const PEDRO = { id: 'u-pedro', nome: 'Pedro', avatar_url: null };

  it('sabe quando há filtro ligado', () => {
    expect(temFiltroAtivo(FILTROS_TAREFAS_VAZIO)).toBe(false);
    expect(temFiltroAtivo({ ...FILTROS_TAREFAS_VAZIO, busca: '  ' })).toBe(false);
    expect(temFiltroAtivo({ ...FILTROS_TAREFAS_VAZIO, dia: 'hoje' })).toBe(true);
  });

  it('a nova aparece quando o filtro deixa, e não aparece quando o filtro esconde', () => {
    const nova = { titulo: 'Repor os copos', lista_id: 'l1', responsaveis: [PEDRO] };
    expect(novaTarefaApareceNoFiltro(nova, { ...FILTROS_TAREFAS_VAZIO, busca: 'copos' }, HOJE_F)).toBe(true);
    expect(novaTarefaApareceNoFiltro(nova, { ...FILTROS_TAREFAS_VAZIO, pessoa: 'u-pedro' }, HOJE_F)).toBe(true);
    expect(novaTarefaApareceNoFiltro(nova, { ...FILTROS_TAREFAS_VAZIO, busca: 'caixa' }, HOJE_F)).toBe(false);
    expect(novaTarefaApareceNoFiltro(nova, { ...FILTROS_TAREFAS_VAZIO, etiqueta: 'e1' }, HOJE_F)).toBe(false);
    expect(novaTarefaApareceNoFiltro(nova, { ...FILTROS_TAREFAS_VAZIO, status: 'feito' }, HOJE_F)).toBe(false);
    expect(novaTarefaApareceNoFiltro(nova, { ...FILTROS_TAREFAS_VAZIO, prioridade: 'alta' }, HOJE_F)).toBe(false);
  });
});

describe('desfazerSo — o erro desfaz só o que a ação mexeu', () => {
  const A = tarefa({ id: 'a', ordem: 1 });
  const B = tarefa({ id: 'b', ordem: 2 });
  const base: DadosDoQuadro = { quadro: null, listas: [], tarefas: [A, B] };
  const marcar = (d: DadosDoQuadro, id: string): DadosDoQuadro => ({
    ...d,
    tarefas: d.tarefas.map((t) => (t.id === id ? { ...t, feita_hoje: true } : t)),
  });

  it('A falha depois de B dar certo: B continua marcada', () => {
    const depoisDeA = marcar(base, 'a');
    const depoisDeB = marcar(depoisDeA, 'b');
    const tela = desfazerSo(depoisDeB, base, depoisDeA);
    expect(tela.tarefas.find((t) => t.id === 'a')!.feita_hoje).toBe(false);
    expect(tela.tarefas.find((t) => t.id === 'b')!.feita_hoje).toBe(true);
  });

  it('A e B falham, na ordem A e depois B: nenhuma fica marcada', () => {
    const depoisDeA = marcar(base, 'a');
    const depoisDeB = marcar(depoisDeA, 'b');
    const semA = desfazerSo(depoisDeB, base, depoisDeA);
    const semB = desfazerSo(semA, depoisDeA, depoisDeB);
    expect(semB.tarefas.every((t) => !t.feita_hoje)).toBe(true);
  });

  it('arquivar que falha devolve o cartão, no lugar dele', () => {
    const semA: DadosDoQuadro = { ...base, tarefas: [B] };
    const tela = desfazerSo(semA, base, semA);
    expect(tela.tarefas.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  v2 (24/09): conferência do gerente, horário e anexos                      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('estadoDeConferencia', () => {
  const AGORA = '2026-09-23T15:00:00.000Z';

  it('recorrente: olha só o feito de HOJE', () => {
    const rec = { dias_semana: [1, 3], concluida_em: null, conferida_em: null };
    expect(estadoDeConferencia(rec, undefined)).toBe('nenhuma');
    expect(estadoDeConferencia(rec, { feita: false, conferida: false })).toBe('nenhuma');
    expect(estadoDeConferencia(rec, { feita: true, conferida: false })).toBe('aguardando');
    expect(estadoDeConferencia(rec, { feita: true, conferida: true })).toBe('conferida');
  });

  it('recorrente ignora conferida_em da linha (a conferência dela mora no feito do dia)', () => {
    const rec = { dias_semana: [3], concluida_em: AGORA, conferida_em: AGORA };
    expect(estadoDeConferencia(rec, undefined)).toBe('nenhuma');
  });

  it('avulsa: pela própria linha', () => {
    expect(estadoDeConferencia({ dias_semana: [], concluida_em: null, conferida_em: null }, undefined)).toBe('nenhuma');
    expect(estadoDeConferencia({ dias_semana: [], concluida_em: AGORA, conferida_em: null }, undefined)).toBe(
      'aguardando',
    );
    expect(estadoDeConferencia({ dias_semana: [], concluida_em: AGORA, conferida_em: AGORA }, undefined)).toBe(
      'conferida',
    );
    // Linha sem a coluna (consulta antiga / dublê): concluída = aguardando.
    expect(estadoDeConferencia({ dias_semana: null, concluida_em: AGORA }, undefined)).toBe('aguardando');
  });
});

describe('semAguardandoConferencia — o cartão "vai para a aba"', () => {
  it('tira só o que espera o gerente; conferida continua no quadro como feita', () => {
    const lista = [
      tarefa({ id: 'a', conferencia: 'nenhuma' }),
      tarefa({ id: 'b', conferencia: 'aguardando' }),
      tarefa({ id: 'c', conferencia: 'conferida' }),
    ];
    expect(semAguardandoConferencia(lista).map((t) => t.id)).toEqual(['a', 'c']);
    expect(semAguardandoConferencia([])).toEqual([]);
  });
});

describe('statusNoDia com a conferência', () => {
  it('aguardando e conferida contam como feita no dia', () => {
    expect(statusNoDia(tarefa({ dias_semana: [3], feita_hoje: true, conferencia: 'aguardando' }), HOJE)).toBe('feito');
    expect(statusNoDia(tarefa({ dias_semana: [3], feita_hoje: true, conferencia: 'conferida' }), HOJE)).toBe('feito');
    // Avulsa vencida mas já feita e conferida não é "atrasada".
    expect(
      statusNoDia(
        tarefa({ prazo: '2026-09-01', concluida_em: meioDia(HOJE), status: 'feito', conferencia: 'conferida' }),
        HOJE,
      ),
    ).toBe('feito');
  });
});

describe('normalizarHorario', () => {
  it('lê os jeitos de escrever hora do balcão', () => {
    expect(normalizarHorario('07:30')).toBe('07:30');
    expect(normalizarHorario('7:30')).toBe('07:30');
    expect(normalizarHorario('07:30:00')).toBe('07:30'); // como o banco devolve o TIME
    expect(normalizarHorario('7h30')).toBe('07:30');
    expect(normalizarHorario('7h')).toBe('07:00');
    expect(normalizarHorario('10h')).toBe('10:00');
    expect(normalizarHorario(' 18H00 ')).toBe('18:00');
    expect(normalizarHorario('00:00')).toBe('00:00');
  });

  it('o que não parece hora vira null', () => {
    expect(normalizarHorario('abc')).toBeNull();
    expect(normalizarHorario('Depois do almoço')).toBeNull();
    expect(normalizarHorario('25:00')).toBeNull();
    expect(normalizarHorario('10:60')).toBeNull();
    expect(normalizarHorario('7')).toBeNull();
    expect(normalizarHorario('')).toBeNull();
    expect(normalizarHorario(null)).toBeNull();
    expect(normalizarHorario(undefined)).toBeNull();
  });
});

describe('horariosDoCatalogo', () => {
  it('mantém a ordem do catálogo e marca o que não dá para gravar como hora', () => {
    const opcoes = horariosDoCatalogo([
      { id: 'h1', descricao: '7h30', ativo: true },
      { id: 'h2', descricao: 'Depois do almoço', ativo: true },
      { id: 'h3', descricao: '18:00', ativo: false },
    ]);
    expect(opcoes).toEqual([
      { id: 'h1', descricao: '7h30', ativo: true, valor: '07:30' },
      { id: 'h2', descricao: 'Depois do almoço', ativo: true, valor: null },
      { id: 'h3', descricao: '18:00', ativo: false, valor: '18:00' },
    ]);
    expect(horariosDoCatalogo([])).toEqual([]);
  });
});

describe('ordenarPorHorario', () => {
  it('com hora primeiro (mais cedo antes), sem hora no fim na ordem do quadro', () => {
    const xs = [
      { id: 'sem-2', horario: null, ordem: 2048 },
      { id: '14h', horario: '14:00', ordem: 1 },
      { id: 'sem-1', horario: null, ordem: 1024 },
      { id: '07h30', horario: '07:30', ordem: 9999 },
      { id: '10h-b', horario: '10:00', ordem: 20 },
      { id: '10h-a', horario: '10:00', ordem: 10 },
    ];
    expect(ordenarPorHorario(xs).map((x) => x.id)).toEqual(['07h30', '10h-a', '10h-b', '14h', 'sem-1', 'sem-2']);
  });

  it('não mexe na lista recebida e aguenta lista vazia', () => {
    const xs = [
      { horario: null, ordem: 2 },
      { horario: '08:00', ordem: 1 },
    ];
    const copia = [...xs];
    ordenarPorHorario(xs);
    expect(xs).toEqual(copia);
    expect(ordenarPorHorario([])).toEqual([]);
  });
});

describe('tamanhoLegivel', () => {
  it('do jeito que aparece no celular, com vírgula', () => {
    expect(tamanhoLegivel(0)).toBe('0 bytes');
    expect(tamanhoLegivel(512)).toBe('512 bytes');
    expect(tamanhoLegivel(820 * 1024)).toBe('820 KB');
    expect(tamanhoLegivel(1.2 * 1024 * 1024)).toBe('1,2 MB');
    expect(tamanhoLegivel(LIMITE_DO_ANEXO)).toBe('20 MB');
    expect(tamanhoLegivel(3 * 1024 * 1024 * 1024)).toBe('3 GB');
  });

  it('valor estranho não quebra', () => {
    expect(tamanhoLegivel(-5)).toBe('0 bytes');
    expect(tamanhoLegivel(Number.NaN)).toBe('0 bytes');
  });
});

describe('ehImagem', () => {
  it('pelo tipo, quando ele veio', () => {
    expect(ehImagem('image/jpeg', 'x')).toBe(true);
    expect(ehImagem('image/png', 'x.pdf')).toBe(true);
    expect(ehImagem('application/pdf', 'foto.jpg')).toBe(false);
    // Foto do iPhone que o navegador não desenha: ícone, não miniatura quebrada.
    expect(ehImagem('image/heic', 'IMG_0001.HEIC')).toBe(false);
  });

  it('pelo nome, quando o arquivo chegou sem tipo', () => {
    expect(ehImagem(null, 'vitrine.JPG')).toBe(true);
    expect(ehImagem('', 'vitrine.webp')).toBe(true);
    expect(ehImagem('application/octet-stream', 'vitrine.jpeg')).toBe(true);
    expect(ehImagem(null, 'orcamento.pdf')).toBe(false);
    expect(ehImagem(null, 'sem-extensao')).toBe(false);
  });
});

describe('nomeDeArquivoSeguro — o nome que vai no caminho do bucket', () => {
  it('sem acento, sem espaço, só o que o caminho aceita', () => {
    expect(nomeDeArquivoSeguro('Foto da vitrine (1).JPG')).toBe('Foto-da-vitrine-1.JPG');
    expect(nomeDeArquivoSeguro('Orçamento ção.pdf')).toBe('Orcamento-cao.pdf');
    expect(nomeDeArquivoSeguro('../../segredo.txt')).toBe('segredo.txt');
  });

  it('nome vazio ou só de símbolo vira "arquivo"', () => {
    expect(nomeDeArquivoSeguro('')).toBe('arquivo');
    expect(nomeDeArquivoSeguro('###')).toBe('arquivo');
  });

  it('nome enorme é cortado mantendo a extensão', () => {
    const nome = nomeDeArquivoSeguro(`${'a'.repeat(300)}.pdf`);
    expect(nome.length).toBe(100);
    expect(nome.endsWith('.pdf')).toBe(true);
  });
});

describe('montarTarefa — v2', () => {
  const base: LinhaTarefaDoBanco = {
    id: 't1',
    quadro_id: 'q1',
    lista_id: 'l1',
    titulo: 'Abrir a loja',
    descricao: null,
    prioridade: 'normal',
    status: 'nao_iniciado',
    dias_semana: [3],
    periodo_id: null,
    prazo: null,
    concluida_em: null,
    ordem: 1024,
    arquivada_em: null,
    criado_por: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  };

  it('horário do banco ("HH:MM:SS") vira "HH:MM"; sem horário, null', () => {
    expect(montarTarefa({ ...base, horario: '10:00:00' }, new Map()).horario).toBe('10:00');
    expect(montarTarefa(base, new Map()).horario).toBeNull();
  });

  it('recorrente: o feito de hoje diz a conferência', () => {
    expect(montarTarefa(base, new Map()).conferencia).toBe('nenhuma');
    const aguardando = montarTarefa(base, new Map([['t1', { conferida: false }]]));
    expect(aguardando.feita_hoje).toBe(true);
    expect(aguardando.conferencia).toBe('aguardando');
    expect(montarTarefa(base, new Map([['t1', { conferida: true }]])).conferencia).toBe('conferida');
  });

  it('avulsa: pela linha', () => {
    const avulsa = { ...base, dias_semana: [], status: 'feito', concluida_em: '2026-09-23T12:00:00Z' };
    expect(montarTarefa(avulsa, new Map()).conferencia).toBe('aguardando');
    expect(montarTarefa({ ...avulsa, conferida_em: '2026-09-23T13:00:00Z' }, new Map()).conferencia).toBe(
      'conferida',
    );
  });

  it('conta os anexos (ids ou [{ count }]); sem o embed, zero', () => {
    expect(montarTarefa({ ...base, tarefas_anexos: [{ id: 'a1' }, { id: 'a2' }] }, new Map()).anexos_total).toBe(2);
    expect(montarTarefa({ ...base, tarefas_anexos: [{ count: 5 }] }, new Map()).anexos_total).toBe(5);
    expect(montarTarefa(base, new Map()).anexos_total).toBe(0);
  });
});

describe('aplicarCamposDoFeito — o selo acompanha a bolinha na hora', () => {
  const AGORA = '2026-09-23T15:00:00.000Z';

  it('marcou feito: vai para "aguardando" (o cartão sai do quadro na hora)', () => {
    const t = tarefa({ dias_semana: [3] });
    const depois = aplicarCamposDoFeito(t, planoDeAlternarFeito(t, AGORA).otimista);
    expect(depois.feita_hoje).toBe(true);
    expect(depois.conferencia).toBe('aguardando');

    const avulsa = tarefa();
    expect(aplicarCamposDoFeito(avulsa, planoDeAlternarFeito(avulsa, AGORA).otimista).conferencia).toBe('aguardando');
  });

  it('desmarcou: a conferência some junto (o banco apaga também)', () => {
    const t = tarefa({ dias_semana: [3], feita_hoje: true, conferencia: 'aguardando' });
    expect(aplicarCamposDoFeito(t, planoDeAlternarFeito(t, AGORA).otimista).conferencia).toBe('nenhuma');
  });

  it('continua feita: não mexe no selo (conferida segue conferida)', () => {
    const t = tarefa({ dias_semana: [3], feita_hoje: true, conferencia: 'conferida' });
    expect(aplicarCamposDoFeito(t, { titulo: 'Outro' }).conferencia).toBe('conferida');
  });

  it('não altera a tarefa recebida', () => {
    const t = tarefa({ dias_semana: [3] });
    aplicarCamposDoFeito(t, { feita_hoje: true });
    expect(t.feita_hoje).toBe(false);
    expect(t.conferencia).toBe('nenhuma');
  });
});

describe('montarItensDeConferencia — o que entra na aba', () => {
  const endereco = {
    quadro: { nome: 'Loja', arquivado_em: null },
    lista: { nome: 'Pedro', cor: 'bg-red-500 text-white', arquivada_em: null },
  };
  const tarefaRec = {
    id: 't-rec',
    titulo: 'Repor os copos',
    prioridade: 'alta',
    dias_semana: [5, 1],
    horario: '10:00:00',
    arquivada_em: null,
    quadro_id: 'q1',
    lista_id: 'l-pedro',
    ...endereco,
  };
  const conclusao = (dia: string, extra: object = {}) => ({
    tarefa_id: 't-rec',
    dia,
    concluida_em: `${dia}T13:00:00Z`,
    concluida_por: 'u-pedro',
    conferida_em: null,
    tarefa: tarefaRec,
    ...extra,
  });
  const avulsa = (extra: object = {}) => ({
    id: 't-av',
    titulo: 'Fazer o pedido das sacolas',
    prioridade: 'sei_la',
    dias_semana: [],
    horario: null,
    concluida_em: '2026-09-23T14:00:00Z',
    conferida_em: null,
    arquivada_em: null,
    quadro_id: 'q2',
    lista_id: 'l-gerente',
    quadro: { nome: 'Assistência', arquivado_em: null },
    lista: { nome: 'Gerente', cor: null, arquivada_em: null },
    ...extra,
  });

  it('une os feitos do dia e as avulsas, o mais recente primeiro', () => {
    const itens = montarItensDeConferencia([conclusao('2026-09-22'), conclusao('2026-09-23')], [avulsa()]);
    expect(itens.map((i) => [i.tarefa_id, i.dia])).toEqual([
      ['t-av', null],
      ['t-rec', '2026-09-23'],
      ['t-rec', '2026-09-22'],
    ]);
    const rec = itens[1];
    expect(rec).toMatchObject({
      titulo: 'Repor os copos',
      prioridade: 'alta',
      dias_semana: [1, 5],
      horario: '10:00',
      quadro_nome: 'Loja',
      lista_nome: 'Pedro',
      lista_cor: 'bg-red-500 text-white',
      feita_por: 'u-pedro',
      feita_em: '2026-09-23T13:00:00Z',
    });
    // Avulsa: o banco não guarda quem clicou; prioridade desconhecida cai no padrão.
    expect(itens[0].feita_por).toBeNull();
    expect(itens[0].prioridade).toBe('normal');
  });

  it('deixa de fora o já conferido e o que saiu de circulação', () => {
    const itens = montarItensDeConferencia(
      [
        conclusao('2026-09-21', { conferida_em: '2026-09-21T18:00:00Z' }),
        conclusao('2026-09-22', { tarefa: { ...tarefaRec, arquivada_em: '2026-09-22T20:00:00Z' } }),
        conclusao('2026-09-23', { tarefa: { ...tarefaRec, lista: { ...endereco.lista, arquivada_em: 'x' } } }),
        conclusao('2026-09-20', { tarefa: null }),
      ],
      [
        avulsa({ conferida_em: '2026-09-23T15:00:00Z' }),
        avulsa({ id: 't-av2', concluida_em: null }),
        avulsa({ id: 't-av3', quadro: { nome: 'Velho', arquivado_em: 'x' } }),
        // Recorrente com concluida_em (resto antigo) não é conferida por aqui.
        avulsa({ id: 't-av4', dias_semana: [1] }),
      ],
    );
    expect(itens).toEqual([]);
  });

  it('com quadro escolhido, só os dele', () => {
    const itens = montarItensDeConferencia([conclusao('2026-09-23')], [avulsa()], 'q1');
    expect(itens.map((i) => i.tarefa_id)).toEqual(['t-rec']);
  });
});

describe('Consultas da v2 (contrato com o banco)', () => {
  /**
   * `concluida_por`, `conferida_por` e `enviado_por` apontam para a conta de
   * acesso (auth.users), não para `profiles`: embutir o cadastro neles faz o
   * banco recusar a consulta inteira. O dublê de teste não pegaria isso.
   */
  it('a tarefa traz horário, conferência e a contagem de anexos', () => {
    expect(SELECT_TAREFA).toMatch(/\bhorario\b/);
    expect(SELECT_TAREFA).toMatch(/\bconferida_em\b/);
    expect(SELECT_TAREFA).toContain('tarefas_anexos(id)');
  });

  it('nenhuma consulta embute o cadastro em quem fez, conferiu ou enviou', () => {
    for (const sel of [SELECT_TAREFA, SELECT_CONCLUSAO_PENDENTE, SELECT_AVULSA_PENDENTE]) {
      expect(sel).not.toMatch(/(concluida_por|conferida_por|enviado_por)\s*[:(]/);
      expect(sel).not.toMatch(/profiles!\w*(concluida_por|conferida_por|enviado_por)/);
    }
  });

  it('a conferência não usa catalogos sem dizer o caminho (tarefas chega lá por dois)', () => {
    expect(SELECT_CONCLUSAO_PENDENTE).not.toContain('catalogos(');
    expect(SELECT_AVULSA_PENDENTE).not.toContain('catalogos(');
  });
});
