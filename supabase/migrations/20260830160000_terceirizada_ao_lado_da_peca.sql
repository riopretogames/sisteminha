-- =============================================================================
-- TERCEIRIZADA VAI PARA O MEIO DO QUADRO, AO LADO DE "AGUARDANDO PEÇA"
-- =============================================================================
--
-- Pedido do Felipe em 30/08, logo depois de ver a etapa no lugar em que ele
-- mesmo tinha numerado: *"muda a terceirizada pro meio, do lado da aguardando
-- peça"*.
--
-- E é o lugar certo. As duas contam a mesma história: o aparelho está parado
-- porque depende de alguém de fora — numa, a peça que não chegou; na outra, a
-- empresa que está fazendo o serviço. Nenhuma das duas é "depois de entregue",
-- que era onde a numeração 6 tinha colocado ela.
--
-- -----------------------------------------------------------------------------
-- A ORDEM É CALCULADA, NÃO DIGITADA
-- -----------------------------------------------------------------------------
-- "Aguardando peça" nasceu com ordem 35, mas a loja pode ter arrastado as
-- colunas desde então (Gerenciar Status deixa). Escrever 36 na mão daria certo
-- hoje e erraria em qualquer loja que tenha reordenado o quadro — inclusive nas
-- que comprarem o sisteminha depois.
--
-- Então a ordem vem de onde a peça está AGORA, loja por loja. Sem a etapa da
-- peça (loja que a apagou), fica logo depois de "Aprovado", que é o outro
-- vizinho natural: é de lá que o aparelho sai para a empresa de fora.

UPDATE public.os_status_config AS t
   SET ordem = COALESCE(
         (SELECT p.ordem + 1
            FROM public.os_status_config p
           WHERE p.tenant_id = t.tenant_id
             AND p.key = 'aguardando_peca'),
         (SELECT a.ordem + 1
            FROM public.os_status_config a
           WHERE a.tenant_id = t.tenant_id
             AND a.key = 'aprovado'),
         35
       )
 WHERE t.key = 'terceirizada';

-- -----------------------------------------------------------------------------
-- E O NÚMERO ACOMPANHA: 6 VIRA 2c
-- -----------------------------------------------------------------------------
-- Com a coluna no meio do quadro, "6" apareceria entre o 2b e o 3 — numeração
-- fora de ordem é pior que numeração nenhuma, porque quem lê para de confiar
-- nela.
--
-- "2c" diz a coisa certa: é a terceira forma de o aparelho ficar parado
-- esperando alguém de fora, junto com o cliente que não respondeu (2a) e a peça
-- que não chegou (2b). Se o Felipe preferir outro número, muda em Gerenciar
-- Status sem migration nenhuma.

UPDATE public.os_status_config
   SET numero = '2c'
 WHERE key = 'terceirizada'
   AND numero = '6';
