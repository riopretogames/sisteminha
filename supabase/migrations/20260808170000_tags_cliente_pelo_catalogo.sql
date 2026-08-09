-- =============================================================================
-- Sisteminha (RP System.IO) — Marcações do cliente vêm do catálogo editável
-- =============================================================================
--
-- FURO ACHADO PELO FELIPE EM 08/08, revisando o cadastro de cliente:
-- "quando eu criar um campo na parte de cadastro, ele tem que vir".
--
-- Origem do Cliente e Motivo da Compra já obedecem a isso — o cadastro lê os
-- catálogos editáveis. As **marcações** (tags), não: a coluna `clientes.tags`
-- é um ENUM de três valores fixos no banco ('vip', 'fiel', 'problema'), então
-- a tela só conseguia oferecer esses três.
--
-- Enquanto isso, o catálogo `tag_cliente` já existe em Listas do Sistema, com
-- quatro itens semeados e cor própria: VIP, Fiel, Atacado e Atenção. Ou seja:
-- a loja podia criar a marcação "Atacado", ela aparecia na tela de listas, e
-- não aparecia em lugar nenhum na ficha do cliente. Cadastro que promete e
-- não entrega — a mesma família do problema que a Opção B resolveu no custo.
--
-- POR QUE UMA TABELA DE LIGAÇÃO, E NÃO OUTRO ARRAY:
--
-- Um array de ids não tem como garantir que o id existe de verdade (o Postgres
-- não faz chave estrangeira dentro de array). Marcação que aponta pro vazio
-- vira etiqueta fantasma na ficha. Com tabela de ligação, o banco garante que
-- toda marcação de todo cliente existe no catálogo — e o CHECK garante que é
-- do tipo certo, não uma cor ou uma marca escolhida por engano.
--
-- A COLUNA ANTIGA NÃO É APAGADA. Migration destrutiva precisa da confirmação
-- do Felipe (regra do CLAUDE.md), e o banco de produção tem cadastro real.
-- Ela fica marcada como legada e sem uso — some numa próxima rodada, com
-- autorização explícita.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. GARANTE QUE AS MARCAÇÕES ANTIGAS EXISTEM NO CATÁLOGO
-- -----------------------------------------------------------------------------
-- Sem isso, um cliente marcado como "problema" perderia a marcação em silêncio
-- caso a loja já tivesse renomeado o item correspondente. Perder dado calado é
-- pior que dar erro.
--
-- 'problema' vira 'Atenção' porque é o nome que o catálogo já usa para a mesma
-- ideia — e é um nome que dá pra dizer na frente do cliente.

INSERT INTO public.catalogos (tenant_id, tipo, descricao, cor, ordem)
SELECT t.id, 'tag_cliente', v.descricao, v.cor, v.ordem
FROM public.tenants t
CROSS JOIN (VALUES
  ('VIP',     'bg-amber-500/10 text-amber-600',     10),
  ('Fiel',    'bg-emerald-500/10 text-emerald-600', 20),
  ('Atenção', 'bg-red-500/10 text-red-600',         40)
) AS v(descricao, cor, ordem)
ON CONFLICT (tenant_id, tipo, descricao) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. A LIGAÇÃO CLIENTE ↔ MARCAÇÃO
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cliente_tags (
  cliente_id  UUID NOT NULL REFERENCES public.clientes(id)  ON DELETE CASCADE,
  catalogo_id UUID NOT NULL REFERENCES public.catalogos(id) ON DELETE CASCADE,
  -- Repetido aqui de propósito: é o que a RLS usa pra isolar loja de loja sem
  -- precisar consultar `clientes` a cada linha.
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, catalogo_id),
  CONSTRAINT cliente_tags_e_do_tipo_certo
    CHECK (public.catalogo_e_do_tipo(catalogo_id, 'tag_cliente'))
);

COMMENT ON TABLE public.cliente_tags IS
  'Marcações da ficha do cliente. Vêm do catálogo `tag_cliente` (Listas do '
  'Sistema), então a loja cria marcação nova sem precisar de migration.';

CREATE INDEX IF NOT EXISTS idx_cliente_tags_cliente ON public.cliente_tags(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_tags_catalogo ON public.cliente_tags(catalogo_id);

ALTER TABLE public.cliente_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver marcacoes de cliente do tenant" ON public.cliente_tags;
CREATE POLICY "Ver marcacoes de cliente do tenant"
  ON public.cliente_tags FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Mesma chave que a policy de INSERT/UPDATE em `clientes` exige. Marcar um
-- cliente é editar a ficha dele.
DROP POLICY IF EXISTS "Quem gerencia clientes marca" ON public.cliente_tags;
CREATE POLICY "Quem gerencia clientes marca"
  ON public.cliente_tags FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.customers.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.customers.manage')
  );


-- -----------------------------------------------------------------------------
-- 3. LEVA AS MARCAÇÕES QUE JÁ EXISTEM PARA O NOVO LUGAR
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  migradas INTEGER;
  perdidas INTEGER;
BEGIN
  INSERT INTO public.cliente_tags (cliente_id, catalogo_id, tenant_id)
  SELECT c.id, cat.id, c.tenant_id
  FROM public.clientes c
  CROSS JOIN LATERAL unnest(c.tags) AS t
  JOIN public.catalogos cat
    ON cat.tenant_id = c.tenant_id
   AND cat.tipo = 'tag_cliente'
   AND lower(cat.descricao) = CASE t::TEXT
         WHEN 'vip'      THEN 'vip'
         WHEN 'fiel'     THEN 'fiel'
         WHEN 'problema' THEN 'atenção'
       END
  WHERE c.tags IS NOT NULL
    AND array_length(c.tags, 1) IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS migradas = ROW_COUNT;

  -- Confere se sobrou alguma marcação sem destino (não deveria, depois do
  -- passo 1 — mas contar é barato e descobrir depois é caro).
  SELECT count(*)
    INTO perdidas
  FROM public.clientes c
  CROSS JOIN LATERAL unnest(c.tags) AS t
  WHERE c.tags IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalogos cat
      WHERE cat.tenant_id = c.tenant_id
        AND cat.tipo = 'tag_cliente'
        AND lower(cat.descricao) = CASE t::TEXT
              WHEN 'vip'      THEN 'vip'
              WHEN 'fiel'     THEN 'fiel'
              WHEN 'problema' THEN 'atenção'
            END
    );

  RAISE NOTICE 'Marcações de cliente migradas: %. Sem correspondência: %.', migradas, perdidas;
END $$;


COMMENT ON COLUMN public.clientes.tags IS
  'LEGADO — não é mais lido nem gravado por nenhuma tela desde 08/08. As '
  'marcações agora vivem em `cliente_tags`, ligadas ao catálogo editável. '
  'Mantida só porque apagar coluna com dado real exige confirmação do Felipe.';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- 1) As marcações vieram junto?
--    SELECT c.nome, cat.descricao
--      FROM public.cliente_tags ct
--      JOIN public.clientes c   ON c.id = ct.cliente_id
--      JOIN public.catalogos cat ON cat.id = ct.catalogo_id
--     ORDER BY c.nome;
--
-- 2) Bate com o que havia na coluna antiga?
--    SELECT
--      (SELECT count(*) FROM public.clientes c, unnest(c.tags)) AS antes,
--      (SELECT count(*) FROM public.cliente_tags)               AS depois;
--
-- 3) A trava de tipo funciona? (tem que dar erro)
--    INSERT INTO public.cliente_tags (cliente_id, catalogo_id, tenant_id)
--    SELECT c.id, cat.id, c.tenant_id
--      FROM public.clientes c, public.catalogos cat
--     WHERE cat.tipo = 'marca' LIMIT 1;
-- =============================================================================
