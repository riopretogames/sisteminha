-- =============================================================================
-- View nova nasce fechada, e "todas as campanhas suspensas" deixa de travar
-- =============================================================================
--
-- Dois achados da SEGUNDA rodada de revisão (23/09/2026), que conferiu as
-- correções da primeira.
--
-- 1. A TRAVA DAS VIEWS SÓ VALIA PARA AS QUE JÁ EXISTIAM.
--    A migration 20260923160000 fechou a escrita das oito views, mas o padrão
--    do banco continua dando tudo a quem está logado em todo objeto NOVO. A
--    próxima view criada nasceria gravável de novo — e a proteção dependeria
--    de alguém lembrar de uma regra escrita, que é exatamente o que falhou no
--    mesmo dia (a vw_metas_mes foi criada horas antes só com GRANT SELECT).
--
--    Agora é automático: um gatilho do próprio banco (o mesmo tipo do
--    `ensure_rls` que o Supabase usa para ligar o RLS em tabela nova) fecha a
--    escrita de toda view criada em `public`, na hora em que ela é criada.
--
--    Não dá para resolver mudando o padrão do banco: o padrão vale para
--    tabela e view juntas, e as tabelas PRECISAM da escrita para o RLS
--    decidir quem grava.
--
-- 2. SUSPENDER TODAS AS CAMPANHAS TRAVAVA O ENVIO INTEIRO.
--    A primeira rodada fez o banco recusar lista de campanhas vazia (quase
--    sempre é leitura quebrada). Mas a planilha tem um jeito legítimo de
--    esvaziar: escrever "SUSPENSO" no título do bloco — como já está feito no
--    bloco do Gerente. Com Acessórios e Jogos suspensos, a lista saía vazia,
--    o envio era recusado, e daí em diante NENHUMA meta da loja chegava mais.
--    Agora o robô manda junto a lista das campanhas suspensas, e o banco
--    aceita a lista vazia quando ela vem com esse aviso.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O gatilho que fecha a escrita de toda view nova
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.travar_escrita_de_view()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $f$
DECLARE
  obj RECORD;
BEGIN
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE schema_name = 'public' AND object_type IN ('view', 'materialized view')
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON %s FROM PUBLIC, anon, authenticated',
      obj.object_identity
    );
    -- Como as outras vw_*: a condição do WHERE roda antes de qualquer função
    -- da consulta de quem pede.
    IF obj.object_type = 'view' THEN
      EXECUTE format('ALTER VIEW %s SET (security_barrier = true)', obj.object_identity);
    END IF;
  END LOOP;
END;
$f$;

-- Função de gatilho não é chamada por ninguém; fechada na marra (regra de 15/09).
REVOKE EXECUTE ON FUNCTION public.travar_escrita_de_view() FROM PUBLIC, anon, authenticated;

DROP EVENT TRIGGER IF EXISTS travar_escrita_de_view;
-- O REVOKE e o ALTER VIEW que a função roda não são "CREATE VIEW", então o
-- gatilho não dispara a si mesmo.
CREATE EVENT TRIGGER travar_escrita_de_view
  ON ddl_command_end
  WHEN TAG IN ('CREATE VIEW', 'CREATE MATERIALIZED VIEW')
  EXECUTE FUNCTION public.travar_escrita_de_view();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. aplicar_metas_da_planilha aceita "todas as campanhas suspensas"
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Lista vazia só é aceita quando a planilha diz, com todas as letras, que as
  -- campanhas estão SUSPENSAS (o título do bloco com "SUSPENSO", a mesma
  -- convenção que a planilha já usa para o Gerente). Sem esse sinal, lista
  -- vazia é leitura quebrada — e aplicar apagaria todas as campanhas.
  IF jsonb_array_length(p_payload->'campanhas') = 0
     AND (jsonb_typeof(p_payload->'campanhas_suspensas') IS DISTINCT FROM 'array'
          OR jsonb_array_length(p_payload->'campanhas_suspensas') = 0) THEN
    RAISE EXCEPTION 'A leitura da aba CAMPANHAS não achou nenhuma campanha. Nada foi alterado — confira se a aba mudou de nome ou se o cabeçalho "Faixa / Meta / Prêmio" dos blocos continua igual. (Para suspender todas as campanhas, escreva SUSPENSO no título de cada bloco.)';
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
    'campanhas_sem_grupo', to_jsonb(v_sem_grupo),
    'campanhas_suspensas', COALESCE(p_payload->'campanhas_suspensas', '[]'::jsonb)
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Conferência: cria uma view de teste e confere que ela nasceu fechada
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.vw_teste_da_trava AS SELECT 1 AS um;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.vw_teste_da_trava', 'INSERT')
     OR has_table_privilege('authenticated', 'public.vw_teste_da_trava', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.vw_teste_da_trava', 'DELETE')
     OR has_table_privilege('anon', 'public.vw_teste_da_trava', 'INSERT') THEN
    RAISE EXCEPTION 'O gatilho não fechou a escrita da view nova';
  END IF;

  IF has_function_privilege('authenticated', 'public.aplicar_metas_da_planilha(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'aplicar_metas_da_planilha ficou aberta para quem usa o sistema';
  END IF;
END $$;

DROP VIEW public.vw_teste_da_trava;
