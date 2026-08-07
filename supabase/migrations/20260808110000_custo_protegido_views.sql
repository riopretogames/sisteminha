-- =============================================================================
-- Sisteminha (RP System.IO) — Custo protegido: views de leitura
-- =============================================================================
--
-- Decisão do Felipe em 07/08 (PLANO-DE-REFINAMENTO.md, "Decisão que só você
-- pode tomar" → Opção B): permissão que existe no catálogo tem que valer no
-- banco também, não só na tela.
--
-- O problema: `inventory.cost.view` é checada só no front. RLS é por LINHA,
-- não por COLUNA, então qualquer autenticado do tenant que consulte a API
-- direto lê `produtos.custo`, `produtos.margem_percent`,
-- `servicos.custo_estimado` e `service_order_items.custo_unitario`.
--
-- ESTA MIGRATION É A PARTE 1 DE 2 — E SOZINHA NÃO FECHA O VAZAMENTO.
--
--   Parte 1 (aqui): cria o caminho certo de leitura. As tabelas continuam
--   acessíveis exatamente como hoje, então NADA quebra ao aplicar.
--
--   Parte 2 (depois): tira o SELECT das colunas de custo do papel
--   `authenticated`, fechando a leitura direta. Só pode entrar DEPOIS que
--   todas as telas estiverem lendo pelas views daqui — senão o app quebra
--   no mesmo instante, porque `SELECT *` passa a dar erro de permissão.
--
-- Por que view em vez de policy: RLS não sabe filtrar coluna. A view resolve
-- porque pode calcular o valor: quem tem a permissão recebe o custo, quem
-- não tem recebe NULL — decidido pelo banco, não pela tela.
--
-- Por que NÃO usa `security_invoker`: com invoker, a view lê a tabela com os
-- privilégios de quem chamou — ou seja, depois da Parte 2 ela também perderia
-- o acesso à coluna de custo, e não teria como devolver custo pra ninguém. As
-- views abaixo rodam com os privilégios do dono (o padrão), e por isso
-- repetem o filtro de tenant explicitamente no WHERE: sem RLS automática, o
-- isolamento entre lojas passa a ser responsabilidade da própria view.
--
-- `security_barrier` impede que uma função esperta no WHERE de quem consulta
-- rode antes do filtro de tenant e vaze linha de outra loja.
-- =============================================================================


-- =============================================================================
-- 1. PRODUTOS
-- =============================================================================
-- Espelha a policy "Users can view products from their tenant"
-- (tenant_id = get_user_tenant_id) da migration 20260127234413.
--
-- O `(SELECT ...)` em volta do has_permission não é enfeite: como subconsulta
-- sem correlação, o Postgres resolve UMA vez por consulta (InitPlan) em vez de
-- uma vez por produto. Sem isso, listar 2 mil produtos chamaria a checagem de
-- permissão 2 mil vezes.

CREATE OR REPLACE VIEW public.vw_produtos
WITH (security_barrier = true) AS
SELECT
  p.id,
  p.tenant_id,
  p.nome,
  p.marca,
  p.modelo,
  p.categoria,
  p.localizacao,
  p.codigo_barra,
  p.imei_serial,
  p.foto_url,
  p.preco,
  p.estoque_atual,
  p.estoque_minimo,
  p.estoque_maximo,
  p.garantia_meses,
  p.ativo,
  p.created_at,
  p.updated_at,
  CASE WHEN (SELECT public.has_permission(auth.uid(), 'inventory.cost.view'))
       THEN p.custo END AS custo,
  CASE WHEN (SELECT public.has_permission(auth.uid(), 'inventory.cost.view'))
       THEN p.margem_percent END AS margem_percent
FROM public.produtos p
WHERE p.tenant_id = public.get_user_tenant_id(auth.uid());

COMMENT ON VIEW public.vw_produtos IS
  'Leitura de produtos com custo/margem protegidos: só vêm preenchidos para quem tem inventory.cost.view; para os demais vêm NULL. Toda tela de LEITURA deve usar esta view. Escrita continua indo direto em produtos.';


-- =============================================================================
-- 2. SERVIÇOS
-- =============================================================================
-- Espelha a policy "Ver servicos" da migration 20260801000003.

CREATE OR REPLACE VIEW public.vw_servicos
WITH (security_barrier = true) AS
SELECT
  s.id,
  s.tenant_id,
  s.nome,
  s.descricao,
  s.grupo_id,
  s.preco_referencia,
  s.tempo_estimado_horas,
  s.garantia_meses,
  s.exige_aviso_risco,
  s.ativo,
  s.created_at,
  s.updated_at,
  CASE WHEN (SELECT public.has_permission(auth.uid(), 'inventory.cost.view'))
       THEN s.custo_estimado END AS custo_estimado
FROM public.servicos s
WHERE s.tenant_id = public.get_user_tenant_id(auth.uid());

COMMENT ON VIEW public.vw_servicos IS
  'Leitura do catálogo de serviços com custo_estimado protegido por inventory.cost.view. Escrita continua indo direto em servicos.';


-- =============================================================================
-- 3. ITENS DE ORDEM DE SERVIÇO
-- =============================================================================
-- Aqui o tenant não está na própria linha: o item pertence a uma OS, e é a OS
-- que tem tenant_id. Mesmo EXISTS da policy original (20260127234413).

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
       THEN i.custo_unitario END AS custo_unitario
FROM public.service_order_items i
WHERE EXISTS (
  SELECT 1 FROM public.service_orders so
  WHERE so.id = i.os_id
    AND so.tenant_id = public.get_user_tenant_id(auth.uid())
);

COMMENT ON VIEW public.vw_os_itens IS
  'Leitura de peças e serviços lançados na OS, com custo_unitario protegido por inventory.cost.view. Escrita continua indo direto em service_order_items.';


-- =============================================================================
-- 4. ACESSO
-- =============================================================================
-- Views são apenas de leitura por enquanto — nenhum INSERT/UPDATE/DELETE é
-- concedido de propósito. Escrita continua na tabela, onde as policies de RLS
-- que já existem (e checam permissão de edição) seguem valendo sem mudança.

GRANT SELECT ON public.vw_produtos  TO authenticated;
GRANT SELECT ON public.vw_servicos  TO authenticated;
GRANT SELECT ON public.vw_os_itens  TO authenticated;
