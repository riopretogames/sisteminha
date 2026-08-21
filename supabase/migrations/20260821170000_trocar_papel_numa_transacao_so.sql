-- =============================================================================
-- Sisteminha (RPG System.IO) — trocar papel de usuário vira operação única
-- =============================================================================
--
-- ACHADO confirmado desde a primeira revisão e reconfirmado em 18/08:
-- `useUsuarios.definirPapel` troca o papel de alguém em DUAS chamadas
-- separadas — apaga o papel atual, depois grava o novo. Entre uma e outra não
-- há transação nenhuma.
--
-- Se a segunda falhar (queda de rede no meio, erro de RLS, aba fechada), a
-- pessoa fica **sem papel nenhum** — e sem papel ela perde todo acesso ao
-- sistema, em silêncio, sem que ninguém tenha pedido isso. Pior: quem estava
-- trocando o papel vê a mensagem de erro e supõe que "não mudou nada", quando
-- na verdade mudou para o pior estado possível.
--
-- POR QUE NÃO RESOLVER COM `upsert` (e esta é a parte que quase deu errado):
-- a nota deixada na revisão de 20/08 avisa que o gatilho
-- `trg_protege_admin_ao_trocar_papel` (migration `20260818110000`) é um
-- `BEFORE DELETE` escrito DE PROPÓSITO em cima do passo DELETE deste fluxo —
-- é ele que impede tirar o papel do último administrador ativo da loja.
-- Trocar DELETE+INSERT por um upsert eliminaria o DELETE e, com ele, a
-- proteção do último administrador — silenciosamente, que é o pior jeito de
-- perder uma trava.
--
-- Então a correção mantém o DELETE e apenas envolve o par numa função. Como
-- toda função plpgsql roda dentro de uma transação, os dois passos passam a
-- ser um só: ou os dois acontecem, ou nenhum acontece. E o gatilho de
-- proteção continua disparando exatamente como antes.
--
-- De quebra, isto fecha o outro achado da mesma área: a tela era liberada por
-- `users.manage` enquanto escrever papel exige `roles.manage`, sem checagem
-- granular. Agora a função exige `roles.manage` explicitamente e devolve uma
-- mensagem em português — em vez de a operação falhar pela RLS com erro cru.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trocar_papel_do_usuario(_user_id UUID, _role public.app_role)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant      UUID;
  v_tenant_alvo UUID;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.manage') THEN
    RAISE EXCEPTION 'Seu acesso não permite trocar o perfil de um usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_tenant := public.get_user_tenant_id(auth.uid());
  SELECT tenant_id INTO v_tenant_alvo FROM public.profiles WHERE id = _user_id;

  IF v_tenant_alvo IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_tenant_alvo IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'Este usuário é de outra loja.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Os dois passos, na mesma transação. O DELETE é mantido (e não trocado por
  -- upsert) porque `trg_protege_admin_ao_trocar_papel` depende dele para
  -- barrar a remoção do último administrador ativo.
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
END;
$$;

COMMENT ON FUNCTION public.trocar_papel_do_usuario(UUID, public.app_role) IS
  'Troca o papel de um usuário da mesma loja, com DELETE e INSERT na mesma transação — antes eram duas chamadas soltas, e uma falha no meio deixava a pessoa sem papel nenhum, ou seja, sem acesso ao sistema. Exige roles.manage. O DELETE é proposital: trg_protege_admin_ao_trocar_papel depende dele para proteger o último administrador.';

REVOKE ALL ON FUNCTION public.trocar_papel_do_usuario(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trocar_papel_do_usuario(UUID, public.app_role) TO authenticated;

NOTIFY pgrst, 'reload schema';
