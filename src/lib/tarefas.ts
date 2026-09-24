import { DIAS_SEMANA, TAREFA_PRIORIDADES, TAREFA_STATUS } from '@/config/tarefas';
import type {
  DiaFiltro,
  EstadoConferencia,
  Etiqueta,
  FiltrosTarefasValores,
  HorarioOpcao,
  Pessoa,
  StatusNoDia,
  Tarefa,
  TarefaPrioridade,
  TarefaStatus,
} from '@/types/tarefas';

/**
 * Regras das tarefas da equipe — puras, sem banco, testadas em tarefas.test.ts.
 *
 * Tudo que decide "está feita?", "está atrasada?", "cai hoje?" mora aqui, num
 * lugar só. Kanban, Tabela, ficha e Minhas Tarefas perguntam para estas
 * funções; se cada tela respondesse do seu jeito, o cartão diria "feito" e a
 * linha da tabela diria "não iniciado" para a mesma tarefa.
 */

/* ── Frequência ────────────────────────────────────────────────────────────── */

/** Tarefa que se repete (tem dia da semana). Sem dia = avulsa. */
export function ehRecorrente(t: Pick<Tarefa, 'dias_semana'>): boolean {
  return (t.dias_semana ?? []).length > 0;
}

/**
 * "Seg, Qua e Sex", do jeito que se fala. Sempre na ordem da semana da loja
 * (segunda a domingo), não na ordem em que os dias foram clicados.
 */
export function descreverDias(dias: number[]): string {
  const unicos = new Set(dias ?? []);
  if (unicos.size === 0) return 'Avulsa';
  if (unicos.size >= 7) return 'Todos os dias';
  const nomes = DIAS_SEMANA.filter((d) => unicos.has(d.n)).map((d) => d.curto);
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/* ── Datas ─────────────────────────────────────────────────────────────────── */

/** 'YYYY-MM-DD' no fuso do computador da loja (não em UTC). */
export function dataLocalISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * A data do dia `dia` (0-6) na semana de hoje, contando a semana de segunda a
 * domingo — é o que o chip "Qua" quer dizer para quem olha o quadro numa
 * sexta: a quarta desta semana, não a da semana que vem.
 */
export function dataDoDiaNaSemana(hojeISO: string, diaHoje: number, dia: number): string {
  const posicao = (n: number) => (n === 0 ? 7 : n); // domingo fecha a semana
  const [a, m, d] = hojeISO.split('-').map(Number);
  const data = new Date(a, m - 1, d);
  data.setDate(data.getDate() + (posicao(dia) - posicao(diaHoje)));
  return dataLocalISO(data);
}

/* ── Situação no dia ───────────────────────────────────────────────────────── */

/**
 * Está feita? Recorrente: tem conclusão de hoje (amanhã volta a ficar
 * pendente sozinha — é o fim do "zerar status à mão" do Monday). Avulsa: tem
 * `concluida_em`.
 */
export function estaFeita(t: Pick<Tarefa, 'dias_semana' | 'feita_hoje' | 'concluida_em'>): boolean {
  return ehRecorrente(t) ? Boolean(t.feita_hoje) : Boolean(t.concluida_em);
}

/**
 * O que a tela mostra no lugar do status.
 *
 * - Recorrente: feita hoje => 'feito'; senão o status gravado (que nunca é
 *   'feito' — o banco recusa, justamente para não congelar a tarefa).
 * - Avulsa: concluída => 'feito'; pausada continua pausada mesmo com prazo
 *   vencido ("não fazer por enquanto" não é atraso, é decisão); prazo antes
 *   de hoje => 'atrasada'.
 */
export function statusNoDia(t: Tarefa, hojeISO: string): StatusNoDia {
  // Aguardando o gerente ou já conferida: para quem fez, está feita. A
  // conferência é um passo a mais do gerente, não um "ainda não terminou".
  if (t.conferencia === 'aguardando' || t.conferencia === 'conferida') return 'feito';
  if (ehRecorrente(t)) return t.feita_hoje ? 'feito' : t.status;
  if (t.concluida_em) return 'feito';
  if (t.status === 'pausada') return 'pausada';
  if (t.prazo && t.prazo < hojeISO) return 'atrasada';
  return t.status;
}

/**
 * A tarefa aparece no dia `dia` (0-6, data `dataISO`)?
 *
 * - Recorrente: se o dia está na frequência dela.
 * - Avulsa não concluída: se o prazo já chegou (prazo vencido continua
 *   aparecendo todo dia até alguém resolver) ou se não tem prazo nenhum
 *   (pendência sem data é pendência todo dia).
 * - Avulsa concluída: só no dia em que foi concluída. Sem isso, marcar
 *   "feito" em Minhas Tarefas faria a linha sumir na hora, e quem clicou sem
 *   querer não teria como desfazer.
 */
export function tarefaCaiNoDia(t: Tarefa, dia: number, dataISO: string): boolean {
  if (ehRecorrente(t)) return t.dias_semana.includes(dia);
  if (t.concluida_em) return dataLocalISO(new Date(t.concluida_em)) === dataISO;
  return t.prazo ? t.prazo <= dataISO : true;
}

/** Dia da semana (0 = domingo ... 6 = sábado) de uma data 'YYYY-MM-DD', sem passar por fuso. */
export function diaDaSemanaDe(dataISO: string): number {
  const [a, m, d] = dataISO.split('-').map(Number);
  return new Date(a, m - 1, d).getDay();
}

/**
 * Por que a bolinha de "feito" desta tarefa fica travada agora — ou `null`
 * quando dá para marcar. Kanban, Tabela e ficha perguntam aqui.
 *
 * O feito de uma tarefa que se repete é SEMPRE o de hoje (é o que a tela
 * grava). Achado da revisão de 24/09: a bolinha deixava marcar numa quinta a
 * tarefa "seg, qua e sex" — gravava um feito de quinta, a tarefa ia para a
 * Conferência e na sexta voltava pendente, e quem "adiantou" achava que já
 * tinha feito. Por isso, duas travas (decisão da revisão; o Felipe pode pedir
 * o contrário, que é o chip de um dia gravar a data daquele dia):
 *
 * 1. hoje não é dia da tarefa: a bolinha não marca;
 * 2. o chip ligado é de OUTRO dia (numa terça, o chip "Seg"): a lista mostra
 *    as tarefas de segunda, mas a situação e a bolinha são as de hoje. Marcar
 *    ali gravaria o feito de terça achando que era o de segunda.
 *
 * Tarefa avulsa não trava (o feito dela não é de um dia), e o feito já
 * marcado sempre pode ser desmarcado — é a saída de quem clicou sem querer.
 */
export function travaDoFeito(
  t: Pick<Tarefa, 'dias_semana' | 'feita_hoje' | 'concluida_em'>,
  hojeISO: string,
  diaDoFiltro: DiaFiltro = 'todas',
): string | null {
  if (!ehRecorrente(t) || estaFeita(t)) return null;
  const diaDeHoje = diaDaSemanaDe(hojeISO);
  if (!t.dias_semana.includes(diaDeHoje)) {
    return `Hoje não é dia desta tarefa (${descreverDias(t.dias_semana)}). O feito só se marca no dia dela.`;
  }
  if (typeof diaDoFiltro === 'number' && diaDoFiltro !== diaDeHoje) {
    const nome = DIAS_SEMANA.find((d) => d.n === diaDoFiltro)?.nome.toLowerCase() ?? 'outro dia';
    return `Você está vendo as tarefas de ${nome}. A bolinha marca o feito de hoje: para marcar, use o chip "Hoje".`;
  }
  return null;
}

/* ── Conferência do gerente (v2, 24/09) ────────────────────────────────────── */

/**
 * Em que pé está a conferência da tarefa.
 *
 * - Recorrente: olha o feito de HOJE (`hoje`, vindo de tarefas_conclusoes).
 *   O feito de ontem que ninguém conferiu continua na aba Conferência, mas não
 *   muda a tarefa de hoje, que começa pendente como sempre.
 * - Avulsa: olha a própria linha (`concluida_em` e `conferida_em`).
 */
export function estadoDeConferencia(
  t: { dias_semana: number[] | null; concluida_em: string | null; conferida_em?: string | null },
  hoje: { feita: boolean; conferida: boolean } | undefined,
): EstadoConferencia {
  if ((t.dias_semana ?? []).length > 0) {
    if (!hoje?.feita) return 'nenhuma';
    return hoje.conferida ? 'conferida' : 'aguardando';
  }
  if (!t.concluida_em) return 'nenhuma';
  return t.conferida_em ? 'conferida' : 'aguardando';
}

/**
 * O que o quadro (Kanban e Tabela) mostra: tudo, menos o que está esperando o
 * gerente. Frase do Felipe: marcou concluído, "ela fosse para uma aba de
 * conferência" — o cartão sai do quadro e volta quando o gerente aprova
 * (feito, com o selo) ou devolve (pendente de novo).
 */
export function semAguardandoConferencia<T extends Pick<Tarefa, 'conferencia'>>(tarefas: T[]): T[] {
  return tarefas.filter((t) => t.conferencia !== 'aguardando');
}

/* ── Horário ───────────────────────────────────────────────────────────────── */

/**
 * Lê uma hora do jeito que ela aparece no balcão e devolve "HH:MM".
 *
 * Aceita "07:30", "7:30", "07:30:00" (como o banco devolve o tipo TIME),
 * "7h30", "7h" e "10h". O que não parece hora ("abc", "Depois do almoço",
 * "25:00") vira null — o catálogo é texto livre em Listas do Sistema, e a
 * ficha precisa saber qual item dá para gravar como hora.
 */
export function normalizarHorario(texto: string | null | undefined): string | null {
  const limpo = (texto ?? '').trim().toLowerCase();
  const m =
    /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(limpo) ?? /^(\d{1,2})\s*h\s*(\d{2})?$/.exec(limpo);
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2] ?? '0');
  if (hora > 23 || minuto > 59) return null;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/**
 * Os itens do catálogo `tarefa_horario` como a ficha os oferece, na ordem do
 * catálogo. Item que não parece hora continua na lista (com `valor` nulo) para
 * a tela mostrá-lo desativado com o motivo, em vez de sumir sem explicação.
 */
export function horariosDoCatalogo(
  itens: { id: string; descricao: string; ativo: boolean }[],
): HorarioOpcao[] {
  return itens.map((i) => ({
    id: i.id,
    descricao: i.descricao,
    ativo: i.ativo,
    valor: normalizarHorario(i.descricao),
  }));
}

/**
 * Com hora marcada primeiro, da mais cedo para a mais tarde; sem hora depois,
 * na ordem do quadro. Minhas Tarefas usa dentro de cada período: quem tem
 * "10:00" precisa ver essa antes da "14:00", e a sem hora não passa na frente.
 */
export function ordenarPorHorario<T extends { horario: string | null; ordem: number }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => {
    if (a.horario && b.horario && a.horario !== b.horario) return a.horario < b.horario ? -1 : 1;
    if (a.horario && !b.horario) return -1;
    if (!a.horario && b.horario) return 1;
    return a.ordem - b.ordem;
  });
}

/* ── Anexos ────────────────────────────────────────────────────────────────── */

/** 20 MB — o mesmo limite do bucket `tarefas-anexos` no banco. */
export const LIMITE_DO_ANEXO = 20 * 1024 * 1024;

/**
 * "820 KB", "1,2 MB", "20 MB". Do jeito que aparece no celular da pessoa, com
 * vírgula, para ela reconhecer o arquivo que mandou.
 */
export function tamanhoLegivel(bytes: number): string {
  const b = Math.max(0, Number.isFinite(bytes) ? Math.round(bytes) : 0);
  const umaCasa = (n: number) => (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (b < 1024) return `${b} bytes`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 * 1024 * 1024) return `${umaCasa(b / (1024 * 1024))} MB`;
  return `${umaCasa(b / (1024 * 1024 * 1024))} GB`;
}

const EXTENSOES_DE_IMAGEM = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
/** Foto que o navegador não sabe desenhar (HEIC do iPhone, TIFF): vira ícone, não miniatura quebrada. */
const IMAGEM_QUE_O_NAVEGADOR_NAO_MOSTRA = /^image\/(heic|heif|tiff)$/i;

/**
 * O anexo dá para mostrar como miniatura? Pelo tipo quando ele veio; pelo nome
 * quando o celular mandou sem tipo (acontece com arquivo vindo do WhatsApp).
 */
export function ehImagem(tipo: string | null | undefined, nome: string): boolean {
  const t = (tipo ?? '').trim().toLowerCase();
  if (t && t !== 'application/octet-stream') {
    return t.startsWith('image/') && !IMAGEM_QUE_O_NAVEGADOR_NAO_MOSTRA.test(t);
  }
  return EXTENSOES_DE_IMAGEM.test(nome ?? '');
}

/**
 * Nome do arquivo como pode ir no caminho do bucket: sem acento, sem espaço,
 * só letras, números, ponto, hífen e sublinhado. "Foto da vitrine (1).JPG" →
 * "Foto-da-vitrine-1.JPG". O nome original, com acento e tudo, continua
 * guardado em `tarefas_anexos.nome` — é esse que a pessoa vê.
 */
export function nomeDeArquivoSeguro(nome: string): string {
  const limpo = (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '');
  // Nome enorme estouraria o caminho; corta preservando a extensão.
  if (limpo.length > 100) {
    const ponto = limpo.lastIndexOf('.');
    const ext = ponto > 0 && limpo.length - ponto <= 10 ? limpo.slice(ponto) : '';
    return limpo.slice(0, 100 - ext.length) + ext;
  }
  return limpo || 'arquivo';
}

/** Texto sem acento e em minúsculas: "Conferência" acha "conferencia". */
function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Aplica os filtros da barra do quadro. `hoje` vem de fora para o teste poder
 * fixar a data (e para a tela calcular uma vez só por render).
 */
export function filtrarTarefas(
  tarefas: Tarefa[],
  f: FiltrosTarefasValores,
  hoje: { iso: string; diaSemana: number },
): Tarefa[] {
  const termo = normalizar(f.busca.trim());

  let diaAlvo: { dia: number; iso: string } | null = null;
  if (f.dia === 'hoje') diaAlvo = { dia: hoje.diaSemana, iso: hoje.iso };
  else if (typeof f.dia === 'number') {
    diaAlvo = { dia: f.dia, iso: dataDoDiaNaSemana(hoje.iso, hoje.diaSemana, f.dia) };
  }

  return tarefas.filter((t) => {
    if (termo && !normalizar(t.titulo).includes(termo) && !normalizar(t.descricao).includes(termo)) {
      return false;
    }
    if (f.pessoa && !t.responsaveis.some((p) => p.id === f.pessoa)) return false;
    if (f.prioridade && t.prioridade !== f.prioridade) return false;
    if (f.status && statusNoDia(t, hoje.iso) !== f.status) return false;
    if (f.etiqueta && !t.etiquetas.some((e) => e.id === f.etiqueta)) return false;
    if (diaAlvo && !tarefaCaiNoDia(t, diaAlvo.dia, diaAlvo.iso)) return false;
    return true;
  });
}

/** Algum filtro da barra está ligado? */
export function temFiltroAtivo(v: FiltrosTarefasValores): boolean {
  return (
    v.busca.trim() !== '' ||
    v.pessoa !== '' ||
    v.prioridade !== '' ||
    v.status !== '' ||
    v.etiqueta !== '' ||
    v.dia !== 'todas'
  );
}

/**
 * A tarefa que acabou de ser criada pelo "+ Adicionar tarefa" aparece com os
 * filtros de agora? Ela nasce do jeito que o `useQuadro` a grava: avulsa, sem
 * prazo, prioridade normal, "não iniciado", sem etiqueta, com o dono da
 * coluna. Se não aparecer, a página avisa — senão a tarefa "some" na hora e a
 * pessoa digita de novo, criando repetida.
 */
export function novaTarefaApareceNoFiltro(
  nova: { titulo: string; lista_id: string; responsaveis: Pessoa[] },
  f: FiltrosTarefasValores,
  hoje: { iso: string; diaSemana: number },
): boolean {
  const t: Tarefa = {
    id: '__nova__',
    quadro_id: '',
    lista_id: nova.lista_id,
    titulo: nova.titulo,
    descricao: null,
    prioridade: 'normal',
    status: 'nao_iniciado',
    dias_semana: [],
    periodo_id: null,
    periodo: null,
    prazo: null,
    concluida_em: null,
    ordem: 0,
    arquivada_em: null,
    criado_por: null,
    created_at: '',
    updated_at: '',
    responsaveis: nova.responsaveis,
    etiquetas: [],
    checklist_total: 0,
    checklist_feitos: 0,
    comentarios_total: 0,
    feita_hoje: false,
    horario: null,
    conferencia: 'nenhuma',
    anexos_total: 0,
  };
  return filtrarTarefas([t], f, hoje).length === 1;
}

/** Quantas tarefas em cada situação — a barrinha colorida do Monday. */
export function resumoDeStatus(tarefas: Tarefa[], hojeISO: string): Record<StatusNoDia, number> {
  const resumo: Record<StatusNoDia, number> = {
    nao_iniciado: 0,
    fazendo: 0,
    feito: 0,
    pausada: 0,
    atrasada: 0,
  };
  for (const t of tarefas) resumo[statusNoDia(t, hojeISO)] += 1;
  return resumo;
}

/* ── Ordem (arrastar e soltar) ─────────────────────────────────────────────── */

/**
 * Posição de um cartão solto entre dois vizinhos.
 *
 * A ordem é um número decimal de propósito: mover um cartão é UM update — ele
 * recebe a média entre os vizinhos — em vez de reescrever a coluna inteira a
 * cada arrasto (várias pessoas mexendo no mesmo quadro brigariam por isso).
 * Nas pontas, anda 1024 para fora.
 */
export function ordemEntre(antes?: number, depois?: number): number {
  const temAntes = typeof antes === 'number';
  const temDepois = typeof depois === 'number';
  if (temAntes && temDepois) return (antes + depois) / 2;
  if (temAntes) return antes + 1024;
  if (temDepois) return depois - 1024;
  return 1024;
}

/**
 * Depois de muitos arrastos no mesmo lugar, a média entre dois vizinhos fica
 * tão perto que o número decimal não distingue mais. Aí a coluna inteira é
 * renumerada — é raro, e só nesse caso vale reescrever tudo.
 */
export function precisaRenumerar(ordens: number[]): boolean {
  const ordenadas = [...ordens].sort((a, b) => a - b);
  for (let i = 1; i < ordenadas.length; i++) {
    if (ordenadas[i] - ordenadas[i - 1] < 1e-6) return true;
  }
  return false;
}

/** 1024, 2048, 3072... na ordem dos ids recebidos. */
export function renumerar(ids: string[]): { id: string; ordem: number }[] {
  return ids.map((id, i) => ({ id, ordem: (i + 1) * 1024 }));
}

export function ordenarPorOrdem<T extends { ordem: number }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => a.ordem - b.ordem);
}

/** Tarefas por lista, cada grupo já em ordem. */
export function agruparPorLista(tarefas: Tarefa[]): Map<string, Tarefa[]> {
  const grupos = new Map<string, Tarefa[]>();
  for (const t of tarefas) {
    const grupo = grupos.get(t.lista_id);
    if (grupo) grupo.push(t);
    else grupos.set(t.lista_id, [t]);
  }
  for (const [id, grupo] of grupos) grupos.set(id, ordenarPorOrdem(grupo));
  return grupos;
}

/* ── Minhas Tarefas ────────────────────────────────────────────────────────── */

export function saudacao(hora: number): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function primeiroNome(nome: string): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? '';
}

/* ── Montagem a partir do banco ────────────────────────────────────────────── */

/**
 * Uma linha de `tarefas` como o banco devolve, com os embeds da consulta de
 * `useQuadro` (ver SELECT_TAREFA lá). Os embeds são opcionais porque o dublê
 * de teste e uma consulta mais enxuta podem não trazê-los.
 */
export interface LinhaTarefaDoBanco {
  id: string;
  quadro_id: string;
  lista_id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  status: string;
  dias_semana: number[] | null;
  periodo_id: string | null;
  prazo: string | null;
  concluida_em: string | null;
  ordem: number;
  arquivada_em: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  /** "HH:MM:SS" (tipo TIME). Opcional: dublê de teste e dado anterior à v2. */
  horario?: string | null;
  /** Conferência da tarefa AVULSA (a da recorrente mora em tarefas_conclusoes). */
  conferida_em?: string | null;
  conferida_por?: string | null;
  periodo?: { id: string; descricao: string } | null;
  tarefas_responsaveis?: { user_id: string; profiles: Pessoa | null }[] | null;
  tarefas_etiquetas?: { catalogo_id: string; catalogos: Etiqueta | null }[] | null;
  tarefas_checklist?: { feito: boolean }[] | null;
  /** Ids (consulta de useQuadro) ou contagem ([{ count }]). */
  tarefas_comentarios?: ({ id: string } | { count: number })[] | null;
  /** Idem: só para contar o clipe do cartão. */
  tarefas_anexos?: ({ id: string } | { count: number })[] | null;
}

/**
 * O feito de hoje de cada tarefa recorrente: id da tarefa → já conferido?
 * Era um Set de ids até a v2; virou mapa porque "feita hoje" agora tem dois
 * estados (esperando o gerente ou conferida).
 */
export type FeitasHoje = Map<string, { conferida: boolean }>;

/** Contagem de um embed que pode vir como ids ou como [{ count }]. */
function contar(xs: ({ id: string } | { count: number })[] | null | undefined): number {
  const lista = xs ?? [];
  return lista.length === 1 && 'count' in lista[0] ? lista[0].count : lista.length;
}

/**
 * Transforma a linha crua do banco na `Tarefa` que a tela usa.
 *
 * Valor de prioridade/status que o front não conhece (dado mexido direto no
 * banco) cai no padrão em vez de quebrar a tela — o CHECK do banco já impede
 * isso na gravação, então é só rede de segurança.
 *
 * "Fazendo" de tarefa que se repete vale só no dia em que foi marcado. Quem
 * clicou "Começar" ontem e não terminou não está fazendo a de hoje: a tarefa
 * de hoje é outra, e começa "não iniciado" — sem ninguém zerar à mão. O dia é
 * o da última gravação da tarefa (`updated_at`, no fuso da loja).
 */
export function montarTarefa(
  linha: LinhaTarefaDoBanco,
  feitasHoje: FeitasHoje,
  hojeISO: string = dataLocalISO(new Date()),
): Tarefa {
  const prioridade = (linha.prioridade in TAREFA_PRIORIDADES ? linha.prioridade : 'normal') as TarefaPrioridade;
  const gravado = (linha.status in TAREFA_STATUS ? linha.status : 'nao_iniciado') as TarefaStatus;
  const fazendoDeOutroDia =
    gravado === 'fazendo' &&
    (linha.dias_semana ?? []).length > 0 &&
    dataLocalISO(new Date(linha.updated_at)) !== hojeISO;
  const status: TarefaStatus = fazendoDeOutroDia ? 'nao_iniciado' : gravado;
  const checklist = linha.tarefas_checklist ?? [];
  const feitoDeHoje = feitasHoje.get(linha.id);

  return {
    id: linha.id,
    quadro_id: linha.quadro_id,
    lista_id: linha.lista_id,
    titulo: linha.titulo,
    descricao: linha.descricao,
    prioridade,
    status,
    dias_semana: [...(linha.dias_semana ?? [])].sort((a, b) => a - b),
    periodo_id: linha.periodo_id,
    periodo: linha.periodo ?? null,
    prazo: linha.prazo,
    concluida_em: linha.concluida_em,
    ordem: linha.ordem,
    arquivada_em: linha.arquivada_em,
    criado_por: linha.criado_por,
    created_at: linha.created_at,
    updated_at: linha.updated_at,
    responsaveis: (linha.tarefas_responsaveis ?? [])
      .map((r) => r.profiles)
      .filter((p): p is Pessoa => Boolean(p))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    etiquetas: (linha.tarefas_etiquetas ?? [])
      .map((e) => e.catalogos)
      .filter((e): e is Etiqueta => Boolean(e)),
    checklist_total: checklist.length,
    checklist_feitos: checklist.filter((i) => i.feito).length,
    comentarios_total: contar(linha.tarefas_comentarios),
    feita_hoje: Boolean(feitoDeHoje),
    horario: normalizarHorario(linha.horario),
    conferencia: estadoDeConferencia(
      linha,
      feitoDeHoje ? { feita: true, conferida: feitoDeHoje.conferida } : undefined,
    ),
    anexos_total: contar(linha.tarefas_anexos),
  };
}

/* ── Textos da tela (moram aqui para os componentes só exportarem componentes) ── */

/** "Pedro Henrique" => "PH"; "Richard" => "RI". */
export function iniciais(nome: string): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * "agora mesmo", "há 5 min", "hoje às 14:30", "ontem às 09:10", "12/09 às 10:00".
 *
 * Do jeito que se fala no balcão: "comentou há 5 minutos" diz mais que
 * "23/09/2026 14:25" para quem quer saber se o recado é fresco.
 */
export function quandoFoi(iso: string, agora: Date = new Date()): string {
  const quando = new Date(iso);
  const minutos = Math.floor((agora.getTime() - quando.getTime()) / 60_000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;

  const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dia = dataLocalISO(quando);
  if (dia === dataLocalISO(agora)) return `hoje às ${hora}`;

  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (dia === dataLocalISO(ontem)) return `ontem às ${hora}`;

  const mesmoAno = quando.getFullYear() === agora.getFullYear();
  const data = quando.toLocaleDateString(
    'pt-BR',
    mesmoAno ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' },
  );
  return `${data} às ${hora}`;
}
