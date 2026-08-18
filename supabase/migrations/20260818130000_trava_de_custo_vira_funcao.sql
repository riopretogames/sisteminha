-- =============================================================================
-- Sisteminha (RPG System.IO) — a trava de custo vira função reaplicável
-- =============================================================================
--
-- ACHADO NA REVISÃO DE 18/08: a trava de custo (Opção B) funciona revogando o
-- SELECT da tabela inteira e reconcedendo coluna a coluna, sem as protegidas.
-- Isso congela a lista de colunas no instante em que a migration roda —
-- qualquer coluna criada DEPOIS nasce sem permissão de leitura na tabela crua.
--
-- Conferido na API de produção antes de escrever: 7 colunas de `produtos`
-- estão nesse estado agora (`grupo_produto_id`, `marca_id`, `modelo_id`,
-- `cor_id`, `condicao_id`, `memoria_id`, `observacoes`) — todas criadas
-- depois da trava de 07/08.
--
-- Hoje não quebra nada, e é sorte de desenho: toda leitura de produto passa
-- por `vw_produtos`, que roda com privilégio de dono e enxerga tudo. Mas é
-- uma armadilha real e cara de diagnosticar: no dia em que alguém emendar um
-- `.select()` direto na tabela depois de um insert, o erro vai ser "permission
-- denied" — e todo mundo procura RLS primeiro, não GRANT de coluna. Já
-- aconteceu uma vez a trava cair inteira em silêncio (migration 20260809210000);
-- o modo de falha oposto é igualmente silencioso.
--
-- CORREÇÃO: em vez de mais um DO block de uso único, a lógica vira uma FUNÇÃO
-- que pode ser chamada de novo a qualquer momento. Toda migration que
-- adicionar coluna em `produtos`, `servicos`, `service_order_items` ou
-- `movimentos_estoque` termina com:
--
--     SELECT public.aplicar_trava_de_custo();
--
-- e a trava se reajusta sozinha, sem ninguém precisar lembrar quais são as
-- colunas protegidas nem reescrever a lista. A regra está registrada no
-- CLAUDE.md junto das outras regras de custo protegido.
--
-- A lista de colunas protegidas continua sendo a mesma desde 07/08 e vive
-- DENTRO da função — um lugar só, em vez de repetida em cada migration.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.aplicar_trava_de_custo()
RETURNS TEXT
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
    -- Guarda contra digitação errada: se uma coluna protegida não existir
    -- mais (renomeada, removida), é melhor falhar alto do que liberar em
    -- silêncio o custo pra todo mundo.
    SELECT string_agg(p.nome, ', ')
      INTO faltando
      FROM unnest(alvo.protegidas) AS p(nome)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name   = alvo.tabela
          AND c.column_name  = p.nome
     );

    IF faltando IS NOT NULL THEN
      RAISE EXCEPTION
        'Coluna protegida inexistente em public.%: %. Confira os nomes antes de aplicar.',
        alvo.tabela, faltando;
    END IF;

    -- A lista de liberadas é DESCOBERTA do catálogo, nunca digitada: é isso
    -- que faz coluna nova ser coberta automaticamente na próxima chamada.
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
      INTO cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = alvo.tabela
       AND NOT (c.column_name = ANY (alvo.protegidas));

    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated, anon', alvo.tabela);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated, anon', cols, alvo.tabela);

    relato := relato || format(
      '%s: %s colunas liberadas, protegidas [%s]; ',
      alvo.tabela,
      array_length(string_to_array(cols, ', '), 1),
      array_to_string(alvo.protegidas, ', ')
    );
  END LOOP;

  RETURN relato;
END;
$$;

COMMENT ON FUNCTION public.aplicar_trava_de_custo() IS
  'Reaplica a trava de custo (Opção B) nas 4 tabelas protegidas: revoga SELECT da tabela e reconcede coluna a coluna, sem as de custo. A lista de liberadas é descoberta do catálogo, então coluna nova é coberta automaticamente. CHAME ESTA FUNÇÃO no fim de toda migration que adicionar coluna em produtos, servicos, service_order_items ou movimentos_estoque.';

-- Só o dono chama. Não faz sentido expor pela API, e deixar exposta uma
-- função SECURITY DEFINER que mexe em GRANT seria abrir uma porta à toa.
REVOKE ALL ON FUNCTION public.aplicar_trava_de_custo() FROM PUBLIC, authenticated, anon;

-- Aplica agora: cobre as 7 colunas de `produtos` que ficaram de fora.
SELECT public.aplicar_trava_de_custo();

NOTIFY pgrst, 'reload schema';
