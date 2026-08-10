-- =============================================================================
-- Sisteminha (RP System.IO) — vw_produtos precisa repassar as colunas novas
-- =============================================================================
--
-- Achado escrevendo a ficha do produto (10/08): `vw_produtos`
-- (20260808110000) tem lista de colunas explícita — colunas adicionadas
-- depois na tabela (`grupo_produto_id`/`marca_id`/`modelo_id`/`cor_id`/
-- `condicao_id`/`memoria_id` em 20260809220000, `observacoes` em
-- 20260810100000) não aparecem sozinhas na view. Toda leitura de produto
-- passa pela view (regra do custo protegido) — sem isto, a ficha não
-- conseguiria nem carregar esses campos pra editar.
--
-- `CREATE OR REPLACE VIEW` só aceita ACRESCENTAR coluna no fim da lista, não
-- reordenar nem remover — por isso as 7 colunas novas entram depois de
-- `updated_at`, e todo o resto do SELECT é idêntico ao original.
-- =============================================================================

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
       THEN p.margem_percent END AS margem_percent,
  p.grupo_produto_id,
  p.marca_id,
  p.modelo_id,
  p.cor_id,
  p.condicao_id,
  p.memoria_id,
  p.observacoes
FROM public.produtos p
WHERE p.tenant_id = public.get_user_tenant_id(auth.uid());

COMMENT ON VIEW public.vw_produtos IS
  'Leitura de produtos com custo/margem protegidos: só vêm preenchidos para quem tem inventory.cost.view; para os demais vêm NULL. Toda tela de LEITURA deve usar esta view. Escrita continua indo direto em produtos.';

NOTIFY pgrst, 'reload schema';
