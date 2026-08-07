-- =============================================================================
-- RPG System.IO — Liga o cadastro de Formas de Pagamento ao PDV
-- =============================================================================
--
-- Achado na revisão técnica (PLANO-DE-REFINAMENTO.md, Vendas/PDV): o cadastro
-- de Formas de Pagamento (Passo 5) existe, com parcelamento e taxa
-- configuráveis por loja, mas o PDV continuava usando só o enum fixo
-- `forma_pagamento` (pix/dinheiro/cartao_credito/...) — o cadastro nunca era
-- consultado na hora de vender.
--
-- Por que NÃO trocar o enum inteiro pelo cadastro: `pagamentos_venda.forma`
-- já é usado por relatórios/dashboards existentes (VendasPagamentos,
-- Relatório Financeiro) pra agrupar por categoria ampla. Trocar tudo pra
-- texto livre quebraria esses agrupamentos. Solução: as DUAS coisas
-- coexistem — `forma_pagamento_id` aponta pro cadastro específico usado
-- (ex.: "Cartão Crédito - Taxa", com parcelas e taxa reais), e `forma`
-- (enum) continua sendo preenchido, derivado do cadastro, só pra manter os
-- relatórios existentes funcionando sem mudança nenhuma.
-- =============================================================================

-- Cada forma de pagamento cadastrada precisa saber em qual categoria ampla
-- do enum ela entra, pra reports antigos continuarem agrupando certo.
ALTER TABLE public.formas_pagamento
  ADD COLUMN forma_enum public.forma_pagamento NOT NULL DEFAULT 'dinheiro';

COMMENT ON COLUMN public.formas_pagamento.forma_enum IS
  'Categoria ampla (enum forma_pagamento) que esta forma cadastrada representa — usado só pra preencher pagamentos_venda.forma automaticamente e manter relatórios antigos (agrupados pelo enum) funcionando sem mudança.';

-- Mapeamento dos 9 itens já seedados (migration 20260801000003) pra sua
-- categoria mais próxima. "Link de Pagamento" e "Shopee" mapeiam pra
-- cartão de crédito (processamento eletrônico mais parecido); "Produtos
-- para a AS" e "Folha de Pagamento" mapeiam pra vale_troca (não é dinheiro
-- de verdade entrando — aliás as duas já têm entra_no_caixa=false).
UPDATE public.formas_pagamento SET forma_enum = 'dinheiro'       WHERE descricao = 'Dinheiro';
UPDATE public.formas_pagamento SET forma_enum = 'pix'            WHERE descricao = 'PIX';
UPDATE public.formas_pagamento SET forma_enum = 'cartao_debito'  WHERE descricao = 'Cartão Débito';
UPDATE public.formas_pagamento SET forma_enum = 'cartao_credito' WHERE descricao IN ('Cartão Crédito', 'Cartão Crédito - Taxa', 'Link de Pagamento', 'Shopee');
UPDATE public.formas_pagamento SET forma_enum = 'vale_troca'     WHERE descricao IN ('Produtos para a AS', 'Folha de Pagamento');

-- Liga o pagamento de verdade ao cadastro específico usado. Nullable: um
-- pagamento antigo (antes desta migration) não tem de onde vir esse dado.
ALTER TABLE public.pagamentos_venda
  ADD COLUMN forma_pagamento_id UUID REFERENCES public.formas_pagamento(id);

COMMENT ON COLUMN public.pagamentos_venda.forma_pagamento_id IS
  'Qual linha do cadastro de Formas de Pagamento foi usada de verdade nesta venda. Nulo em pagamentos gravados antes desta migration, ou se a forma cadastrada foi excluída depois.';
