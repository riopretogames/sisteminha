-- =============================================================================
-- O TIPO DO ITEM PRECISA PASSAR PELA VIEW E PELA TRAVA DE CUSTO
-- =============================================================================
--
-- Conserto do meu próprio erro, na mesma hora em que ele apareceu.
--
-- A migration anterior (20260831180000) criou `service_order_items.tipo_item`
-- e parou aí. Só que essa é UMA DAS QUATRO TABELAS com custo protegido, e o
-- CLAUDE.md avisa exatamente sobre isso — em duas frentes que eu ignorei:
--
--   1. **A VIEW.** `vw_os_itens` lista as colunas UMA A UMA (não é SELECT *,
--      de propósito: é ela que esconde o custo de quem não pode ver). Coluna
--      nova na tabela não aparece na view sozinha. Como toda leitura de item
--      de OS passa pela view — regra da casa, sem exceção —, o tipo simplesmente
--      não existiria para nenhuma tela. E não daria erro: viria `undefined`, e
--      a tela mostraria tudo como serviço.
--
--   2. **A TRAVA.** `aplicar_trava_de_custo()` funciona revogando o SELECT da
--      tabela e reconcedendo coluna a coluna. Ela congela a lista de colunas
--      no instante em que roda: coluna criada depois nasce SEM permissão de
--      leitura. Enquanto todo mundo lê pela view isso não quebra nada, mas o
--      dia em que alguém emendar um `.select()` direto na tabela, o erro será
--      "permission denied" e ninguém vai associar a causa.
--
-- O CLAUDE.md registra que isso já aconteceu com 7 colunas de `produtos` entre
-- 09 e 18/08. Repeti o erro 13 dias depois, com o aviso escrito.

-- -----------------------------------------------------------------------------
-- 1. A VIEW PASSA A ENTREGAR O TIPO
-- -----------------------------------------------------------------------------
-- `tipo_item` entra no fim: CREATE OR REPLACE VIEW só aceita acrescentar
-- coluna no final, mantendo as outras com o mesmo nome, tipo e ordem.
--
-- Ele NÃO é informação de custo — é o que a linha é (peça, serviço, custo
-- repassado). Todo mundo que enxerga a OS precisa dele para ler a conta.

CREATE OR REPLACE VIEW public.vw_os_itens
WITH (security_barrier = true) AS
SELECT
  i.id,
  i.os_id,
  i.produto_id,
  i.descricao,
  i.quantidade,
  i.preco_cobrado,
  i.horas_mao_obra,
  i.garantia_item_meses,
  i.created_at,
  CASE WHEN (SELECT public.has_permission(auth.uid(), 'inventory.cost.view'))
       THEN i.custo_unitario END AS custo_unitario,
  i.tipo_item
FROM public.service_order_items i
WHERE EXISTS (
  SELECT 1 FROM public.service_orders so
  WHERE so.id = i.os_id
    AND so.tenant_id = public.get_user_tenant_id(auth.uid())
);

-- -----------------------------------------------------------------------------
-- 2. A TRAVA SE REAJUSTA
-- -----------------------------------------------------------------------------
-- A função descobre as colunas sozinha, então basta chamá-la: ela revoga e
-- reconcede tudo menos as de custo, incluindo a coluna nova.

SELECT public.aplicar_trava_de_custo();
