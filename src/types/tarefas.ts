import type { TAREFA_PRIORIDADES, TAREFA_STATUS } from '@/config/tarefas';

/**
 * Tipos do módulo Tarefas (o Trello e o Monday dentro do sisteminha).
 *
 * Os dados são um só — quadro → listas → tarefas — e Kanban e Tabela são duas
 * formas de olhar a mesma coisa (frase do Felipe: "tudo é um kanban... é tudo
 * cards, colunas e fileiras"). Por isso as duas visões recebem exatamente as
 * mesmas props (`PropsVisaoQuadro`) e nenhuma delas fala com o banco: quem
 * fala é `useQuadro`, que entrega as `AcoesDoQuadro`.
 */

export type TarefaPrioridade = keyof typeof TAREFA_PRIORIDADES;
export type TarefaStatus = keyof typeof TAREFA_STATUS;
/** O que a tela mostra num dia: o status gravado, ou o derivado "atrasada". */
export type StatusNoDia = TarefaStatus | 'atrasada';

export interface Pessoa {
  id: string;
  nome: string;
  avatar_url: string | null;
}

/** Item do catálogo `tarefa_etiqueta`. */
export interface Etiqueta {
  id: string;
  descricao: string;
  cor: string | null;
}

export interface Quadro {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  ordem: number;
  arquivado_em: string | null;
  created_at: string;
  updated_at: string;
  /** Preenchidos na lista de quadros (podem faltar se a contagem falhar). */
  total_listas?: number;
  total_tarefas?: number;
}

export interface Lista {
  id: string;
  quadro_id: string;
  nome: string;
  cor: string | null;
  /** A "coluna do Pedro": tarefa criada nela já nasce com ele. */
  responsavel_id: string | null;
  responsavel: Pessoa | null;
  ordem: number;
  arquivada_em: string | null;
}

export interface Tarefa {
  id: string;
  quadro_id: string;
  lista_id: string;
  titulo: string;
  descricao: string | null;
  prioridade: TarefaPrioridade;
  status: TarefaStatus;
  /** 0 = domingo ... 6 = sábado. Os sete = todos os dias. Vazia = avulsa. */
  dias_semana: number[];
  periodo_id: string | null;
  periodo: { id: string; descricao: string } | null;
  /** 'YYYY-MM-DD'. Só faz sentido em tarefa avulsa. */
  prazo: string | null;
  concluida_em: string | null;
  ordem: number;
  arquivada_em: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  responsaveis: Pessoa[];
  etiquetas: Etiqueta[];
  checklist_total: number;
  checklist_feitos: number;
  comentarios_total: number;
  /** Só faz sentido em tarefa recorrente: existe conclusão para hoje. */
  feita_hoje: boolean;
}

export interface ItemChecklist {
  id: string;
  tarefa_id: string;
  titulo: string;
  feito: boolean;
  ordem: number;
}

export interface Comentario {
  id: string;
  tarefa_id: string;
  autor_id: string;
  autor: Pessoa | null;
  texto: string;
  created_at: string;
}

/** Os chips de dia (as abas Segunda...Domingo do Monday). */
export type DiaFiltro = 'todas' | 'hoje' | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface FiltrosTarefasValores {
  busca: string;
  /** id da pessoa ('' = todas). */
  pessoa: string;
  /** TarefaPrioridade ('' = todas). */
  prioridade: string;
  /** StatusNoDia, inclusive 'atrasada' ('' = todos). */
  status: string;
  /** id do item de catálogo ('' = todas). */
  etiqueta: string;
  dia: DiaFiltro;
}

export const FILTROS_TAREFAS_VAZIO: FiltrosTarefasValores = {
  busca: '',
  pessoa: '',
  prioridade: '',
  status: '',
  etiqueta: '',
  dia: 'todas',
};

/**
 * Tudo que as visões podem fazer. Vem de useQuadro(); as visões não importam
 * hooks de dado.
 *
 * NENHUMA destas promessas rejeita: quando o banco recusa, o hook já devolveu
 * a tela ao estado anterior e já mostrou o aviso em português. Quem chama pode
 * dar `await` sem `try/catch`.
 */
export interface AcoesDoQuadro {
  criarTarefa: (d: {
    lista_id: string;
    titulo: string;
    dias_semana?: number[];
    prioridade?: TarefaPrioridade;
    /** Ausente = o período marcado como padrão em Listas do Sistema. */
    periodo_id?: string | null;
    /** Vazio = o responsável da coluna, se ela tiver um. */
    responsaveis?: string[];
    /**
     * `true` = gravou. Única ação que conta o resultado: a caixa de "Adicionar
     * tarefa" limpa o que foi digitado só quando deu certo — se o banco
     * recusar, a pessoa corrige e tenta de novo sem redigitar.
     */
  }) => Promise<boolean>;
  atualizarTarefa: (
    d: { id: string } & Partial<
      Pick<Tarefa, 'titulo' | 'descricao' | 'prioridade' | 'dias_semana' | 'periodo_id' | 'prazo'>
    >,
  ) => Promise<void>;
  /** Move para outra lista e/ou posição. `ordem` já calculada com ordemEntre(). */
  moverTarefa: (d: { id: string; lista_id: string; ordem: number }) => Promise<void>;
  /**
   * Regra: recorrente + 'feito' => grava conclusão de hoje (e, se estava
   * "fazendo", volta o andamento a "não iniciado" para amanhã começar limpo).
   * Avulsa + 'feito' => concluida_em = agora. Qualquer outro status: grava
   * status e, se recorrente e feita hoje, apaga a conclusão; se avulsa, limpa
   * concluida_em.
   */
  definirStatus: (d: { id: string; status: TarefaStatus }) => Promise<void>;
  /** Atalho da bolinha do cartão / caixa de Minhas Tarefas. */
  alternarFeito: (id: string) => Promise<void>;
  arquivarTarefa: (id: string) => Promise<void>;
  definirResponsaveis: (d: { id: string; user_ids: string[] }) => Promise<void>;
  definirEtiquetas: (d: { id: string; catalogo_ids: string[] }) => Promise<void>;
  /** `true` = gravou (a janelinha de "Adicionar coluna" só limpa e fecha nesse caso). */
  criarLista: (d: { nome: string; cor?: string | null; responsavel_id?: string | null }) => Promise<boolean>;
  atualizarLista: (d: {
    id: string;
    nome?: string;
    cor?: string | null;
    responsavel_id?: string | null;
  }) => Promise<void>;
  moverLista: (d: { id: string; ordem: number }) => Promise<void>;
  arquivarLista: (id: string) => Promise<void>;
}

/** Item de período como a tela o recebe (inclui o desativado já escolhido). */
export interface PeriodoOpcao {
  id: string;
  descricao: string;
  ativo: boolean;
  /** O padrão da loja em Listas do Sistema ("Livre", de fábrica). */
  padrao?: boolean;
}

/** Contratos das visões e da ficha (para as frentes codarem em paralelo). */
export interface PropsVisaoQuadro {
  /** Já sem arquivadas, em ordem. */
  listas: Lista[];
  /** Já FILTRADAS pela página, sem arquivadas. */
  tarefas: Tarefa[];
  podeEditar: boolean;
  acoes: AcoesDoQuadro;
  onAbrirTarefa: (tarefaId: string) => void;
  /** Cadastro de pessoas (para seletores). */
  pessoas: Pessoa[];
  periodos: PeriodoOpcao[];
  /** Catálogo tarefa_etiqueta (ativos). */
  etiquetas: Etiqueta[];
  /**
   * Há filtro ligado na página. Com filtro, "nenhuma tarefa" numa coluna
   * pode ser só o filtro escondendo — a visão avisa isso em vez de dizer que
   * a coluna está vazia.
   */
  filtroAtivo?: boolean;
  /** Desliga todos os filtros (botão "Limpar filtros" dos avisos de vazio). */
  onLimparFiltros?: () => void;
}

export interface PropsTarefaDialog {
  /** null = fechado. */
  tarefa: Tarefa | null;
  listas: Lista[];
  podeEditar: boolean;
  podeGerenciar: boolean;
  acoes: AcoesDoQuadro;
  pessoas: Pessoa[];
  periodos: PeriodoOpcao[];
  etiquetas: Etiqueta[];
  onClose: () => void;
}

export interface PropsFiltrosTarefas {
  valores: FiltrosTarefasValores;
  onChange: (v: FiltrosTarefasValores) => void;
  pessoas: Pessoa[];
  etiquetas: Etiqueta[];
  resultados?: number;
}

/** O que `criarQuadro` recebe (e `montarDadosDoModelo` devolve). */
export interface DadosNovoQuadro {
  nome: string;
  descricao?: string | null;
  cor?: string | null;
  listas: { nome: string; cor?: string | null; responsavel_id?: string | null }[];
  tarefas: {
    /** Índice em `listas`. */
    lista: number;
    titulo: string;
    dias_semana?: number[];
    prioridade?: TarefaPrioridade;
    status?: TarefaStatus;
    /** Descrição do item de `tarefa_periodo` ("Manhã (7 às 11)"); resolvida no banco. */
    periodo_descricao?: string | null;
  }[];
}

/** A tarefa como Minhas Tarefas a mostra: com o endereço dela. */
export interface TarefaMinha extends Tarefa {
  quadro_nome: string;
  lista_nome: string;
}
