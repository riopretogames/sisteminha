-- =============================================================================
-- Venda e devolução passam a ser conferidas no banco, não só na tela
-- =============================================================================
--
-- Revisão completa de 24/09/2026 (área Vendas e Clientes). Regra da casa
-- (CLAUDE.md, "custo protegido"): permissão e regra que existem têm que valer
-- no BANCO também — a tela é só uma das portas. Três achados, um por seção:
--
-- 1. VENDA INVENTADA PELA API (achado 33). A regra de gravação de `vendas`
--    conferia só a loja e a permissão de vender. Um vendedor, com o próprio
--    login, conseguia pela API: gravar venda com data retroativa (para cair
--    numa quinzena já fechada), em nome de outro vendedor, com número
--    inventado ou repetido, com total menor que o subtotal sem registrar
--    desconto (driblando a permissão "Dar desconto"), ou com item a preço
--    abaixo da etiqueta. Tudo isso entra no faturamento, nas metas e na
--    premiação. Agora:
--      - a data, o vendedor e o número da venda são do BANCO (agora, quem está
--        logado, próximo número da sequência) — o que vier da tela é ignorado;
--      - venda nasce "pago" (a única situação que o sistema grava hoje);
--      - total = subtotal − desconto, no centavo;
--      - item de venda sai pelo preço do cadastro, e o total do item é
--        preço × quantidade;
--      - a soma dos itens bate com o subtotal da venda;
--      - número de venda não se repete dentro da loja (índice único).
--    O que continua possível e fica anotado: gravar a linha da venda SEM itens.
--    Fechar isso de verdade exige gravar venda, itens e pagamentos numa
--    transação só (uma função "fechar_venda" no banco) — é a próxima etapa,
--    que também acaba com a "venda cancelada automaticamente" quando algo
--    falha no meio do PDV.
--
-- 2. DEVOLUÇÃO PELO PREÇO CHEIO (achado 25). A tela devolvia o preço de tabela
--    do item, ignorando o desconto da venda: a VD-202608-0003 (itens de
--    R$ 2.000, desconto de R$ 500, paga com R$ 1.500) mandava devolver
--    R$ 2.000. A tela foi corrigida; aqui o banco passa a recusar:
--      - item devolvido com preço acima do que o cliente pagou por ele (preço
--        do item na venda × fator do desconto da venda);
--      - devolução que manda devolver mais dinheiro do que os itens valem.
--
-- 3. NOME REPETIDO COM ACENTO OU ESPAÇO DIFERENTE (achado 39). A procura de
--    cliente parecido comparava só minúscula e espaço das pontas: "Joao Silva"
--    não batia com "João Silva", nem "João  Silva" (dois espaços). Agora
--    compara sem acento e com os espaços do meio espremidos — a mesma regra
--    de `normalizarNome` (src/lib/clienteDuplicado.ts). A extensão `unaccent`
--    NÃO está instalada neste banco (conferido em 24/09), então a troca de
--    letras é feita por `translate`, que não depende de extensão.
--
-- `auth.uid() IS NULL` é manutenção feita direto no banco (SQL Editor,
-- migration, rotina interna): fica livre, como em `proteger_venda_gravada`.
-- Tudo que vem da tela ou da API tem crachá e passa pelas travas.
--
-- NÃO confundir com o item 29 (devolução com caixa fechado): esse foi
-- corrigido pela migration do Financeiro (20260924165000, seção 3), que
-- reescreve `registrar_devolucao_no_caixa`. Esta aqui não mexe nela.
--
-- Regras de sempre (CLAUDE.md): função de gatilho fechada com REVOKE ... FROM
-- PUBLIC, GRANT explícito para a função que a tela chama, e a conferência no
-- fim derruba a migration se algo não ficou no lugar.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. A venda nova é carimbada pelo banco
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O nome começa com "c" de propósito: gatilhos BEFORE da mesma tabela rodam em
-- ordem alfabética, e este precisa rodar ANTES de `generate_venda_number` —
-- ele apaga o número que veio da tela, e o gerador (que só age com o número
-- vazio) preenche o próximo da sequência.

CREATE OR REPLACE FUNCTION public.conferir_venda_nova()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- O que é do banco, não da tela.
  NEW.created_at         := now();
  NEW.updated_at         := now();
  NEW.vendedor_id        := auth.uid();
  NEW.numero_venda       := NULL;
  NEW.comissao_calculada := 0;

  IF NEW.status IS DISTINCT FROM 'pago'::public.venda_status THEN
    RAISE EXCEPTION 'Venda nova nasce paga. Para desfazer, grave e cancele.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(NEW.subtotal, 0) < 0 OR COALESCE(NEW.descontos, 0) < 0 OR COALESCE(NEW.total, 0) < 0 THEN
    RAISE EXCEPTION 'Valor de venda não pode ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- O desconto tem que estar ESCRITO no desconto: é ele que o gatilho
  -- `validar_desconto_venda` confere contra a permissão "Dar desconto".
  IF abs(COALESCE(NEW.total, 0) - (COALESCE(NEW.subtotal, 0) - COALESCE(NEW.descontos, 0))) > 0.005 THEN
    RAISE EXCEPTION
      'O total da venda (R$ %) não fecha com o subtotal (R$ %) menos o desconto (R$ %). Atualize a página e monte a venda de novo.',
      COALESCE(NEW.total, 0), COALESCE(NEW.subtotal, 0), COALESCE(NEW.descontos, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.conferir_venda_nova() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conferir_venda_nova ON public.vendas;
CREATE TRIGGER conferir_venda_nova
  BEFORE INSERT ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.conferir_venda_nova();


-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Número de venda não se repete dentro da loja
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Conferido em 24/09: nenhuma loja tem número repetido hoje, então o índice
-- entra sem apagar nada.

CREATE UNIQUE INDEX IF NOT EXISTS vendas_numero_unico_por_loja
  ON public.vendas (tenant_id, numero_venda)
  WHERE numero_venda IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1c. Item de venda sai pelo preço do cadastro
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O desconto do PDV é dado na venda inteira (`vendas.descontos`), nunca no
-- item — então o item vale exatamente o preço do produto. Item mais barato que
-- a etiqueta era um desconto escondido, fora da permissão.
--
-- Efeito para o balcão: se alguém muda o preço de um produto com o PDV aberto
-- em outro computador, a venda daquele produto é recusada com o aviso de
-- atualizar a página. É o certo — o cliente pagaria o preço velho.

CREATE OR REPLACE FUNCTION public.conferir_item_de_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preco NUMERIC;
  v_nome  TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.quantidade, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantidade do item precisa ser maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT preco, nome INTO v_preco, v_nome FROM public.produtos WHERE id = NEW.produto_id;

  IF abs(COALESCE(NEW.preco_unitario, 0) - COALESCE(v_preco, 0)) > 0.005 THEN
    RAISE EXCEPTION
      'O preço de "%" mudou desde que a tela abriu (na venda: R$ %; no cadastro: R$ %). Atualize a página e monte a venda de novo.',
      COALESCE(v_nome, 'produto'), COALESCE(NEW.preco_unitario, 0), COALESCE(v_preco, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  IF abs(COALESCE(NEW.total, 0) - round(COALESCE(NEW.preco_unitario, 0) * NEW.quantidade, 2)) > 0.005 THEN
    RAISE EXCEPTION 'O total do item "%" não é o preço vezes a quantidade.', COALESCE(v_nome, 'produto')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.conferir_item_de_venda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conferir_item_de_venda ON public.itens_venda;
CREATE TRIGGER conferir_item_de_venda
  BEFORE INSERT ON public.itens_venda
  FOR EACH ROW EXECUTE FUNCTION public.conferir_item_de_venda();


-- ─────────────────────────────────────────────────────────────────────────────
-- 1d. A soma dos itens bate com o subtotal da venda
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Confere depois da INSTRUÇÃO inteira (o PDV e a troca gravam todos os itens
-- de uma vez só), olhando tudo o que a venda tem naquele momento. Sem isto, uma
-- venda de subtotal R$ 5.000 com um item de R$ 10 inflava o faturamento — e as
-- metas — de quem vendeu. Item lançado depois, numa segunda leva, também é
-- recusado: a soma passaria do subtotal.

CREATE OR REPLACE FUNCTION public.conferir_soma_dos_itens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda    RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  FOR v_venda IN
    SELECT v.id, v.numero_venda, COALESCE(v.subtotal, 0) AS subtotal,
           (SELECT COALESCE(SUM(iv.total), 0) FROM public.itens_venda iv WHERE iv.venda_id = v.id) AS soma
      FROM public.vendas v
     WHERE v.id IN (SELECT DISTINCT venda_id FROM inseridos)
  LOOP
    IF abs(v_venda.soma - v_venda.subtotal) > 0.005 THEN
      RAISE EXCEPTION
        'Os itens da venda % somam R$ %, mas o subtotal gravado é R$ %. Atualize a página e monte a venda de novo.',
        COALESCE(v_venda.numero_venda, ''), v_venda.soma, v_venda.subtotal
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.conferir_soma_dos_itens() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conferir_soma_dos_itens ON public.itens_venda;
CREATE TRIGGER conferir_soma_dos_itens
  AFTER INSERT ON public.itens_venda
  REFERENCING NEW TABLE AS inseridos
  FOR EACH STATEMENT EXECUTE FUNCTION public.conferir_soma_dos_itens();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2a. Item devolvido não vale mais do que o cliente pagou por ele
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O que o cliente pagou por unidade = preço do item na venda × (total da venda
-- ÷ soma dos itens). É o desconto da venda rateado entre os itens — a mesma
-- regra de `pagoPorLinha` (src/lib/valoresDaVenda.ts) e do painel de Metas.
-- Um centavo de folga cobre o arredondamento do rateio.

CREATE OR REPLACE FUNCTION public.conferir_preco_devolvido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda_original UUID;
  v_total_venda    NUMERIC;
  v_soma_itens     NUMERIC;
  v_preco_item     NUMERIC;
  v_pago_unidade   NUMERIC;
  v_nome           TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT d.venda_original_id INTO v_venda_original
    FROM public.devolucoes d WHERE d.id = NEW.devolucao_id;

  SELECT COALESCE(v.total, 0),
         (SELECT COALESCE(SUM(iv.total), 0) FROM public.itens_venda iv WHERE iv.venda_id = v.id)
    INTO v_total_venda, v_soma_itens
    FROM public.vendas v WHERE v.id = v_venda_original;

  SELECT MAX(iv.preco_unitario) INTO v_preco_item
    FROM public.itens_venda iv
   WHERE iv.venda_id = v_venda_original AND iv.produto_id = NEW.produto_id;

  -- Produto que não é da venda: quem recusa, com a mensagem certa, é o
  -- gatilho `trg_quantidade_devolvida`. Aqui só não atrapalha.
  IF v_preco_item IS NULL OR v_soma_itens IS NULL OR v_soma_itens <= 0 THEN
    RETURN NEW;
  END IF;

  v_pago_unidade := round(v_preco_item * v_total_venda / v_soma_itens, 2);

  IF NEW.preco_unitario > v_pago_unidade + 0.01 THEN
    SELECT nome INTO v_nome FROM public.produtos WHERE id = NEW.produto_id;
    RAISE EXCEPTION
      'O cliente pagou R$ % por unidade de "%" (a venda teve desconto). Não dá para devolver R$ % por unidade.',
      v_pago_unidade, COALESCE(v_nome, 'produto'), NEW.preco_unitario
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.conferir_preco_devolvido() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conferir_preco_devolvido ON public.devolucao_itens;
CREATE TRIGGER conferir_preco_devolvido
  BEFORE INSERT OR UPDATE OF preco_unitario, produto_id ON public.devolucao_itens
  FOR EACH ROW EXECUTE FUNCTION public.conferir_preco_devolvido();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2b. Dinheiro devolvido não passa do que os itens devolvidos valem
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A tela grava primeiro a devolução (com o valor a devolver) e depois, numa
-- instrução só, os itens. Esta conferência roda depois dos itens: se o valor
-- devolvido passa da soma deles, a gravação dos itens é recusada, e a tela
-- desfaz a devolução (ela já faz isso quando os itens falham — e o lançamento
-- de caixa da devolução cai junto, pela ligação em cascata de 17/08).
--
-- Na troca, o valor devolvido é a sobra depois dos produtos novos, sempre
-- menor que os itens — passa. A folga é de um centavo por unidade: o preço por
-- unidade gravado é arredondado, e a soma pode ficar uns centavos abaixo.

CREATE OR REPLACE FUNCTION public.conferir_valor_devolvido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dev RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  FOR v_dev IN
    SELECT d.id, d.numero_devolucao, d.valor_devolvido_cliente,
           COALESCE(SUM(di.quantidade * di.preco_unitario), 0) AS valor_itens,
           COALESCE(SUM(di.quantidade), 0) AS unidades
      FROM public.devolucoes d
      LEFT JOIN public.devolucao_itens di ON di.devolucao_id = d.id
     WHERE d.id IN (SELECT DISTINCT devolucao_id FROM inseridos)
     GROUP BY d.id, d.numero_devolucao, d.valor_devolvido_cliente
  LOOP
    IF v_dev.valor_devolvido_cliente > v_dev.valor_itens + 0.01 * v_dev.unidades THEN
      RAISE EXCEPTION
        'A devolução % manda devolver R$ %, mas os itens devolvidos valem R$ % pelo que o cliente pagou.',
        COALESCE(v_dev.numero_devolucao, ''), v_dev.valor_devolvido_cliente, v_dev.valor_itens
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.conferir_valor_devolvido() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conferir_valor_devolvido ON public.devolucao_itens;
CREATE TRIGGER conferir_valor_devolvido
  AFTER INSERT ON public.devolucao_itens
  REFERENCING NEW TABLE AS inseridos
  FOR EACH STATEMENT EXECUTE FUNCTION public.conferir_valor_devolvido();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cliente parecido: nome sem acento e sem espaço sobrando
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Mesma assinatura, mesmo retorno, mesma segurança (roda como quem chama, sob
-- as regras de leitura de `clientes`). Muda só a comparação do nome.

CREATE OR REPLACE FUNCTION public.buscar_clientes_semelhantes(
  _documento text DEFAULT NULL::text,
  _telefone text DEFAULT NULL::text,
  _nome text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, nome text, cpf_cnpj text, telefones text[], liberado_venda boolean, motivo text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.nome,
    c.cpf_cnpj,
    c.telefones,
    -- Quem for usar o cadastro encontrado precisa saber, na mesma tela, se
    -- ele está bloqueado para venda — senão descobre só no fechamento.
    COALESCE(c.liberado_venda, true) AS liberado_venda,
    CASE
      WHEN COALESCE(public.somente_digitos(_documento), '') <> ''
       AND public.somente_digitos(c.cpf_cnpj) = public.somente_digitos(_documento)
        THEN 'documento'
      WHEN EXISTS (
        SELECT 1
        FROM unnest(c.telefones) AS t
        WHERE length(public.somente_digitos(t)) >= 8
          AND public.somente_digitos(t) = public.somente_digitos(_telefone)
      ) THEN 'telefone'
      ELSE 'nome'
    END AS motivo
  FROM public.clientes c
  WHERE c.ativo
    AND (
      -- Documento igual (só quando veio documento de verdade)
      (
        COALESCE(public.somente_digitos(_documento), '') <> ''
        AND public.somente_digitos(c.cpf_cnpj) = public.somente_digitos(_documento)
      )
      -- Telefone igual (só a partir de 8 dígitos, igual à trava)
      OR (
        length(COALESCE(public.somente_digitos(_telefone), '')) >= 8
        AND EXISTS (
          SELECT 1
          FROM unnest(c.telefones) AS t
          WHERE public.somente_digitos(t) = public.somente_digitos(_telefone)
        )
      )
      -- Nome igual, ignorando maiúscula/minúscula, ACENTO e espaço sobrando
      -- (nas pontas e no meio). Desde 23/08 o nome igual TRAVA o cadastro cru
      -- (só nome) — ver src/lib/clienteDuplicado.ts, que normaliza igual.
      OR (
        length(COALESCE(btrim(_nome), '')) >= 3
        AND regexp_replace(
              lower(translate(btrim(c.nome),
                'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN')),
              '\s+', ' ', 'g')
          = regexp_replace(
              lower(translate(btrim(_nome),
                'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN')),
              '\s+', ' ', 'g')
      )
    )
  ORDER BY c.nome
  LIMIT 10;
$function$;

-- A tela chama esta função (`.rpc`). Quem não fez login não chama.
REVOKE EXECUTE ON FUNCTION public.buscar_clientes_semelhantes(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_clientes_semelhantes(text, text, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERE (estrutural — nada de SET ROLE dentro de migration: ele vaza para o
-- registro do `supabase db push`. Custou uma reversão em 15/09.)
-- ─────────────────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  v_txt TEXT;
  v_n   INTEGER;
BEGIN
  -- 1. os cinco gatilhos novos estão no lugar
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE NOT tgisinternal
     AND (   (tgname = 'conferir_venda_nova'      AND tgrelid = 'public.vendas'::regclass)
          OR (tgname = 'conferir_item_de_venda'   AND tgrelid = 'public.itens_venda'::regclass)
          OR (tgname = 'conferir_soma_dos_itens'  AND tgrelid = 'public.itens_venda'::regclass)
          OR (tgname = 'conferir_preco_devolvido' AND tgrelid = 'public.devolucao_itens'::regclass)
          OR (tgname = 'conferir_valor_devolvido' AND tgrelid = 'public.devolucao_itens'::regclass));
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'esperava 5 gatilhos novos de conferência, achei %', v_n;
  END IF;

  -- 2. o carimbo roda ANTES do gerador de número (ordem alfabética)
  IF NOT ('conferir_venda_nova' < 'generate_venda_number') THEN
    RAISE EXCEPTION 'o gatilho que apaga o número precisa rodar antes do gerador';
  END IF;

  -- 3. número de venda único por loja
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'vendas_numero_unico_por_loja') THEN
    RAISE EXCEPTION 'índice de número de venda único não foi criado';
  END IF;

  -- 4. funções de gatilho fechadas para quem está logado e para "todo mundo"
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('conferir_venda_nova', 'conferir_item_de_venda', 'conferir_soma_dos_itens',
                       'conferir_preco_devolvido', 'conferir_valor_devolvido')
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR has_function_privilege('anon', p.oid, 'EXECUTE')
          OR p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função de gatilho ainda aberta: %', v_txt;
  END IF;

  -- 5. a procura de cliente parecido continua chamável pela tela, e só por ela
  IF NOT has_function_privilege('authenticated', 'public.buscar_clientes_semelhantes(text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'buscar_clientes_semelhantes ficou sem EXECUTE para authenticated — o cadastro de cliente quebraria';
  END IF;
  IF has_function_privilege('anon', 'public.buscar_clientes_semelhantes(text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'buscar_clientes_semelhantes ficou aberta para quem não fez login';
  END IF;

  -- 6. a comparação de nome ignora acento e espaço duplo, de verdade
  SELECT pg_get_functiondef('public.buscar_clientes_semelhantes(text, text, text)'::regprocedure) INTO v_txt;
  IF v_txt NOT LIKE '%translate%' OR v_txt NOT LIKE '%regexp_replace%' THEN
    RAISE EXCEPTION 'buscar_clientes_semelhantes não passou a normalizar o nome';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
