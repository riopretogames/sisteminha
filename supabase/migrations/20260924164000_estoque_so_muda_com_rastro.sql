-- =============================================================================
-- O estoque só muda com rastro, e o ajuste da ficha não sobrescreve venda
-- =============================================================================
--
-- Dois achados da revisão completa de 24/09/2026, área de Estoque.
--
-- 1. O AJUSTE DA FICHA RECRIAVA A UNIDADE VENDIDA (achado 45).
--    O gerente abria a ficha do Controle PS5 (3 unidades) e ia para outra
--    aba. O balcão vendia 1 (ficava 2). Ele voltava, mudava só o preço e
--    salvava — e o estoque voltava para 3, com uma movimentação "Ajuste
--    manual / Entrada +1" no nome dele. Estoque fantasma: o sistema passava a
--    oferecer um aparelho que não existe.
--
--    A tela foi consertada (só ajusta se a pessoa mexeu no campo). Aqui fica
--    a segunda trava, no banco: a função de ajuste passa a receber o saldo
--    que a pessoa VIU (`_saldo_anterior`). Se o estoque mudou no meio do
--    caminho, ela recusa com uma frase clara em vez de gravar o número por
--    cima. Quem não manda o saldo (chamada antiga) continua funcionando como
--    antes.
--
--    Como a função ganhou um parâmetro, a versão de 3 parâmetros é apagada e
--    recriada com 4 — se as duas convivessem, a chamada de 3 ficaria ambígua.
--    Nenhuma outra função do banco chama esta (conferido em 24/09).
--
-- 2. DAVA PARA MUDAR O ESTOQUE SEM DEIXAR RASTRO (achado 50).
--    A regra de gravação de `produtos` exige só "editar produto", e quem está
--    logado pode gravar todas as colunas — inclusive `estoque_atual`. Uma
--    chamada direta à API (sem passar pelas telas) mudava o estoque sem linha
--    em Movimentações, sem conferir a permissão de AJUSTAR estoque e sem a
--    recusa de estoque negativo. Contrariava a Opção B (permissão do catálogo
--    vale no banco) e a nota de 15/09 de que o rastro de movimento não é
--    forjável. Nenhuma tela grava `estoque_atual` direto (só o cadastro
--    inicial, que é INSERT e já gera movimento por gatilho).
--
--    Agora um gatilho recusa a mudança de `estoque_atual` feita por quem está
--    logado. As portas oficiais — venda, OS, devolução, cancelamento, entrada
--    de mercadoria, ajuste da ficha — são funções com chave de dono
--    (SECURITY DEFINER, donas: postgres) e rodam como o dono, então passam.
--    Conferido em 24/09: todas as funções que fazem UPDATE em `produtos` são
--    SECURITY DEFINER (ajustar_estoque_produto, baixar_estoque_os,
--    baixar_estoque_venda, estornar_estoque_devolucao,
--    estornar_estoque_venda_cancelada, mover_pecas_da_os,
--    registrar_entrada_mercadoria).
--
--    ⚠️ Consequência para o futuro: função NOVA que mexa em estoque tem que
--    ser SECURITY DEFINER (como todas as de hoje). Se for escrita sem isso,
--    o gatilho recusa com a mensagem abaixo — falha alta, na hora, que é o
--    comportamento desejado.
--
-- Depois de aplicar: regerar `src/integrations/supabase/types.ts` (a função
-- ganhou parâmetro) e rodar o parecer de segurança (get_advisors).
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ajuste da ficha com "saldo que eu vi"
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.ajustar_estoque_produto(uuid, integer, text);

CREATE FUNCTION public.ajustar_estoque_produto(
  _produto_id uuid,
  _nova_quantidade integer,
  _motivo text DEFAULT 'Ajuste manual',
  _saldo_anterior integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto RECORD;
  v_saldo   INTEGER;
BEGIN
  SELECT estoque_atual, custo, tenant_id
  INTO v_produto
  FROM public.produtos
  WHERE id = _produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado.', _produto_id;
  END IF;

  IF v_produto.tenant_id <> public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Produto não pertence à sua loja.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission(auth.uid(), 'inventory.adjust') THEN
    RAISE EXCEPTION 'Seu acesso não permite ajustar estoque.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _nova_quantidade < 0 THEN
    RAISE EXCEPTION 'Estoque não pode ser negativo.';
  END IF;

  -- Estoque vazio no cadastro conta como zero: sem isto, a conta do
  -- movimento abaixo daria vazio e a linha do rastro não seria gravada.
  v_saldo := COALESCE(v_produto.estoque_atual, 0);

  -- Já está no número pedido: nada a fazer (e nada a recusar — se o saldo
  -- mudou para exatamente o que a pessoa queria, ela conseguiu o que queria).
  IF _nova_quantidade = v_saldo THEN
    RETURN;
  END IF;

  -- O saldo mudou desde que a pessoa abriu a ficha (venda, OS, entrada).
  -- Gravar o número absoluto por cima recriaria a unidade vendida.
  IF _saldo_anterior IS NOT NULL AND _saldo_anterior <> v_saldo THEN
    RAISE EXCEPTION
      'O estoque deste produto mudou enquanto a ficha estava aberta (era %, agora é %): outra venda, OS ou entrada mexeu nele. Nada foi alterado no estoque — confira o número e ajuste de novo se precisar.',
      _saldo_anterior, v_saldo
      USING ERRCODE = 'P0001';
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
    (CASE WHEN _nova_quantidade > v_saldo THEN 'entrada' ELSE 'saida' END)::public.movimento_tipo,
    ABS(_nova_quantidade - v_saldo),
    v_produto.custo,
    v_produto.custo * ABS(_nova_quantidade - v_saldo),
    _motivo,
    'ajuste_manual',
    auth.uid(),
    v_saldo,
    _nova_quantidade
  );
END;
$$;

-- Função nova nasce aberta para "todo mundo" (ver CLAUDE.md, 15/09): fecha na
-- marra e abre só para quem está logado — a tela chama por `.rpc()`.
REVOKE EXECUTE ON FUNCTION public.ajustar_estoque_produto(uuid, integer, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_produto(uuid, integer, text, integer)
  TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Estoque só muda pelas portas que deixam rastro
-- ─────────────────────────────────────────────────────────────────────────────

-- SEM `SECURITY DEFINER`, de propósito: a pergunta é justamente "quem está
-- rodando esta gravação?". Dentro das funções com chave de dono, o
-- `current_user` é o dono (postgres) e passa; numa chamada direta da API,
-- é `authenticated` e é recusado. Com chave de dono, esta função responderia
-- "postgres" sempre e não travaria nada.
CREATE OR REPLACE FUNCTION public.estoque_so_muda_com_rastro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estoque_atual IS DISTINCT FROM OLD.estoque_atual
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION
      'O estoque só muda por venda, OS, entrada de mercadoria ou pelo ajuste na ficha do produto — assim ele fica registrado em Movimentações.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estoque_so_muda_com_rastro ON public.produtos;
CREATE TRIGGER estoque_so_muda_com_rastro
  BEFORE UPDATE OF estoque_atual ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.estoque_so_muda_com_rastro();

-- Gatilho não precisa de EXECUTE para disparar; fechar impede que alguém a
-- chame como função solta (regra de 15/09: o REVOKE FROM PUBLIC é o que
-- fecha de verdade).
REVOKE EXECUTE ON FUNCTION public.estoque_so_muda_com_rastro() FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERE
-- ─────────────────────────────────────────────────────────────────────────────
-- Estrutural, mais uma prova de verdade do ajuste num rascunho desfeito pelo
-- erro proposital P0999 (mesmo método da migration 20260915100000). Nada de
-- SET ROLE aqui dentro: ele vaza para o registro da própria migration e
-- derruba o `db push` (lição de 15/09). Por isso a recusa do gatilho para
-- `authenticated` é conferida pela definição, não trocando de papel.
DO $verifica$
DECLARE
  v_txt TEXT;
BEGIN
  -- a versão antiga, de 3 parâmetros, não pode sobrar (chamada ambígua)
  IF to_regprocedure('public.ajustar_estoque_produto(uuid,integer,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'a versão antiga de ajustar_estoque_produto continua no banco';
  END IF;
  IF to_regprocedure('public.ajustar_estoque_produto(uuid,integer,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'ajustar_estoque_produto de 4 parâmetros não foi criada';
  END IF;

  -- quem está logado chama; quem não está, não
  IF NOT has_function_privilege('authenticated', 'public.ajustar_estoque_produto(uuid,integer,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ajustar_estoque_produto sem EXECUTE para authenticated — a ficha do produto quebraria';
  END IF;
  IF has_function_privilege('anon', 'public.ajustar_estoque_produto(uuid,integer,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ajustar_estoque_produto chamável sem login';
  END IF;

  -- o gatilho está no lugar, SEM chave de dono, e fechado para chamada solta
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'estoque_so_muda_com_rastro'
                    AND tgrelid = 'public.produtos'::regclass) THEN
    RAISE EXCEPTION 'gatilho estoque_so_muda_com_rastro não foi criado';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.estoque_so_muda_com_rastro()'::regprocedure) THEN
    RAISE EXCEPTION 'estoque_so_muda_com_rastro não pode ter chave de dono — deixaria de travar';
  END IF;
  IF has_function_privilege('authenticated', 'public.estoque_so_muda_com_rastro()', 'EXECUTE') THEN
    RAISE EXCEPTION 'estoque_so_muda_com_rastro chamável por quem está logado';
  END IF;

  -- nenhuma das duas aberta para "todo mundo"
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('ajustar_estoque_produto', 'estoque_so_muda_com_rastro')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função ainda aberta para PUBLIC: %', v_txt;
  END IF;

  -- toda função que grava em produtos continua com chave de dono (senão o
  -- gatilho novo travaria venda, OS ou entrada)
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~* 'update\s+(public\.)?produtos'
     AND NOT p.prosecdef;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função que grava estoque sem chave de dono seria travada pelo gatilho: %', v_txt;
  END IF;
END
$verifica$;

DO $prova$
DECLARE
  v_tenant UUID;
  v_admin  UUID;
  v_prod   UUID;
  v_saldo  INTEGER;
  v_recusou BOOLEAN := false;
BEGIN
  BEGIN
    SELECT id INTO v_tenant FROM public.tenants ORDER BY created_at LIMIT 1;
    SELECT ur.user_id INTO v_admin
      FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'administrador' AND p.ativo AND p.tenant_id = v_tenant
     ORDER BY p.created_at LIMIT 1;

    IF v_tenant IS NULL OR v_admin IS NULL THEN
      RAISE EXCEPTION 'Banco sem loja ou administrador para a prova — confira antes de aplicar.';
    END IF;

    -- Age como o administrador: é o que a tela faz.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    INSERT INTO public.produtos (tenant_id, nome, custo, preco, estoque_atual, ativo)
    VALUES (v_tenant, '__prova da migration 24/09 (desfeita)', 10, 20, 5, false)
    RETURNING id INTO v_prod;

    -- (a) viu 5, pediu 3, o banco tinha 5: ajusta
    PERFORM public.ajustar_estoque_produto(v_prod, 3, 'prova (desfeita)', 5);
    SELECT estoque_atual INTO v_saldo FROM public.produtos WHERE id = v_prod;
    IF v_saldo <> 3 THEN
      RAISE EXCEPTION 'ajuste com saldo certo deixou % em vez de 3', v_saldo;
    END IF;

    -- (b) viu 5 (ficha velha), pediu 9, o banco tem 3: RECUSA e não mexe
    BEGIN
      PERFORM public.ajustar_estoque_produto(v_prod, 9, 'prova (desfeita)', 5);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%mudou enquanto a ficha estava aberta%' THEN
        v_recusou := true;
      ELSE
        RAISE;
      END IF;
    END;
    IF NOT v_recusou THEN
      RAISE EXCEPTION 'ajuste com ficha velha foi aceito — a unidade vendida voltaria';
    END IF;
    SELECT estoque_atual INTO v_saldo FROM public.produtos WHERE id = v_prod;
    IF v_saldo <> 3 THEN
      RAISE EXCEPTION 'a recusa mexeu no estoque: % em vez de 3', v_saldo;
    END IF;

    -- (c) chamada antiga, sem o saldo: continua funcionando
    PERFORM public.ajustar_estoque_produto(v_prod, 4, 'prova (desfeita)');
    SELECT estoque_atual INTO v_saldo FROM public.produtos WHERE id = v_prod;
    IF v_saldo <> 4 THEN
      RAISE EXCEPTION 'ajuste sem saldo deixou % em vez de 4', v_saldo;
    END IF;

    -- (d) o dono (que é quem roda as funções de venda, OS e entrada) passa
    --     pelo gatilho novo
    UPDATE public.produtos SET estoque_atual = 6 WHERE id = v_prod;
    SELECT estoque_atual INTO v_saldo FROM public.produtos WHERE id = v_prod;
    IF v_saldo <> 6 THEN
      RAISE EXCEPTION 'o gatilho travou o dono: saldo % em vez de 6', v_saldo;
    END IF;

    -- Tudo certo: desfaz o rascunho inteiro.
    RAISE EXCEPTION 'prova concluída' USING ERRCODE = 'P0999';
  EXCEPTION
    WHEN SQLSTATE 'P0999' THEN
      NULL;
  END;

  -- O crachá simulado morre com o sub-bloco, mas não custa garantir.
  PERFORM set_config('request.jwt.claims', '', true);
END
$prova$;

NOTIFY pgrst, 'reload schema';
