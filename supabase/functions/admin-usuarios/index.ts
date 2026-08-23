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
 * E a regra de qual perfil a pessoa nova recebe NÃO é decidida aqui: este
 * código chama `trocar_papel_do_usuario`, a mesma função que a tela de
 * Usuários já usa, e também com o crachá de quem clicou. Assim a proteção do
 * último administrador e a exigência de `roles.manage` continuam valendo, e a
 * regra segue morando num lugar só — o banco. Um segundo lugar decidindo
 * permissão é como as duas versões divergem em silêncio.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

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

    if (Number(h.total ?? 0) > 0) {
      const ROTULOS: Record<string, string> = {
        vendas: 'venda(s)',
        ordens_servico: 'ordem(ns) de serviço',
        movimentos_estoque: 'movimentação(ões) de estoque',
        caixa: 'abertura(s)/fechamento(s) de caixa',
        entradas_mercadoria: 'entrada(s) de mercadoria',
        auditoria: 'registro(s) no histórico do sistema',
      };
      const partes = Object.entries(ROTULOS)
        .filter(([chave]) => Number(h[chave] ?? 0) > 0)
        .map(([chave, rotulo]) => `${h[chave]} ${rotulo}`);

      return erro(
        `Não dá para excluir ${alvo.nome}: existem ${partes.join(', ')} no nome dele. ` +
          'Apagar deixaria esses registros sem autor para sempre — ninguém mais saberia quem atendeu. ' +
          'Use Desativar: tira o acesso na hora e preserva o histórico.',
        409,
      );
    }

    // Apagar da conta de acesso derruba o cadastro junto (o vínculo é em
    // cascata), então uma chamada resolve as duas coisas.
    const { error: erroExcluir } = await comoServidor.auth.admin.deleteUser(userId);
    if (erroExcluir) {
      return erro('Não foi possível excluir: ' + (erroExcluir.message ?? ''), 500);
    }

    return responder({ id: userId, nome: alvo.nome });
  }

  return erro('Ação desconhecida.');
});
