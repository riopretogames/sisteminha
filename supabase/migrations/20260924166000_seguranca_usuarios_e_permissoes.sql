-- =============================================================================
-- Sisteminha (RPG System.IO) — Segurança: usuários, permissões e rastro
-- =============================================================================
--
-- Revisão completa pedida pelo Felipe em 24/09/2026 ("faz uma revisão completa
-- no sistema e testa tudo"). Esta é a parte da área de SEGURANÇA E ACESSO.
-- Cada item abaixo foi conferido no banco de produção, só com leitura, antes
-- de virar correção.
--
-- 1. (achado 73, ALTA) "TROCAR SENHA" E "ENTRAR COMO" VIRAVAM ADMINISTRADOR.
--    A função de servidor `admin-usuarios` conferia se o alvo era
--    administrador lendo `user_roles` com o crachá de quem pediu. Só que as
--    regras de leitura de `user_roles` só mostram o papel dos OUTROS a quem
--    tem "Ver usuários" ou "Gerenciar perfis". Quem recebesse só "Criar,
--    editar e desativar usuários" (uma caixinha na ficha) via o Felipe "sem
--    perfil", a trava concluía "não é administrador" e a chave mestra trocava
--    a senha do dono — ou gerava o acesso de "Entrar como" nele.
--    Correção: a pergunta "quem pede tem alçada sobre a conta desta pessoa?"
--    passa a morar no banco, numa função só (`pode_mexer_na_conta_de`), que a
--    função de servidor chama com o crachá de quem pediu e que responde NÃO
--    sempre que o alvo tiver QUALQUER acesso que quem pede não tem. Entrar
--    como alguém, ou trocar a senha dele, nunca mais dá a ninguém um poder que
--    ele já não tivesse.
--
-- 2. (achado 74) A TELA DE USUÁRIOS PEDIA UM CRACHÁ E O BANCO EXIGIA OUTRO.
--    O menu abre Cadastros > Usuários com "Criar, editar e desativar
--    usuários" (users.manage); o banco só mostrava os perfis, as exceções e o
--    histórico a quem tem "Ver usuários" (users.view) ou "Gerenciar perfis".
--    Quem tivesse só a primeira abria a tela e via todo mundo "Sem perfil".
--    Agora quem gerencia usuários também VÊ o que precisa para gerenciar.
--
-- 3. (achado 78) O CADASTRO DO FUNCIONÁRIO PODIA SER APAGADO DIRETO PELA API.
--    A regra de `profiles` para quem gerencia usuários valia para TUDO
--    (inclusive apagar). Apagar pulava as duas regras do Felipe que moram na
--    função de servidor: "quem tem rastro é arquivado, nunca apagado" e "tirar
--    administrador exige Gerenciar perfis". A OS perdia o técnico, a meta do
--    vendedor sumia. A tela nunca apaga nem cria cadastro (quem cria é o
--    gatilho `handle_new_user`; quem apaga é a função de servidor, com as
--    regras dela), então a regra vira só de ALTERAR.
--
-- 4. (achado 79) MUDAR O PERFIL INTEIRO NÃO DEIXAVA RASTRO.
--    Marcar "Ver custo e margem" para o perfil Vendedor inteiro, ou
--    desativar, arquivar ou renomear um funcionário, não aparecia na tela de
--    Logs. Ganham gatilho de auditoria `role_permissions` (a loja vem de quem
--    fez, porque a tabela não tem loja — o mesmo cuidado que `user_roles`
--    precisou em 18/08) e `profiles` (só nome, ativo e arquivado; o resto é
--    ruído).
--
-- 5. (achado 83) ARQUIVO DE ANEXO DE TAREFA: O COFRE ERA MAIS LARGO QUE A FICHA.
--    A ficha do anexo exige "quem enviou ou quem edita tarefas" para apagar,
--    e "quem edita tarefas ou é responsável pela tarefa" para anexar; o cofre
--    de arquivos (Storage) aceitava qualquer um que só VÊ tarefas. As duas
--    regras do cofre passam a ser as mesmas da ficha. Para apagar, "quem
--    enviou" é o dono do arquivo no cofre (o Storage carimba sozinho quem
--    subiu) — não dá para exigir a ficha, porque a tela apaga a ficha ANTES
--    do arquivo (useAnexos.ts, de propósito) e a ficha já não existe mais.
--
-- 6. (achado 84) CONTA NOVA CAÍA SEMPRE NA PRIMEIRA LOJA CADASTRADA.
--    `handle_new_user` escolhia "a loja mais antiga" e ignorava o carimbo de
--    quem criou. Com uma loja só não acontece nada; no dia em que o sistema
--    tiver uma segunda loja, o funcionário criado por ela nasceria dentro da
--    Rio Preto Games. Agora a loja vem de quem criou; a "mais antiga" fica só
--    para o primeiro acesso do sistema (bootstrap).
--
-- 7. (achado 85) A REGRA DE PAGAMENTO DE OS CITAVA UMA PERMISSÃO QUE NÃO EXISTE.
--    `orders.deliver` não está no catálogo e ninguém pode recebê-la. O pedaço
--    sai; a regra continua exigindo "Editar OS", como sempre valeu na prática.
--    Feito por substituição conferida (e não reescrevendo a regra inteira)
--    para não desfazer mudança que a área de OS tenha feito na mesma leva.
--
-- Não é migration destrutiva: não apaga linha, coluna nem tabela. Troca
-- regras de acesso, cria uma função, dois gatilhos, e reescreve duas funções.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. QUEM PEDE TEM ALÇADA SOBRE A CONTA DESTA PESSOA?
-- -----------------------------------------------------------------------------
-- Usada pela função de servidor `admin-usuarios` antes de trocar senha,
-- excluir/arquivar ou gerar o acesso de "Entrar como". Roda com o crachá de
-- quem pediu (auth.uid()), mas com chave de dono para enxergar o alvo inteiro
-- — que é exatamente o que faltava: a checagem antiga lia com o crachá de quem
-- pedia e, sem enxergar, concluía "pode".
--
-- A regra: SIM se
--   • quem pede gerencia usuários, o alvo é da mesma loja, e
--   • o alvo é a própria pessoa, OU quem pede define perfis (roles.manage —
--     quem tem isso já pode dar a si mesmo qualquer permissão), OU o alvo não
--     é administrador e não tem NENHUMA permissão que quem pede não tenha.
--
-- O poder do alvo é calculado IGNORANDO se a conta está ativa, de propósito:
-- quem gerencia usuários também ativa e desativa. Se a conta desativada
-- contasse como "sem poder", bastaria desativar um administrador, trocar a
-- senha dele, reativar e entrar. (A regra de has_permission — exceção da
-- pessoa primeiro, perfil depois — é a mesma; só o "ativo" fica de fora.)
CREATE OR REPLACE FUNCTION public.pode_mexer_na_conta_de(_alvo uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND _alvo IS NOT NULL
    AND public.has_permission(auth.uid(), 'users.manage')
    -- A loja do alvo é lida direto (não por get_user_tenant_id): o alvo pode
    -- ser justamente a conta desativada que vai ser arquivada.
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = _alvo
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
    AND (
      _alvo = auth.uid()
      OR public.has_permission(auth.uid(), 'roles.manage')
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = _alvo AND ur.role = 'administrador'
        )
        AND NOT EXISTS (
          SELECT 1
            FROM public.permissions k
           WHERE COALESCE(
                   (SELECT up.concedida
                      FROM public.user_permissions up
                     WHERE up.user_id = _alvo AND up.permission_key = k.key),
                   EXISTS (
                     SELECT 1
                       FROM public.user_roles ur
                       JOIN public.role_permissions rp ON rp.role = ur.role
                      WHERE ur.user_id = _alvo AND rp.permission_key = k.key
                   )
                 )
             AND NOT public.has_permission(auth.uid(), k.key)
        )
      )
    )
$$;

COMMENT ON FUNCTION public.pode_mexer_na_conta_de(uuid) IS
  'Quem está logado pode trocar a senha, arquivar/excluir ou "Entrar como" esta pessoa? Só se gerencia usuários, é da mesma loja e o alvo não tem nenhum acesso a mais (administrador exige roles.manage). Chamada pela função admin-usuarios com o crachá de quem pediu. Achado 73 da revisão de 24/09.';

REVOKE EXECUTE ON FUNCTION public.pode_mexer_na_conta_de(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_mexer_na_conta_de(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. QUEM GERENCIA USUÁRIOS VÊ O QUE PRECISA PARA GERENCIAR
-- -----------------------------------------------------------------------------
-- 2a. O perfil de cada pessoa da loja (lista de Usuários).
ALTER POLICY "Quem gerencia usuarios ve todos os papeis" ON public.user_roles
  USING (
    (public.has_permission(auth.uid(), 'users.view')
      OR public.has_permission(auth.uid(), 'users.manage'))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = user_roles.user_id
         AND p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  );

-- 2b. As exceções de cada pessoa (a ficha mostra quais permissões ela tem a
--     mais ou a menos que o perfil). Só LER: criar ou tirar exceção continua
--     exigindo "Gerenciar perfis" (policy "Quem gerencia perfis administra
--     excecoes", intocada).
DROP POLICY IF EXISTS "Quem ve usuarios ve as excecoes da loja" ON public.user_permissions;
CREATE POLICY "Quem ve usuarios ve as excecoes da loja"
  ON public.user_permissions FOR SELECT TO authenticated
  USING (
    (public.has_permission(auth.uid(), 'users.view')
      OR public.has_permission(auth.uid(), 'users.manage'))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = user_permissions.user_id
         AND p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  );

-- 2c. O rastro da pessoa (a ficha conta antes de oferecer "Excluir", e a
--     função de servidor confere antes de apagar ou arquivar). Mesmo corpo de
--     antes; só a porta aceita também quem gerencia usuários.
CREATE OR REPLACE FUNCTION public.historico_do_usuario(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vendas INTEGER; v_os INTEGER; v_mov INTEGER; v_caixa INTEGER;
  v_entradas INTEGER; v_aud INTEGER; v_admins INTEGER; v_e_admin BOOLEAN;
BEGIN
  -- Roda com chave de dono, então precisa perguntar sozinha: o alvo é da
  -- loja de quem pergunta, e quem pergunta pode ver (ou gerenciar) usuários?
  -- Sem isto, qualquer logado contava o movimento de qualquer usuário de
  -- qualquer loja. A loja do ALVO é lida direto de profiles (não por
  -- get_user_tenant_id): o alvo típico desta pergunta é justamente a conta
  -- desativada que vai ser excluída, e para conta desativada
  -- get_user_tenant_id responde "nenhuma".
  --
  -- users.manage entrou em 24/09 (achado 74): a tela de Usuários abre para
  -- quem gerencia usuários, e só users.view passava aqui — quem tinha só a
  -- primeira via "Não consegui conferir o histórico dele" ao excluir.
  IF auth.uid() IS NULL
     OR NOT (public.has_permission(auth.uid(), 'users.view')
             OR public.has_permission(auth.uid(), 'users.manage'))
     OR (SELECT p.tenant_id FROM public.profiles p WHERE p.id = _user_id)
        IS DISTINCT FROM public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Esse usuário não é da sua loja.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_vendas   FROM public.vendas              WHERE vendedor_id = _user_id;
  SELECT count(*) INTO v_os       FROM public.service_orders      WHERE tecnico_id = _user_id OR vendedor_id = _user_id;
  SELECT count(*) INTO v_mov      FROM public.movimentos_estoque  WHERE usuario_id = _user_id;
  SELECT count(*) INTO v_caixa    FROM public.caixa_sessoes       WHERE aberto_por = _user_id OR fechado_por = _user_id;
  SELECT count(*) INTO v_entradas FROM public.entradas_mercadoria WHERE usuario_id = _user_id;
  SELECT count(*) INTO v_aud      FROM public.auditoria           WHERE usuario_id = _user_id;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'administrador') INTO v_e_admin;
  SELECT count(*) INTO v_admins
    FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
   WHERE ur.role = 'administrador' AND p.ativo = true AND ur.user_id <> _user_id;

  RETURN jsonb_build_object(
    'vendas', v_vendas, 'ordens_servico', v_os, 'movimentos_estoque', v_mov,
    'caixa', v_caixa, 'entradas_mercadoria', v_entradas, 'auditoria', v_aud,
    'total', v_vendas + v_os + v_mov + v_caixa + v_entradas + v_aud,
    'e_ultimo_admin', v_e_admin AND v_admins = 0
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.historico_do_usuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.historico_do_usuario(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. O CADASTRO DO FUNCIONÁRIO SÓ SE ALTERA PELA API — NÃO SE CRIA NEM SE APAGA
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Quem gerencia usuarios administra perfis" ON public.profiles;
DROP POLICY IF EXISTS "Quem gerencia usuarios altera perfis" ON public.profiles;
CREATE POLICY "Quem gerencia usuarios altera perfis"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'users.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'users.manage')
  );

-- Sem policy o RLS já recusa; tirar o privilégio fecha também o TRUNCATE, que
-- o RLS não vigia. A criação é do gatilho handle_new_user (chave de dono) e a
-- exclusão, da função de servidor (chave mestra) — nenhuma das duas passa por
-- `authenticated`.
REVOKE INSERT, DELETE, TRUNCATE ON public.profiles FROM authenticated, anon;


-- -----------------------------------------------------------------------------
-- 4. RASTRO DE PERFIS E PERMISSÕES E DO CADASTRO DO FUNCIONÁRIO
-- -----------------------------------------------------------------------------
-- 4a. role_permissions (Configurações > Perfis e Permissões).
--     A tabela não tem loja: o mapa perfil → permissão é um só. A loja do
--     registro é a de QUEM FEZ — sem isso a linha nasceria com loja vazia e a
--     tela de Logs (vw_auditoria filtra por loja) nunca a mostraria.
CREATE OR REPLACE FUNCTION public.registrar_auditoria_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_antes  JSONB;
  v_depois JSONB;
BEGIN
  -- Mesmo cuidado do registrar_auditoria: NEW num DELETE (ou OLD num INSERT)
  -- derruba a operação inteira, então só se lê guardado por TG_OP.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_antes := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_depois := to_jsonb(NEW);
  END IF;

  INSERT INTO public.auditoria (tenant_id, usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  VALUES (public.get_user_tenant_id(auth.uid()), auth.uid(), TG_OP, TG_TABLE_NAME, NULL, v_antes, v_depois);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS audit_role_permissions ON public.role_permissions;
CREATE TRIGGER audit_role_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_role_permissions();

-- 4b. profiles: só o que interessa a quem audita — nome, ativo e arquivado.
--     Telefone, foto e o carimbo de "atualizado em" não viram linha de log.
--     A criação também fica registrada, e em nome de QUEM CRIOU: a conta nasce
--     pela chave mestra (sem ninguém logado no banco), mas o carimbo
--     `criado_por` da conta de acesso diz quem foi.
CREATE OR REPLACE FUNCTION public.registrar_auditoria_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_antes   JSONB;
  v_depois  JSONB;
  v_quem    UUID := auth.uid();
  v_tenant  UUID;
  v_id      UUID;
  v_criador TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.nome IS NOT DISTINCT FROM NEW.nome
     AND OLD.ativo IS NOT DISTINCT FROM NEW.ativo
     AND OLD.arquivado_em IS NOT DISTINCT FROM NEW.arquivado_em THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_antes := jsonb_build_object('nome', OLD.nome, 'ativo', OLD.ativo, 'arquivado_em', OLD.arquivado_em);
    v_tenant := OLD.tenant_id;
    v_id := OLD.id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_depois := jsonb_build_object('nome', NEW.nome, 'ativo', NEW.ativo, 'arquivado_em', NEW.arquivado_em);
    v_tenant := NEW.tenant_id;
    v_id := NEW.id;
  END IF;

  IF v_quem IS NULL AND TG_OP = 'INSERT' THEN
    SELECT u.raw_app_meta_data ->> 'criado_por' INTO v_criador FROM auth.users u WHERE u.id = NEW.id;
    IF v_criador ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_quem := v_criador::uuid;
    END IF;
  END IF;

  INSERT INTO public.auditoria (tenant_id, usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  VALUES (v_tenant, v_quem, TG_OP, TG_TABLE_NAME, v_id, v_antes, v_depois);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_profiles();


-- -----------------------------------------------------------------------------
-- 5. COFRE DE ANEXOS DE TAREFA COM A MESMA REGRA DA FICHA DO ANEXO
-- -----------------------------------------------------------------------------
-- O caminho é <loja>/<tarefa>/<id>-<nome> (useAnexos.ts). A segunda pasta é a
-- tarefa; o CASE evita que um caminho torto derrube o envio com erro de
-- conversão em vez de uma recusa limpa.
DROP POLICY IF EXISTS "Enviar anexo de tarefa da propria loja" ON storage.objects;
CREATE POLICY "Enviar anexo de tarefa da propria loja"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tarefas-anexos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND public.has_permission(auth.uid(), 'tasks.view')
    AND (
      public.has_permission(auth.uid(), 'tasks.edit')
      OR CASE
           WHEN (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN public.eh_responsavel_da_tarefa(((storage.foldername(name))[2])::uuid, auth.uid())
           ELSE false
         END
    )
  );

-- Apagar: quem subiu o arquivo (o Storage carimba o dono sozinho) ou quem
-- edita tarefas — a mesma regra de apagar a ficha do anexo.
DROP POLICY IF EXISTS "Remover anexo de tarefa da propria loja" ON storage.objects;
CREATE POLICY "Remover anexo de tarefa da propria loja"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tarefas-anexos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND public.has_permission(auth.uid(), 'tasks.view')
    AND (
      COALESCE(owner_id, owner::text) = auth.uid()::text
      OR public.has_permission(auth.uid(), 'tasks.edit')
    )
  );


-- -----------------------------------------------------------------------------
-- 6. CONTA NOVA NASCE NA LOJA DE QUEM CRIOU
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  -- A loja: a de QUEM CRIOU (achado 84 da revisão de 24/09). Antes era sempre
  -- "a loja mais antiga" — com uma loja só dá no mesmo; com duas, o
  -- funcionário criado pela segunda nasceria dentro da primeira. Quem criou
  -- sem loja é recusa, não palpite: melhor não criar do que criar no lugar
  -- errado. A loja mais antiga fica só para o primeiro acesso (bootstrap).
  IF v_criado_por IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant_id
      FROM public.profiles p
     WHERE p.id = v_criado_por::uuid;
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION
        'Não foi possível descobrir a loja de quem está criando este acesso.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at LIMIT 1;
  END IF;

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
$function$;


-- -----------------------------------------------------------------------------
-- 7. PAGAMENTO DE OS: SAI A PERMISSÃO QUE NÃO EXISTE
-- -----------------------------------------------------------------------------
-- Substituição conferida no texto atual da regra, em vez de reescrevê-la: se
-- a área de OS mudou esta regra na mesma leva, a mudança dela fica; se o
-- pedaço já saiu, nada acontece.
DO $orders_deliver$
DECLARE
  v_regra TEXT;
  v_nova  TEXT;
BEGIN
  SELECT with_check INTO v_regra
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'os_pagamentos'
     AND policyname = 'Quem entrega OS registra pagamento';

  IF v_regra IS NOT NULL AND position('orders.deliver' IN v_regra) > 0 THEN
    v_nova := replace(v_regra, 'has_permission(auth.uid(), ''orders.deliver''::text) OR ', '');
    IF position('orders.deliver' IN v_nova) > 0 THEN
      RAISE EXCEPTION 'a regra de pagamento de OS mudou de forma e orders.deliver não saiu: %', v_regra;
    END IF;
    EXECUTE format(
      'ALTER POLICY %I ON public.os_pagamentos WITH CHECK (%s)',
      'Quem entrega OS registra pagamento',
      v_nova
    );
  END IF;
END
$orders_deliver$;


-- -----------------------------------------------------------------------------
-- 8. FUNÇÃO DE GATILHO NASCE ABERTA — FECHA NA MARRA
-- -----------------------------------------------------------------------------
-- O ALTER DEFAULT PRIVILEGES não cobre função criada pelo CLI de migration
-- (achado de 15/09, CLAUDE.md). Mesmo laço da 20260915110000.
REVOKE EXECUTE ON FUNCTION public.registrar_auditoria_role_permissions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_auditoria_profiles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f RECORD;
BEGIN
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
  v_n   INT;
  v_txt TEXT;
BEGIN
  -- 1. a função de alçada existe, é chamável por quem está logado e por mais ninguém
  IF NOT has_function_privilege('authenticated', 'public.pode_mexer_na_conta_de(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pode_mexer_na_conta_de sem EXECUTE para authenticated — trocar senha e Entrar como parariam';
  END IF;
  IF has_function_privilege('anon', 'public.pode_mexer_na_conta_de(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pode_mexer_na_conta_de chamável sem login';
  END IF;
  -- sem ninguém logado, a resposta é NÃO (nunca "pode")
  IF public.pode_mexer_na_conta_de((SELECT id FROM public.profiles LIMIT 1)) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'pode_mexer_na_conta_de respondeu diferente de NÃO sem ninguém logado';
  END IF;

  -- 2. quem gerencia usuários enxerga papéis, exceções e histórico
  SELECT qual INTO v_txt FROM pg_policies
   WHERE schemaname='public' AND tablename='user_roles' AND policyname='Quem gerencia usuarios ve todos os papeis';
  IF v_txt IS NULL OR v_txt NOT LIKE '%users.manage%' OR v_txt NOT LIKE '%users.view%' THEN
    RAISE EXCEPTION 'a leitura de papéis não aceita users.manage (ou perdeu users.view)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_permissions'
                    AND policyname='Quem ve usuarios ve as excecoes da loja' AND cmd='SELECT') THEN
    RAISE EXCEPTION 'faltou a leitura de exceções para quem vê/gerencia usuários';
  END IF;
  IF pg_get_functiondef('public.historico_do_usuario(uuid)'::regprocedure) NOT LIKE '%users.manage%' THEN
    RAISE EXCEPTION 'historico_do_usuario não aceita users.manage';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.historico_do_usuario(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'historico_do_usuario sem EXECUTE para authenticated';
  END IF;

  -- 3. cadastro do funcionário: só UPDATE pela API
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename='profiles' AND cmd IN ('ALL','INSERT','DELETE');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'profiles ainda aceita criar ou apagar pela API (% regra(s))', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
                    AND policyname='Quem gerencia usuarios altera perfis' AND cmd='UPDATE') THEN
    RAISE EXCEPTION 'quem gerencia usuários ficou sem poder alterar cadastro (ativar, arquivar, renomear)';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'DELETE')
     OR has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated ainda tem INSERT/DELETE em profiles';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated perdeu SELECT/UPDATE em profiles — a tela de Usuários quebraria';
  END IF;

  -- 4. rastro
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='audit_role_permissions' AND tgrelid='public.role_permissions'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='audit_profiles' AND tgrelid='public.profiles'::regclass) THEN
    RAISE EXCEPTION 'gatilho de auditoria de role_permissions/profiles não foi criado';
  END IF;
  IF has_function_privilege('authenticated', 'public.registrar_auditoria_role_permissions()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.registrar_auditoria_profiles()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'função de gatilho continua chamável por quem está logado';
  END IF;

  -- 5. cofre de anexos com a regra da ficha
  SELECT with_check INTO v_txt FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='Enviar anexo de tarefa da propria loja';
  IF v_txt IS NULL OR v_txt NOT LIKE '%tasks.edit%' OR v_txt NOT LIKE '%eh_responsavel_da_tarefa%' THEN
    RAISE EXCEPTION 'o envio de anexo ao cofre não exige editar tarefas ou ser responsável';
  END IF;
  SELECT qual INTO v_txt FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='Remover anexo de tarefa da propria loja';
  IF v_txt IS NULL OR v_txt NOT LIKE '%tasks.edit%' OR v_txt NOT LIKE '%owner%' THEN
    RAISE EXCEPTION 'apagar anexo do cofre não exige ser quem enviou ou editar tarefas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                    AND policyname='Ver anexos de tarefas da propria loja') THEN
    RAISE EXCEPTION 'a leitura dos anexos de tarefa sumiu — ninguém abriria os arquivos';
  END IF;

  -- 6. conta nova na loja de quem criou
  IF pg_get_functiondef('public.handle_new_user()'::regprocedure) NOT LIKE '%v_criado_por::uuid%' THEN
    RAISE EXCEPTION 'handle_new_user ainda não tira a loja de quem criou';
  END IF;

  -- 7. nenhuma regra cita orders.deliver
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%orders.deliver%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ainda há % regra(s) citando orders.deliver', v_n;
  END IF;

  -- 8. portas fechadas: nenhuma policy para quem não fez login, nenhuma função aberta a PUBLIC
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n > 0 THEN
    RAISE EXCEPTION '% policy(ies) ainda valem para quem não fez login', v_n;
  END IF;
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função ainda aberta para PUBLIC: %', v_txt;
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
