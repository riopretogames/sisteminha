/**
 * O texto de um erro do banco, pronto para a tela.
 *
 * Nasceu na assistência (revisão de 24/09) e foi para `lib/` no fechamento da
 * mesma revisão, porque o mesmo defeito existia em quase todas as telas.
 *
 * -----------------------------------------------------------------------------
 * O defeito que isto resolve (revisão de 24/09)
 * -----------------------------------------------------------------------------
 * Todas as telas de OS faziam assim:
 *
 *     const { error } = await supabase.from(...).update(...);
 *     if (error) throw error;
 *     ...
 *     catch (e) { mostrar(e instanceof Error ? e.message : 'Tente novamente.') }
 *
 * Parece certo, e não é: a biblioteca do Supabase devolve `error` como um
 * OBJETO COMUM ({ message, code, details, hint }), não como um `Error` de
 * JavaScript. O `instanceof Error` dava falso SEMPRE, e a tela mostrava
 * "Tente novamente." no lugar do motivo que o banco escreveu.
 *
 * E o banco escreve motivos bons, em português, justamente para o balcão:
 * "O cliente Fulano está bloqueado para venda…", "Registre o pagamento… falta
 * R$ 50", "O cliente ainda não respondeu ao orçamento…", "Reponha o estoque
 * antes de reabrir a OS". Todos sumiam atrás do "Tente novamente" — e o
 * vendedor, com o cliente na frente, tentava de novo e recebia o mesmo nada.
 *
 * -----------------------------------------------------------------------------
 * A regra
 * -----------------------------------------------------------------------------
 *   • Mensagem que os gatilhos da loja escreveram (português) passa como está:
 *     ela já foi escrita para quem está no balcão.
 *   • Mensagem técnica do próprio banco, em inglês (regra de acesso, conexão,
 *     sessão vencida), vira uma frase de gente — nunca o inglês cru na tela.
 *
 * Por que NÃO decidir pelo código do erro: vários gatilhos da OS usam o código
 * de "sem permissão" (42501) com um texto em português que explica o caso
 * ("O cliente ainda não respondeu ao orçamento…"). Traduzir pelo código
 * trocaria esse texto bom por um genérico. Por isso a tradução olha as
 * palavras em inglês do Postgres, que os textos da loja nunca usam.
 */

/** O que dizer quando a regra de acesso do banco recusou, se a tela não disser outra coisa. */
const SEM_ACESSO_PADRAO = 'Seu perfil de acesso não permite fazer isso.';

/**
 * A mensagem crua, venha o erro como `Error`, como objeto do Supabase ou como texto.
 *
 * Exportada para as telas que olham o texto ANTES de escolher o aviso (ex.:
 * "duplicate" vira "já existe um cadastro com esse nome"). Elas também não
 * podem usar `erro instanceof Error ? erro.message : …`, pelo motivo do topo.
 */
export function mensagemCrua(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === 'string') return erro;
  if (erro && typeof erro === 'object' && 'message' in erro) {
    const m = (erro as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

/**
 * A recusa veio da regra de acesso do banco (a mensagem técnica, em inglês)?
 *
 * Só o inglês do Postgres/PostgREST: "new row violates row-level security
 * policy", "permission denied for table…". Os textos em português dos
 * gatilhos NÃO contam aqui — eles já explicam o caso e passam direto.
 */
export function ehRecusaDeAcesso(erro: unknown): boolean {
  return /row-level security|permission denied|violates .*policy/i.test(mensagemCrua(erro));
}

/**
 * O texto para o aviso da tela.
 *
 * @param semAcesso o que dizer quando a regra de acesso recusar — cada tela
 *   sabe explicar melhor de quem é a vez ("peça a um vendedor…").
 */
export function mensagemDoErro(erro: unknown, opcoes: { semAcesso?: string } = {}): string {
  const msg = mensagemCrua(erro).trim();

  if (!msg) return 'Tente novamente.';

  if (ehRecusaDeAcesso(erro)) return opcoes.semAcesso ?? SEM_ACESSO_PADRAO;

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
    return 'Sem conexão com o sistema. Confira a internet e tente de novo.';
  }
  if (/jwt|token.*expired|session.*expired/i.test(msg)) {
    return 'Sua sessão expirou. Entre de novo no sistema.';
  }

  // Outras mensagens técnicas do banco, em inglês. O texto cru não ajuda quem
  // está no balcão; o código entre parênteses ajuda quem for investigar.
  if (/violates|duplicate key|invalid input|null value in column|does not exist|syntax error/i.test(msg)) {
    const codigo =
      erro && typeof erro === 'object' && 'code' in erro && typeof (erro as { code: unknown }).code === 'string'
        ? ` (código ${(erro as { code: string }).code})`
        : '';
    return `O sistema recusou a gravação${codigo}. Tente de novo; se continuar, avise o Felipe.`;
  }

  return msg;
}
