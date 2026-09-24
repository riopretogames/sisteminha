import { describe, it, expect } from 'vitest';
import {
  agruparPorLista,
  dataDoDiaNaSemana,
  dataLocalISO,
  descreverDias,
  ehRecorrente,
  estaFeita,
  filtrarTarefas,
  montarTarefa,
  novaTarefaApareceNoFiltro,
  ordemEntre,
  ordenarPorOrdem,
  precisaRenumerar,
  primeiroNome,
  renumerar,
  resumoDeStatus,
  saudacao,
  statusNoDia,
  tarefaCaiNoDia,
  temFiltroAtivo,
  type LinhaTarefaDoBanco,
} from './tarefas';
import {
  camposAoMudarFrequencia,
  ehEnderecoInvalido,
  mensagemLeiga,
  planoDeAlternarFeito,
  planoDeStatus,
} from './tarefasMutacoes';
import { FILTROS_TAREFAS_VAZIO, type Tarefa } from '@/types/tarefas';
import { desfazerSo, SELECT_TAREFA, type DadosDoQuadro } from '@/hooks/useQuadro';

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
    const t = montarTarefa(linha, new Set(['t9']));
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
    const t = montarTarefa(seca, new Set());
    expect(t.responsaveis).toEqual([]);
    expect(t.checklist_total).toBe(0);
    expect(t.periodo).toBeNull();
    expect(t.feita_hoje).toBe(false);
  });

  it('aceita contagem de comentários no formato [{ count }]', () => {
    expect(montarTarefa({ ...linha, tarefas_comentarios: [{ count: 7 }] }, new Set()).comentarios_total).toBe(7);
  });

  it('"fazendo" de tarefa que se repete vale só no dia em que foi marcado', () => {
    // Pedro clicou "Começar" ontem e não terminou: a de hoje é outra tarefa.
    const ontem = { ...linha, status: 'fazendo', updated_at: '2026-09-22T14:00:00' };
    expect(montarTarefa(ontem, new Set(), HOJE).status).toBe('nao_iniciado');
    // Começou hoje: continua "fazendo".
    const hoje = { ...linha, status: 'fazendo', updated_at: '2026-09-23T09:00:00' };
    expect(montarTarefa(hoje, new Set(), HOJE).status).toBe('fazendo');
    // Pausada não é andamento do dia: fica como está.
    expect(montarTarefa({ ...ontem, status: 'pausada' }, new Set(), HOJE).status).toBe('pausada');
    // Avulsa "fazendo" desde ontem continua fazendo: ela não recomeça todo dia.
    expect(montarTarefa({ ...ontem, dias_semana: [] }, new Set(), HOJE).status).toBe('fazendo');
  });

  it('valor desconhecido de prioridade/status cai no padrão em vez de quebrar a tela', () => {
    const t = montarTarefa({ ...linha, prioridade: 'altissima', status: 'sei_la' }, new Set());
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
