-- =============================================================================
-- RPG System.IO — Produto recebido em troca já nasce com preço de venda
-- =============================================================================
--
-- Achado do Felipe testando em 24/08: *"quando for cadastrar um produto como
-- parte do pagamento, ele tem que ter a partir de custo do produto para a
-- gente, e quando a gente vai, qual o valor que a gente vai vender depois"*.
--
-- Metade já existia: o `custo` do produto novo é o valor de entrada, ou seja,
-- quanto a loja abateu da venda para ficar com o aparelho. Isso está certo e
-- não muda.
--
-- O que faltava é o PREÇO DE VENDA, que nascia **zero**.
--
-- Por que zero é pior do que parece:
--
--   • O produto nasce inativo, esperando revisão. Quem revisa precisa lembrar
--     de pôr o preço — e "lembrar depois" é justamente o que não acontece
--     numa loja cheia.
--   • Enquanto o preço for zero, a margem daquele produto aparece como -100%
--     em qualquer tela que a mostre: custou R$ 200, "vende" por R$ 0.
--   • Se alguém ativar o produto sem reparar no preço, ele entra na vitrine
--     valendo nada.
--
-- Agora o vendedor informa por quanto pretende revender no mesmo momento em
-- que está com o aparelho na mão e sabe o estado dele. O campo é OPCIONAL:
-- quem não souber na hora deixa em branco e cai no comportamento de antes.
-- Obrigar travaria o balcão com fila.
--
-- ⚠️ POR QUE TEM UM DROP AQUI
--
-- `CREATE OR REPLACE` só substitui uma função quando a lista de tipos dos
-- parâmetros é IDÊNTICA. Acrescentar um parâmetro — mesmo no fim, mesmo com
-- DEFAULT — cria uma função NOVA ao lado da antiga. Ficariam duas com o mesmo
-- nome, e a chamada por nome de argumento passaria a ser ambígua: o Postgres
-- recusa com "function is not unique", numa tela que funcionava ontem.
-- Por isso a antiga é derrubada pela assinatura exata antes.

DROP FUNCTION IF EXISTS public.registrar_entrada_produto_troca(
  UUID, TEXT, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, DECIMAL, TEXT
);

CREATE FUNCTION public.registrar_entrada_produto_troca(
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
  -- NOVO em 25/08. NULL = "ainda não sei", e o produto nasce com preço zero
  -- como antes.
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
  v_cliente_id   UUID;
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

  SELECT tenant_id, cliente_id INTO v_tenant_id, v_cliente_id
  FROM public.vendas WHERE id = _venda_id;

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

  -- 3) O rastro: este produto veio desta venda, com este valor.
  INSERT INTO public.entradas_produto_troca (
    tenant_id, venda_id, produto_id, pagamento_id, cliente_id, valor_entrada
  ) VALUES (
    v_tenant_id, _venda_id, v_produto_id, v_pagamento_id, v_cliente_id, _valor_entrada
  );

  RETURN v_produto_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_entrada_produto_troca IS
  'Recebe um produto usado como parte do pagamento: cria o produto INATIVO com custo = valor de entrada e preço = o que o vendedor pretende revender (opcional, 25/08), lança o valor como pagamento da venda e guarda o rastro até a venda de origem.';

REVOKE ALL ON FUNCTION public.registrar_entrada_produto_troca FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrada_produto_troca TO authenticated;
