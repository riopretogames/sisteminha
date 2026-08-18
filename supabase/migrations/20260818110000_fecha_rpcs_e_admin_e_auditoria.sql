-- =============================================================================
-- Sisteminha (RP System.IO) — fecha RPCs sem trava, protege último admin,
-- audita exceção de permissão
-- =============================================================================
--
-- Continuação do backlog de itens 🔴 ainda abertos depois da revisão de
-- 17-18/08 (achados antigos, de 07-08/08, nunca corrigidos até hoje):
--
--   1. `ajustar_estoque_produto` (RPC) não conferia permissão nem tenant —
--      qualquer autenticado, de QUALQUER loja cadastrada no sistema, podia
--      mudar o estoque de um produto de OUTRA loja passando o ID direto
--      pela API, sem precisar da tela nem de `inventory.adjust`.
--   2. `proximo_numero_documento` (RPC) não conferia que o `_tenant`
--      recebido é o do próprio usuário — dava pra consumir/embaralhar a
--      numeração de OS/venda/devolução de outra loja via chamada direta.
--   3. Nada impedia o único administrador ativo de uma loja se rebaixar de
--      cargo ou se desativar (ou desativar/rebaixar o último outro
--      administrador) — sem caminho de volta dentro do próprio app, isso
--      trava o sistema pra todo mundo daquela loja.
--   4. Exceção de permissão por usuário (`user_permissions`) é a única
--      tabela sensível de Configurações sem gatilho de auditoria — dar ou
--      tirar uma permissão especial de alguém não deixava rastro nenhum.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ajustar_estoque_produto — trava de tenant + permissão
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ajustar_estoque_produto(
  _produto_id UUID,
  _nova_quantidade INTEGER,
  _motivo TEXT DEFAULT 'Ajuste manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto RECORD;
BEGIN
  SELECT estoque_atual, custo, tenant_id
  INTO v_produto
  FROM public.produtos
  WHERE id = _produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado.', _produto_id;
  END IF;

  -- NOVO (18/08): antes disto, qualquer autenticado — de qualquer loja —
  -- podia chamar esta função direto pela API e mudar o estoque de um
  -- produto de OUTRA loja. `SECURITY DEFINER` roda com privilégio do dono,
  -- então a RLS de `produtos` nunca entrava em cena pra barrar isso.
  IF v_produto.tenant_id <> public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Produto não pertence à sua loja.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission(auth.uid(), 'inventory.adjust') THEN
    RAISE EXCEPTION 'Seu acesso não permite ajustar estoque.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _nova_quantidade < 0 THEN
    RAISE EXCEPTION 'Estoque não pode ser negativo.';
  END IF;

  -- Sem diferença: não grava movimentação vazia (ex.: usuário abriu o
  -- formulário e salvou sem mudar a quantidade).
  IF _nova_quantidade = v_produto.estoque_atual THEN
    RETURN;
  END IF;

  UPDATE public.produtos
  SET estoque_atual = _nova_quantidade
  WHERE id = _produto_id;

  INSERT INTO public.movimentos_estoque (
    tenant_id, produto_id, tipo, quantidade,
    custo_unitario, valor_total,
    motivo, origem, usuario_id,
    saldo_anterior, saldo_depois
  ) VALUES (
    v_produto.tenant_id,
    _produto_id,
    CASE WHEN _nova_quantidade > v_produto.estoque_atual THEN 'entrada' ELSE 'saida' END,
    ABS(_nova_quantidade - v_produto.estoque_atual),
    v_produto.custo,
    v_produto.custo * ABS(_nova_quantidade - v_produto.estoque_atual),
    _motivo,
    'ajuste_manual',
    auth.uid(),
    v_produto.estoque_atual,
    _nova_quantidade
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. proximo_numero_documento — trava de tenant
-- -----------------------------------------------------------------------------
-- Único uso real hoje é interno (gatilhos de numeração de OS/venda/
-- devolução, sempre passando NEW.tenant_id da própria linha sendo criada) —
-- mas por ser SECURITY DEFINER, também é chamável direto pela API com
-- QUALQUER `_tenant`. A trava fecha isso sem afetar nenhum uso legítimo.

CREATE OR REPLACE FUNCTION public.proximo_numero_documento(_tenant UUID, _documento TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano_mes TEXT := to_char(now(), 'YYYYMM');
  v_seq     INTEGER;
BEGIN
  IF _tenant <> public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Loja informada não é a sua.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- INSERT ... ON CONFLICT DO UPDATE é atômico: concorrentes serializam na
  -- linha e cada um recebe um valor distinto.
  INSERT INTO public.documento_sequencias (tenant_id, documento, ano_mes, ultimo)
  VALUES (_tenant, _documento, v_ano_mes, 1)
  ON CONFLICT (tenant_id, documento, ano_mes)
  DO UPDATE SET ultimo = public.documento_sequencias.ultimo + 1
  RETURNING ultimo INTO v_seq;

  RETURN _documento || '-' || v_ano_mes || '-' || lpad(v_seq::text, 4, '0');
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Protege o último administrador ativo da loja
-- -----------------------------------------------------------------------------
-- Regra: toda loja precisa ter, a qualquer momento, pelo menos 1
-- administrador ATIVO (perfil administrador + profiles.ativo = true).
-- Cobre os dois jeitos de derrubar isso: trocar o papel dele por outro
-- (DELETE em user_roles) e desativar a conta (UPDATE em profiles.ativo).
-- Vale tanto pra alguém se auto-rebaixar/desativar quanto pra um admin
-- mexer no ÚLTIMO outro administrador — a proteção é sobre a LOJA nunca
-- ficar sem ninguém capaz de administrar, não só sobre autoproteção.

CREATE OR REPLACE FUNCTION public.proteger_ultimo_administrador()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_outros_admins_ativos INTEGER;
BEGIN
  -- Só interessa se a linha afetada É de um administrador.
  IF OLD.role <> 'administrador' THEN
    RETURN OLD;
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = OLD.user_id;

  SELECT COUNT(*) INTO v_outros_admins_ativos
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'administrador'
    AND p.tenant_id = v_tenant
    AND p.ativo = true
    AND ur.user_id <> OLD.user_id;

  IF v_outros_admins_ativos = 0 THEN
    RAISE EXCEPTION
      'Esta é a única conta de administrador ativa da loja — promova outra pessoa a administrador antes de trocar o perfil desta.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

-- BEFORE DELETE em user_roles: dispara exatamente no passo que `definirPapel`
-- usa pra tirar o papel atual (DELETE + INSERT do novo) antes de trocar por
-- outro perfil.
CREATE TRIGGER trg_protege_admin_ao_trocar_papel
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_ultimo_administrador();

CREATE OR REPLACE FUNCTION public.proteger_ultimo_administrador_desativacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e_admin BOOLEAN;
  v_outros_admins_ativos INTEGER;
BEGIN
  -- Só interessa a transição ativo → inativo.
  IF NEW.ativo <> false OR OLD.ativo = false THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND role = 'administrador'
  ) INTO v_e_admin;

  IF NOT v_e_admin THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_outros_admins_ativos
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'administrador'
    AND p.tenant_id = NEW.tenant_id
    AND p.ativo = true
    AND ur.user_id <> NEW.id;

  IF v_outros_admins_ativos = 0 THEN
    RAISE EXCEPTION
      'Esta é a única conta de administrador ativa da loja — promova outra pessoa a administrador antes de desativar esta conta.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protege_admin_ao_desativar
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_ultimo_administrador_desativacao();


-- -----------------------------------------------------------------------------
-- 4. Auditoria de exceção de permissão (user_permissions)
-- -----------------------------------------------------------------------------
-- Mesmo problema já resolvido pra user_roles/os_pagamentos: não tem
-- tenant_id direto (só via user_id → profiles).

CREATE OR REPLACE FUNCTION public.registrar_auditoria_user_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes  JSONB;
  v_depois JSONB;
  v_tenant UUID;
  v_user   UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_antes := to_jsonb(OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_depois := to_jsonb(NEW);
  END IF;

  v_user := COALESCE(v_depois ->> 'user_id', v_antes ->> 'user_id')::UUID;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_user;

  -- user_permissions não tem coluna `id` própria (chave primária composta
  -- user_id + permission_key) — registro_id fica nulo, dados_antes/depois
  -- já identificam a linha pelas duas colunas.
  INSERT INTO public.auditoria (tenant_id, usuario_id, acao, tabela, dados_antes, dados_depois)
  VALUES (v_tenant, auth.uid(), TG_OP, TG_TABLE_NAME, v_antes, v_depois);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_user_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_user_permissions();

NOTIFY pgrst, 'reload schema';
