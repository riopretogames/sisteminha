-- =============================================================================
-- CONSERTA A NUMERAÇÃO DAS ETAPAS E A TERCEIRIZADA REPETIDA
-- =============================================================================
--
-- Três coisas que o Felipe viu no quadro em 30/08, e as três são erro meu:
--
--   1. "O Aguardando Peça ficou sem o 2b na frente."
--   2. "Tem duas terceirizadas: 2c e sem numeração."
--   3. A numeração final que ele quer: Terceirizada 4, Finalizado 5,
--      Entregue 6 — sem mudar o significado de nada.
--
-- -----------------------------------------------------------------------------
-- O ERRO DE RAIZ: EU NUMEREI POR CHAVE, SEM PODER OLHAR O BANCO
-- -----------------------------------------------------------------------------
-- A migration de numeração escreveu `WHERE key = 'aguardando_peca'`, e essa
-- linha não pegou. Também criei `terceirizada` sem saber que a loja já tinha
-- uma etapa parecida — a política de segurança esconde a tabela de quem não
-- está logado, e eu não tenho login: apliquei no escuro e conferi só no papel.
--
-- Por isso esta migration procura pelo NOME que aparece na tela, e não pela
-- chave interna. É o único jeito de acertar sem enxergar os dados: o nome é o
-- que o Felipe leu no print, a chave é invenção de quem criou a etapa.

-- -----------------------------------------------------------------------------
-- 1. A TERCEIRIZADA REPETIDA
-- -----------------------------------------------------------------------------
-- Fica UMA por loja. Escolha, nesta ordem:
--
--   a) a que tem OS dentro — mexer nessa apagaria trabalho de verdade;
--   b) empate em zero: a mais antiga, que é a que a loja criou antes de mim.
--
-- As outras são DESATIVADAS, não apagadas. Somem do quadro e das listas de
-- escolha, mas continuam existindo para o histórico: uma OS pode ter passado
-- por ali, e apagar reescreveria o passado. Se o Felipe quiser sumir de vez,
-- é um comando a mais — mas isso apaga linha do banco, e apagar linha só com
-- ele mandando.

WITH repetidas AS (
  SELECT c.id,
         row_number() OVER (
           PARTITION BY c.tenant_id
           ORDER BY (
             SELECT count(*) FROM public.service_orders s
              WHERE s.tenant_id = c.tenant_id AND s.status = c.key
           ) DESC,
           c.created_at ASC
         ) AS posicao
    FROM public.os_status_config c
   WHERE lower(c.label) LIKE 'terceiriz%'
)
UPDATE public.os_status_config AS t
   SET ativo = false
  FROM repetidas r
 WHERE t.id = r.id
   AND r.posicao > 1;

-- -----------------------------------------------------------------------------
-- 2. A NUMERAÇÃO, PELO NOME QUE APARECE NA TELA
-- -----------------------------------------------------------------------------
-- A ordem também é reescrita, para o quadro ficar na sequência que ele ditou:
--
--   1  Entrada / Análise        4  Terceirizada
--   2a Aguardando aprovação     5  Finalizado
--   2b Aguardando Peça          6  Entregue
--   3  Aprovado / Executar
--
-- Espaçamento de 10 entre elas: sobra lugar para a loja encaixar etapa nova no
-- meio sem precisar reordenar tudo de novo.
--
-- A etapa é encontrada pela CHAVE quando ela é de sistema (essa não muda
-- nunca) e pelo NOME quando é etapa da loja (peça e terceirizada), que é
-- justamente onde a chave me traiu.

UPDATE public.os_status_config SET numero = '1',  ordem = 10 WHERE key = 'aguardando_analise';
UPDATE public.os_status_config SET numero = '2a', ordem = 20 WHERE key = 'aguardando_aprovacao';

UPDATE public.os_status_config
   SET numero = '2b', ordem = 30
 WHERE ativo
   -- Com e sem cedilha: o nome foi digitado por gente, e as duas grafias
   -- aparecem. Nada de curinga solto no meio, que pegaria "pera" e "pesa".
   AND (key = 'aguardando_peca'
        OR lower(label) LIKE '%peça%'
        OR lower(label) LIKE '%peca%');

UPDATE public.os_status_config SET numero = '3',  ordem = 40 WHERE key = 'aprovado';

UPDATE public.os_status_config
   SET numero = '4', ordem = 50
 WHERE ativo
   AND lower(label) LIKE 'terceiriz%';

UPDATE public.os_status_config SET numero = '5', ordem = 60 WHERE key = 'finalizado';
UPDATE public.os_status_config SET numero = '6', ordem = 70 WHERE key = 'entregue';

-- Cancelado continua sem número e no fim: não é passo do processo, é saída de
-- emergência. Numerar daria a ele um lugar na esteira que ele não tem.
UPDATE public.os_status_config SET numero = NULL, ordem = 90 WHERE key = 'cancelado';

-- A etapa desativada no passo 1 perde o número junto: se um dia alguém
-- reativar, ela volta sem número em vez de voltar como uma segunda "4".
UPDATE public.os_status_config
   SET numero = NULL
 WHERE NOT ativo
   AND lower(label) LIKE 'terceiriz%';
