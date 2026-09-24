-- =============================================================================
-- As metas passam a vir da planilha "Metas RPG 2026" — e só dela
-- =============================================================================
--
-- Pedido do Felipe em 23/09/2026: *"sempre copiar os dados dessa planilha; se
-- alterar os dados da planilha, alterar os dados aí no sistema"*. A planilha é
-- a fonte das metas desde esse dia (a aba COMO USAR dela diz isso com todas as
-- letras), então o sistema vira ESPELHO: ninguém cadastra meta pela tela, a
-- planilha manda os números e o banco só guarda.
--
-- Ler a planilha mostrou que o que foi construído em 22/09 não seguia a regra
-- da loja em três pontos, e esta migration corrige os três:
--
--   1. A META INDIVIDUAL NÃO É DIGITADA, é conta: meta da loja ÷ número de
--      vendedores do mês, nas quatro faixas. A tabela `metas_vendedor` de 22/09
--      guardava um valor livre por pessoa — isso não existe na loja. Ela fica
--      sem uso (apagar tabela exige o OK do Felipe, pedido em 23/09).
--   2. CADA MÊS TEM O SEU DIVISOR E A SUA APURAÇÃO: janeiro a julho/2026 foram
--      apurados em 4 períodos semanais; de agosto em diante, por quinzena. Isso
--      mora na nova `metas_mes`.
--   3. EXISTEM AS CAMPANHAS — Acessórios e Jogos, por quinzena e por vendedor,
--      com meta e prêmio fixos por faixa. Moram na nova `metas_campanha`,
--      ligadas ao Grupo de Produto que o painel usa para somar as vendas.
--
-- E um defeito que a comparação revelou: setembro a dezembro estavam com as
-- metas antigas de agosto no banco (setembro: R$ 95.000 no sistema contra
-- R$ 108.000 na planilha). A primeira sincronização corrige.
--
-- COMO OS NÚMEROS CHEGAM
--
-- Um robô (Apps Script) dentro da própria planilha lê as abas a cada edição e
-- chama a peça do servidor `sincronizar-metas`, que confere um código de acesso
-- e chama `aplicar_metas_da_planilha` abaixo. Essa função é a ÚNICA porta de
-- gravação das metas: as policies de gravação que existiam desde 22/09 caem,
-- para que ninguém consiga criar pela API uma meta que a planilha não tem — ela
-- seria apagada na próxima sincronização e deixaria o painel mentindo até lá.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A configuração de cada mês
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.metas_mes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ano                      INTEGER NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  mes                      INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- Quantas pessoas dividem a meta da loja. Zero é válido (mês sem vendedor)
  -- e o painel mostra "sem divisão" em vez de dividir por zero.
  vendedores               INTEGER NOT NULL CHECK (vendedores BETWEEN 0 AND 50),
  apuracao                 TEXT NOT NULL CHECK (apuracao IN ('quinzenal', 'quatro_periodos')),
  -- Referência histórica da planilha ("Ano passado"). Não entra em conta
  -- nenhuma, e é faturamento da loja: só quem cadastra meta enxerga — ver a
  -- view `vw_metas_mes` logo abaixo.
  faturamento_ano_passado  DECIMAL(12,2) CHECK (faturamento_ano_passado >= 0),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ano, mes)
);

COMMENT ON TABLE public.metas_mes IS
  'Por mês: quantos vendedores dividem a meta da loja e se a apuração é quinzenal ou em 4 períodos. Espelho da aba METAS DA LOJA da planilha Metas RPG; gravada só por aplicar_metas_da_planilha.';

CREATE TRIGGER update_metas_mes_updated_at
  BEFORE UPDATE ON public.metas_mes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.metas_mes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver configuracao de meta do mes"
  ON public.metas_mes FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'dashboards.goals.view')
      OR public.has_permission(auth.uid(), 'dashboards.goals.manage')
    )
  );

-- Leitura coluna a coluna, sem o faturamento do ano passado. Mesma técnica da
-- trava de custo: a coluna sensível não tem SELECT na tabela crua, e quem pode
-- vê-la lê pela view.
REVOKE ALL ON public.metas_mes FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, tenant_id, ano, mes, vendedores, apuracao, created_at, updated_at)
  ON public.metas_mes TO authenticated;

-- A view segue o desenho das outras `vw_*` (Opção B): roda com o poder do dono,
-- filtra a loja por get_user_tenant_id e esconde a coluna sensível por
-- has_permission. É por ela que TODA tela lê a configuração do mês.
CREATE VIEW public.vw_metas_mes AS
  SELECT
    m.id,
    m.tenant_id,
    m.ano,
    m.mes,
    m.vendedores,
    m.apuracao,
    CASE
      WHEN public.has_permission(auth.uid(), 'dashboards.goals.manage')
        THEN m.faturamento_ano_passado
      ELSE NULL
    END AS faturamento_ano_passado,
    m.created_at,
    m.updated_at
  FROM public.metas_mes m
  WHERE m.tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'dashboards.goals.view')
      OR public.has_permission(auth.uid(), 'dashboards.goals.manage')
    );

REVOKE ALL ON public.vw_metas_mes FROM PUBLIC, anon;
GRANT SELECT ON public.vw_metas_mes TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. As campanhas (Acessórios, Jogos…)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.metas_campanha (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Identificador estável vindo do título do bloco na planilha
  -- ("🎧 ACESSÓRIOS" → acessorios). É por ele que a sincronização sabe que é a
  -- mesma campanha de antes.
  chave             TEXT NOT NULL CHECK (chave ~ '^[a-z0-9_]{2,40}$'),
  nome              TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 80),
  -- Qual Grupo de Produto soma as vendas desta campanha. Achado pelo nome na
  -- sincronização; NULO quando a loja ainda não tem um grupo com esse nome — o
  -- painel avisa em vez de somar zero calado.
  grupo_produto_id  UUID REFERENCES public.catalogos(id) ON DELETE SET NULL
                    CHECK (grupo_produto_id IS NULL
                           OR public.catalogo_e_do_tipo(grupo_produto_id, 'grupo_produto')),
  periodicidade     TEXT NOT NULL CHECK (periodicidade IN ('quinzenal', 'mensal')),
  faixa             public.faixa_premiacao NOT NULL,
  -- Meta POR VENDEDOR, no período da campanha (a planilha já traz assim).
  meta              DECIMAL(12,2) NOT NULL CHECK (meta >= 0),
  premio            DECIMAL(12,2) NOT NULL CHECK (premio >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, chave, faixa)
);

COMMENT ON TABLE public.metas_campanha IS
  'Campanhas extras por vendedor (Acessórios, Jogos…), uma linha por faixa. Espelho da aba CAMPANHAS da planilha Metas RPG; gravada só por aplicar_metas_da_planilha.';

CREATE TRIGGER update_metas_campanha_updated_at
  BEFORE UPDATE ON public.metas_campanha
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.metas_campanha ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver campanhas de meta da loja"
  ON public.metas_campanha FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'dashboards.goals.view')
      OR public.has_permission(auth.uid(), 'dashboards.goals.manage')
    )
  );

REVOKE ALL ON public.metas_campanha FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.metas_campanha TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O registro das sincronizações
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Toda chegada da planilha deixa uma linha aqui, deu certo ou não. É o que a
-- tela de Cadastros > Metas usa para dizer "última atualização da planilha:
-- hoje, 14:32" — e, quando falha, o motivo em português.

CREATE TABLE public.metas_sincronizacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recebido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  planilha_id     TEXT CHECK (length(planilha_id) <= 200),
  planilha_nome   TEXT CHECK (length(planilha_nome) <= 200),
  planilha_url    TEXT CHECK (length(planilha_url) <= 500),
  enviado_por     TEXT CHECK (length(enviado_por) <= 200),
  ano             INTEGER,
  sucesso         BOOLEAN NOT NULL,
  resumo          JSONB,
  erro            TEXT CHECK (length(erro) <= 2000)
);

CREATE INDEX idx_metas_sincronizacoes_recentes
  ON public.metas_sincronizacoes (tenant_id, recebido_em DESC);

ALTER TABLE public.metas_sincronizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver sincronizacoes de metas"
  ON public.metas_sincronizacoes FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'dashboards.goals.manage')
  );

REVOKE ALL ON public.metas_sincronizacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.metas_sincronizacoes TO authenticated;
-- A peça do servidor grava a linha de FALHA direto (a de sucesso sai de dentro
-- de aplicar_metas_da_planilha). Concedido explicitamente: a migration de 14/09
-- mexeu nos privilégios padrão, e não dá para contar com eles.
GRANT SELECT, INSERT ON public.metas_sincronizacoes TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A planilha é o único lugar que escreve meta
-- ─────────────────────────────────────────────────────────────────────────────
--
-- As policies de gravação de 22/09 caem. Não é apagar dado — é tirar a porta
-- de escrita pela tela, que agora concorreria com a planilha.

DROP POLICY IF EXISTS "Cadastrar meta da loja" ON public.metas_faturamento;
DROP POLICY IF EXISTS "Alterar meta da loja"   ON public.metas_faturamento;
DROP POLICY IF EXISTS "Apagar meta da loja"    ON public.metas_faturamento;
REVOKE INSERT, UPDATE, DELETE ON public.metas_faturamento FROM PUBLIC, anon, authenticated;

-- `metas_vendedor` (22/09) guardava a "meta individual digitada", que não é
-- regra da loja. Ela fica, vazia e só de leitura, até o Felipe confirmar que
-- pode ser apagada — apagar tabela é migration destrutiva.
DROP POLICY IF EXISTS "Cadastrar meta de vendedor" ON public.metas_vendedor;
DROP POLICY IF EXISTS "Alterar meta de vendedor"   ON public.metas_vendedor;
DROP POLICY IF EXISTS "Apagar meta de vendedor"    ON public.metas_vendedor;
REVOKE INSERT, UPDATE, DELETE ON public.metas_vendedor FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.metas_vendedor IS
  'SEM USO desde 23/09/2026: a meta individual é a meta da loja ÷ vendedores (metas_mes), não um valor digitado. Aguardando OK do Felipe para ser apagada.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A função que aplica o que a planilha mandou
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Recebe o conteúdo da planilha já organizado (a peça do servidor
-- `sincronizar-metas` monta o pedido) e aplica TUDO numa transação só: ou a
-- planilha inteira entra, ou nada muda. Meia sincronização deixaria o painel
-- com outubro novo e novembro velho, sem ninguém saber.
--
-- Confere de novo tudo o que chega, mesmo a peça do servidor já tendo
-- conferido: este é o último lugar antes do dado virar meta de prêmio.
--
-- Só a peça do servidor (papel service_role) pode chamar. Ninguém logado no
-- sistema consegue — ver o REVOKE no fim.

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

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'O pedido chegou vazio ou fora do formato.';
  END IF;

  -- ── O ano ──────────────────────────────────────────────────────────────────
  BEGIN
    v_ano := (p_payload->>'ano')::INTEGER;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'O ano da planilha não é um número.';
  END;
  IF v_ano IS NULL OR v_ano NOT BETWEEN 2020 AND 2100 THEN
    RAISE EXCEPTION 'O ano da planilha (%) está fora do esperado.', p_payload->>'ano';
  END IF;

  -- ── Os 12 meses ────────────────────────────────────────────────────────────
  -- Exige os doze: a planilha sempre tem os doze, e um pedido com menos é sinal
  -- de leitura quebrada — aplicar pela metade apagaria meses bons.
  IF jsonb_typeof(p_payload->'meses') <> 'array' OR jsonb_array_length(p_payload->'meses') <> 12 THEN
    RAISE EXCEPTION 'A planilha precisa trazer os 12 meses; chegaram %.',
      COALESCE(jsonb_array_length(p_payload->'meses')::TEXT, 'nenhum');
  END IF;

  FOR v_mes IN SELECT * FROM jsonb_array_elements(p_payload->'meses') LOOP
    BEGIN
      v_num_mes := (v_mes->>'mes')::INTEGER;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Um dos meses veio sem número.';
    END;
    IF v_num_mes IS NULL OR v_num_mes NOT BETWEEN 1 AND 12 THEN
      RAISE EXCEPTION 'Mês inválido na planilha: %.', v_mes->>'mes';
    END IF;
    IF v_num_mes = ANY (v_meses_vistos) THEN
      RAISE EXCEPTION 'O mês de % aparece duas vezes na planilha.', v_nomes_mes[v_num_mes];
    END IF;
    v_meses_vistos := v_meses_vistos || v_num_mes;

    BEGIN
      v_vendedores := (v_mes->>'vendedores')::INTEGER;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Em %, o número de vendedores não é um número inteiro.', v_nomes_mes[v_num_mes];
    END;
    IF v_vendedores IS NULL OR v_vendedores NOT BETWEEN 0 AND 50 THEN
      RAISE EXCEPTION 'Em %, o número de vendedores (%) está fora do esperado.',
        v_nomes_mes[v_num_mes], v_mes->>'vendedores';
    END IF;

    v_apuracao := v_mes->>'apuracao';
    IF v_apuracao IS NULL OR v_apuracao NOT IN ('quinzenal', 'quatro_periodos') THEN
      RAISE EXCEPTION 'Em %, a apuração precisa ser "Quinzenal" ou "4 períodos".', v_nomes_mes[v_num_mes];
    END IF;

    v_ano_passado := NULL;
    IF v_mes ? 'ano_passado' AND jsonb_typeof(v_mes->'ano_passado') = 'number' THEN
      v_ano_passado := (v_mes->>'ano_passado')::NUMERIC;
      IF v_ano_passado < 0 THEN v_ano_passado := NULL; END IF;
    END IF;

    INSERT INTO public.metas_mes (tenant_id, ano, mes, vendedores, apuracao, faturamento_ano_passado)
    VALUES (p_tenant, v_ano, v_num_mes, v_vendedores, v_apuracao, v_ano_passado)
    ON CONFLICT (tenant_id, ano, mes) DO UPDATE
      SET vendedores = EXCLUDED.vendedores,
          apuracao = EXCLUDED.apuracao,
          faturamento_ano_passado = EXCLUDED.faturamento_ano_passado;

    -- As quatro faixas, em ordem. Faixa em branco = não vale neste mês (apaga).
    -- Faixa fora de ordem (Prata menor que Bronze) quase sempre é dedo
    -- escorregado, e vira prêmio errado: recusa com o mês e a faixa no aviso.
    v_anterior := NULL;
    FOREACH v_faixa IN ARRAY ARRAY['bronze','prata','ouro','diamante'] LOOP
      IF v_mes ? v_faixa AND jsonb_typeof(v_mes->v_faixa) = 'number' THEN
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
      ELSIF v_mes ? v_faixa AND jsonb_typeof(v_mes->v_faixa) NOT IN ('null') THEN
        RAISE EXCEPTION 'Em %, a faixa % não é um valor em reais.', v_nomes_mes[v_num_mes], initcap(v_faixa);
      ELSE
        DELETE FROM public.metas_faturamento
        WHERE tenant_id = p_tenant AND ano = v_ano AND mes = v_num_mes
          AND faixa = v_faixa::public.faixa_premiacao;
        IF FOUND THEN v_apagadas := v_apagadas + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- ── As campanhas ───────────────────────────────────────────────────────────
  IF p_payload ? 'campanhas' THEN
    IF jsonb_typeof(p_payload->'campanhas') <> 'array' THEN
      RAISE EXCEPTION 'As campanhas chegaram fora do formato.';
    END IF;

    FOR v_camp IN SELECT * FROM jsonb_array_elements(p_payload->'campanhas') LOOP
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

      -- O grupo de produto é achado pelo NOME, sem acento, sem plural e sem
      -- maiúscula: "ACESSÓRIOS" na planilha acha "Acessório" no cadastro.
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

      IF jsonb_typeof(v_camp->'faixas') <> 'array' OR jsonb_array_length(v_camp->'faixas') = 0 THEN
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

        IF jsonb_typeof(v_camp_faixa->'meta') <> 'number' OR (v_camp_faixa->>'meta')::NUMERIC < 0
           OR jsonb_typeof(v_camp_faixa->'premio') <> 'number' OR (v_camp_faixa->>'premio')::NUMERIC < 0 THEN
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

      -- Faixa que saiu da planilha sai do sistema.
      DELETE FROM public.metas_campanha
      WHERE tenant_id = p_tenant AND chave = v_chave
        AND NOT (faixa::TEXT = ANY (v_faixas_camp));
    END LOOP;

    -- Campanha que saiu da planilha sai do sistema.
    DELETE FROM public.metas_campanha
    WHERE tenant_id = p_tenant AND NOT (chave = ANY (v_chaves));
  END IF;

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

COMMENT ON FUNCTION public.aplicar_metas_da_planilha(UUID, JSONB) IS
  'Única porta de gravação das metas. Aplica o conteúdo da planilha Metas RPG numa transação só. Chamada apenas pela peça do servidor sincronizar-metas (service_role).';

-- Fechada na marra (lição de 15/09: ALTER DEFAULT PRIVILEGES não fecha função
-- nova criada pelo CLI). Só a peça do servidor chama.
REVOKE EXECUTE ON FUNCTION public.aplicar_metas_da_planilha(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_metas_da_planilha(UUID, JSONB) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Quem entra na apuração individual
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Regra da planilha: a meta individual vale para quem tem o perfil VENDEDOR.
-- O gerente não conta no divisor nem entra em apuração nenhuma — mas as vendas
-- dele contam no faturamento da loja.
--
-- É função (e não leitura direta) porque ler o perfil dos outros exige
-- permissão de gerenciar usuários; sem ela, um vendedor abriria o painel de
-- metas sem ninguém na tabela, nem ele mesmo.

CREATE OR REPLACE FUNCTION public.pessoas_da_apuracao()
RETURNS TABLE (id UUID, nome TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome
  FROM public.profiles p
  WHERE p.tenant_id = public.get_user_tenant_id(auth.uid())
    AND p.ativo
    AND p.arquivado_em IS NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role = 'vendedor'
    )
    AND (
      public.has_permission(auth.uid(), 'dashboards.goals.view')
      OR public.has_permission(auth.uid(), 'dashboards.goals.manage')
    )
  ORDER BY p.nome;
$$;

REVOKE EXECUTE ON FUNCTION public.pessoas_da_apuracao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pessoas_da_apuracao() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Conferência — a migration derruba a si mesma se algo saiu torto
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Policy sem `TO authenticated` vale para `public`, que inclui quem não fez
  -- login.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('metas_mes', 'metas_campanha', 'metas_sincronizacoes',
                        'metas_faturamento', 'metas_vendedor')
      AND roles::TEXT NOT LIKE '%authenticated%'
  ) THEN
    RAISE EXCEPTION 'Policy de meta aberta para quem não fez login';
  END IF;

  -- A planilha é a única porta de escrita: nenhuma policy de gravação pode
  -- ter sobrado nas tabelas de meta.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('metas_mes', 'metas_campanha', 'metas_sincronizacoes',
                        'metas_faturamento', 'metas_vendedor')
      AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Sobrou porta de gravação de meta fora da planilha';
  END IF;

  -- Ninguém logado (nem de fora) pode chamar a função que grava meta.
  IF has_function_privilege('authenticated', 'public.aplicar_metas_da_planilha(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.aplicar_metas_da_planilha(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'aplicar_metas_da_planilha ficou aberta para quem usa o sistema';
  END IF;

  IF has_function_privilege('anon', 'public.pessoas_da_apuracao()', 'EXECUTE') THEN
    RAISE EXCEPTION 'pessoas_da_apuracao ficou aberta para quem não fez login';
  END IF;

  -- O faturamento do ano passado não pode ser lido na tabela crua.
  IF has_column_privilege('authenticated', 'public.metas_mes', 'faturamento_ano_passado', 'SELECT') THEN
    RAISE EXCEPTION 'O faturamento do ano passado ficou legível para qualquer um';
  END IF;
END $$;
