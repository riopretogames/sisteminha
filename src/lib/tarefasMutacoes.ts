import { ehRecorrente, estaFeita } from '@/lib/tarefas';
import type { Tarefa, TarefaStatus } from '@/types/tarefas';

/**
 * A regra do "feito" — decidida aqui, gravada pelos hooks.
 *
 * Existe num arquivo só porque duas telas marcam feito (o quadro e Minhas
 * Tarefas), e se cada uma decidisse do seu jeito, uma gravaria o feito de
 * hoje e a outra gravaria `status = 'feito'` — e a tarefa recorrente ficaria
 * "feita para sempre", exatamente o que o Felipe zera à mão no Monday todo
 * dia. O banco recusa esse caso (gatilho `travas_das_tarefas`), mas a tela
 * precisa acertar de primeira, não descobrir pelo erro.
 *
 * Tudo aqui é puro: devolve um PLANO (o que gravar e o que mostrar enquanto o
 * banco não responde). Quem grava é `gravarPlanoDeStatus` em hooks/useQuadro.
 */

export type CamposDoFeito = Partial<Pick<Tarefa, 'status' | 'concluida_em' | 'feita_hoje'>>;

export interface PlanoDeStatus {
  /** O que muda na linha de `tarefas`. null = não mexe nela. */
  linha: { status?: TarefaStatus; concluida_em?: string | null } | null;
  /** O feito de hoje em `tarefas_conclusoes`. */
  conclusaoDeHoje: 'gravar' | 'apagar' | null;
  /** O que a tela mostra na hora, antes da resposta do banco. */
  otimista: CamposDoFeito;
}

const NADA: PlanoDeStatus = { linha: null, conclusaoDeHoje: null, otimista: {} };

type TarefaDoPlano = Pick<Tarefa, 'dias_semana' | 'feita_hoje' | 'concluida_em' | 'status'>;

/**
 * Plano para "mudar o status para X".
 *
 * - Recorrente + feito: grava a conclusão de HOJE. O status só muda num caso:
 *   se estava "fazendo", volta a "não iniciado" na mesma hora. Sem isso, quem
 *   clicou "Começar" e depois marcou a bolinha deixava a tarefa de todo dia
 *   "fazendo" para sempre — amanhã cedo ela já apareceria começada, e alguém
 *   teria de zerar à mão, exatamente o que o módulo veio acabar. Pausada
 *   continua pausada: "não fazer por enquanto" é decisão, não andamento do dia.
 * - Recorrente + outro: grava o status e, se já estava feita hoje, apaga a
 *   conclusão (quem volta para "fazendo" está dizendo que não terminou).
 * - Avulsa + feito: status 'feito' e `concluida_em` = agora.
 * - Avulsa + outro: grava o status e limpa `concluida_em`.
 */
export function planoDeStatus(t: TarefaDoPlano, novo: TarefaStatus, agoraISO: string): PlanoDeStatus {
  if (ehRecorrente(t)) {
    if (novo === 'feito') {
      if (t.feita_hoje) return NADA;
      if (t.status === 'fazendo') {
        return {
          linha: { status: 'nao_iniciado' },
          conclusaoDeHoje: 'gravar',
          otimista: { status: 'nao_iniciado', feita_hoje: true },
        };
      }
      return { linha: null, conclusaoDeHoje: 'gravar', otimista: { feita_hoje: true } };
    }
    return {
      linha: { status: novo },
      conclusaoDeHoje: t.feita_hoje ? 'apagar' : null,
      otimista: { status: novo, feita_hoje: false },
    };
  }

  if (novo === 'feito') {
    if (t.concluida_em) return NADA;
    return {
      linha: { status: 'feito', concluida_em: agoraISO },
      conclusaoDeHoje: null,
      otimista: { status: 'feito', concluida_em: agoraISO },
    };
  }
  return {
    linha: { status: novo, concluida_em: null },
    conclusaoDeHoje: null,
    otimista: { status: novo, concluida_em: null },
  };
}

/**
 * Plano da bolinha "feito": se está feita, desfaz; se não, marca.
 *
 * Desfazer uma avulsa volta para "não iniciado" — o status de antes não fica
 * guardado, e "não iniciado" é o que a pessoa espera ver numa tarefa que ela
 * acabou de dizer que não terminou.
 */
export function planoDeAlternarFeito(t: TarefaDoPlano, agoraISO: string): PlanoDeStatus {
  if (!estaFeita(t)) return planoDeStatus(t, 'feito', agoraISO);
  if (ehRecorrente(t)) {
    return { linha: null, conclusaoDeHoje: 'apagar', otimista: { feita_hoje: false } };
  }
  return planoDeStatus(t, 'nao_iniciado', agoraISO);
}

/**
 * Aplica na tela, antes de o banco responder, o que uma ação mudou — e acerta
 * junto o selo da conferência.
 *
 * O plano (acima) não fala de conferência: quem confere é o gerente, pela
 * função `conferir_tarefa`. Mas a conferência DEPENDE do feito, e a tela
 * precisa acompanhar na hora: marcou feito → "aguardando" (o cartão vai para
 * a aba Conferência); desmarcou → "nenhuma" (o banco apaga a conferência junto
 * com o feito). Sem isto, a pessoa marcaria a bolinha e o cartão ficaria no
 * quadro até a próxima recarga, parecendo que não foi.
 */
export function aplicarCamposDoFeito<
  T extends Pick<Tarefa, 'dias_semana' | 'feita_hoje' | 'concluida_em' | 'conferencia'>,
>(t: T, campos: Partial<Tarefa>): T {
  const depois = { ...t, ...campos } as T;
  const feitaAntes = estaFeita(t);
  const feitaDepois = estaFeita(depois);
  if (!feitaDepois) return { ...depois, conferencia: 'nenhuma' };
  if (!feitaAntes) return { ...depois, conferencia: 'aguardando' };
  return depois;
}

/**
 * Campos que precisam mudar junto quando a frequência muda.
 *
 * Uma avulsa concluída (status 'feito') que vira recorrente seria recusada
 * pelo banco — recorrente não fica "feita para sempre". Então ela volta a
 * "não iniciado" na mesma gravação, em vez de a pessoa ver um erro por ter
 * só marcado "segunda e quarta".
 */
export function camposAoMudarFrequencia(
  t: Pick<Tarefa, 'status'>,
  novosDias: number[],
): { status?: TarefaStatus; concluida_em?: null } {
  if (novosDias.length > 0 && t.status === 'feito') {
    return { status: 'nao_iniciado', concluida_em: null };
  }
  return {};
}

/** O código do erro do banco ('22P02', '23505'...), quando houver. */
export function codigoDoErro(erro: unknown): string | null {
  if (typeof erro === 'object' && erro && 'code' in erro) {
    const code = (erro as { code: unknown }).code;
    return typeof code === 'string' && code ? code : null;
  }
  return null;
}

/** Link errado ou cortado (/tarefas/abc): o banco recusa o id antes de procurar. */
export function ehEnderecoInvalido(erro: unknown): boolean {
  return codigoDoErro(erro) === '22P02';
}

const ERRO_GENERICO = 'Algo deu errado no sistema. Tente de novo; se continuar, avise o Felipe.';

/**
 * Mensagem de erro que quem está no balcão entende.
 *
 * O erro do Supabase é um objeto com `message` e `code`, em inglês técnico
 * ("invalid input syntax for type uuid", "violates check constraint"). A
 * regra é: o que a gente reconhece vira frase de gente; as mensagens dos
 * gatilhos do banco (código P0001) já são escritas em português e passam;
 * qualquer outro erro do banco vira um aviso genérico — nunca o inglês cru na
 * tela. Erro sem código é nosso (lançado pelo próprio front, em português) e
 * passa como está.
 */
export function mensagemLeiga(erro: unknown): string {
  const msg =
    erro instanceof Error
      ? erro.message
      : typeof erro === 'object' && erro && 'message' in erro
        ? String((erro as { message: unknown }).message)
        : 'Erro desconhecido';
  const codigo = codigoDoErro(erro);

  if (codigo === 'P0001') {
    // Os textos dos gatilhos citam o nome interno da tabela entre parênteses
    // ("(tarefas_conclusoes)"); para quem está no balcão isso é ruído.
    return msg.replace(/\s*\(tarefas_\w+\)/g, '');
  }
  if (codigo === '42501' || /row-level security|policy|permission denied/i.test(msg)) {
    return 'Seu perfil de acesso não permite isso.';
  }
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) {
    return 'Sem conexão com o sistema. Confira a internet e tente de novo.';
  }
  if (/jwt|token.*expired|session.*expired/i.test(msg) || codigo === 'PGRST301' || codigo === 'PGRST303') {
    return 'Sua sessão expirou. Entre de novo no sistema.';
  }
  if (codigo === '22P02' || /invalid input syntax/i.test(msg)) {
    return 'Endereço inválido: esse quadro ou essa tarefa não existe.';
  }
  if (codigo === '23505' || /duplicate key/i.test(msg)) {
    return 'Isso já existe.';
  }
  if (codigo === '23514' || /check constraint/i.test(msg)) {
    return 'Algum valor não é aceito: o texto ficou vazio ou grande demais, por exemplo.';
  }
  if (codigo) return ERRO_GENERICO;
  return msg;
}
