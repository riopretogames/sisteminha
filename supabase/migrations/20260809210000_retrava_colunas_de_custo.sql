-- =============================================================================
-- Sisteminha (RP System.IO) — Opção B, re-aplicação: a trava tinha caído
-- =============================================================================
--
-- ACHADO NA RETOMADA DE 09/08 (revisão feita depois de sincronizar um
-- worktree que estava 3 dias desatualizado): consultando
-- information_schema.column_privileges direto em produção, `authenticated` E
-- `anon` estavam de volta com SELECT nas 6 colunas de custo que a migration
-- 20260808140000 tinha trancado — exatamente o vazamento que a Opção B foi
-- desenhada pra fechar.
--
-- CAUSA MAIS PROVÁVEL: o Lovable só foi desconectado do projeto em 08/08
-- 22:37 (commit 804a761) — mais de um dia DEPOIS da trava original (07/08
-- 10:39). Um rebuild automático da plataforma nesse intervalo provavelmente
-- restaurou os GRANTs padrão dela. É o risco que a própria migration
-- 20260808140000 já tinha registrado ("um GRANT ALL... desfaz a tranca em
-- silêncio") — só que ele não era mais hipotético, já tinha acontecido.
--
-- Esta migration reaplica a MESMA lógica da 20260808140000 (revogar SELECT
-- na tabela inteira, reconceder coluna a coluna sem as protegidas — lista
-- descoberta de information_schema, não digitada, pelo mesmo motivo de
-- antes: coluna nova não pode nascer invisível). Não escrevo por cima da
-- migration antiga porque ela já foi aplicada e é histórico — o conserto
-- entra como uma nova migration, do jeito que o resto do projeto já faz
-- quando corrige algo depois do fato (ex.: 20260807020000).
--
-- Conferido antes de escrever esta migration: nenhuma coluna de custo nova
-- apareceu desde 07/08 (só as mesmas 6, nas mesmas 4 tabelas — devolucoes/
-- devolucao_itens não guardam custo direto). A lista abaixo é a mesma de
-- 20260808140000, sem adição.
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

    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated, anon', alvo.tabela);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated, anon', cols, alvo.tabela);

    RAISE NOTICE 'public.% : % colunas liberadas, protegidas: %',
      alvo.tabela,
      array_length(string_to_array(cols, ', '), 1),
      array_to_string(alvo.protegidas, ', ');
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
