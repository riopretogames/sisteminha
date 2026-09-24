/**
 * "Entrar como esta pessoa" — o jeito certo de o administrador ver o sistema
 * como um funcionário vê, sem saber a senha dele.
 *
 * Pedido do Felipe em 24/09/2026: *"quero entrar no usuário do Richard, mas
 * não sei a senha dele, para poder testar as coisas"*. Ele pediu para VER a
 * senha; isso não existe em sistema nenhum (o banco guarda só um embaralhado
 * sem volta) e guardar senha escrita seria expor a senha de todo mundo num
 * vazamento. Este recurso resolve o que ele precisa de verdade:
 *
 *   1. a função de servidor `admin-usuarios` (ação `entrar_como`) confere que
 *      quem pediu gerencia usuários, gera um acesso de uso único com a chave
 *      mestra e GRAVA NA AUDITORIA quem entrou como quem;
 *   2. a tela troca a sessão do navegador para a da pessoa e recarrega tudo
 *      (o que estava em cache era do administrador);
 *   3. uma faixa no topo lembra que "você está como Fulano", com o botão para
 *      sair e voltar para a própria conta.
 *
 * A marca fica no `sessionStorage` de propósito: vale só para esta aba e
 * morre quando ela fecha. Uma janela anônima aberta pelo link copiado não
 * ganha faixa nenhuma — ali a separação já é a própria janela.
 */

export const CHAVE_ENTROU_COMO = 'entrou_como';

export interface EntrouComo {
  /** Nome de quem está sendo "vestido". */
  nome: string;
  /** Nome do administrador que entrou. */
  por: string;
  /** Quando, em ISO. */
  quando: string;
}

/** Lê a marca desta aba. Sem marca, ou sem armazenamento, devolve null. */
export function lerEntrouComo(): EntrouComo | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_ENTROU_COMO);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as Partial<EntrouComo>;
    if (typeof dados.nome !== 'string' || !dados.nome) return null;
    return { nome: dados.nome, por: String(dados.por ?? ''), quando: String(dados.quando ?? '') };
  } catch {
    return null;
  }
}

export function gravarEntrouComo(dados: EntrouComo): void {
  try {
    sessionStorage.setItem(CHAVE_ENTROU_COMO, JSON.stringify(dados));
  } catch {
    // Sem armazenamento (aba anônima bloqueada): a sessão troca do mesmo
    // jeito, só não aparece a faixa. Melhor entrar sem faixa do que não entrar.
  }
}

export function limparEntrouComo(): void {
  try {
    sessionStorage.removeItem(CHAVE_ENTROU_COMO);
  } catch {
    // idem
  }
}

/**
 * O link para abrir a conta da pessoa numa janela anônima.
 *
 * `base` é o `import.meta.env.BASE_URL` ("/" no dia a dia, "/sisteminha/" no
 * ar). O acesso vai no endereço, então o link vale enquanto o acesso valer
 * (o Supabase expira em uma hora) e só uma vez.
 */
export function montarLinkDeAcesso(origem: string, base: string, tokenHash: string): string {
  const raiz = `${origem.replace(/\/$/, '')}/${base.replace(/^\/|\/$/g, '')}`.replace(/\/$/, '');
  return `${raiz}/login?acesso=${encodeURIComponent(tokenHash)}`;
}

/** Primeiro nome, para o botão ("Entrar como Richard") e a faixa. */
export function primeiroNomeDe(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
