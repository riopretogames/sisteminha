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
 * ONDE A MARCA DA FAIXA MORA (revisão de 24/09, achados 16 e 20)
 *
 * A marca fica no `localStorage`, junto com o id da pessoa em que se entrou,
 * e a faixa aparece sempre que quem está logado É essa pessoa. Até 24/09 ela
 * ficava no `sessionStorage` (só a aba, e some quando a aba fecha), mas a
 * sessão de login fica no `localStorage` (o navegador inteiro, e sobrevive ao
 * fechar a aba). Resultado: nas outras abas, ou depois de fechar e abrir de
 * novo, o Felipe continuava como o Richard SEM faixa nenhuma — e a venda feita
 * dali saía no nome do Richard, que é justamente o que a faixa existe para
 * impedir. Com a marca no mesmo lugar da sessão, as duas vivem e morrem
 * juntas.
 *
 * Ligar a marca ao id resolve também o caminho contrário: quem saiu pelo
 * "Sair" do menu e entrou com a própria senha não é a pessoa da marca, então
 * a faixa não aparece dizendo que ele é o Richard. E qualquer saída de conta
 * (SIGNED_OUT) apaga a marca — ver AppLayout.
 */

export const CHAVE_ENTROU_COMO = 'entrou_como';

export interface EntrouComo {
  /** Id da conta em que se entrou. A faixa só vale enquanto quem está logado for esta pessoa. */
  alvoId: string;
  /** Nome de quem está sendo "vestido". */
  nome: string;
  /** Nome do administrador que entrou. */
  por: string;
  /** Quando, em ISO. */
  quando: string;
}

/** Lê a marca deste navegador. Sem marca, marca velha (sem id) ou sem armazenamento: null. */
export function lerEntrouComo(): EntrouComo | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ENTROU_COMO);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as Partial<EntrouComo>;
    if (typeof dados.nome !== 'string' || !dados.nome) return null;
    if (typeof dados.alvoId !== 'string' || !dados.alvoId) return null;
    return {
      alvoId: dados.alvoId,
      nome: dados.nome,
      por: String(dados.por ?? ''),
      quando: String(dados.quando ?? ''),
    };
  } catch {
    return null;
  }
}

/**
 * A marca vale para quem está logado agora? É a pergunta da faixa. Marca de
 * outra pessoa (o Felipe saiu pelo menu e entrou com a senha dele) não vale.
 */
export function marcaValePara(marca: EntrouComo | null, userId: string | null | undefined): EntrouComo | null {
  return marca && userId && marca.alvoId === userId ? marca : null;
}

export function gravarEntrouComo(dados: EntrouComo): void {
  try {
    localStorage.setItem(CHAVE_ENTROU_COMO, JSON.stringify(dados));
  } catch {
    // Sem armazenamento (aba anônima bloqueada): a sessão troca do mesmo
    // jeito, só não aparece a faixa. Melhor entrar sem faixa do que não entrar.
  }
}

export function limparEntrouComo(): void {
  try {
    localStorage.removeItem(CHAVE_ENTROU_COMO);
    // A marca da versão anterior morava aqui; sem id, ela não vale mais nada.
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

/**
 * O erro do "Entrar como" / "Copiar link" em português de balcão.
 *
 * As mensagens da função de servidor já vêm em português ("Esse usuário não
 * é da sua loja") e passam como estão. O que vinha em inglês era o resto
 * (achado 23 da revisão de 24/09): o do login ("Email link is invalid or has
 * expired"), o da área de transferência ("Document is not focused", "Write
 * permission denied") e o de rede ("Failed to fetch").
 */
export function mensagemDoAcesso(erro: unknown): string {
  const msg =
    erro instanceof Error
      ? erro.message
      : typeof erro === 'object' && erro && 'message' in erro
        ? String((erro as { message: unknown }).message)
        : '';
  const nome = erro instanceof Error ? erro.name : '';

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
    return 'Sem conexão com o sistema. Confira a internet e tente de novo.';
  }
  if (/invalid or has expired|otp.*expired|token.*(invalid|expired)|expired.*token/i.test(msg)) {
    return 'Esse acesso não vale mais (ele vale por uma hora e só uma vez). Peça outro.';
  }
  if (nome === 'NotAllowedError' || /clipboard|document is not focused|write permission/i.test(msg)) {
    return 'O navegador não deixou copiar o link sozinho.';
  }
  if (/jwt|session.*(missing|expired)|not authenticated/i.test(msg)) {
    return 'Sua sessão expirou. Entre de novo no sistema.';
  }
  // Mensagem que já é frase de gente (vem da nossa função de servidor, em
  // português): mostra como está. O que sobrar em inglês vira a frase padrão.
  if (msg && /[ãõçéêáíóú]|\b(não|você|essa|esse|conta|usuário|loja|acesso)\b/i.test(msg)) return msg;
  return 'Algo deu errado no sistema. Tente de novo; se continuar, avise o Felipe.';
}
