import { STATUS_ATRASADA, TAREFA_PRIORIDADES, TAREFA_STATUS } from '@/config/tarefas';
import type { StatusNoDia, Tarefa, TarefaPrioridade } from '@/types/tarefas';

/**
 * As contas do rodapé de cada grupo da Tabela: quantas tarefas em cada
 * situação e em cada prioridade, e a frase que diz isso como gente fala
 * ("3 feitas · 2 fazendo"). Sem tela aqui, para dar para testar a frase sozinha.
 */

export interface SegmentoResumo {
  chave: string;
  quantidade: number;
  /** Classe completa, de config/tarefas.ts. */
  cor: string;
}

/** Ordem do Monday: o que já foi primeiro, o que falta depois. */
const ORDEM_DOS_STATUS: StatusNoDia[] = ['feito', 'fazendo', 'atrasada', 'nao_iniciado', 'pausada'];

const COR_DO_STATUS: Record<StatusNoDia, string> = {
  feito: TAREFA_STATUS.feito.cor,
  fazendo: TAREFA_STATUS.fazendo.cor,
  atrasada: STATUS_ATRASADA.cor,
  nao_iniciado: TAREFA_STATUS.nao_iniciado.cor,
  pausada: TAREFA_STATUS.pausada.cor,
};

/** Como se fala cada situação no plural ("3 feitas", "1 atrasada"). */
const FALA_DO_STATUS: Record<StatusNoDia, [string, string]> = {
  feito: ['feita', 'feitas'],
  fazendo: ['fazendo', 'fazendo'],
  atrasada: ['atrasada', 'atrasadas'],
  nao_iniciado: ['não iniciada', 'não iniciadas'],
  // O mesmo nome do filtro e do seletor de status ("Não fazer por enquanto"):
  // uma palavra nova só aqui ("em espera") fazia parecer outra situação.
  pausada: ['não fazer por enquanto', 'não fazer por enquanto'],
};

export function segmentosDeStatus(resumo: Record<StatusNoDia, number>): SegmentoResumo[] {
  return ORDEM_DOS_STATUS.map((s) => ({ chave: s, quantidade: resumo[s] ?? 0, cor: COR_DO_STATUS[s] }));
}

/** "3 feitas · 2 fazendo · 5 não iniciadas" (só o que tem). */
export function descreverResumoDeStatus(resumo: Record<StatusNoDia, number>): string {
  const partes = ORDEM_DOS_STATUS.filter((s) => (resumo[s] ?? 0) > 0).map((s) => {
    const n = resumo[s];
    const [um, varios] = FALA_DO_STATUS[s];
    return `${n} ${n === 1 ? um : varios}`;
  });
  return partes.length > 0 ? partes.join(' · ') : 'Nenhuma tarefa';
}

/** Da mais séria para a mais leve. */
const ORDEM_DAS_PRIORIDADES = (Object.keys(TAREFA_PRIORIDADES) as TarefaPrioridade[]).sort(
  (a, b) => TAREFA_PRIORIDADES[b].ordem - TAREFA_PRIORIDADES[a].ordem,
);

const FALA_DA_PRIORIDADE: Record<TarefaPrioridade, [string, string]> = {
  urgente: ['urgente', 'urgentes'],
  alta: ['alta', 'altas'],
  normal: ['normal', 'normais'],
  baixa: ['baixa', 'baixas'],
  livre: ['livre', 'livres'],
};

export function resumoDePrioridade(tarefas: Tarefa[]): Record<TarefaPrioridade, number> {
  const resumo: Record<TarefaPrioridade, number> = { livre: 0, baixa: 0, normal: 0, alta: 0, urgente: 0 };
  for (const t of tarefas) if (t.prioridade in resumo) resumo[t.prioridade] += 1;
  return resumo;
}

export function segmentosDePrioridade(resumo: Record<TarefaPrioridade, number>): SegmentoResumo[] {
  return ORDEM_DAS_PRIORIDADES.map((p) => ({ chave: p, quantidade: resumo[p], cor: TAREFA_PRIORIDADES[p].cor }));
}

/** "1 urgente · 3 altas · 4 normais". */
export function descreverResumoDePrioridade(resumo: Record<TarefaPrioridade, number>): string {
  const partes = ORDEM_DAS_PRIORIDADES.filter((p) => resumo[p] > 0).map((p) => {
    const [um, varios] = FALA_DA_PRIORIDADE[p];
    return `${resumo[p]} ${resumo[p] === 1 ? um : varios}`;
  });
  return partes.length > 0 ? partes.join(' · ') : 'Nenhuma tarefa';
}
