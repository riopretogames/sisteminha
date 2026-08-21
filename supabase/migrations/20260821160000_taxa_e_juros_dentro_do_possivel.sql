-- =============================================================================
-- Sisteminha (RPG System.IO) — taxa e juros só aceitam percentual possível
-- =============================================================================
--
-- ACHADO reconferido em 18/08: `taxa_percent` e `juros_percent` de Formas de
-- Pagamento têm o mesmo risco que estourou em `margem_percent` em 05/08 —
-- ambos são `DECIMAL(5,2)`, ou seja, o maior valor que cabe é 999,99. Digitar
-- 1000 ou mais faz o Postgres devolver "numeric field overflow", um erro cru,
-- em inglês, sem dizer qual campo causou.
--
-- A diferença em relação à margem, e por isso a correção é outra: margem é
-- CALCULADA (custo e preço podem gerar qualquer número, então lá o certo foi
-- limitar o resultado). Taxa e juros são DIGITADOS por uma pessoa. Alargar a
-- coluna aqui seria resolver o sintoma errado: não existe taxa de maquininha
-- de 5.000%, e aceitar esse número calado é pior do que recusar — ele entraria
-- no cálculo de toda venda parcelada daquela forma de pagamento e comeria a
-- margem sem ninguém entender por quê.
--
-- Então: CHECK de 0 a 100. Generoso de propósito (taxa real de cartão fica
-- entre 1% e 6%, juros entre 1% e 15% ao mês) — a trava não existe pra
-- adivinhar o negócio, existe pra barrar o impossível: percentual negativo e
-- percentual que não cabe na coluna.
--
-- Os nomes das constraints são descritivos porque é o que aparece no erro
-- quando alguém esbarra: `formas_pagamento_taxa_entre_0_e_100` diz o que
-- fazer; `check_constraint_violation` não diz nada.
--
-- Conferido antes de aplicar: nenhuma linha existente viola as faixas (a
-- migration falharia na hora se violasse, e é assim que se quer — dado ruim
-- aparecendo agora, e não daqui a meses).
-- =============================================================================

ALTER TABLE public.formas_pagamento
  ADD CONSTRAINT formas_pagamento_taxa_entre_0_e_100
  CHECK (taxa_percent >= 0 AND taxa_percent <= 100);

ALTER TABLE public.formas_pagamento
  ADD CONSTRAINT formas_pagamento_juros_entre_0_e_100
  CHECK (juros_percent >= 0 AND juros_percent <= 100);

ALTER TABLE public.formas_pagamento_parcelas
  ADD CONSTRAINT parcela_taxa_entre_0_e_100
  CHECK (taxa_percent >= 0 AND taxa_percent <= 100);

COMMENT ON COLUMN public.formas_pagamento.taxa_percent IS
  'Percentual que a operadora cobra da loja. Aceita de 0 a 100 — acima disso é digitação errada, e passaria a comer a margem de toda venda nessa forma de pagamento.';

COMMENT ON COLUMN public.formas_pagamento.juros_percent IS
  'Percentual de juros repassado ao cliente no parcelamento. Aceita de 0 a 100.';

NOTIFY pgrst, 'reload schema';
