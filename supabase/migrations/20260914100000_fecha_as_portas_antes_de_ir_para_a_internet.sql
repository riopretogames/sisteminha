-- =============================================================================
-- FECHA AS PORTAS ANTES DE IR PARA A INTERNET
-- =============================================================================
--
-- Decisão do Felipe em 14/09: o sisteminha sai do localhost e vai para
-- www.riopretogames.com.br/sisteminha esta semana. A tela de login fica exposta
-- ao mundo. Esta migration é a auditoria de segurança dessa véspera, virada em
-- correção — o que ela fecha foi achado no BANCO DE VERDADE (parecer de
-- segurança do próprio Supabase + consultas ao catálogo), não em anotação.
--
-- Quatro coisas, da maior para a menor:
--
-- 1. QUEM NÃO FEZ LOGIN TINHA PODER SOBRE TODAS AS TABELAS.
--    O papel `anon` (a chave pública, que vai no navegador de qualquer pessoa)
--    tinha SELECT/INSERT/UPDATE/DELETE/TRUNCATE em TODA tabela do sistema —
--    é o padrão de fábrica do Supabase. O RLS segurava (toda policy exige
--    usuário logado), então na prática ninguém lia nada. Mas segurança que
--    depende de UMA camada estar perfeita para sempre não é segurança: bastava
--    uma policy nova escrita com `TO public` — e já havia DUAS assim — para o
--    dado ficar a um passo de vazar. Nada no sistema lê o banco antes do login
--    (a tela de login não consulta nada), então o `anon` não precisa de nada.
--    Agora ele não tem nada.
--
-- 2. FUNÇÕES "COM CHAVE DE DONO" CHAMÁVEIS POR QUALQUER LOGADO.
--    54 funções SECURITY DEFINER aceitavam chamada de qualquer usuário logado,
--    e 48 delas até de quem NÃO fez login. A maioria é engrenagem de gatilho
--    (não faz nada útil chamada direto), mas duas eram buraco de verdade:
--      • `garantir_caixa_aberto(_tenant, _usuario)` abre uma sessão de caixa na
--        loja que receber como parâmetro — QUALQUER loja, sem conferir nada.
--        Um vendedor conseguiria abrir caixa na loja do vizinho pela API.
--      • `proximo_numero_venda/os/entrada(_tenant)` avançam a numeração de
--        QUALQUER loja. Quem não fez login conseguia furar a sequência de OS
--        da Rio Preto Games — sem entrar no sistema.
--    A regra da casa sempre foi "SECURITY DEFINER ou confere o crachá ou tem
--    EXECUTE revogado", mas ela dependia de cada migration lembrar de revogar.
--    Agora o padrão vira o contrário: função nova NASCE sem EXECUTE para
--    ninguém, e quem precisa chamar da tela ganha o GRANT de propósito.
--
-- 3. `historico_do_usuario(_user_id)` contava vendas e OS de QUALQUER usuário,
--    de qualquer loja. Só contagens — mas é a loja do vizinho.
--
-- 4. Três funções sem `search_path` fixo (parecer do Supabase): uma delas,
--    `somente_digitos`, sustenta o índice de cliente único. Fixar custa uma
--    linha e fecha uma classe inteira de golpe.
--
-- O que NÃO mudou, e foi conferido: as 6 views de custo protegido (vw_*) que
-- o parecer marca como "SECURITY DEFINER" estão assim DE PROPÓSITO (Opção B,
-- 07/08) — todas filtram a loja com get_user_tenant_id e escondem o custo com
-- has_permission; a leitura pública da logo (bucket `logos`) é só leitura e é
-- o desenho; a função de borda publicada é a mesma do repositório.

-- -----------------------------------------------------------------------------
-- 0. A TRAVA DE CUSTO DEIXA DE RE-ABRIR O ANON
-- -----------------------------------------------------------------------------
-- Ela reconcedia SELECT coluna a coluna "TO authenticated, anon" a cada rodada.
-- Sem esta correção, a próxima chamada dela desfaria o item 1 nas 4 tabelas
-- de custo, em silêncio. Mesmo corpo de 20260818130000, só sem o anon.

CREATE OR REPLACE FUNCTION public.aplicar_trava_de_custo()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alvo     RECORD;
  cols     TEXT;
  faltando TEXT;
  relato   TEXT := '';
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('produtos',            ARRAY['custo', 'margem_percent']),
      ('servicos',            ARRAY['custo_estimado']),
      ('service_order_items', ARRAY['custo_unitario']),
      ('movimentos_estoque',  ARRAY['custo_unitario', 'valor_total'])
    ) AS t(tabela, protegidas)
  LOOP
    SELECT string_agg(p.nome, ', ') INTO faltando
      FROM unnest(alvo.protegidas) AS p(nome)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = alvo.tabela AND c.column_name = p.nome);
    IF faltando IS NOT NULL THEN
      RAISE EXCEPTION 'Coluna protegida inexistente em public.%: %. Confira os nomes antes de aplicar.',
        alvo.tabela, faltando;
    END IF;

    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = alvo.tabela
       AND NOT (c.column_name = ANY (alvo.protegidas));

    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated, anon', alvo.tabela);
    -- Só quem fez login. O anon não lê tabela nenhuma deste sistema (14/09).
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, alvo.tabela);

    relato := relato || format('%s: %s colunas liberadas, protegidas [%s]; ',
      alvo.tabela, array_length(string_to_array(cols, ', '), 1), array_to_string(alvo.protegidas, ', '));
  END LOOP;
  RETURN relato;
END;
$$;

SELECT public.aplicar_trava_de_custo();

-- -----------------------------------------------------------------------------
-- 1. O ANON NÃO TEM NADA EM PUBLIC — HOJE E NO FUTURO
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- O terceiro nome do mesmo sujeito: `PUBLIC` é "todo mundo" no Postgres —
-- inclui o anon e o authenticated. Toda função nasce com EXECUTE para PUBLIC
-- (padrão do banco), então revogar só do anon não fecha nada: em 15/09, 51 das
-- 63 funções continuavam abertas por este caminho. Não há extensão instalada
-- em `public` (ficam em `extensions`), então dá para revogar em bloco.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Tabela, sequência ou função criada daqui para a frente nasce fechada para o
-- anon e para o "todo mundo". (Vale para o que o `postgres` cria — é ele quem
-- roda as migrations.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- As duas policies que valiam "para todo mundo" (TO public, o padrão de quem
-- esquece o TO). O filtro delas já exigia usuário logado, mas policy aberta
-- para o anon é a porta que o item 1 existe para fechar.
ALTER POLICY "Ver entradas de mercadoria da loja"  ON public.entradas_mercadoria       TO authenticated;
ALTER POLICY "Ver itens da entrada de mercadoria"  ON public.entradas_mercadoria_itens TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. FUNÇÃO SÓ É CHAMÁVEL DA TELA SE ALGUÉM DISSER QUE É
-- -----------------------------------------------------------------------------
-- 2a. Função nova nasce sem EXECUTE para quem está logado. Quem precisar ser
--     chamada da tela recebe GRANT na própria migration que a cria — e isso é
--     uma linha, visível, revisável. (Gatilho não precisa: o banco não confere
--     EXECUTE de quem disparou o gatilho.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

-- 2b. Toda função de GATILHO perde o EXECUTE de quem está logado. Chamada
--     direta a ela nunca fez sentido, e o gatilho continua disparando normal.
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

-- 2c. As engrenagens internas que NÃO são gatilho mas só gatilho chama.
REVOKE EXECUTE ON FUNCTION public.garantir_caixa_aberto(uuid, uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.proximo_numero_venda(uuid)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.proximo_numero_os(uuid)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.proximo_numero_entrada(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.proximo_numero_documento(uuid, text)     FROM PUBLIC, anon, authenticated;
-- `has_role` não é usada por policy nenhuma nem pela tela (o perfil chega
-- pronto por `minhas_permissoes`). Sobrou de 01/08 respondendo "fulano é
-- administrador?" para qualquer uuid de qualquer loja.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)          FROM PUBLIC, anon, authenticated;

-- 2d. O que a tela e a função de borda CHAMAM de verdade — o contrato, dito
--     por extenso. Cada uma destas ou confere o crachá dentro, ou é ajudante
--     de policy/constraint (roda como o próprio usuário, com RLS ligado).
DO $$
DECLARE f RECORD; n TEXT;
BEGIN
  FOREACH n IN ARRAY ARRAY[
    -- ajudantes de policy, constraint e índice
    'get_user_tenant_id', 'has_permission', 'user_belongs_to_tenant',
    'catalogo_e_do_tipo', 'somente_digitos',
    -- chamadas pela tela (grep .rpc( em src/) e pela função de borda
    'minhas_permissoes', 'buscar_clientes_semelhantes', 'ajustar_estoque_produto',
    'trocar_papel_do_usuario', 'registrar_entrada_produto_troca',
    'registrar_entrada_mercadoria', 'registrar_decisao_do_laudo',
    'iniciar_diagnostico_os', 'iniciar_execucao_os', 'historico_do_usuario',
    'custo_das_pecas_do_servico'
  ] LOOP
    FOR f IN
      SELECT p.oid::regprocedure AS assinatura
        FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
       WHERE n2.nspname = 'public' AND p.proname = n
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.assinatura);
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. `historico_do_usuario` SÓ RESPONDE SOBRE GENTE DA MESMA LOJA
-- -----------------------------------------------------------------------------
-- Mesmo corpo de 23/08, com a pergunta que faltava no começo.
CREATE OR REPLACE FUNCTION public.historico_do_usuario(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendas INTEGER; v_os INTEGER; v_mov INTEGER; v_caixa INTEGER;
  v_entradas INTEGER; v_aud INTEGER; v_admins INTEGER; v_e_admin BOOLEAN;
BEGIN
  -- Roda com chave de dono, então precisa perguntar sozinha: o alvo é da
  -- loja de quem pergunta, e quem pergunta pode ver usuários? Sem isto,
  -- qualquer logado contava o movimento de qualquer usuário de qualquer loja.
  -- A loja do ALVO é lida direto de profiles (não por get_user_tenant_id):
  -- o alvo típico desta pergunta é justamente a conta desativada que vai ser
  -- excluída, e para conta desativada get_user_tenant_id responde "nenhuma".
  IF auth.uid() IS NULL
     OR NOT public.has_permission(auth.uid(), 'users.view')
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
$$;

-- -----------------------------------------------------------------------------
-- 4. SEARCH_PATH FIXO NAS TRÊS QUE FALTAVAM
-- -----------------------------------------------------------------------------
ALTER FUNCTION public.somente_digitos(text)                          SET search_path = public;
ALTER FUNCTION public.buscar_clientes_semelhantes(text, text, text)  SET search_path = public;
ALTER FUNCTION public.proteger_status_de_sistema()                   SET search_path = public;

-- -----------------------------------------------------------------------------
-- CONFERE QUE FECHOU MESMO
-- -----------------------------------------------------------------------------
-- Migration aplicada às cegas já custou caro aqui. Qualquer uma destas falhando
-- derruba a transação inteira: nada fica pela metade.
DO $verifica$
DECLARE v_txt TEXT; v_n INT;
BEGIN
  -- 1. anon sem tabela nenhuma
  SELECT string_agg(DISTINCT table_name, ', ') INTO v_txt
    FROM information_schema.role_table_grants
   WHERE grantee = 'anon' AND table_schema = 'public';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'anon ainda tem privilégio em tabela: %', v_txt;
  END IF;

  -- 1b. anon sem coluna nenhuma (a trava de custo concedia coluna a coluna)
  SELECT string_agg(DISTINCT table_name, ', ') INTO v_txt
    FROM information_schema.role_column_grants
   WHERE grantee = 'anon' AND table_schema = 'public';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'anon ainda tem privilégio em coluna: %', v_txt;
  END IF;

  -- 1c. anon sem função nenhuma (passa por PUBLIC também: has_function_privilege
  --     enxerga o "todo mundo")
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'anon ainda executa função: %', v_txt;
  END IF;

  -- 1e. nenhuma função aberta para "todo mundo" (PUBLIC)
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função ainda aberta para PUBLIC: %', v_txt;
  END IF;

  -- 1f. e o padrão para função nova também fechou
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE n.nspname = 'public' AND d.defaclobjtype = 'f' AND pg_get_userbyid(d.defaclrole) = 'postgres'
       AND EXISTS (SELECT 1 FROM unnest(d.defaclacl) a WHERE a::text LIKE '=X/%' OR a::text LIKE 'anon=%' OR a::text LIKE 'authenticated=%')
  ) THEN
    RAISE EXCEPTION 'função nova ainda nasceria aberta (default privileges)';
  END IF;

  -- 1d. nenhuma policy aberta para anon/public
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n > 0 THEN
    RAISE EXCEPTION '% policy(ies) ainda valem para quem não fez login', v_n;
  END IF;

  -- 2. as engrenagens fecharam para quem está logado
  IF has_function_privilege('authenticated', 'public.garantir_caixa_aberto(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.proximo_numero_venda(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.baixar_estoque_os()', 'EXECUTE') THEN
    RAISE EXCEPTION 'função interna continua chamável por usuário logado';
  END IF;

  -- 2d. e o que a tela precisa continua aberto
  IF NOT has_function_privilege('authenticated', 'public.has_permission(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_user_tenant_id(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.minhas_permissoes()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.registrar_decisao_do_laudo(uuid, boolean, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.somente_digitos(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'uma função que a tela usa ficou sem EXECUTE — o sistema quebraria no login';
  END IF;

  -- 4. search_path fixo
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('somente_digitos', 'buscar_clientes_semelhantes', 'proteger_status_de_sistema')
     AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  IF v_n > 0 THEN
    RAISE EXCEPTION '% função(ões) continuam sem search_path fixo', v_n;
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
