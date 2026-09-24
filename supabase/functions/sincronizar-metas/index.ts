/**
 * A porta por onde a planilha de metas entra no sistema.
 *
 * O QUE FAZ
 *
 * A planilha "Metas RPG" (Google Drive) tem um robô dentro dela (Apps Script,
 * em `integracoes/planilha-de-metas/`). Toda vez que alguém edita a planilha,
 * o robô lê as abas e manda os números para cá. Este código confere o código
 * de acesso e entrega tudo para `aplicar_metas_da_planilha`, a função do banco
 * que grava — numa transação só, ou tudo ou nada.
 *
 * Decisão do Felipe em 23/09/2026: *"sempre copiar os dados dessa planilha; se
 * alterar os dados da planilha, alterar os dados aí no sistema"*. A planilha é
 * a fonte; o sistema é espelho.
 *
 * COMO A PERMISSÃO É CONFERIDA — e por que é diferente de `admin-usuarios`
 *
 * A regra da chave mestra (CLAUDE.md, 22/08) manda conferir o crachá da PESSOA
 * antes de usar a chave. Aqui não existe pessoa logada no sistema: quem chama é
 * um robô dentro de uma planilha do Google, que não tem crachá do Supabase. O
 * "crachá" dele é um código de acesso compartilhado, guardado em dois lugares
 * só — nos segredos deste servidor (METAS_SYNC_SECRET) e nas propriedades do
 * robô na planilha. Quem não tem o código recebe 401 e não deixa rastro.
 *
 * O que o código de acesso permite é estreito de propósito: gravar METAS, e só
 * na loja configurada (METAS_SYNC_TENANT_ID). Não lê nada, não mexe em venda,
 * cliente, caixa ou usuário. E quem pode editar a planilha já pode mudar as
 * metas de qualquer jeito — o código só protege contra quem está de fora.
 *
 * A validação de verdade mora no banco (`aplicar_metas_da_planilha`): este
 * arquivo só barra o que nem precisa chegar lá. Um segundo lugar decidindo as
 * regras é como as duas versões divergem em silêncio.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

/** A planilha inteira cabe em ~5 KB. 64 KB é folga, não porta aberta. */
const LIMITE_BYTES = 64 * 1024;

/** Código de acesso curto é chutável. 32 caracteres é o mínimo aceito. */
const SEGREDO_MINIMO = 32;

function responder(corpo: unknown, status = 200) {
  // Sem cabeçalhos de CORS de propósito: quem chama é um servidor (o Google),
  // nunca um navegador. Sem CORS, nenhuma página da internet consegue fazer o
  // navegador de alguém chamar esta porta.
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function erro(mensagem: string, status = 400) {
  return responder({ ok: false, erro: mensagem }, status);
}

/**
 * Compara dois textos sem vazar, pelo tempo de resposta, quantos caracteres
 * acertaram. Compara o resumo (SHA-256) dos dois — assim até o tamanho do
 * código de acesso fica escondido.
 */
async function mesmoCodigo(recebido: string, esperado: string): Promise<boolean> {
  const cod = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', cod.encode(recebido)),
    crypto.subtle.digest('SHA-256', cod.encode(esperado)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diferenca = 0;
  for (let i = 0; i < va.length; i++) diferenca |= va[i] ^ vb[i];
  return diferenca === 0;
}

/** Texto curto e seguro para guardar no registro (sem quebrar o limite da coluna). */
function recorte(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  return t ? t.slice(0, maximo) : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return erro('Método não suportado.', 405);

  const URL_PROJETO = Deno.env.get('SUPABASE_URL');
  const CHAVE_MESTRA = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SEGREDO = Deno.env.get('METAS_SYNC_SECRET') ?? '';
  const LOJA = Deno.env.get('METAS_SYNC_TENANT_ID') ?? '';

  if (!URL_PROJETO || !CHAVE_MESTRA || SEGREDO.length < SEGREDO_MINIMO || !LOJA) {
    // Configuração faltando no servidor: responde sem dizer qual, para não
    // ensinar a quem está de fora o que existe aqui dentro.
    return erro('A sincronização de metas não está configurada no servidor.', 503);
  }

  const recebido = req.headers.get('x-segredo-metas') ?? '';
  if (!(await mesmoCodigo(recebido, SEGREDO))) {
    // Não grava registro de tentativa sem código: senão qualquer um de fora
    // conseguiria encher a tabela de sincronizações de lixo.
    return erro('Código de acesso inválido.', 401);
  }

  const texto = await req.text();
  if (texto.length > LIMITE_BYTES) return erro('O pedido é grande demais para ser a planilha de metas.', 413);

  let payload: Record<string, unknown>;
  try {
    const lido = JSON.parse(texto);
    if (!lido || typeof lido !== 'object' || Array.isArray(lido)) throw new Error('formato');
    payload = lido as Record<string, unknown>;
  } catch {
    return erro('O pedido não chegou no formato esperado.', 400);
  }

  const admin = createClient(URL_PROJETO, CHAVE_MESTRA, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Relato de falha do robô ────────────────────────────────────────────────
  // Quando o robô nem consegue LER a planilha (coluna renomeada, aba apagada),
  // ele não tem metas para mandar — mas avisa que falhou. Sem isto, a falha
  // ficava presa na planilha e Cadastros > Metas seguia mostrando o check verde
  // de semanas atrás, sem ninguém perceber que o sistema parou de acompanhar.
  if (payload.tipo === 'falha') {
    const planilha = (payload.planilha ?? {}) as Record<string, unknown>;
    const mensagem = recorte(payload.mensagem, 1900) ?? 'Falha sem descrição.';
    // O ano (quando o robô conseguiu ler) separa a falha da planilha de 2027
    // do sucesso diário da de 2026 na virada do ano — senão um esconde o outro
    // em Cadastros > Metas.
    const anoDaFalha = Number(payload.ano);
    await admin.from('metas_sincronizacoes').insert({
      tenant_id: LOJA,
      sucesso: false,
      ano: Number.isInteger(anoDaFalha) && anoDaFalha >= 2020 && anoDaFalha <= 2100 ? anoDaFalha : null,
      erro: `O robô da planilha não conseguiu enviar: ${mensagem}`,
      planilha_id: recorte(planilha.id, 200),
      planilha_nome: recorte(planilha.nome, 200),
      planilha_url: recorte(planilha.url, 500),
      // Informativo: quem manda é o próprio robô, então o sistema anota o que
      // ele declarou, sem conferir.
      enviado_por: recorte(payload.enviado_por, 200),
    });
    return responder({ ok: true, registrado: 'falha' });
  }

  const { data, error } = await admin.rpc('aplicar_metas_da_planilha', {
    p_tenant: LOJA,
    p_payload: payload,
  });

  if (error) {
    // As mensagens do banco já saem em português ("Em outubro, a faixa Prata
    // é menor que a anterior…") — são elas que aparecem para o Felipe no aviso
    // da planilha e na tela de Cadastros > Metas.
    const motivo = (error.message || 'Falha desconhecida ao gravar as metas.').slice(0, 2000);
    const planilha = (payload.planilha ?? {}) as Record<string, unknown>;
    const ano = Number(payload.ano);
    await admin.from('metas_sincronizacoes').insert({
      tenant_id: LOJA,
      sucesso: false,
      erro: motivo,
      planilha_id: recorte(planilha.id, 200),
      planilha_nome: recorte(planilha.nome, 200),
      planilha_url: recorte(planilha.url, 500),
      enviado_por: recorte(payload.enviado_por, 200),
      ano: Number.isInteger(ano) ? ano : null,
    });
    return erro(motivo, 422);
  }

  return responder({ ok: true, resumo: data });
});
