/**
 * Tarefas da equipe — prioridades, andamentos e dias da semana.
 *
 * Pedido do Felipe em 23/09/2026: trocar o Trello e o Monday por um quadro
 * dentro do sisteminha, "só para gestão de tarefas".
 *
 * Por que estas listas são fixas no código e não Listas do Sistema: são REGRA
 * do sistema, não escolha da loja. A tela decide coisas a partir delas —
 * "feito" zera sozinho no dia seguinte, "não fazer por enquanto" some de
 * Minhas Tarefas, "urgente" sobe na lista. O que a loja escolhe (os turnos do
 * dia e as etiquetas) mora em `catalogos` (`tarefa_periodo`, `tarefa_etiqueta`).
 * O banco confere os mesmos valores (CHECK da migration 20260923220000).
 *
 * As cores estão escritas por extenso de propósito: o Tailwind só gera o CSS
 * das classes que encontra no código. Classe montada em pedaços chega ao
 * navegador sem cor nenhuma.
 */

export const TAREFA_PRIORIDADES = {
  livre: { label: 'Livre', cor: 'bg-slate-400 text-white', ordem: 0 },
  baixa: { label: 'Baixa', cor: 'bg-emerald-500 text-white', ordem: 1 },
  normal: { label: 'Normal', cor: 'bg-indigo-500 text-white', ordem: 2 },
  alta: { label: 'Alta', cor: 'bg-orange-500 text-white', ordem: 3 },
  urgente: { label: 'Urgente', cor: 'bg-red-600 text-white', ordem: 4 },
} as const;

export const TAREFA_STATUS = {
  nao_iniciado: { label: 'Não iniciado', cor: 'bg-slate-500 text-white' },
  fazendo: { label: 'Fazendo', cor: 'bg-amber-500 text-white' },
  feito: { label: 'Feito', cor: 'bg-emerald-500 text-white' },
  // O "NÃO FAZER POR ENQUANTO" do Trello do Felipe.
  pausada: { label: 'Não fazer por enquanto', cor: 'bg-slate-700 text-white' },
} as const;

/**
 * Derivado, nunca gravado: tarefa avulsa com prazo vencido e sem conclusão.
 * Não existe no banco porque "atrasada" muda sozinha com o relógio — gravar
 * isso exigiria alguém (ou um robô) atualizar todo dia, exatamente o trabalho
 * manual que o Felipe quer parar de fazer no Monday.
 */
export const STATUS_ATRASADA = { label: 'Atrasada', cor: 'bg-red-600 text-white' } as const;

/**
 * Ordem de exibição: segunda a domingo, como a semana da loja.
 * `n` é o número que o banco grava (0 = domingo ... 6 = sábado, o mesmo do
 * `Date.getDay()`). Cores = as etiquetas de dia do Trello do Felipe, para a
 * equipe reconhecer de primeira.
 */
export const DIAS_SEMANA = [
  { n: 1, curto: 'Seg', nome: 'Segunda', cor: 'bg-red-500 text-white' },
  { n: 2, curto: 'Ter', nome: 'Terça', cor: 'bg-orange-500 text-white' },
  { n: 3, curto: 'Qua', nome: 'Quarta', cor: 'bg-yellow-400 text-slate-900' },
  { n: 4, curto: 'Qui', nome: 'Quinta', cor: 'bg-amber-500 text-white' },
  { n: 5, curto: 'Sex', nome: 'Sexta', cor: 'bg-purple-500 text-white' },
  { n: 6, curto: 'Sáb', nome: 'Sábado', cor: 'bg-pink-500 text-white' },
  { n: 0, curto: 'Dom', nome: 'Domingo', cor: 'bg-cyan-500 text-white' },
] as const;

/** A etiqueta verde "TODOS OS DIAS" do Trello. */
export const TODOS_OS_DIAS = { label: 'Todos os dias', cor: 'bg-green-600 text-white' } as const;
export const TODOS_OS_DIAS_LISTA = [0, 1, 2, 3, 4, 5, 6];
