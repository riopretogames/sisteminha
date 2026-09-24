/**
 * "Quem pediu tem alçada sobre a conta desta pessoa?"
 *
 * Trocar a senha de alguém, arquivar/excluir alguém ou "Entrar como" alguém
 * só vale para quem NÃO tem mais acesso que você. Senão, trocar a senha do
 * administrador (ou entrar como ele) é virar administrador.
 *
 * ACHADO 73 (revisão de 24/09): a versão anterior perguntava "o alvo é
 * administrador?" lendo os papéis com o crachá de quem pediu. Quem não tem
 * "Ver usuários" não enxerga o papel dos outros — a resposta vinha vazia, sem
 * erro, e a trava concluía "não é administrador" e seguia com a chave mestra.
 *
 * Agora quem responde é o banco, pela função `pode_mexer_na_conta_de`
 * (migration 20260924166000), chamada com o crachá de quem pediu mas
 * enxergando o alvo inteiro. E a resposta só vale se for um SIM explícito:
 * erro, vazio ou qualquer outra coisa é recusa (fecha em caso de dúvida).
 *
 * Este arquivo não usa nada do Deno de propósito: assim o mesmo código roda
 * na função de servidor e nos testes do sistema (Usuarios.servidor.test.ts).
 */

/** O pedaço do cliente do Supabase que a conferência usa. */
export interface ClienteQueConfere {
  rpc: (
    funcao: string,
    argumentos: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

export type AcaoSobreConta = 'trocar_senha' | 'excluir' | 'entrar_como';

export interface Recusa {
  status: number;
  mensagem: string;
}

const O_QUE_TENTOU: Record<AcaoSobreConta, string> = {
  trocar_senha: 'trocar a senha dela',
  excluir: 'excluir essa pessoa',
  entrar_como: 'entrar como ela',
};

/**
 * Devolve `null` quando pode seguir, ou a recusa pronta para responder.
 *
 * `cliente` TEM que ser o montado com o crachá de quem pediu — nunca o da
 * chave mestra, para quem o banco não sabe quem está perguntando.
 */
export async function conferirAlcada(
  cliente: ClienteQueConfere,
  alvoId: string,
  acao: AcaoSobreConta,
): Promise<Recusa | null> {
  let resposta: { data: unknown; error: unknown };
  try {
    resposta = await cliente.rpc('pode_mexer_na_conta_de', { _alvo: alvoId });
  } catch (erro) {
    resposta = { data: null, error: erro ?? 'falha' };
  }

  if (resposta.error) {
    return {
      status: 500,
      mensagem:
        'Não consegui conferir o que essa pessoa pode fazer no sistema. Por segurança, nada foi feito. Tente de novo em instantes.',
    };
  }

  if (resposta.data !== true) {
    return {
      status: 403,
      mensagem:
        `Essa pessoa tem acessos que o seu perfil não tem (um administrador, por exemplo). ` +
        `Só quem tem a permissão "Alterar perfis e permissões" pode ${O_QUE_TENTOU[acao]}.`,
    };
  }

  return null;
}
