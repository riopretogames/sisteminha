-- =============================================================================
-- Sisteminha (RPG System.IO) — O aparelho que entra na troca nasce "não se repõe"
-- =============================================================================
--
-- Fechamento da revisão completa de 24/09/2026 (pedido do corretor do Estoque).
--
-- O PROBLEMA. O aparelho usado que o cliente dá como parte do pagamento vira
-- um produto novo no estoque, criado por `registrar_entrada_produto_troca`.
-- Essa função não dizia o estoque mínimo, então valia o padrão da coluna
-- (`estoque_minimo = 1`). Resultado: no dia em que o aparelho fosse vendido
-- (estoque 0 < mínimo 1), ele aparecia no Estoque Crítico e no aviso do topo
-- pedindo "Repor" — um PS4 usado de um cliente, que a loja nunca vai comprar
-- de fornecedor de novo.
--
-- A REGRA (achado 47, mesma data): mínimo 0 = "não se repõe". O produto só
-- volta ao Estoque Crítico se o estoque ficar negativo. Então o aparelho de
-- troca nasce com mínimo 0. Quem quiser que ele seja reposto muda na ficha.
--
-- O QUE MUDA: só o valor `estoque_minimo = 0` no INSERT do produto. O resto da
-- função é a versão que está no banco em 24/09 (conferida com
-- pg_get_functiondef), sem nenhuma outra mudança. Mesma assinatura, então a
-- tela e o `types.ts` não mudam.
--
-- NÃO mexe nos aparelhos que já existem (dado real). Os que estão com mínimo 1
-- e aparecendo no Crítico ("Ps5 slim", "PS4 TESTE") se resolvem na ficha.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_entrada_produto_troca(
  _venda_id uuid,
  _nome text,
  _grupo_produto_id uuid,
  _marca_id uuid,
  _modelo_id uuid,
  _cor_id uuid,
  _condicao_id uuid,
  _memoria_id uuid,
  _imei_serial text,
  _valor_entrada numeric,
  _observacoes text DEFAULT NULL::text,
  _preco_venda numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venda        RECORD;
  v_produto_id   UUID;
  v_pagamento_id UUID;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'sales.create') THEN
    RAISE EXCEPTION 'Seu perfil de acesso não permite registrar venda.'
      USING ERRCODE = 'P0001';
  END IF;

  IF btrim(COALESCE(_nome, '')) = '' THEN
    RAISE EXCEPTION 'Informe o que está entrando na troca.' USING ERRCODE = 'P0001';
  END IF;

  IF _valor_entrada IS NULL OR _valor_entrada <= 0 THEN
    RAISE EXCEPTION 'O valor de entrada da troca precisa ser maior que zero.'
      USING ERRCODE = 'P0001';
  END IF;

  IF _preco_venda IS NOT NULL AND _preco_venda < 0 THEN
    RAISE EXCEPTION 'O preço de venda não pode ser negativo.' USING ERRCODE = 'P0001';
  END IF;

  SELECT tenant_id, status, vendedor_id, created_at INTO v_venda
    FROM public.vendas WHERE id = _venda_id;

  IF v_venda.tenant_id IS NULL
     OR v_venda.tenant_id IS DISTINCT FROM public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF v_venda.status <> 'pago'
     OR v_venda.vendedor_id IS DISTINCT FROM auth.uid()
     OR v_venda.created_at < now() - interval '10 minutes' THEN
    RAISE EXCEPTION
      'A entrada de troca só é registrada pelo próprio vendedor, na venda que ele está fechando agora.'
      USING ERRCODE = 'P0001';
  END IF;

  -- estoque_minimo = 0: aparelho de troca não se repõe (ver o topo do arquivo).
  INSERT INTO public.produtos (
    tenant_id, nome, grupo_produto_id, marca_id, modelo_id, cor_id,
    condicao_id, memoria_id, imei_serial, observacoes,
    custo, preco, estoque_atual, estoque_minimo, ativo
  ) VALUES (
    v_venda.tenant_id, btrim(_nome), _grupo_produto_id, _marca_id, _modelo_id, _cor_id,
    _condicao_id, _memoria_id, _imei_serial, _observacoes,
    _valor_entrada, COALESCE(_preco_venda, 0), 1, 0, false
  ) RETURNING id INTO v_produto_id;

  INSERT INTO public.pagamentos_venda (
    venda_id, forma, forma_pagamento_id, parcelas, valor
  ) VALUES (
    _venda_id, 'vale_troca', NULL, 1, _valor_entrada
  ) RETURNING id INTO v_pagamento_id;

  INSERT INTO public.entradas_produto (
    tenant_id, venda_id, produto_id, pagamento_venda_id,
    valor_entrada, observacoes, usuario_id
  ) VALUES (
    v_venda.tenant_id, _venda_id, v_produto_id, v_pagamento_id,
    _valor_entrada, _observacoes, auth.uid()
  );

  RETURN v_produto_id;
END;
$function$;

-- A tela chama esta função (PDV, na troca): continua aberta só para quem está
-- logado. O CREATE OR REPLACE mantém as permissões, mas repetir aqui deixa a
-- regra das portas fechadas explícita no arquivo.
REVOKE ALL ON FUNCTION public.registrar_entrada_produto_troca(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrada_produto_troca(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, numeric) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERE
-- ─────────────────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  v_def TEXT := pg_get_functiondef(
    'public.registrar_entrada_produto_troca(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, numeric)'::regprocedure);
BEGIN
  IF v_def NOT LIKE '%estoque_minimo%' THEN
    RAISE EXCEPTION 'registrar_entrada_produto_troca ainda não grava o estoque mínimo 0';
  END IF;
  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
    -- Sem a chave de dono, a mudança de estoque cairia na trava da migration
    -- 20260924164000 (estoque só muda pelas portas oficiais).
    RAISE EXCEPTION 'registrar_entrada_produto_troca perdeu o SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon',
       'public.registrar_entrada_produto_troca(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'registrar_entrada_produto_troca está aberta para quem não fez login';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.registrar_entrada_produto_troca(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'registrar_entrada_produto_troca ficou fechada para a tela (PDV)';
  END IF;
END;
$verifica$;

NOTIFY pgrst, 'reload schema';
