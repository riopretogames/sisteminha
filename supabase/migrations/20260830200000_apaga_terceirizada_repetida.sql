-- =============================================================================
-- APAGA A TERCEIRIZADA REPETIDA — DE VEZ
-- =============================================================================
--
-- Autorizado pelo Felipe em 30/08: *"apaga a terceirizada repetida de vez"*.
-- A migration anterior só desativou (some do quadro, fica no banco); ele pediu
-- para sumir.
--
-- -----------------------------------------------------------------------------
-- O QUE PROTEGE ESTE DELETE
-- -----------------------------------------------------------------------------
-- Apagar uma etapa é diferente de apagar um cadastro qualquer: o status de uma
-- OS é TEXTO apontando para a chave da etapa, sem chave estrangeira. Se a
-- etapa some e alguma OS ainda aponta para ela, a OS não é apagada junto — ela
-- fica com um status que não existe no cadastro. O quadro trata esse caso (a
-- OS cai numa coluna vermelha de "sem etapa válida", em vez de sumir), mas é
-- um estrago que ninguém pediu.
--
-- Por isso o DELETE só acontece se as TRÊS coisas forem verdade:
--
--   1. a etapa está desativada (é a repetida, não a que está em uso);
--   2. nenhuma OS está nela agora;
--   3. nenhuma OS PASSOU por ela — `service_order_history` guarda a linha do
--      tempo de cada OS, e apagar a etapa deixaria "mudou para —" no histórico
--      de quem já esteve ali.
--
-- Se qualquer uma falhar, a linha simplesmente não é apagada: continua
-- desativada, fora do quadro, e nada quebra. Migration destrutiva que não tem
-- certeza não apaga.

DELETE FROM public.os_status_config c
 WHERE NOT c.ativo
   AND lower(c.label) LIKE 'terceiriz%'
   -- Nunca uma etapa de sistema: o banco recusaria de qualquer jeito
   -- (gatilho da migration 20260809130000), mas deixar explícito evita que
   -- alguém leia este DELETE e ache que ele pode alcançá-las.
   AND COALESCE(c.sistema, false) = false
   AND NOT EXISTS (
     SELECT 1 FROM public.service_orders s
      WHERE s.tenant_id = c.tenant_id
        AND s.status = c.key
   )
   AND NOT EXISTS (
     SELECT 1
       FROM public.service_order_history h
       JOIN public.service_orders s ON s.id = h.os_id
      WHERE s.tenant_id = c.tenant_id
        AND (h.status_novo = c.key OR h.status_anterior = c.key)
   );
