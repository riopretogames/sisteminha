-- =============================================================================
-- A PERGUNTA DA SENHA VIRA REGISTRO NA OS
-- =============================================================================
--
-- Pedido do Felipe em 27/08, abrindo OS de teste no balcão:
--
--   "A senha tem que ter um campo, senha sim ou não? Se ele apertar sim,
--    aparece o campo senha digitada ou senha de desenho. Mas é obrigatório
--    passar por esse senha sim ou não, porque tem equipamento que não tem
--    senha, mas tem que SEMPRE perguntar."
--
-- POR QUE UMA COLUNA, E NÃO DEDUZIR DOS CAMPOS QUE JÁ EXISTEM
--
-- `senha_aparelho` e `senha_padrao` já existiam, e olhando só para eles a OS
-- sem senha e a OS onde ninguém perguntou são idênticas: as duas chegam na
-- bancada com os dois campos vazios. Só que uma diz "o cliente confirmou que
-- não tem" e a outra diz "esquecemos de perguntar" -- e a diferença aparece
-- justamente no pior momento, com o técnico de aparelho na mão sem conseguir
-- testar o reparo, tendo que ligar para o cliente.
--
-- Guardar a resposta é o que faz a pergunta valer alguma coisa depois.
--
-- NULL nas OS que já existem, e fica assim: elas foram abertas antes da
-- pergunta existir, e inventar "não tem senha" para elas seria registrar uma
-- resposta que ninguém deu.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS tem_senha BOOLEAN;

COMMENT ON COLUMN public.service_orders.tem_senha IS
  'O cliente informou que o aparelho tem senha? TRUE/FALSE são respostas dadas no check-in; NULL é OS aberta antes de 27/08, quando a pergunta não existia. Obrigatório na abertura desde 27/08.';

-- Nada de trava de custo aqui: `service_orders` não é uma das quatro tabelas
-- com colunas de custo protegidas (produtos, servicos, service_order_items,
-- movimentos_estoque). A OS não tem coluna de custo -- o custo da assistência
-- mora nos ITENS da OS, e essa tabela não foi tocada.
