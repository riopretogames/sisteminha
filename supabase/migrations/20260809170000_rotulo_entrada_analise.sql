-- =============================================================================
-- Sisteminha (RP System.IO) — "Aguardando análise" vira "Entrada / Análise"
-- =============================================================================
--
-- Pedido do Felipe em 09/08, olhando o quadro: a primeira etapa é onde o
-- aparelho ENTRA na loja, não só onde ele espera. "Aguardando" dava a impressão
-- de fila parada quando na verdade é o momento em que o check-in acontece.
--
-- Só o rótulo muda. A chave `aguardando_analise` continua igual, porque é dela
-- que dependem o código e as automações do n8n — trocar a chave quebraria o
-- fluxo do lado de fora, onde nenhum teste daqui alcança. É exatamente por isso
-- que o banco permite renomear etapa de sistema, mas não renomear a chave.
--
-- O UPDATE só age se o rótulo ainda for o padrão: se alguém já tiver
-- personalizado na tela, a escolha da loja vale mais.
-- =============================================================================

UPDATE public.os_status_config
   SET label = 'Entrada / Análise'
 WHERE key = 'aguardando_analise'
   AND label = 'Aguardando análise';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================
-- SELECT etapa, key, label FROM public.os_status_config
--  WHERE sistema ORDER BY etapa NULLS LAST;
-- =============================================================================
