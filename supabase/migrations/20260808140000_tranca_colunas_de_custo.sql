-- =============================================================================
-- Sisteminha (RP System.IO) — Opção B, Parte 2: a tranca
-- =============================================================================
--
-- ESTA É A MIGRATION QUE DE FATO FECHA O VAZAMENTO.
--
-- As views das migrations 20260808110000 e 20260808130000 criaram o caminho
-- certo de leitura, mas não trancaram nada: a tabela original continuava
-- acessível, e quem consultasse a API pedindo `produtos` em vez de
-- `vw_produtos` recebia o custo do mesmo jeito.
--
-- A tranca é privilégio por COLUNA. RLS não sabe filtrar coluna — mas o
-- Postgres sabe, desde sempre, via GRANT. O detalhe é que privilégio de
-- tabela cobre todas as colunas: não dá pra "revogar uma coluna" de quem tem
-- SELECT na tabela inteira. Tem que revogar a tabela e reconceder coluna a
-- coluna, sem as protegidas. É o que o bloco abaixo faz.
--
-- POR QUE A LISTA DE COLUNAS É DESCOBERTA E NÃO DIGITADA: uma lista fixa
-- envelhece. Bastaria alguém adicionar uma coluna em `produtos` amanhã pra
-- ela nascer invisível para o sistema inteiro, com erro difícil de rastrear
-- ("por que esse campo novo não aparece?"). Lendo de information_schema, toda
-- coluna que existir no momento da aplicação entra — menos as protegidas,
-- que estão nomeadas explicitamente.
--
-- ORDEM IMPORTA: só aplicar DEPOIS que todas as telas de leitura estiverem
-- nas views. Estão, desde os commits 18fc421 (produtos/serviços/itens de OS)
-- e o desta rodada (movimentos de estoque). A partir daqui, `SELECT *` nessas
-- 4 tabelas passa a dar erro de permissão — é esse o objetivo.
--
-- O QUE **NÃO** MUDA:
--   - Escrita. Só SELECT é revogado. INSERT e UPDATE de custo continuam
--     funcionando (Estoque > cadastro de produto grava custo normalmente).
--   - Gatilhos e RPCs. Todos são SECURITY DEFINER, rodam com privilégio do
--     dono: baixa de estoque na venda, estorno de cancelamento, baixa por
--     peça em OS, ajuste manual — nenhum passa por esta trava.
--   - As views. Rodam com privilégio do dono pelo mesmo motivo.
--   - `service_role`. Não é tocado; a chave de serviço continua vendo tudo.
--   - `margem_percent`, que é coluna gerada a partir de `custo`: o Postgres
--     calcula com privilégio de sistema, não do usuário.
-- =============================================================================

DO $$
DECLARE
  alvo  RECORD;
  cols  TEXT;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('produtos',            ARRAY['custo', 'margem_percent']),
      ('servicos',            ARRAY['custo_estimado']),
      ('service_order_items', ARRAY['custo_unitario']),
      ('movimentos_estoque',  ARRAY['custo_unitario', 'valor_total'])
    ) AS t(tabela, protegidas)
  LOOP
    -- Confere que as colunas protegidas existem mesmo. Um erro de digitação
    -- aqui passaria silencioso e deixaria a coluna aberta — que é justamente
    -- o problema que esta migration existe pra resolver.
    PERFORM 1
    FROM unnest(alvo.protegidas) AS p(nome)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = alvo.tabela
        AND c.column_name = p.nome
    );
    IF FOUND THEN
      RAISE EXCEPTION
        'Coluna protegida inexistente em public.%. Confira os nomes antes de aplicar.',
        alvo.tabela;
    END IF;

    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
      INTO cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = alvo.tabela
       AND NOT (c.column_name = ANY (alvo.protegidas));

    -- `anon` recebe o mesmo tratamento de propósito. A RLS já devolve vazio
    -- pra quem não está logado, então na prática nada muda — mas deixar
    -- privilégio sobrando numa coluna sensível é dívida esperando acontecer.
    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated, anon', alvo.tabela);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated, anon', cols, alvo.tabela);

    RAISE NOTICE 'public.% : % colunas liberadas, protegidas: %',
      alvo.tabela,
      array_length(string_to_array(cols, ', '), 1),
      array_to_string(alvo.protegidas, ', ');
  END LOOP;
END $$;


-- =============================================================================
-- DOCUMENTAÇÃO NO PRÓPRIO BANCO
-- =============================================================================
-- Quem for mexer nessas colunas daqui a seis meses precisa descobrir a regra
-- sem depender de achar o arquivo certo no repositório.

COMMENT ON COLUMN public.produtos.custo IS
  'PROTEGIDA: authenticated NÃO tem SELECT nesta coluna. Leitura só por public.vw_produtos, que devolve o valor apenas para quem tem inventory.cost.view. Escrita continua normal.';
COMMENT ON COLUMN public.produtos.margem_percent IS
  'PROTEGIDA (coluna gerada a partir de custo): leitura só por public.vw_produtos.';
COMMENT ON COLUMN public.servicos.custo_estimado IS
  'PROTEGIDA: leitura só por public.vw_servicos, gateada por inventory.cost.view.';
COMMENT ON COLUMN public.service_order_items.custo_unitario IS
  'PROTEGIDA: leitura só por public.vw_os_itens, gateada por inventory.cost.view.';
COMMENT ON COLUMN public.movimentos_estoque.custo_unitario IS
  'PROTEGIDA: leitura só por public.vw_movimentos_estoque, gateada por inventory.cost.view.';
COMMENT ON COLUMN public.movimentos_estoque.valor_total IS
  'PROTEGIDA: leitura só por public.vw_movimentos_estoque, gateada por inventory.cost.view.';


-- PostgREST guarda o desenho do banco em cache. Sem isso, ele continuaria
-- oferecendo as colunas antigas até reiniciar sozinho.
NOTIFY pgrst, 'reload schema';
