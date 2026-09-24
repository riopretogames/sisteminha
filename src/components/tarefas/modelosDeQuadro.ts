import { TODOS_OS_DIAS_LISTA } from '@/config/tarefas';
import type { DadosNovoQuadro, TarefaPrioridade, TarefaStatus } from '@/types/tarefas';

/**
 * Modelos do "Novo quadro": Em branco, Loja e Assistência.
 *
 * Loja e Assistência são os dois quadros do Trello do Felipe em 23/09/2026
 * ("Rio Preto Games LTDA" e "Assistência"), passados a limpo: uma lista por
 * função e os cartões que ele já usava. A ideia é a equipe trocar de
 * ferramenta sem redigitar nada — abrir o sisteminha e achar o mesmo quadro
 * de sempre, só que com o "feito" zerando sozinho todo dia.
 *
 * As colunas têm nome de FUNÇÃO ("Vendedor sênior"), não de pessoa ("Pedro"):
 * quem entra e sai da equipe muda, a função fica. O responsável de cada
 * coluna é escolhido depois, no próprio quadro. E os nomes das listas podem
 * ser trocados antes de criar.
 *
 * Os dias da semana e os períodos são escritos aqui como a loja fala ('todos',
 * 'manha'), e `montarDadosDoModelo` traduz para o que o banco grava. O
 * período vai pelo NOME do turno ("Manhã (7 às 11)") porque o id é de cada
 * loja; se a loja renomeou o turno em Listas do Sistema, a tarefa entra sem
 * período em vez de travar a criação do quadro.
 *
 * As cores estão escritas por extenso de propósito (o Tailwind só gera o CSS
 * das classes que encontra no código) e são todas da paleta de
 * `lib/cores.ts`, a mesma que a tela oferece para escolher.
 */

export type IdModeloDeQuadro = 'em-branco' | 'loja' | 'assistencia';

/** Os turnos de fábrica do catálogo `tarefa_periodo`. */
export type PeriodoDoModelo = 'manha' | 'meio' | 'tarde' | 'livre';

export interface TarefaDoModelo {
  titulo: string;
  /** 'todos' = todos os dias; lista = dias (1=seg ... 6=sáb, 0=dom); ausente = avulsa. */
  dias?: number[] | 'todos';
  prioridade?: TarefaPrioridade;
  status?: TarefaStatus;
  periodo?: PeriodoDoModelo;
}

export interface ListaDoModelo {
  nome: string;
  cor?: string;
  tarefas: TarefaDoModelo[];
}

export interface ModeloDeQuadro {
  id: IdModeloDeQuadro;
  /** Nome do modelo no cartão de escolha. */
  nome: string;
  /** Uma linha, no cartão de escolha. */
  descricao: string;
  cor: string;
  /** Nome sugerido para o quadro criado. Vazio = a pessoa escolhe. */
  nomeDoQuadro: string;
  /** Descrição sugerida para o quadro criado. */
  descricaoDoQuadro?: string;
  listas: ListaDoModelo[];
}

/**
 * O nome de cada turno como a migration 20260923220000 semeou no catálogo.
 * Tem que bater letra por letra (a comparação ignora só maiúscula/minúscula).
 */
export const PERIODO_DO_MODELO: Record<PeriodoDoModelo, string> = {
  manha: 'Manhã (7 às 11)',
  meio: 'Meio do dia (11 às 15)',
  tarde: 'Tarde (15 às 19)',
  livre: 'Livre',
};

const LOJA: ModeloDeQuadro = {
  id: 'loja',
  nome: 'Loja',
  descricao: 'O Trello da loja: vendedores, gerente, dono e anúncios da OLX.',
  cor: 'bg-blue-500 text-white',
  nomeDoQuadro: 'Loja',
  descricaoDoQuadro: 'Rotina do balcão: vendedores, gerente, dono e anúncios.',
  listas: [
    {
      nome: 'Vendedor sênior',
      cor: 'bg-blue-500 text-white',
      tarefas: [
        { titulo: '4 anúncios na OLX e no Facebook (olha a bio)', dias: [1, 3, 5] },
        { titulo: '5 fotos de produto ou serviço no status do WhatsApp', dias: 'todos' },
        { titulo: 'Mandar a arte do dia e o texto no grupo de troca e venda', dias: 'todos' },
        { titulo: 'Fazer conteúdo para o story do Instagram', dias: 'todos' },
        { titulo: 'Revisar os laudos: algum foi aprovado?', dias: 'todos' },
        { titulo: 'Responder a OLX cedo', dias: 'todos', periodo: 'manha' },
        { titulo: 'Responder o Facebook cedo', dias: 'todos', periodo: 'manha' },
        { titulo: 'Ligar os telefones da loja ao chegar', dias: 'todos', periodo: 'manha', prioridade: 'alta' },
        { titulo: 'Varrer e passar pano na loja', dias: [1, 5] },
        { titulo: 'Repor os copos', dias: 'todos', prioridade: 'livre' },
        { titulo: 'Tirar o lixo e pôr os sacos', dias: [1, 3, 5], prioridade: 'livre' },
      ],
    },
    {
      nome: 'Vendedor júnior',
      cor: 'bg-cyan-500 text-white',
      tarefas: [
        { titulo: 'Tirar todos os lixos e repor os sacos', dias: [2, 4] },
        { titulo: 'Repor os copos', dias: 'todos' },
        { titulo: 'Dar um grau na frente da loja, deixar sempre limpa e organizada', dias: [1, 5] },
        { titulo: 'Trocar a toalha do banheiro e pôr papel higiênico', dias: [2] },
        { titulo: 'Organizar o balcão antes de ir embora', dias: 'todos', periodo: 'tarde' },
        { titulo: 'Não deixar mensagem no WhatsApp para o dia seguinte', dias: 'todos', periodo: 'tarde' },
        { titulo: 'Pôr celulares e maquininha para carregar toda noite', dias: 'todos', periodo: 'tarde' },
        { titulo: 'Desligar todos os PCs antes de ir embora', dias: 'todos', periodo: 'tarde', prioridade: 'alta' },
      ],
    },
    {
      nome: 'Gerente',
      cor: 'bg-amber-500 text-white',
      tarefas: [
        { titulo: 'Conferir e alinhar o quadro de tarefas', dias: 'todos', periodo: 'manha' },
        { titulo: 'Editar o quadro de metas do grupo', dias: 'todos' },
        { titulo: 'Conferência do caixa', dias: 'todos', periodo: 'tarde' },
        { titulo: 'Conferir o cartão de ponto dos colaboradores', dias: [6] },
        { titulo: 'Fazer o pedido das sacolas', status: 'fazendo' },
        { titulo: 'Fazer o feedback da semana', status: 'pausada' },
        { titulo: 'Colocar foto profissional no Telegram, em todos os grupos' },
      ],
    },
    {
      nome: 'Dono',
      cor: 'bg-purple-500 text-white',
      tarefas: [
        { titulo: 'Calendário de feriados do ano' },
        { titulo: 'Estudo de bonificações da equipe' },
        { titulo: 'Tabela de orçamentos com a gerência' },
        { titulo: 'Contagem e correção do estoque', status: 'fazendo', prioridade: 'urgente' },
      ],
    },
    {
      nome: 'Anúncios OLX',
      cor: 'bg-orange-500 text-white',
      tarefas: [
        { titulo: 'Série X 2TB' },
        { titulo: 'PS5 Pro' },
        { titulo: 'Nintendo Switch novo lacrado' },
        { titulo: 'Controle seminovo GameSir' },
        { titulo: 'Cockpit' },
        { titulo: 'Todos os equipamentos da Razer', status: 'fazendo' },
        { titulo: 'PS5 Slim com leitor' },
        { titulo: 'iPhone 17 Pro Max' },
        { titulo: 'Jogos de PS5: anunciar os jogos unitários (os bons e os lançamentos)' },
        { titulo: 'iPhone 16 Pro' },
        { titulo: 'PC gamer parado' },
        { titulo: 'iPhones e celulares' },
        { titulo: 'Switches' },
      ],
    },
  ],
};

const ASSISTENCIA: ModeloDeQuadro = {
  id: 'assistencia',
  nome: 'Assistência',
  descricao: 'O Trello da assistência: técnico, gerente técnico, auxiliar e compras.',
  cor: 'bg-purple-500 text-white',
  nomeDoQuadro: 'Assistência',
  descricaoDoQuadro: 'Rotina da bancada: técnico, gerente técnico, auxiliar e compras.',
  listas: [
    {
      nome: 'Técnico',
      cor: 'bg-emerald-500 text-white',
      tarefas: [
        { titulo: 'Passar aspirador no chão da assistência', dias: [2] },
        { titulo: 'Tirar os lixos e pôr a sacola de volta (cozinha, assistência e banheiro)', dias: [1, 4] },
        { titulo: 'Colocar os equipamentos para carregar: parafusadeira, soprador, aspirador', dias: [2, 5] },
        { titulo: 'Reabastecer os recipientes de álcool', dias: [5] },
        { titulo: 'Limpar os tapetes de silicone (cozinha, assistência, corredor e banheiro)', dias: [2] },
        { titulo: 'Limpar e organizar a assistência', dias: [5] },
      ],
    },
    {
      nome: 'Gerente técnico',
      cor: 'bg-violet-500 text-white',
      tarefas: [
        { titulo: 'Preencher a ficha de serviço diária', dias: 'todos' },
        { titulo: 'Cobrar as terceirizadas', dias: [1, 3] },
        {
          titulo: 'Relatório de OS aguardando aprovação e mandar para o balcão cobrar um posicionamento',
          dias: [1],
        },
        { titulo: 'Revisar o grupo de laudos: algum serviço perdido ou sem aprovação?', dias: [1] },
        { titulo: 'Organização e conferência da prateleira', dias: [1] },
      ],
    },
    {
      nome: 'Auxiliar',
      cor: 'bg-cyan-500 text-white',
      tarefas: [
        { titulo: 'Bater o ponto', dias: 'todos', periodo: 'manha' },
        { titulo: 'Preencher a ficha de serviço diária', dias: 'todos' },
        { titulo: 'Ficar com o telefone da assistência e responder o WhatsApp e as demandas', dias: 'todos' },
      ],
    },
    {
      nome: 'Dono',
      cor: 'bg-purple-500 text-white',
      tarefas: [
        { titulo: 'Organizar o Kanban de OS', dias: 'todos' },
        { titulo: 'Ensinar o Kanban para quem entrou' },
        { titulo: 'Conferir os relatórios' },
        { titulo: 'Vídeo para o Instagram mostrando a loja, um produto ou um serviço', dias: 'todos', periodo: 'livre' },
      ],
    },
    {
      nome: 'Conferência do quadro',
      cor: 'bg-pink-500 text-white',
      tarefas: [{ titulo: 'Conferir o quadro da assistência', dias: [1, 2, 3, 4, 5], periodo: 'manha' }],
    },
    {
      nome: 'Produtos a comprar',
      cor: 'bg-orange-500 text-white',
      tarefas: [
        { titulo: 'Leitor com mecanismo para PS4 Fat e PS4 Slim' },
        { titulo: 'Hall TMR para PS5', prioridade: 'alta' },
        { titulo: 'Conector FPC do OLED' },
      ],
    },
  ],
};

const EM_BRANCO: ModeloDeQuadro = {
  id: 'em-branco',
  nome: 'Em branco',
  descricao: 'Três colunas simples para começar do zero e montar do seu jeito.',
  cor: 'bg-slate-500 text-white',
  nomeDoQuadro: '',
  // Colunas com nome de ASSUNTO, nunca de andamento. "A fazer / Fazendo /
  // Feito" (o padrão do Trello) enganava aqui: arrastar para "Feito" não
  // marca a tarefa como feita (quem marca é a bolinha), e ela continuava
  // pendente em Minhas Tarefas.
  listas: [
    { nome: 'Esta semana', cor: 'bg-blue-500 text-white', tarefas: [] },
    { nome: 'Próxima semana', cor: 'bg-slate-500 text-white', tarefas: [] },
    { nome: 'Ideias', cor: 'bg-purple-500 text-white', tarefas: [] },
  ],
};

/** Na ordem em que aparecem para escolher. */
export const MODELOS_DE_QUADRO: ModeloDeQuadro[] = [EM_BRANCO, LOJA, ASSISTENCIA];

export function modeloPorId(id: IdModeloDeQuadro): ModeloDeQuadro {
  return MODELOS_DE_QUADRO.find((m) => m.id === id) ?? EM_BRANCO;
}

/** "5 listas · 43 tarefas", para o cartão de escolha e o estado vazio de Quadros. */
export function resumoDoModelo(modelo: ModeloDeQuadro): { listas: number; tarefas: number } {
  return {
    listas: modelo.listas.length,
    tarefas: modelo.listas.reduce((soma, l) => soma + l.tarefas.length, 0),
  };
}

function diasDoModelo(dias: TarefaDoModelo['dias']): number[] {
  if (dias === 'todos') return [...TODOS_OS_DIAS_LISTA];
  return [...(dias ?? [])].sort((a, b) => a - b);
}

/**
 * Transforma o modelo no que `criarQuadro` grava.
 *
 * `nomesDasListas[i]` renomeia a lista `i` do modelo (a tela deixa trocar os
 * nomes antes de criar). Nome ausente ou em branco fica com o do modelo — um
 * quadro com coluna sem nome não teria como ser lido depois.
 *
 * Quem tira ou acrescenta listas monta um modelo derivado antes de chamar
 * (é o que o NovoQuadroDialog faz): assim a regra de tradução fica num lugar
 * só, e as tarefas continuam presas à lista certa pelo índice.
 */
export function montarDadosDoModelo(modelo: ModeloDeQuadro, nomesDasListas?: string[]): DadosNovoQuadro {
  return {
    nome: modelo.nomeDoQuadro.trim() || 'Novo quadro',
    descricao: modelo.descricaoDoQuadro ?? null,
    cor: modelo.cor,
    listas: modelo.listas.map((l, i) => ({
      nome: (nomesDasListas?.[i] ?? '').trim() || l.nome,
      cor: l.cor ?? null,
    })),
    tarefas: modelo.listas.flatMap((l, indice) =>
      l.tarefas.map((t) => {
        const dias = diasDoModelo(t.dias);
        // Tarefa que se repete não nasce "feita" (o banco recusa): o feito é
        // de cada dia. Nenhum modelo faz isso hoje; a trava é para o próximo
        // que alguém escrever.
        const status: TarefaStatus =
          t.status === 'feito' && dias.length > 0 ? 'nao_iniciado' : t.status ?? 'nao_iniciado';
        return {
          lista: indice,
          titulo: t.titulo,
          dias_semana: dias,
          prioridade: t.prioridade ?? 'normal',
          status,
          periodo_descricao: t.periodo ? PERIODO_DO_MODELO[t.periodo] : null,
        };
      }),
    ),
  };
}
