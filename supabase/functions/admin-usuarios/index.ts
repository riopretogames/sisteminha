/**
 * Criação de usuário e troca de senha, feitas do lado do servidor.
 *
 * POR QUE ISTO EXISTE FORA DO SISTEMA
 *
 * Criar uma conta de login exige a "chave mestra" do projeto. Ela dá poder
 * total sobre o banco — ignora perfil, ignora permissão, ignora tudo. Se
 * ficasse guardada dentro do sistema, viajaria junto para o navegador de todo
 * mundo que abre a tela, e qualquer pessoa conseguiria lê-la.
 *
 * Este arquivo roda no servidor do Supabase, onde a chave nunca sai. O sistema
 * só manda o pedido; quem tem a chave é este código.
 *
 * COMO A PERMISSÃO É CONFERIDA
 *
 * O pedido chega com o crachá de quem clicou. Antes de qualquer coisa, este
 * código pergunta ao banco — usando o crachá da pessoa, não a chave mestra —
 * se ela pode gerenciar usuários. Só depois usa a chave.
 *
 * Trocar senha, excluir/arquivar e "Entrar como" alguém ainda passam por uma
 * segunda pergunta ao banco (alcada.ts): quem pediu tem alçada sobre a conta
 * DESTA pessoa? Ninguém mexe na conta de quem tem mais acesso que ele.
 *
 * E a regra de qual perfil a pessoa nova recebe NÃO é decidida aqui: este
 * código chama `trocar_papel_do_usuario`, a mesma função que a tela de
 * Usuários já usa, e também com o crachá de quem clicou. Assim a proteção do
 * último administrador e a exigência de `roles.manage` continuam valendo, e a
 * regra segue morando num lugar só — o banco. Um segundo lugar decidindo
 * permissão é como as duas versões divergem em silêncio.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { conferirAlcada } from './alcada.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Papéis que a tela oferece. Espelha ROLES em src/config/permissions.ts. */
const PAPEIS = ['administrador', 'gerente', 'gerente_tecnico', 'vendedor', 'tecnico'];

/** Senha curta é o buraco mais comum. 8 é o mínimo que vale a pena exigir. */
const SENHA_MINIMA = 8;

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function erro(mensagem: string, status = 400) {
  return responder({ erro: mensagem }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro('Método não suportado.', 405);

  const URL_PROJETO = Deno.env.get('SUPABASE_URL')!;
  const CHAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY')!;
  const CHAVE_MESTRA = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const crachá = req.headers.get('Authorization');
  if (!crachá) return erro('Faça login de novo para continuar.', 401);

  // Cliente "como a pessoa que clicou": enxerga o banco com as permissões dela,
  // com RLS ligado. É com este que toda checagem é feita.
  const comoUsuario = createClient(URL_PROJETO, CHAVE_PUBLICA, {
    global: { headers: { Authorization: crachá } },
    auth: { persistSession: false },
  });

  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser();
  if (erroSessao || !sessao?.user) {
    return erro('Sua sessão expirou. Entre de novo.', 401);
  }
  const quemPediu = sessao.user.id;

  const { data: podeGerenciar, error: erroPermissao } = await comoUsuario.rpc(
    'has_permission',
    { _user_id: quemPediu, _permission: 'users.manage' },
  );
  if (erroPermissao) return erro('Não consegui conferir sua permissão.', 500);
  if (podeGerenciar !== true) {
    return erro('Seu perfil de acesso não permite criar ou alterar usuários.', 403);
  }

  // Só a partir daqui a chave mestra entra em cena.
  const comoServidor = createClient(URL_PROJETO, CHAVE_MESTRA, {
    auth: { persistSession: false },
  });

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return erro('Pedido malformado.');
  }
  const acao = String(corpo.acao ?? '');

  // ── Criar usuário ────────────────────────────────────────────────────────
  if (acao === 'criar') {
    const nome = String(corpo.nome ?? '').trim();
    const email = String(corpo.email ?? '').trim().toLowerCase();
    const senha = String(corpo.senha ?? '');
    const papel = String(corpo.papel ?? '');

    if (!nome) return erro('Informe o nome da pessoa.');
    if (!email.includes('@')) return erro('Informe um e-mail válido.');
    if (senha.length < SENHA_MINIMA) {
      return erro(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
    }
    if (papel && !PAPEIS.includes(papel)) return erro('Perfil de acesso desconhecido.');

    const { data: criado, error: erroCriar } = await comoServidor.auth.admin.createUser({
      email,
      password: senha,
      // Sem isto a pessoa fica presa esperando confirmar um e-mail que a loja
      // não manda, e não consegue entrar.
      email_confirm: true,
      // O gatilho `handle_new_user` lê este campo para montar o cadastro. Sem
      // ele, o nome vira o pedaço do e-mail antes do @.
      user_metadata: { nome },
      // O carimbo de "foi um administrador que criou". Metadados de APLICAÇÃO
      // só a chave mestra escreve — o cadastro público do Supabase só consegue
      // escrever metadados de usuário. Desde 15/09 o gatilho `handle_new_user`
      // RECUSA conta nova sem este carimbo: foi assim que se fechou a porta de
      // qualquer pessoa na internet criar conta dentro da loja.
      app_metadata: { criado_por: quemPediu },
    });

    if (erroCriar) {
      const m = erroCriar.message ?? '';
      if (/already been registered|already exists|duplicate/i.test(m)) {
        return erro('Já existe um usuário com este e-mail.', 409);
      }
      if (/password/i.test(m)) return erro('Senha recusada: ' + m);
      return erro('Não foi possível criar o usuário: ' + m, 500);
    }

    const idNovo = criado.user!.id;

    // O perfil é atribuído com o crachá de quem pediu, de propósito: quem não
    // tem `roles.manage` cria a pessoa mas não escolhe o poder dela.
    let avisoPerfil: string | null = null;
    if (papel) {
      const { error: erroPapel } = await comoUsuario.rpc('trocar_papel_do_usuario', {
        _user_id: idNovo,
        _role: papel,
      });
      if (erroPapel) {
        avisoPerfil =
          'O usuário foi criado, mas o perfil não foi definido: ' +
          (erroPapel.message ?? 'erro desconhecido') +
          '. Use o botão Gerenciar para definir.';
      }
    }

    return responder({ id: idNovo, email, avisoPerfil });
  }

  // ── Redefinir senha ──────────────────────────────────────────────────────
  if (acao === 'redefinir_senha') {
    const userId = String(corpo.user_id ?? '');
    const senha = String(corpo.senha ?? '');

    if (!userId) return erro('Informe de quem é a senha.');
    if (senha.length < SENHA_MINIMA) {
      return erro(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
    }

    // A consulta roda com o crachá da pessoa, então o RLS já limita ao pessoal
    // da loja dela. Se não voltar nada, o alvo não é de lá — e a chave mestra,
    // que enxerga tudo, não chega a ser usada.
    const { data: alvo, error: erroAlvo } = await comoUsuario
      .from('profiles')
      .select('id, nome')
      .eq('id', userId)
      .maybeSingle();
    if (erroAlvo) return erro('Não consegui localizar esse usuário.', 500);
    if (!alvo) return erro('Esse usuário não é da sua loja.', 404);

    // Trocar a senha de quem tem MAIS acesso que você é ganhar esse acesso:
    // quem faz isso entra como a pessoa em seguida. Achado da auditoria de
    // 14/09 (dava para trocar a senha do dono e virar dono) e de novo em 24/09
    // (achado 73: a trava lia o papel do alvo com o crachá de quem pediu, não
    // enxergava, e deixava passar). Quem decide é o banco, e na dúvida recusa
    // — ver alcada.ts. A própria senha cada um troca.
    if (userId !== quemPediu) {
      const recusa = await conferirAlcada(comoUsuario, userId, 'trocar_senha');
      if (recusa) return erro(recusa.mensagem, recusa.status);
    }

    const { error: erroSenha } = await comoServidor.auth.admin.updateUserById(userId, {
      password: senha,
    });
    if (erroSenha) {
      return erro('Não foi possível trocar a senha: ' + (erroSenha.message ?? ''), 500);
    }

    return responder({ id: userId, nome: alvo.nome });
  }

  // ── Excluir usuário ──────────────────────────────────────────────────────
  //
  // Só passa quem não deixou NENHUM rastro no sistema. O caminho normal para
  // quem saiu da loja continua sendo desativar: tira o acesso na hora e
  // preserva tudo que a pessoa fez.
  if (acao === 'excluir') {
    const userId = String(corpo.user_id ?? '');
    if (!userId) return erro('Informe quem excluir.');

    // Excluir a si mesmo derruba a própria sessão no meio da operação e deixa
    // a tela num estado que ninguém consegue explicar.
    if (userId === quemPediu) {
      return erro('Você não pode excluir a sua própria conta.');
    }

    const { data: alvo, error: erroAlvo } = await comoUsuario
      .from('profiles')
      .select('id, nome')
      .eq('id', userId)
      .maybeSingle();
    if (erroAlvo) return erro('Não consegui localizar esse usuário.', 500);
    if (!alvo) return erro('Esse usuário não é da sua loja.', 404);

    // Tirar da loja alguém com mais acesso que você (um administrador, por
    // exemplo) é da mesma alçada que mexer no perfil dele. Mesma trava da
    // troca de senha — ver alcada.ts (achados de 14/09 e 73, de 24/09).
    {
      const recusa = await conferirAlcada(comoUsuario, userId, 'excluir');
      if (recusa) return erro(recusa.mensagem, recusa.status);
    }

    const { data: historico, error: erroHistorico } = await comoUsuario.rpc(
      'historico_do_usuario',
      { _user_id: userId },
    );
    if (erroHistorico) return erro('Não consegui conferir o histórico dele.', 500);

    const h = (historico ?? {}) as Record<string, number | boolean>;

    if (h.e_ultimo_admin === true) {
      return erro(
        'Esse é o último administrador ativo da loja. Excluí-lo trancaria todo mundo do lado de fora, sem ninguém para dar permissão a ninguém.',
        409,
      );
    }

    // ── QUEM TEM RASTRO É ARQUIVADO, NÃO APAGADO ──────────────────────────
    //
    // Decisão do Felipe em 23/08: tem que dar para tirar qualquer um da tela,
    // SEM perder as vendas e OS que a pessoa fez.
    //
    // Apagar de verdade não serviria: `profiles.id` aponta para a conta de
    // acesso em cascata, então apagar a conta apaga o cadastro, e aí
    // `vendas.vendedor_id` vira NULL — a venda fica sem ninguém, para sempre,
    // e o banco faz isso sem reclamar. Arquivar mantém o cadastro no lugar, e
    // toda venda antiga segue mostrando quem atendeu.
    if (Number(h.total ?? 0) > 0) {
      const { error: erroArquivar } = await comoUsuario
        .from('profiles')
        .update({ arquivado_em: new Date().toISOString() })
        .eq('id', userId);

      if (erroArquivar) {
        // O gatilho do último administrador manda a mensagem pronta; erro de
        // permissão do RLS vira uma frase que quem atende entende.
        const m = erroArquivar.message ?? '';
        return erro(
          /row-level security|policy/i.test(m)
            ? 'Seu perfil de acesso não permite alterar usuários.'
            : m,
          409,
        );
      }

      const ROTULOS: Record<string, string> = {
        vendas: 'venda(s)',
        ordens_servico: 'ordem(ns) de serviço',
        movimentos_estoque: 'movimentação(ões) de estoque',
        caixa: 'abertura(s) de caixa',
        entradas_mercadoria: 'entrada(s) de mercadoria',
        auditoria: 'registro(s) no histórico',
      };
      const partes = Object.entries(ROTULOS)
        .filter(([chave]) => Number(h[chave] ?? 0) > 0)
        .map(([chave, rotulo]) => `${h[chave]} ${rotulo}`);

      return responder({
        id: userId,
        nome: alvo.nome,
        modo: 'arquivado',
        preservado: partes.join(', '),
      });
    }

    // Sem rastro nenhum: apaga de verdade. Não há o que preservar, e cadastro
    // morto acumulado no banco é sujeira. A conta de acesso leva o cadastro
    // junto pela cascata, então uma chamada resolve as duas coisas.
    const { error: erroExcluir } = await comoServidor.auth.admin.deleteUser(userId);
    if (erroExcluir) {
      return erro('Não foi possível excluir: ' + (erroExcluir.message ?? ''), 500);
    }

    return responder({ id: userId, nome: alvo.nome, modo: 'apagado' });
  }

  // ── Trazer de volta alguém arquivado ─────────────────────────────────────
  //
  // Arquivar sem desarquivar seria uma porta só de ida: a pessoa some da lista
  // e ninguém mais a alcança para corrigir o engano.
  if (acao === 'desarquivar') {
    const userId = String(corpo.user_id ?? '');
    if (!userId) return erro('Informe quem trazer de volta.');

    const { error: erroVolta } = await comoUsuario
      .from('profiles')
      .update({ arquivado_em: null })
      .eq('id', userId);
    if (erroVolta) return erro('Não foi possível trazer de volta: ' + erroVolta.message, 500);

    // Continua INATIVO de propósito: voltar para a lista é uma coisa, voltar a
    // ter acesso ao sistema é outra, e quem decide isso é quem está olhando.
    return responder({ id: userId });
  }

  // ── Entrar como esta pessoa ──────────────────────────────────────────────
  //
  // Pedido do Felipe em 24/09: "quero entrar no usuário do Richard, mas não
  // sei a senha dele, para poder testar". Ele pediu para VER a senha — isso
  // não existe (o banco guarda só um embaralhado sem volta) e guardar senha
  // escrita seria expor a de todo mundo num vazamento. Isto aqui resolve o
  // que ele precisa: um acesso de uso único, gerado com a chave mestra, que a
  // tela usa para trocar a sessão para a da pessoa. E fica na auditoria QUEM
  // entrou COMO QUEM — sem isso, uma venda "feita pelo Richard" poderia ter
  // sido feita por qualquer administrador.
  if (acao === 'entrar_como') {
    const userId = String(corpo.user_id ?? '');
    if (!userId) return erro('Informe como quem entrar.');
    if (userId === quemPediu) return erro('Você já está na sua própria conta.');

    // Com o crachá de quem pediu: o RLS só devolve gente da loja dela.
    const { data: alvo, error: erroAlvo } = await comoUsuario
      .from('profiles')
      .select('id, nome, ativo, arquivado_em, tenant_id')
      .eq('id', userId)
      .maybeSingle();
    if (erroAlvo) return erro('Não consegui localizar esse usuário.', 500);
    if (!alvo) return erro('Esse usuário não é da sua loja.', 404);
    if (alvo.ativo === false || alvo.arquivado_em) {
      return erro('Essa conta está desativada ou arquivada. Ative-a antes de entrar como ela.', 409);
    }

    // Entrar como alguém com mais acesso que você é ganhar esse acesso: mesma
    // trava da troca de senha — ver alcada.ts (achado 73, de 24/09).
    {
      const recusa = await conferirAlcada(comoUsuario, userId, 'entrar_como');
      if (recusa) return erro(recusa.mensagem, recusa.status);
    }

    // O e-mail de acesso vem da conta, não do cadastro (o cadastro pode
    // estar sem e-mail em conta antiga).
    const { data: conta, error: erroConta } = await comoServidor.auth.admin.getUserById(userId);
    const email = conta?.user?.email;
    if (erroConta || !email) return erro('Essa conta não tem e-mail de acesso.', 500);

    // Acesso de uso único, do tipo "link mágico". A tela troca a sessão com
    // ele; ele expira em uma hora e morre no primeiro uso.
    const { data: link, error: erroLink } = await comoServidor.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (erroLink || !tokenHash) {
      return erro('Não foi possível gerar o acesso: ' + (erroLink?.message ?? ''), 500);
    }

    // O rastro. Se não der para registrar, não entra: acesso sem registro
    // é exatamente o que este recurso não pode ser.
    //
    // "Copiar link" (`modo: 'link'`) só GERA o acesso: ninguém entrou ainda,
    // e talvez ninguém entre. Até 24/09 os dois botões gravavam "Entrou como"
    // e o histórico dizia que o Felipe entrou quando só tinha copiado um link
    // (achado 23 da revisão). O uso do link não passa por esta função, então
    // o registro honesto é "gerou o acesso", com o mesmo peso de rastro.
    const soGerouLink = corpo.modo === 'link';
    const { error: erroAuditoria } = await comoServidor.from('auditoria').insert({
      tabela: 'profiles',
      acao: soGerouLink ? 'GEROU_ACESSO' : 'ENTRAR_COMO',
      registro_id: userId,
      usuario_id: quemPediu,
      tenant_id: alvo.tenant_id,
      dados_depois: soGerouLink
        ? { gerou_acesso_para: alvo.nome, email, modo: 'link' }
        : { entrou_como: alvo.nome, email },
    });
    if (erroAuditoria) {
      return erro('Não foi possível registrar na auditoria; a entrada foi cancelada.', 500);
    }

    return responder({ token_hash: tokenHash, nome: alvo.nome, email });
  }

  return erro('Ação desconhecida.');
});
