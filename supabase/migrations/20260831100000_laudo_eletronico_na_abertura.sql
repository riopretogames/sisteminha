-- =============================================================================
-- "VAI TER LAUDO ELETRÔNICO?" — A PERGUNTA QUE MUDA A CONVERSA NO BALCÃO
-- =============================================================================
--
-- Pedido do Felipe em 31/08: *"na criação da ordem de serviço tem que ter
-- alguma coisa lá, um botão de ON/OFF, sobre laudo eletrônico, para lembrar o
-- vendedor de avisar sobre o laudo eletrônico"*.
--
-- No organograma dele, é a bifurcação da triagem — e ela decide DUAS coisas
-- que acontecem em momentos diferentes:
--
--   No BALCÃO, o que o vendedor fala com o cliente:
--     • serviço tabelado → informa preço e prazo da tabela, e pronto;
--     • análise completa → explica a taxa de R$ 80, o prazo de 1 a 3 dias
--       úteis e o abatimento da taxa se o serviço for aprovado.
--
--   Na BANCADA, o que o técnico faz depois ("tem laudo eletrônico?"):
--     • sim → desmonta, investiga e monta o laudo, que vai ao cliente;
--     • não → vai direto para a execução.
--
-- Hoje essa decisão só existe na cabeça de quem atendeu. O técnico descobre
-- desmontando, e o cliente descobre na hora de pagar — que é o pior lugar
-- possível para descobrir uma taxa de R$ 80.
--
-- -----------------------------------------------------------------------------
-- POR QUE NASCE LIGADO
-- -----------------------------------------------------------------------------
-- O padrão é o caminho mais cuidadoso: toda OS nasce esperando laudo. Desligar
-- é uma escolha consciente para o serviço tabelado, que é o caso em que a loja
-- JÁ SABE o preço antes de abrir o aparelho.
--
-- Se o padrão fosse o contrário, o esquecimento levaria o aparelho para a
-- bancada sem ninguém ter combinado a análise com o cliente — e a conversa
-- difícil aconteceria na entrega.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS laudo_eletronico BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.service_orders.laudo_eletronico IS
  'TRUE = a OS passa por análise e laudo eletrônico (o cliente foi avisado da taxa e do prazo). FALSE = serviço tabelado, preço e prazo informados na hora. Decide o que o vendedor fala no balcão e se o técnico monta laudo. Organograma do Felipe, 30-31/08.';

-- As OS que já existem ficam com TRUE, que é o comportamento que o sistema
-- sempre teve: todas passavam pela etapa de análise. Nenhuma vira "tabelada"
-- retroativamente — isso seria inventar uma conversa que ninguém teve.
