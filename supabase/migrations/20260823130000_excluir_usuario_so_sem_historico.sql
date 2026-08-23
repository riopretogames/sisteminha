-- =============================================================================
-- RPG System.IO — Excluir usuário, só quando não há nada dele no sistema
-- =============================================================================
--
-- Pedido do Felipe em 23/08: a tela de Usuários cadastra e desativa, mas não
-- exclui. O caso real dele é limpar um usuário de teste ("aaaaaaa", inativo,
-- sem nenhum movimento).
--
-- POR QUE NÃO BASTA UM DELETE
--
-- Conferido no banco antes de escrever, e o resultado não é o esperado:
--
--   • `auditoria`, `caixa_sessoes`, `caixa_movimentos`, `movimentos_estoque` e
--     `entradas_mercadoria` apontam para o usuário com RESTRICT — o banco
--     RECUSA o delete sozinho. Ótimo.
--   • Mas `vendas.vendedor_id` e `service_orders.tecnico_id/vendedor_id` são
--     SET NULL. Apagar alguém com venda NÃO dá erro: a venda continua lá, sem
--     vendedor, PARA SEMPRE. O ranking perde a pessoa, o comprovante fica sem
--     quem atendeu, e ninguém mais responde "quem vendeu isso?".
--
-- O segundo caso é o perigoso justamente por ser silencioso. Por isso a
-- checagem aqui é explícita e cobre venda e OS, em vez de confiar que o banco
-- vai barrar.
--
-- Desativar continua sendo o caminho normal para quem saiu da loja: tira o
-- acesso na hora e preserva tudo que a pessoa fez.

CREATE OR REPLACE FUNCTION public.historico_do_usuario(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendas   INTEGER;
  v_os       INTEGER;
  v_mov      INTEGER;
  v_caixa    INTEGER;
  v_entradas INTEGER;
  v_aud      INTEGER;
  v_admins   INTEGER;
  v_e_admin  BOOLEAN;
BEGIN
  SELECT count(*) INTO v_vendas FROM public.vendas WHERE vendedor_id = _user_id;
  SELECT count(*) INTO v_os     FROM public.service_orders
    WHERE tecnico_id = _user_id OR vendedor_id = _user_id;
  SELECT count(*) INTO v_mov    FROM public.movimentos_estoque WHERE usuario_id = _user_id;
  SELECT count(*) INTO v_caixa  FROM public.caixa_sessoes
    WHERE aberto_por = _user_id OR fechado_por = _user_id;
  SELECT count(*) INTO v_entradas FROM public.entradas_mercadoria WHERE usuario_id = _user_id;
  SELECT count(*) INTO v_aud    FROM public.auditoria WHERE usuario_id = _user_id;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'administrador'
  ) INTO v_e_admin;

  -- Último administrador ATIVO não pode sumir: sem ele ninguém consegue mais
  -- dar permissão a ninguém, e a loja fica trancada do lado de fora. Mesma
  -- proteção que já existe para desativar e para trocar papel.
  SELECT count(*) INTO v_admins
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'administrador' AND p.ativo = true AND ur.user_id <> _user_id;

  RETURN jsonb_build_object(
    'vendas', v_vendas,
    'ordens_servico', v_os,
    'movimentos_estoque', v_mov,
    'caixa', v_caixa,
    'entradas_mercadoria', v_entradas,
    'auditoria', v_aud,
    'total', v_vendas + v_os + v_mov + v_caixa + v_entradas + v_aud,
    'e_ultimo_admin', v_e_admin AND v_admins = 0
  );
END;
$$;

COMMENT ON FUNCTION public.historico_do_usuario(UUID) IS
  'Conta tudo que um usuário deixou no sistema, para decidir se dá para excluí-lo. Usada pela função de servidor admin-usuarios antes de apagar. Total zero = não há rastro dele em lugar nenhum.';

REVOKE ALL ON FUNCTION public.historico_do_usuario(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.historico_do_usuario(UUID) TO authenticated;
