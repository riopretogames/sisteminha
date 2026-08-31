-- =============================================================================
-- APAGA A TERCEIRIZADA QUE EU CRIEI POR ENGANO — E CONSERTA A GRAFIA DA OUTRA
-- =============================================================================
--
-- Autorizado pelo Felipe em 30/08: *"apaga a terceirizada repetida de vez"*.
--
-- -----------------------------------------------------------------------------
-- A DESCOBERTA QUE MUDA TUDO: A ETAPA DA LOJA ESTÁ ESCRITA ERRADO
-- -----------------------------------------------------------------------------
-- O PLANO-DE-ACAO.md registra desde 21/08, e ainda em aberto:
--
--   "A etapa de OS 'tercerizada' está escrita errado (o certo é
--    'terceirizada'). É item cadastrado pela loja em Gerenciar Status."
--
-- Ou seja: a loja JÁ TINHA uma etapa de terceirização — com o nome sem o
-- segundo "i". Eu criei outra, `terceirizada`, sem saber. Daí as duas que o
-- Felipe viu no quadro.
--
-- E tem uma consequência pior, que só apareceu na revisão deste arquivo: a
-- migration de ontem (20260830180000) procurava por `label LIKE 'terceiriz%'`
-- para escolher qual desativar. "Tercerizada" NÃO casa com esse filtro. Ela
-- não desativou nada, não numerou a etapa da loja, e eu teria aplicado este
-- DELETE achando que resolvia — ele não apagaria uma linha sequer, terminaria
-- com sucesso, e o Felipe abriria o quadro no dia seguinte com as duas lá.
--
-- Erro que não avisa é o pior tipo, e este é o terceiro seguido pela mesma
-- causa: eu mexendo em dados que não consigo enxergar.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTA MIGRATION FAZ, AGORA QUE SE SABE QUEM É QUEM
-- -----------------------------------------------------------------------------
--   1. APAGA a `terceirizada` — a minha, criada ontem, que nunca teve OS.
--   2. CORRIGE o nome da `tercerizada` para "Terceirizada", que é o item
--      aberto desde 21/08. O nome é texto de tela: mudá-lo não mexe em OS
--      nenhuma, e a chave interna (com o erro) continua a mesma, porque ela é
--      contrato de código e das automações.
--   3. Dá a ela o número 4 e o lugar no quadro, que a migration de ontem não
--      conseguiu dar.
--   4. CONFERE o resultado e FALHA se não ficar exatamente uma etapa de
--      terceirização ativa por loja — ver o bloco final.

-- -----------------------------------------------------------------------------
-- 1. APAGA A MINHA
-- -----------------------------------------------------------------------------
-- Só apaga se não tiver uso nenhum: nenhuma OS nela agora, nenhuma OS que
-- tenha passado por ela. O status da OS é texto apontando para a chave, sem
-- amarração no banco — se a etapa some com OS apontando, a OS não some junto,
-- mas fica órfã (o quadro joga numa coluna vermelha de "sem etapa válida").
--
-- E só apaga se a etapa da loja existir. Sem ela, a minha é a única que a loja
-- tem, e apagar deixaria a assistência sem para onde mandar aparelho que sai
-- para fora.

DELETE FROM public.os_status_config c
 WHERE c.key = 'terceirizada'
   AND COALESCE(c.sistema, false) = false
   AND EXISTS (
     SELECT 1 FROM public.os_status_config outra
      WHERE outra.tenant_id = c.tenant_id
        AND outra.key = 'tercerizada'
   )
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

-- -----------------------------------------------------------------------------
-- 2. A ETAPA DA LOJA GANHA O NOME CERTO, O NÚMERO E O LUGAR
-- -----------------------------------------------------------------------------
-- A chave continua `tercerizada`, com o erro: ela é contrato do código, das
-- automações do n8n e do histórico das OS que já passaram por ali. Trocar a
-- chave para "consertar" quebraria tudo isso em silêncio — o erro de escrita
-- que incomoda é o que aparece na tela, e esse é o `label`.

UPDATE public.os_status_config
   SET label  = 'Terceirizada',
       numero = '4',
       ordem  = 50,
       ativo  = true
 WHERE key = 'tercerizada';

-- -----------------------------------------------------------------------------
-- 3. A MIGRATION CONFERE O PRÓPRIO RESULTADO
-- -----------------------------------------------------------------------------
-- Esta é a lição das três tentativas anteriores: aplicar sem ver não é
-- aceitável quando o resultado importa. Se sobrar mais de uma etapa de
-- terceirização ativa em alguma loja, a migration FALHA e desfaz tudo —
-- melhor não aplicar do que aplicar achando que resolveu.
--
-- A busca aqui é larga de propósito (as duas grafias), porque o objetivo é
-- justamente pegar o que os filtros estreitos deixaram passar.

DO $$
DECLARE
  v_loja   UUID;
  v_quantas INTEGER;
BEGIN
  FOR v_loja, v_quantas IN
    SELECT tenant_id, count(*)
      FROM public.os_status_config
     WHERE ativo
       AND (lower(label) LIKE 'terceiriz%' OR lower(label) LIKE 'terceriz%')
     GROUP BY tenant_id
  LOOP
    IF v_quantas > 1 THEN
      RAISE EXCEPTION
        'Loja % ficou com % etapas de terceirização ativas. Nada foi aplicado — confira em Gerenciar Status antes de rodar de novo.',
        v_loja, v_quantas;
    END IF;
  END LOOP;
END $$;
