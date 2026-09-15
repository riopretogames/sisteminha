-- =============================================================================
-- NINGUÉM SE PROMOVE, NINGUÉM SE REATIVA, NINGUÉM ENTRA SEM SER CHAMADO
-- =============================================================================
--
-- Segunda leva da auditoria de segurança da véspera de publicar (14 e 15/09).
-- A primeira (20260914100000) fechou o que estava aberto para quem NÃO fez
-- login. Esta fecha o que estava aberto para quem fez — e para quem faria.
-- Cada item abaixo foi reproduzido no banco de verdade por dois auditores
-- independentes antes de virar correção.
--
-- 1. QUALQUER PESSOA NA INTERNET CRIAVA UMA CONTA DENTRO DA LOJA.
--    A tela de cadastro foi removida em agosto, mas o servidor de login do
--    Supabase continuou aceitando cadastro público — e o gatilho que monta
--    a ficha de quem entra (`handle_new_user`) colocava o desconhecido na
--    única loja que existe, ativo. Sem papel ele não tinha permissão nenhuma,
--    mas 30 regras de leitura só perguntavam "é da mesma loja?": clientes com
--    CPF e telefone, vendas, OS, estoque, a equipe. Duas travas, uma
--    independente da outra:
--      • `handle_new_user` passa a RECUSAR a conta que não veio pela tela de
--        Usuários do sistema (a função de borda `admin-usuarios` carimba
--        `criado_por` nos metadados de aplicação — coisa que só a chave
--        mestra escreve; o cadastro público não consegue). O erro derruba a
--        criação inteira: a conta nem chega a existir. Continuam valendo o
--        primeiro usuário do sistema e a lista `bootstrap_administradores`.
--      • `get_user_tenant_id` só responde para conta ATIVA, não arquivada e
--        COM papel. Conta sem papel — ou desativada — não é de loja nenhuma,
--        e toda regra "tenant_id = get_user_tenant_id(...)" fecha sozinha.
--    (Desligar "Allow new users to sign up" no painel do Supabase continua
--    sendo a terceira trava, e é um clique do Felipe.)
--
-- 2. FUNCIONÁRIO DESATIVADO SE REATIVAVA SOZINHO.
--    A policy "Users can update their own profile" (do primeiro esquema do
--    Lovable, 27/01) deixava qualquer um editar a PRÓPRIA linha de profiles —
--    todas as colunas: `ativo`, `arquivado_em`, `tenant_id`. Desligou alguém?
--    Ele mandava `ativo = true` pela API e voltava com tudo. Ou trocava o
--    `tenant_id` e ia parar na loja vizinha. Nenhuma tela edita o próprio
--    perfil (o nome é editado por quem tem `users.manage`), então a policy
--    simplesmente sai. Somado ao item 1, conta desativada agora não lê nada.
--
-- 3. O ÚNICO ADMINISTRADOR SE REBAIXAVA POR UPDATE.
--    A trava do "último administrador" só olhava DELETE em `user_roles`. Um
--    UPDATE trocando `role` na linha passava — e a loja ficava sem ninguém
--    que dê permissão. Ninguém precisa de UPDATE nessa tabela (a tela usa
--    `trocar_papel_do_usuario`): o privilégio é revogado, e o gatilho passa
--    a cobrir UPDATE também, para o dia em que alguém reconceder.
--
-- 4. VENDA PAGA ERA REESCRITA POR QUALQUER VENDEDOR.
--    • "Vendedor edita a propria venda" deixava mudar QUALQUER coluna da
--      própria venda, inclusive `status` para cancelado (sem `sales.cancel`)
--      e `total`. A venda sumia do faturamento com o dinheiro no caixa.
--    • Itens e pagamentos tinham policy "FOR ALL" para quem tem
--      `sales.create`: qualquer vendedor editava ou apagava item e pagamento
--      de QUALQUER venda paga da loja, de qualquer dia — e um pagamento
--      "no cartão" inventado tirava o dinheiro da conferência do caixa.
--    • `registrar_entrada_produto_troca` aceitava o id de qualquer venda.
--    Agora: valor, cliente e vendedor de uma venda gravada não mudam mais
--    (para corrigir, cancela e faz outra — é assim que a loja trabalha);
--    a única mudança de situação é pago → cancelado, com `sales.cancel` — ou
--    pelo próprio vendedor nos 10 minutos seguintes, que é o "desfazer" que
--    o PDV usa quando a gravação falha no meio; item e pagamento só ENTRAM,
--    na venda que o próprio vendedor está fechando agora (mesma janela), e
--    nunca são editados nem apagados pela API.
--
-- 5. RASTRO QUE PODIA SER FORJADO OU APAGADO.
--    • Qualquer logado inseria linha na linha do tempo da OS em nome de
--      outra pessoa (policy de INSERT em `service_order_history`); e quem
--      ajusta estoque inseria movimentação falsa à mão. Nenhuma tela faz
--      nenhum dos dois — só gatilhos e funções do próprio banco. As duas
--      policies saem.
--    • O "quem fez" da sangria, da devolução e do pagamento de OS vinha do
--      navegador. Agora o banco carimba `usuario_id` com quem está logado.
--    • Apagar uma OS levava junto os pagamentos dela; apagar um produto
--      levava o extrato de estoque inteiro. Passa a ser recusado: OS com
--      pagamento se cancela, produto com movimento se desativa.
--    • Item de OS tinha policy de UPDATE que nenhuma tela usa: dava para
--      trocar quantidade de peça sem o estoque acompanhar, e reescrever o
--      custo do item sem ver custo. Sai.
--
-- 6. O QUE SÓ A TELA ESCONDIA.
--    • `sales.view` valia só no menu: um técnico lia todas as vendas,
--      pagamentos e metas pela API. A regra de leitura de `vendas` passa a
--      exigir uma permissão de venda, financeiro ou relatório; a de metas,
--      `dashboards.goals.view`.
--    • O resumo do caixa por forma de pagamento (`vw_caixa_resumo_formas`)
--      respondia a qualquer logado. Passa a exigir `finance.view` ou
--      `finance.cashier.close`, como o resto do caixa.
--    • O log de auditoria guardava a linha inteira do produto — custo e
--      margem inclusos — e quem tem só `audit.view` lia tudo. A tela passa a
--      ler por `vw_auditoria`, que apaga as chaves de custo para quem não
--      tem `inventory.cost.view` (mesmo desenho das outras vw_*). A tabela
--      crua fecha para quem está logado.
--
-- Tudo conferido no fim por um bloco que simula cada situação com o banco
-- como está — inclusive lendo vendas como o técnico e perguntando a loja de
-- uma conta desativada — e derruba a migration se qualquer trava não segurar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CONTA NOVA SÓ PELA TELA DE USUÁRIOS; LOJA SÓ PARA CONTA ATIVA COM PAPEL
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    UUID;
  v_total_papeis INTEGER;
  v_e_bootstrap  BOOLEAN;
  v_criado_por   TEXT := NEW.raw_app_meta_data ->> 'criado_por';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.bootstrap_administradores b
    WHERE lower(b.email) = lower(NEW.email)
  ) INTO v_e_bootstrap;

  SELECT COUNT(*) INTO v_total_papeis FROM public.user_roles;

  -- A porta: só entra quem foi criado por um administrador (a função de
  -- borda grava `criado_por` nos metadados de APLICAÇÃO, que só a chave
  -- mestra escreve — o cadastro público só escreve metadados de usuário),
  -- quem está na lista de bootstrap, ou o primeiro usuário do sistema.
  IF v_criado_por IS NULL AND NOT v_e_bootstrap AND v_total_papeis > 0 THEN
    RAISE EXCEPTION
      'O sisteminha não aceita cadastro por conta própria. Peça a um administrador da loja para criar o seu acesso em Configurações > Usuários.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at LIMIT 1;

  INSERT INTO public.profiles (id, tenant_id, nome, email)
  VALUES (
    NEW.id,
    v_tenant_id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nome', ''), split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_e_bootstrap OR v_total_papeis = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrador')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- "De que loja é fulano?" só tem resposta para conta ativa, não arquivada e
-- com papel. Todo o resto do RLS pergunta isto; fechando aqui, fecha em todo
-- lugar de uma vez. Quem lê o próprio perfil (id = auth.uid()) não passa por
-- aqui, então a tela de "conta desativada" continua conseguindo dizer isso.
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.tenant_id
    FROM public.profiles p
   WHERE p.id = _user_id
     AND p.ativo
     AND p.arquivado_em IS NULL
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_tenant_id(_user_id) = _tenant_id
$$;

-- -----------------------------------------------------------------------------
-- 2. NINGUÉM EDITA O PRÓPRIO PERFIL PELA API
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- -----------------------------------------------------------------------------
-- 3. O ÚLTIMO ADMINISTRADOR NÃO SE REBAIXA POR UPDATE
-- -----------------------------------------------------------------------------
REVOKE UPDATE ON public.user_roles FROM authenticated;

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
  IF OLD.role <> 'administrador' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- UPDATE que mantém a linha de administrador no mesmo usuário não tira
  -- ninguém de lugar nenhum.
  IF TG_OP = 'UPDATE' AND NEW.role = 'administrador' AND NEW.user_id = OLD.user_id THEN
    RETURN NEW;
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

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protege_admin_ao_trocar_papel ON public.user_roles;
CREATE TRIGGER trg_protege_admin_ao_trocar_papel
  BEFORE DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_ultimo_administrador();

-- -----------------------------------------------------------------------------
-- 4. VENDA GRAVADA É HISTÓRIA
-- -----------------------------------------------------------------------------
-- 4a. Quem lê vendas é quem tem uma tela de venda, financeiro ou relatório.
DROP POLICY IF EXISTS "Users can view sales in their tenant" ON public.vendas;
CREATE POLICY "Ver vendas da loja"
  ON public.vendas FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'sales.view')
      OR public.has_permission(auth.uid(), 'sales.create')
      OR public.has_permission(auth.uid(), 'sales.cancel')
      OR public.has_permission(auth.uid(), 'dashboards.sales.view')
      OR public.has_permission(auth.uid(), 'dashboards.goals.view')
      OR public.has_permission(auth.uid(), 'bi.commercial.view')
      OR public.has_permission(auth.uid(), 'bi.stock.view')
      OR public.has_permission(auth.uid(), 'finance.view')
      OR public.has_permission(auth.uid(), 'finance.cashflow.view')
      OR public.has_permission(auth.uid(), 'reports.view')
      OR public.has_permission(auth.uid(), 'audit.view')
    )
  );

-- 4b. O que uma venda gravada ainda aceita: observação, e o cancelamento.
CREATE OR REPLACE FUNCTION public.proteger_venda_gravada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.total                  IS DISTINCT FROM OLD.total
     OR NEW.subtotal            IS DISTINCT FROM OLD.subtotal
     OR NEW.descontos           IS DISTINCT FROM OLD.descontos
     OR NEW.valor_faturamento_real IS DISTINCT FROM OLD.valor_faturamento_real
     OR NEW.comissao_calculada  IS DISTINCT FROM OLD.comissao_calculada
     OR NEW.cliente_id          IS DISTINCT FROM OLD.cliente_id
     OR NEW.vendedor_id         IS DISTINCT FROM OLD.vendedor_id
     OR NEW.tenant_id           IS DISTINCT FROM OLD.tenant_id
     OR NEW.numero_venda        IS DISTINCT FROM OLD.numero_venda
     OR NEW.origem_venda_id     IS DISTINCT FROM OLD.origem_venda_id
     OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'Venda gravada não muda de valor, de cliente nem de vendedor. Para corrigir, cancele esta e registre outra.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'pago' AND NEW.status = 'cancelado') THEN
      RAISE EXCEPTION 'A única mudança de situação de uma venda é o cancelamento.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Cancelar é de quem tem `sales.cancel`. A exceção é o "desfazer" do
    -- próprio PDV: se a gravação falha no meio (estoque insuficiente no
    -- item, pagamento recusado), o vendedor cancela a venda que acabou de
    -- abrir. Dez minutos cobrem isso com folga e nada além disso.
    IF NOT public.has_permission(auth.uid(), 'sales.cancel')
       AND NOT (OLD.vendedor_id = auth.uid() AND OLD.created_at > now() - interval '10 minutes')
    THEN
      RAISE EXCEPTION
        'Cancelar venda é de quem tem a permissão "Cancelar venda". O próprio vendedor só desfaz uma venda nos 10 minutos seguintes.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_venda_gravada ON public.vendas;
CREATE TRIGGER proteger_venda_gravada
  BEFORE UPDATE ON public.vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_venda_gravada();

-- 4c. Item e pagamento só entram, na venda que o vendedor está fechando.
DROP POLICY IF EXISTS "Quem vende gerencia itens da venda" ON public.itens_venda;
CREATE POLICY "Quem vende lanca itens na venda que esta fechando"
  ON public.itens_venda FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'sales.create')
    AND EXISTS (
      SELECT 1 FROM public.vendas v
      WHERE v.id = venda_id
        AND v.tenant_id = public.get_user_tenant_id(auth.uid())
        AND v.status = 'pago'
        AND v.vendedor_id = auth.uid()
        AND v.created_at > now() - interval '10 minutes'
    )
  );

DROP POLICY IF EXISTS "Quem vende gerencia pagamentos" ON public.pagamentos_venda;
CREATE POLICY "Quem vende lanca pagamentos na venda que esta fechando"
  ON public.pagamentos_venda FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'sales.create')
    AND EXISTS (
      SELECT 1 FROM public.vendas v
      WHERE v.id = venda_id
        AND v.tenant_id = public.get_user_tenant_id(auth.uid())
        AND v.status = 'pago'
        AND v.vendedor_id = auth.uid()
        AND v.created_at > now() - interval '10 minutes'
    )
  );

-- 4d. A entrada de troca segue a mesma regra (roda com chave de dono, então
--     tem que perguntar sozinha). Mesmo corpo de 20260809230000 + as
--     conferências no começo.
CREATE OR REPLACE FUNCTION public.registrar_entrada_produto_troca(
  _venda_id uuid, _nome text, _grupo_produto_id uuid, _marca_id uuid,
  _modelo_id uuid, _cor_id uuid, _condicao_id uuid, _memoria_id uuid,
  _imei_serial text, _valor_entrada numeric, _observacoes text DEFAULT NULL,
  _preco_venda numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda        RECORD;
  v_produto_id   UUID;
  v_pagamento_id UUID;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'sales.create') THEN
    RAISE EXCEPTION 'Seu perfil de acesso não permite registrar venda.'
      USING ERRCODE = 'P0001';
  END IF;

  IF btrim(COALESCE(_nome, '')) = '' THEN
    RAISE EXCEPTION 'Informe o que está entrando na troca.' USING ERRCODE = 'P0001';
  END IF;

  IF _valor_entrada IS NULL OR _valor_entrada <= 0 THEN
    RAISE EXCEPTION 'O valor de entrada da troca precisa ser maior que zero.'
      USING ERRCODE = 'P0001';
  END IF;

  IF _preco_venda IS NOT NULL AND _preco_venda < 0 THEN
    RAISE EXCEPTION 'O preço de venda não pode ser negativo.' USING ERRCODE = 'P0001';
  END IF;

  SELECT tenant_id, status, vendedor_id, created_at INTO v_venda
    FROM public.vendas WHERE id = _venda_id;

  IF v_venda.tenant_id IS NULL
     OR v_venda.tenant_id IS DISTINCT FROM public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF v_venda.status <> 'pago'
     OR v_venda.vendedor_id IS DISTINCT FROM auth.uid()
     OR v_venda.created_at < now() - interval '10 minutes' THEN
    RAISE EXCEPTION
      'A entrada de troca só é registrada pelo próprio vendedor, na venda que ele está fechando agora.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.produtos (
    tenant_id, nome, grupo_produto_id, marca_id, modelo_id, cor_id,
    condicao_id, memoria_id, imei_serial, observacoes,
    custo, preco, estoque_atual, ativo
  ) VALUES (
    v_venda.tenant_id, btrim(_nome), _grupo_produto_id, _marca_id, _modelo_id, _cor_id,
    _condicao_id, _memoria_id, _imei_serial, _observacoes,
    _valor_entrada, COALESCE(_preco_venda, 0), 1, false
  ) RETURNING id INTO v_produto_id;

  INSERT INTO public.pagamentos_venda (
    venda_id, forma, forma_pagamento_id, parcelas, valor
  ) VALUES (
    _venda_id, 'vale_troca', NULL, 1, _valor_entrada
  ) RETURNING id INTO v_pagamento_id;

  INSERT INTO public.entradas_produto (
    tenant_id, venda_id, produto_id, pagamento_venda_id,
    valor_entrada, observacoes, usuario_id
  ) VALUES (
    v_venda.tenant_id, _venda_id, v_produto_id, v_pagamento_id,
    _valor_entrada, _observacoes, auth.uid()
  );

  RETURN v_produto_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RASTRO: NEM FORJADO, NEM APAGADO
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can add order history"        ON public.service_order_history;
DROP POLICY IF EXISTS "Quem ajusta estoque lanca movimento" ON public.movimentos_estoque;
DROP POLICY IF EXISTS "Quem edita OS atualiza itens"        ON public.service_order_items;

-- O "quem fez" é quem está logado — o navegador não opina.
CREATE OR REPLACE FUNCTION public.carimbar_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.usuario_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carimbar_usuario ON public.caixa_movimentos;
CREATE TRIGGER carimbar_usuario BEFORE INSERT ON public.caixa_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.carimbar_usuario();
DROP TRIGGER IF EXISTS carimbar_usuario ON public.devolucoes;
CREATE TRIGGER carimbar_usuario BEFORE INSERT ON public.devolucoes
  FOR EACH ROW EXECUTE FUNCTION public.carimbar_usuario();
DROP TRIGGER IF EXISTS carimbar_usuario ON public.os_pagamentos;
CREATE TRIGGER carimbar_usuario BEFORE INSERT ON public.os_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.carimbar_usuario();

-- OS com pagamento não se apaga (cancela); produto com movimento não se
-- apaga (desativa). As chaves eram "CASCADE": apagar levava o rastro junto.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS tabela
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
     WHERE con.contype = 'f'
       AND ((con.conrelid = 'public.os_pagamentos'::regclass      AND a.attname = 'os_id')
         OR (con.conrelid = 'public.movimentos_estoque'::regclass AND a.attname = 'produto_id'))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tabela, c.conname);
  END LOOP;

  ALTER TABLE public.os_pagamentos
    ADD CONSTRAINT os_pagamentos_os_id_fkey
    FOREIGN KEY (os_id) REFERENCES public.service_orders(id) ON DELETE RESTRICT;
  ALTER TABLE public.movimentos_estoque
    ADD CONSTRAINT movimentos_estoque_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;
END $$;

-- -----------------------------------------------------------------------------
-- 6. O QUE SÓ A TELA ESCONDIA
-- -----------------------------------------------------------------------------
ALTER POLICY "Ver metas de faturamento do tenant" ON public.metas_faturamento
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_permission(auth.uid(), 'dashboards.goals.view')
         OR public.has_permission(auth.uid(), 'settings.view'))
  );

-- Mesmo corpo de 20260818100000, com a pergunta de permissão no WHERE.
CREATE OR REPLACE VIEW public.vw_caixa_resumo_formas
WITH (security_barrier = true) AS
WITH pagamentos AS (
  SELECT pv.forma_pagamento_id, pv.valor, pv.created_at, v.tenant_id
    FROM public.pagamentos_venda pv
    JOIN public.vendas v ON v.id = pv.venda_id AND v.status = 'pago'
  UNION ALL
  SELECT op.forma_pagamento_id, op.valor, op.created_at, s.tenant_id
    FROM public.os_pagamentos op
    JOIN public.service_orders s ON s.id = op.os_id
)
SELECT cx.id AS sessao_id,
       fp.id AS forma_pagamento_id,
       fp.descricao AS forma_descricao,
       fp.entra_no_caixa,
       COALESCE(sum(p.valor), 0::numeric) AS total
  FROM public.caixa_sessoes cx
  JOIN public.formas_pagamento fp ON fp.tenant_id = cx.tenant_id AND fp.ativo
  LEFT JOIN pagamentos p
         ON p.forma_pagamento_id = fp.id
        AND p.tenant_id = cx.tenant_id
        AND p.created_at >= cx.aberto_em
        AND p.created_at <= COALESCE(cx.fechado_em, now())
 WHERE cx.tenant_id = public.get_user_tenant_id(auth.uid())
   AND (public.has_permission(auth.uid(), 'finance.view')
        OR public.has_permission(auth.uid(), 'finance.cashier.close'))
 GROUP BY cx.id, fp.id, fp.descricao, fp.entra_no_caixa, fp.ordem
 ORDER BY fp.ordem;

-- O log, lido pela view que esconde o custo (mesmo desenho das vw_* de
-- produtos: quem tem `inventory.cost.view` vê tudo; quem não tem, vê a linha
-- sem as chaves de custo). A tabela crua fecha para quem está logado — os
-- gatilhos gravam nela com chave de dono e não precisam de privilégio.
REVOKE ALL ON public.auditoria FROM authenticated, anon;

CREATE OR REPLACE VIEW public.vw_auditoria
WITH (security_barrier = true) AS
SELECT a.id,
       a.tenant_id,
       a.usuario_id,
       a.acao,
       a.tabela,
       a.registro_id,
       CASE WHEN public.has_permission(auth.uid(), 'inventory.cost.view')
            THEN a.dados_antes
            ELSE a.dados_antes - ARRAY['custo', 'margem_percent', 'custo_unitario', 'custo_estimado']
       END AS dados_antes,
       CASE WHEN public.has_permission(auth.uid(), 'inventory.cost.view')
            THEN a.dados_depois
            ELSE a.dados_depois - ARRAY['custo', 'margem_percent', 'custo_unitario', 'custo_estimado']
       END AS dados_depois,
       a.created_at
  FROM public.auditoria a
 WHERE a.tenant_id = public.get_user_tenant_id(auth.uid())
   AND public.has_permission(auth.uid(), 'audit.view');

GRANT SELECT ON public.vw_auditoria TO authenticated;

COMMENT ON VIEW public.vw_auditoria IS
  'Leitura do log de auditoria (Configurações > Logs). Filtra a loja e exige audit.view; apaga as chaves de custo (custo, margem_percent, custo_unitario, custo_estimado) para quem não tem inventory.cost.view. SECURITY DEFINER de propósito, como as demais vw_*.';

-- -----------------------------------------------------------------------------
-- 7. FUNÇÃO NOVA NASCE ABERTA — FECHA POR LISTA, NÃO PELO PADRÃO
-- -----------------------------------------------------------------------------
-- Descoberto em 15/09: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` (que a
-- migration de 14/09 usou) NÃO cobre função criada por outra sessão de
-- migration — o `travas_da_os`, criado logo antes, nasceu com EXECUTE para
-- "todo mundo" (PUBLIC). Toda função nova pega isso por padrão. Então fecha-se
-- na marra, aqui, o que esta leva e a anterior criaram — idempotente.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
DO $$
DECLARE f RECORD;
BEGIN
  -- Toda função de gatilho perde EXECUTE de quem está logado (chamá-la direto
  -- nunca fez sentido; o gatilho dispara sozinho). Pega travas_da_os,
  -- proteger_venda_gravada, carimbar_usuario e as demais.
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND pg_get_function_result(p.oid) IN ('trigger', 'event_trigger')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.assinatura);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- CONFERE QUE FECHOU MESMO
-- -----------------------------------------------------------------------------
DO $verifica$
DECLARE
  v_n        INT;
  v_txt      TEXT;
  v_inativo  UUID;
  v_vendedor UUID;
BEGIN
  -- 1. as policies certas existem / não existem
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can update their own profile')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='vendas' AND policyname='Users can view sales in their tenant')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='itens_venda' AND policyname='Quem vende gerencia itens da venda')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pagamentos_venda' AND policyname='Quem vende gerencia pagamentos')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_order_history' AND policyname='Staff can add order history')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='movimentos_estoque' AND policyname='Quem ajusta estoque lanca movimento')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_order_items' AND policyname='Quem edita OS atualiza itens')
  THEN
    RAISE EXCEPTION 'uma policy que deveria ter saído ainda está no banco';
  END IF;

  -- policy de UPDATE/DELETE em itens e pagamentos de venda: nenhuma
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('itens_venda','pagamentos_venda') AND cmd IN ('UPDATE','DELETE','ALL');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'itens_venda/pagamentos_venda ainda aceitam UPDATE ou DELETE pela API';
  END IF;

  -- 2. user_roles sem UPDATE para logado; gatilho cobre UPDATE
  IF has_table_privilege('authenticated', 'public.user_roles', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated ainda tem UPDATE em user_roles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_protege_admin_ao_trocar_papel'
                    AND tgrelid='public.user_roles'::regclass AND (tgtype & 16) = 16) THEN
    RAISE EXCEPTION 'a trava do último administrador não cobre UPDATE';
  END IF;

  -- 3. chaves estrangeiras seguram o rastro
  SELECT string_agg(rc.constraint_name || '=' || rc.delete_rule, ', ') INTO v_txt
    FROM information_schema.referential_constraints rc
   WHERE rc.constraint_name IN ('os_pagamentos_os_id_fkey', 'movimentos_estoque_produto_id_fkey')
     AND rc.delete_rule <> 'RESTRICT';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'chave estrangeira ainda apaga em cascata: %', v_txt;
  END IF;

  -- 4. auditoria fechada, vw_auditoria aberta
  IF has_table_privilege('authenticated', 'public.auditoria', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated ainda lê a tabela crua de auditoria';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.vw_auditoria', 'SELECT') THEN
    RAISE EXCEPTION 'vw_auditoria sem SELECT para authenticated — a tela de Logs quebraria';
  END IF;

  -- 5. os gatilhos novos estão no lugar
  SELECT count(*) INTO v_n FROM pg_trigger WHERE tgname = 'carimbar_usuario'
     AND tgrelid IN ('public.caixa_movimentos'::regclass, 'public.devolucoes'::regclass, 'public.os_pagamentos'::regclass);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'carimbar_usuario deveria estar em 3 tabelas, está em %', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='proteger_venda_gravada' AND tgrelid='public.vendas'::regclass) THEN
    RAISE EXCEPTION 'gatilho proteger_venda_gravada não foi criado';
  END IF;

  -- 6. conta desativada não é de loja nenhuma; conta ativa com papel continua sendo
  SELECT id INTO v_inativo FROM public.profiles WHERE ativo = false LIMIT 1;
  IF v_inativo IS NOT NULL AND public.get_user_tenant_id(v_inativo) IS NOT NULL THEN
    RAISE EXCEPTION 'conta desativada ainda pertence a uma loja';
  END IF;
  SELECT ur.user_id INTO v_vendedor
    FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
   WHERE p.ativo AND p.arquivado_em IS NULL LIMIT 1;
  IF v_vendedor IS NOT NULL AND public.get_user_tenant_id(v_vendedor) IS NULL THEN
    RAISE EXCEPTION 'conta ativa com papel ficou sem loja — o sistema inteiro quebraria';
  END IF;

  -- 7. a regra de leitura de vendas passou a exigir permissão (não é mais só
  --    "é da mesma loja?"). Confere na definição da policy — sem trocar de
  --    papel dentro da migration, que vazaria para o registro da própria
  --    migration (foi o que derrubou esta migration na primeira tentativa).
  SELECT qual INTO v_txt FROM pg_policies
   WHERE schemaname='public' AND tablename='vendas' AND policyname='Ver vendas da loja';
  IF v_txt IS NULL OR v_txt NOT LIKE '%has_permission%' THEN
    RAISE EXCEPTION 'a regra de leitura de vendas não exige permissão';
  END IF;
  SELECT qual INTO v_txt FROM pg_policies
   WHERE schemaname='public' AND tablename='metas_faturamento' AND policyname='Ver metas de faturamento do tenant';
  IF v_txt IS NULL OR v_txt NOT LIKE '%has_permission%' THEN
    RAISE EXCEPTION 'a regra de leitura de metas não exige permissão';
  END IF;

  -- 8. nenhuma função aberta para "todo mundo" (o travas_da_os nascera aberto)
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função ainda aberta para PUBLIC: %', v_txt;
  END IF;
  IF has_function_privilege('authenticated', 'public.travas_da_os()', 'EXECUTE') THEN
    RAISE EXCEPTION 'travas_da_os continua chamável por quem está logado';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
