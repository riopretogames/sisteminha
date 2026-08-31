-- =============================================================================
-- "APROVADO / EXECUTAR" FICA VERDE
-- =============================================================================
--
-- Pedido do Felipe em 30/08, olhando o quadro: *"deixar essa categoria verde
-- em vez de azul"*.
--
-- Faz sentido para além do gosto. A paleta deste sistema (ver src/lib/acoes.ts)
-- usa âmbar para "parado esperando alguém" e verde para "andou bem" — e é
-- exatamente isso que a aprovação do cliente é: o momento em que a OS deixa de
-- esperar e vira trabalho liberado. Azul dizia "andando", que era verdade pela
-- metade.
--
-- Verde-600, o "Verde" da paleta de src/lib/cores.ts. Diferente do esmeralda
-- de "Entregue" de propósito: são dois momentos bons, mas não são o mesmo.
--
-- Como a cor é escolha da loja, esta migration só mexe em quem ainda está com
-- a cor de fábrica — quem já tinha escolhido outra fica como está.

UPDATE public.os_status_config
   SET color = 'bg-green-600 text-white'
 WHERE key = 'aprovado'
   AND color IN (
     'bg-blue-500/10 text-blue-600',  -- a cor semeada em 09/08
     'bg-blue-500 text-white'         -- a versão sólida, depois da troca de 23/08
   );
