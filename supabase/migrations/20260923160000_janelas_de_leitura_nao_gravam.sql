-- =============================================================================
-- As "janelas de leitura" (views vw_*) deixam de aceitar gravação
-- =============================================================================
--
-- ACHADO DA REVISÃO DE 23/09/2026 — e é o mais grave dela.
--
-- As views `vw_*` foram desenhadas para LEITURA (regra de custo protegido,
-- Opção B): cada uma roda com o poder do dono, filtra a loja e esconde o custo.
-- Só que o padrão de fábrica do Supabase dá ALL em todo objeto novo para
-- `authenticated`, e as migrations das views só faziam `GRANT SELECT` — o que
-- não tira nada. Resultado, conferido no banco ao vivo: as oito views aceitavam
-- INSERT, UPDATE e DELETE de qualquer pessoa logada.
--
-- E como a view roda com o poder do dono (que passa por cima do RLS), gravar
-- por ela ignorava todas as policies da tabela de baixo. Na prática:
--
--   • um vendedor sem permissão de editar estoque conseguia mudar o preço de um
--     produto, zerar o estoque ou APAGAR o produto (pela vw_produtos);
--   • quem tem permissão de ver a auditoria conseguia APAGAR linhas do rastro
--     (pela vw_auditoria) — o contrário do que a leva de 15/09 garantiu;
--   • qualquer logado criava movimento de estoque falso, até de outra loja
--     (pela vw_movimentos_estoque, que não tinha checagem na gravação);
--   • qualquer logado mudava o número de vendedores do mês (pela vw_metas_mes,
--     criada na migration 20260923140000) e deixava a meta individual de todo
--     mundo minúscula.
--
-- Nenhuma tela do sistema grava por view (conferido no código em 23/09: toda
-- gravação vai direto na tabela, como manda o CLAUDE.md). Então fechar não
-- quebra nada — só fecha a porta que ninguém devia usar.
--
-- A proteção que fica: o laço abaixo fecha TODAS as views de `public` (as que
-- existem hoje), e a conferência no fim derruba a migration se alguma view
-- ainda aceitar gravação. Para as views futuras, a regra entrou no CLAUDE.md
-- (seção "Regra das portas fechadas"): `GRANT SELECT` sozinho não fecha a
-- escrita; view nova precisa do REVOKE.
-- =============================================================================

DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated',
      v.relname
    );
  END LOOP;
END $$;

-- As outras vw_* já usam security_barrier (a condição do WHERE roda antes de
-- qualquer função da consulta de quem pede); a view nova de metas também.
ALTER VIEW public.vw_metas_mes SET (security_barrier = true);

-- Higiene nas tabelas de meta: só leitura para quem está logado. As policies de
-- gravação já não existiam (a planilha é a única porta), mas TRUNCATE,
-- REFERENCES e TRIGGER tinham ficado no padrão de fábrica.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.metas_faturamento, public.metas_vendedor, public.metas_mes,
     public.metas_campanha, public.metas_sincronizacoes
  FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- aplicar_metas_da_planilha: as travas que a lógica de NULO deixava passar
-- =============================================================================
--
-- Também achado da revisão. Em SQL, `NULL <> 'array'` não é verdadeiro nem
-- falso — é NULO, e um IF com NULO não entra. Então um pedido SEM a chave
-- "meses" passava pela trava "precisa trazer os 12 meses", não aplicava mês
-- nenhum e registrava SUCESSO. O mesmo com campanha sem "faixas".
--
-- E uma leitura quebrada da aba CAMPANHAS (aba renomeada, bloco com formato
-- mudado) mandava a lista VAZIA — e o banco apagava todas as campanhas e
-- registrava sucesso. Agora lista vazia é recusada: se um dia a loja quiser
-- mesmo zerar as campanhas, é decisão para ser feita de propósito, não por
-- acidente de leitura.

CREATE OR REPLACE FUNCTION public.aplicar_metas_da_planilha(p_tenant UUID, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano          INTEGER;
  v_mes          JSONB;
  v_num_mes      INTEGER;
  v_meses_vistos INTEGER[] := '{}';
  v_faixa        TEXT;
  v_valor        NUMERIC;
  v_anterior     NUMERIC;
  v_vendedores   INTEGER;
  v_apuracao     TEXT;
  v_ano_passado  NUMERIC;
  v_camp         JSONB;
  v_camp_faixa   JSONB;
  v_chave        TEXT;
  v_chaves       TEXT[] := '{}';
  v_grupo        UUID;
  v_periodic     TEXT;
  v_faixas_camp  TEXT[];
  v_sem_grupo    TEXT[] := '{}';
  v_nomes_mes    CONSTANT TEXT[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho',
                                          'julho','agosto','setembro','outubro','novembro','dezembro'];
  v_gravadas     INTEGER := 0;
  v_apagadas     INTEGER := 0;
  v_resumo       JSONB;
BEGIN
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant) THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'O pedido chegou vazio ou fora do formato.';
  END IF;

  BEGIN
    v_ano := (p_payload->>'ano')::INTEGER;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'O ano da planilha não é um número.';
  END;
  IF v_ano IS NULL OR v_ano NOT BETWEEN 2020 AND 2100 THEN
    RAISE EXCEPTION 'O ano da planilha (%) está fora do esperado.', COALESCE(p_payload->>'ano', 'vazio');
  END IF;

  -- IS DISTINCT FROM, e não <>: a chave faltando vira NULO, e NULO <> 'array'
  -- não entra no IF. Era a brecha.
  IF jsonb_typeof(p_payload->'meses') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload->'meses') <> 12 THEN
    RAISE EXCEPTION 'A planilha precisa trazer os 12 meses; chegaram %.',
      CASE WHEN jsonb_typeof(p_payload->'meses') = 'array'
           THEN jsonb_array_length(p_payload->'meses')::TEXT ELSE 'nenhum' END;
  END IF;

  FOR v_mes IN SELECT * FROM jsonb_array_elements(p_payload->'meses') LOOP
    IF jsonb_typeof(v_mes) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Um dos meses chegou fora do formato.';
    END IF;
    BEGIN
      v_num_mes := (v_mes->>'mes')::INTEGER;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Um dos meses veio sem número.';
    END;
    IF v_num_mes IS NULL OR v_num_mes NOT BETWEEN 1 AND 12 THEN
      RAISE EXCEPTION 'Mês inválido na planilha: %.', COALESCE(v_mes->>'mes', 'vazio');
    END IF;
    IF v_num_mes = ANY (v_meses_vistos) THEN
      RAISE EXCEPTION 'O mês de % aparece duas vezes na planilha.', v_nomes_mes[v_num_mes];
    END IF;
    v_meses_vistos := v_meses_vistos || v_num_mes;

    -- Número inteiro de verdade: "2.5" vendedores é leitura errada, não arredonda.
    IF jsonb_typeof(v_mes->'vendedores') IS DISTINCT FROM 'number'
       OR (v_mes->>'vendedores') !~ '^\d+$' THEN
      RAISE EXCEPTION 'Em %, o número de vendedores precisa ser um número inteiro.', v_nomes_mes[v_num_mes];
    END IF;
    v_vendedores := (v_mes->>'vendedores')::INTEGER;
    IF v_vendedores NOT BETWEEN 0 AND 50 THEN
      RAISE EXCEPTION 'Em %, o número de vendedores (%) está fora do esperado.',
        v_nomes_mes[v_num_mes], v_vendedores;
    END IF;

    v_apuracao := v_mes->>'apuracao';
    IF v_apuracao IS NULL OR v_apuracao NOT IN ('quinzenal', 'quatro_periodos') THEN
      RAISE EXCEPTION 'Em %, a apuração precisa ser "Quinzenal" ou "4 períodos".', v_nomes_mes[v_num_mes];
    END IF;

    v_ano_passado := NULL;
    IF jsonb_typeof(v_mes->'ano_passado') = 'number' THEN
      v_ano_passado := (v_mes->>'ano_passado')::NUMERIC;
      IF v_ano_passado < 0 THEN v_ano_passado := NULL; END IF;
    END IF;

    INSERT INTO public.metas_mes (tenant_id, ano, mes, vendedores, apuracao, faturamento_ano_passado)
    VALUES (p_tenant, v_ano, v_num_mes, v_vendedores, v_apuracao, v_ano_passado)
    ON CONFLICT (tenant_id, ano, mes) DO UPDATE
      SET vendedores = EXCLUDED.vendedores,
          apuracao = EXCLUDED.apuracao,
          faturamento_ano_passado = EXCLUDED.faturamento_ano_passado;

    v_anterior := NULL;
    FOREACH v_faixa IN ARRAY ARRAY['bronze','prata','ouro','diamante'] LOOP
      IF jsonb_typeof(v_mes->v_faixa) = 'number' THEN
        v_valor := (v_mes->>v_faixa)::NUMERIC;
        IF v_valor < 0 THEN
          RAISE EXCEPTION 'Em %, a faixa % está negativa.', v_nomes_mes[v_num_mes], initcap(v_faixa);
        END IF;
        IF v_anterior IS NOT NULL AND v_valor < v_anterior THEN
          RAISE EXCEPTION 'Em %, a faixa % (R$ %) é menor que a anterior (R$ %). As faixas precisam subir.',
            v_nomes_mes[v_num_mes], initcap(v_faixa), v_valor, v_anterior;
        END IF;
        v_anterior := v_valor;

        INSERT INTO public.metas_faturamento (tenant_id, ano, mes, faixa, valor_meta)
        VALUES (p_tenant, v_ano, v_num_mes, v_faixa::public.faixa_premiacao, v_valor)
        ON CONFLICT (tenant_id, ano, mes, faixa) DO UPDATE SET valor_meta = EXCLUDED.valor_meta;
        v_gravadas := v_gravadas + 1;
      ELSIF v_mes ? v_faixa AND jsonb_typeof(v_mes->v_faixa) IS DISTINCT FROM 'null' THEN
        RAISE EXCEPTION 'Em %, a faixa % não é um valor em reais.', v_nomes_mes[v_num_mes], initcap(v_faixa);
      ELSE
        -- Faixa em branco na planilha = não vale neste mês.
        DELETE FROM public.metas_faturamento
        WHERE tenant_id = p_tenant AND ano = v_ano AND mes = v_num_mes
          AND faixa = v_faixa::public.faixa_premiacao;
        IF FOUND THEN v_apagadas := v_apagadas + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- ── Campanhas: obrigatórias e não vazias ──────────────────────────────────
  IF jsonb_typeof(p_payload->'campanhas') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A planilha não trouxe as campanhas (aba CAMPANHAS).';
  END IF;
  IF jsonb_array_length(p_payload->'campanhas') = 0 THEN
    RAISE EXCEPTION 'A leitura da aba CAMPANHAS não achou nenhuma campanha. Nada foi alterado — confira se a aba mudou de nome ou se o cabeçalho "Faixa / Meta / Prêmio" dos blocos continua igual.';
  END IF;

  FOR v_camp IN SELECT * FROM jsonb_array_elements(p_payload->'campanhas') LOOP
    IF jsonb_typeof(v_camp) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Uma campanha chegou fora do formato.';
    END IF;
    v_chave := v_camp->>'chave';
    IF v_chave IS NULL OR v_chave !~ '^[a-z0-9_]{2,40}$' THEN
      RAISE EXCEPTION 'Uma campanha chegou sem identificação válida.';
    END IF;
    IF v_chave = ANY (v_chaves) THEN
      RAISE EXCEPTION 'A campanha % aparece duas vezes na planilha.', v_camp->>'nome';
    END IF;
    v_chaves := v_chaves || v_chave;

    IF length(trim(COALESCE(v_camp->>'nome', ''))) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'A campanha % chegou sem nome.', v_chave;
    END IF;

    v_periodic := COALESCE(v_camp->>'periodicidade', 'quinzenal');
    IF v_periodic NOT IN ('quinzenal', 'mensal') THEN
      RAISE EXCEPTION 'A campanha % tem periodicidade desconhecida.', v_camp->>'nome';
    END IF;

    SELECT c.id INTO v_grupo
    FROM public.catalogos c
    WHERE c.tenant_id = p_tenant
      AND c.tipo = 'grupo_produto'
      AND regexp_replace(translate(lower(trim(c.descricao)),
            'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), 's$', '')
        = regexp_replace(translate(lower(trim(COALESCE(v_camp->>'grupo', v_camp->>'nome'))),
            'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), 's$', '')
    ORDER BY c.ativo DESC, c.created_at
    LIMIT 1;
    IF v_grupo IS NULL THEN
      v_sem_grupo := v_sem_grupo || (v_camp->>'nome');
    END IF;

    IF jsonb_typeof(v_camp->'faixas') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_camp->'faixas') = 0 THEN
      RAISE EXCEPTION 'A campanha % chegou sem faixas.', v_camp->>'nome';
    END IF;

    v_faixas_camp := '{}';
    v_anterior := NULL;
    FOR v_camp_faixa IN
      SELECT f FROM jsonb_array_elements(v_camp->'faixas') f
      ORDER BY array_position(ARRAY['bronze','prata','ouro','diamante'], f->>'faixa')
    LOOP
      v_faixa := v_camp_faixa->>'faixa';
      IF v_faixa IS NULL OR v_faixa NOT IN ('bronze','prata','ouro','diamante') THEN
        RAISE EXCEPTION 'A campanha % tem uma faixa desconhecida.', v_camp->>'nome';
      END IF;
      IF v_faixa = ANY (v_faixas_camp) THEN
        RAISE EXCEPTION 'A campanha % tem a faixa % duas vezes.', v_camp->>'nome', initcap(v_faixa);
      END IF;
      v_faixas_camp := v_faixas_camp || v_faixa;

      IF jsonb_typeof(v_camp_faixa->'meta') IS DISTINCT FROM 'number'
         OR jsonb_typeof(v_camp_faixa->'premio') IS DISTINCT FROM 'number'
         OR (v_camp_faixa->>'meta')::NUMERIC < 0
         OR (v_camp_faixa->>'premio')::NUMERIC < 0 THEN
        RAISE EXCEPTION 'Na campanha %, a faixa % precisa de meta e prêmio em reais.',
          v_camp->>'nome', initcap(v_faixa);
      END IF;
      IF v_anterior IS NOT NULL AND (v_camp_faixa->>'meta')::NUMERIC < v_anterior THEN
        RAISE EXCEPTION 'Na campanha %, a faixa % tem meta menor que a anterior. As faixas precisam subir.',
          v_camp->>'nome', initcap(v_faixa);
      END IF;
      v_anterior := (v_camp_faixa->>'meta')::NUMERIC;

      INSERT INTO public.metas_campanha
        (tenant_id, chave, nome, grupo_produto_id, periodicidade, faixa, meta, premio)
      VALUES
        (p_tenant, v_chave, trim(v_camp->>'nome'), v_grupo, v_periodic,
         v_faixa::public.faixa_premiacao,
         (v_camp_faixa->>'meta')::NUMERIC, (v_camp_faixa->>'premio')::NUMERIC)
      ON CONFLICT (tenant_id, chave, faixa) DO UPDATE
        SET nome = EXCLUDED.nome,
            grupo_produto_id = EXCLUDED.grupo_produto_id,
            periodicidade = EXCLUDED.periodicidade,
            meta = EXCLUDED.meta,
            premio = EXCLUDED.premio;
    END LOOP;

    DELETE FROM public.metas_campanha
    WHERE tenant_id = p_tenant AND chave = v_chave
      AND NOT (faixa::TEXT = ANY (v_faixas_camp));
  END LOOP;

  DELETE FROM public.metas_campanha
  WHERE tenant_id = p_tenant AND NOT (chave = ANY (v_chaves));

  v_resumo := jsonb_build_object(
    'ano', v_ano,
    'faixas_gravadas', v_gravadas,
    'faixas_apagadas', v_apagadas,
    'campanhas', to_jsonb(v_chaves),
    'campanhas_sem_grupo', to_jsonb(v_sem_grupo)
  );

  INSERT INTO public.metas_sincronizacoes
    (tenant_id, planilha_id, planilha_nome, planilha_url, enviado_por, ano, sucesso, resumo)
  VALUES
    (p_tenant,
     left(p_payload->'planilha'->>'id', 200),
     left(p_payload->'planilha'->>'nome', 200),
     left(p_payload->'planilha'->>'url', 500),
     left(p_payload->>'enviado_por', 200),
     v_ano, true, v_resumo);

  RETURN v_resumo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aplicar_metas_da_planilha(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_metas_da_planilha(UUID, JSONB) TO service_role;


-- =============================================================================
-- pessoas_da_apuracao passa a olhar o PERÍODO, não só o cadastro de hoje
-- =============================================================================
--
-- Achado da revisão: a lista saía do cadastro de HOJE e valia para qualquer
-- mês. Um vendedor desligado no dia 17 sumia da apuração da 1ª quinzena, que
-- ainda é paga a ele.
--
-- Agora entra: quem é vendedor e está ativo hoje, MAIS quem é vendedor (ativo
-- ou não) e vendeu dentro do período consultado. O limite que sobra — e que a
-- tela avisa — é quem mudou de perfil (vendedor promovido a gerente): o sistema
-- não guarda o histórico de perfil, então vale o de hoje.

DROP FUNCTION IF EXISTS public.pessoas_da_apuracao();

CREATE FUNCTION public.pessoas_da_apuracao(p_de TIMESTAMPTZ, p_ate TIMESTAMPTZ)
RETURNS TABLE (id UUID, nome TEXT, ativo BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, (p.ativo AND p.arquivado_em IS NULL) AS ativo
  FROM public.profiles p
  WHERE p.tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'dashboards.goals.view')
      OR public.has_permission(auth.uid(), 'dashboards.goals.manage')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role = 'vendedor'
    )
    AND (
      (p.ativo AND p.arquivado_em IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.vendas v
        WHERE v.vendedor_id = p.id
          AND v.tenant_id = p.tenant_id
          AND v.created_at >= p_de
          AND v.created_at < p_ate
          AND v.status <> 'cancelado'
      )
    )
  ORDER BY p.nome;
$$;

REVOKE EXECUTE ON FUNCTION public.pessoas_da_apuracao(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pessoas_da_apuracao(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- =============================================================================
-- Conferência — derruba a migration se alguma janela ainda aceitar gravação
-- =============================================================================

DO $$
DECLARE
  v_aberta TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_aberta
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
    AND (
      has_table_privilege('authenticated', c.oid, 'INSERT')
      OR has_table_privilege('authenticated', c.oid, 'UPDATE')
      OR has_table_privilege('authenticated', c.oid, 'DELETE')
      OR has_table_privilege('anon', c.oid, 'INSERT')
      OR has_table_privilege('anon', c.oid, 'UPDATE')
      OR has_table_privilege('anon', c.oid, 'DELETE')
    );
  IF v_aberta IS NOT NULL THEN
    RAISE EXCEPTION 'Estas views ainda aceitam gravação: %', v_aberta;
  END IF;

  -- As telas continuam lendo pelas views.
  IF NOT has_table_privilege('authenticated', 'public.vw_produtos', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.vw_metas_mes', 'SELECT') THEN
    RAISE EXCEPTION 'A leitura pelas views foi fechada junto — não era para isso';
  END IF;

  IF has_function_privilege('authenticated', 'public.aplicar_metas_da_planilha(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'aplicar_metas_da_planilha ficou aberta para quem usa o sistema';
  END IF;
  IF has_function_privilege('anon', 'public.pessoas_da_apuracao(timestamptz, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pessoas_da_apuracao ficou aberta para quem não fez login';
  END IF;
END $$;
