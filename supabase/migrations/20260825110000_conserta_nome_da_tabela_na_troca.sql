-- =============================================================================
-- RPG System.IO — Conserta a função de troca que eu quebrei há minutos
-- =============================================================================
--
-- A migration `20260825100000` (preço de venda no produto de troca) reescreveu
-- `registrar_entrada_produto_troca` e, ao reescrever, errei DOIS nomes:
--
--   • a tabela do rastro é `entradas_produto`, e eu escrevi
--     `entradas_produto_troca`;
--   • a coluna é `pagamento_venda_id`, e eu escrevi `pagamento_id`;
--   • e faltava gravar `usuario_id`, que é NOT NULL.
--
-- POR QUE ISSO PASSOU PELO `db push` SEM ERRO
--
-- Corpo de função plpgsql não é conferido quando a função é criada — só na
-- hora em que ela roda. Uma função pode citar tabela que não existe e ser
-- aceita normalmente. O erro só apareceria quando alguém no balcão recebesse
-- um aparelho em troca, no meio de uma venda, com o cliente na frente.
--
-- Achado porque testei a função de verdade depois de aplicar, em vez de
-- confiar no "Finished supabase db push". É exatamente a regra que já está no
-- CLAUDE.md desde 08/08: **conferir no banco, não no registro.**

CREATE OR REPLACE FUNCTION public.registrar_entrada_produto_troca(
  _venda_id         UUID,
  _nome             TEXT,
  _grupo_produto_id UUID,
  _marca_id         UUID,
  _modelo_id        UUID,
  _cor_id           UUID,
  _condicao_id      UUID,
  _memoria_id       UUID,
  _imei_serial      TEXT,
  _valor_entrada    DECIMAL,
  _observacoes      TEXT DEFAULT NULL,
  _preco_venda      DECIMAL DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    UUID;
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

  -- Vender por menos do que se pagou acontece de verdade (aparelho aceito de
  -- má vontade, que a loja vai desovar), então não é recusado. Negativo, sim.
  IF _preco_venda IS NOT NULL AND _preco_venda < 0 THEN
    RAISE EXCEPTION 'O preço de venda não pode ser negativo.' USING ERRCODE = 'P0001';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.vendas WHERE id = _venda_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  -- 1) O produto entra no estoque INATIVO, esperando revisão da bancada.
  --    `custo` = o que a loja abateu da venda para ficar com ele.
  --    `preco` = por quanto pretende revender, quando o vendedor souber.
  INSERT INTO public.produtos (
    tenant_id, nome, grupo_produto_id, marca_id, modelo_id, cor_id,
    condicao_id, memoria_id, imei_serial, observacoes,
    custo, preco, estoque_atual, ativo
  ) VALUES (
    v_tenant_id, btrim(_nome), _grupo_produto_id, _marca_id, _modelo_id, _cor_id,
    _condicao_id, _memoria_id, _imei_serial, _observacoes,
    _valor_entrada, COALESCE(_preco_venda, 0), 1, false
  ) RETURNING id INTO v_produto_id;

  -- 2) O valor da troca entra como pagamento da venda (forma "vale_troca"),
  --    para já contar automaticamente em "quanto foi pago".
  INSERT INTO public.pagamentos_venda (
    venda_id, forma, forma_pagamento_id, parcelas, valor
  ) VALUES (
    _venda_id, 'vale_troca', NULL, 1, _valor_entrada
  ) RETURNING id INTO v_pagamento_id;

  -- 3) O rastro: este produto veio desta venda, com este valor. Serve para dar
  --    cobertura se o item, já revendido, apresentar defeito depois.
  INSERT INTO public.entradas_produto (
    tenant_id, venda_id, produto_id, pagamento_venda_id,
    valor_entrada, observacoes, usuario_id
  ) VALUES (
    v_tenant_id, _venda_id, v_produto_id, v_pagamento_id,
    _valor_entrada, _observacoes, auth.uid()
  );

  RETURN v_produto_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_entrada_produto_troca IS
  'Recebe um produto usado como parte do pagamento: cria o produto INATIVO com custo = valor de entrada e preço = o que o vendedor pretende revender (opcional, 25/08), lança o valor como pagamento da venda e guarda o rastro em entradas_produto.';

REVOKE ALL ON FUNCTION public.registrar_entrada_produto_troca FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrada_produto_troca TO authenticated;
