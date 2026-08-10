-- =============================================================================
-- Sisteminha (RP System.IO) — Entrada de Produto por Troca
-- =============================================================================
--
-- Pedido do Felipe: cliente compra algo novo (ex.: um PS5) e dá um aparelho
-- usado como parte do pagamento (ex.: o PS4 dele). Esse aparelho tem que:
--   1. Entrar no estoque da loja como produto (INATIVO até alguém revisar e
--      definir o preço de revenda — decisão do Felipe, 09/08).
--   2. Ficar rastreável até a venda e o cliente de origem, pra dar cobertura
--      se der defeito depois de revendido.
--   3. Abater o valor dele do total a pagar da venda.
--
-- DESENHO — por que uma tabela nova em vez de só uma coluna em `produtos`:
-- o rastreio ("de quem veio esse produto, em qual venda") precisa sobreviver
-- mesmo que o produto seja revendido, editado ou tenha o estoque zerado —
-- uma coluna em `produtos` seria perdida nesse caso. Uma linha em
-- `entradas_produto` fica pra sempre, ligando produto_id → venda_id →
-- vendas.cliente_id → clientes, sem duplicar dado de cliente.
--
-- Por que o valor da troca entra como PAGAMENTO (`pagamentos_venda`, forma
-- `vale_troca`) e não como desconto: `vale_troca` já existe no enum
-- `forma_pagamento` desde a base do projeto e nunca foi usado em lugar
-- nenhum — é exatamente pra isso. Usar como pagamento significa que a soma
-- "quanto já foi pago" da venda já inclui o valor da troca automaticamente,
-- sem precisar mexer em nenhuma fórmula de total/troco que já existe no PDV.
-- =============================================================================

CREATE TABLE public.entradas_produto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  venda_id UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  pagamento_venda_id UUID REFERENCES public.pagamentos_venda(id) ON DELETE SET NULL,
  valor_entrada DECIMAL(10,2) NOT NULL CHECK (valor_entrada >= 0),
  observacoes TEXT,
  usuario_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_entradas_produto_venda   ON public.entradas_produto(venda_id);
CREATE INDEX idx_entradas_produto_produto ON public.entradas_produto(produto_id);
CREATE INDEX idx_entradas_produto_tenant  ON public.entradas_produto(tenant_id);

COMMENT ON TABLE public.entradas_produto IS
  'Rastro de produto usado recebido como parte de pagamento numa venda (troca). Liga produto_id -> venda_id -> vendas.cliente_id, pra dar cobertura se o item, já revendido, apresentar defeito depois.';

ALTER TABLE public.entradas_produto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver entradas de produto do tenant"
  ON public.entradas_produto FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Só a RPC abaixo grava aqui de verdade (SECURITY DEFINER, contorna esta
-- policy) — mas a policy de INSERT existe do mesmo jeito, coerente com o
-- resto do projeto (nunca deixar uma tabela sem nenhuma policy de escrita
-- sem motivo documentado).
CREATE POLICY "Quem vende registra entrada de produto"
  ON public.entradas_produto FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'sales.create')
  );

-- =============================================================================
-- A FUNÇÃO QUE FAZ AS TRÊS COISAS NUMA CHAMADA SÓ
-- =============================================================================
--
-- SECURITY DEFINER pelo mesmo motivo de baixar_estoque_venda()/
-- estornar_estoque_devolucao(): quem opera o PDV (vendedor) não tem
-- `inventory.create` (é permissão do módulo de Estoque, não de Vendas) — um
-- INSERT direto em `produtos` feito pelo front seria recusado pela RLS.
--
-- tenant_id NÃO é recebido como parâmetro — é sempre calculado a partir de
-- quem está logado (`get_user_tenant_id(auth.uid())`), pra nenhuma chamada
-- conseguir gravar produto/entrada em nome de outra loja.

CREATE OR REPLACE FUNCTION public.registrar_entrada_produto_troca(
  _venda_id UUID,
  _nome TEXT,
  _grupo_produto_id UUID,
  _marca_id UUID,
  _modelo_id UUID,
  _cor_id UUID,
  _condicao_id UUID,
  _memoria_id UUID,
  _imei_serial TEXT,
  _valor_entrada DECIMAL,
  _observacoes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_produto_id UUID;
  v_pagamento_id UUID;
BEGIN
  v_tenant_id := public.get_user_tenant_id(auth.uid());

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem loja associada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission(auth.uid(), 'sales.create') THEN
    RAISE EXCEPTION 'Seu acesso não permite registrar entrada de produto por troca.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _valor_entrada < 0 THEN
    RAISE EXCEPTION 'Valor de entrada não pode ser negativo.';
  END IF;

  IF _nome IS NULL OR btrim(_nome) = '' THEN
    RAISE EXCEPTION 'Descrição do produto recebido é obrigatória.';
  END IF;

  -- Confere que a venda é de fato desta loja, antes de vincular qualquer
  -- coisa a ela (evita vincular a uma venda de outro tenant).
  IF NOT EXISTS (
    SELECT 1 FROM public.vendas v WHERE v.id = _venda_id AND v.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Venda não encontrada para esta loja.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1) O produto usado entra no estoque, inativo até alguém revisar e
  -- precificar (decisão do Felipe). custo = valor_entrada (foi o que a loja
  -- "pagou" por ele, em forma de abatimento na venda); preço fica em 0 até
  -- a revisão. O INSERT abaixo já dispara sozinho o trigger existente
  -- `registrar_entrada_ao_cadastrar_produto`, que grava a movimentação de
  -- estoque — nada precisa ser feito aqui além do INSERT.
  INSERT INTO public.produtos (
    tenant_id, nome, grupo_produto_id, marca_id, modelo_id, cor_id,
    condicao_id, memoria_id, imei_serial, custo, preco, estoque_atual, ativo
  ) VALUES (
    v_tenant_id, btrim(_nome), _grupo_produto_id, _marca_id, _modelo_id, _cor_id,
    _condicao_id, _memoria_id, _imei_serial, _valor_entrada, 0, 1, false
  ) RETURNING id INTO v_produto_id;

  -- 2) O valor da troca entra como pagamento da venda (forma "vale_troca"),
  -- pra já contar automaticamente em "quanto foi pago".
  INSERT INTO public.pagamentos_venda (
    venda_id, forma, forma_pagamento_id, parcelas, valor
  ) VALUES (
    _venda_id, 'vale_troca', NULL, 1, _valor_entrada
  ) RETURNING id INTO v_pagamento_id;

  -- 3) O rastro: este produto veio desta venda, com este valor.
  INSERT INTO public.entradas_produto (
    tenant_id, venda_id, produto_id, pagamento_venda_id, valor_entrada, observacoes, usuario_id
  ) VALUES (
    v_tenant_id, _venda_id, v_produto_id, v_pagamento_id, _valor_entrada, _observacoes, auth.uid()
  );

  RETURN v_produto_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_entrada_produto_troca IS
  'Chamada pelo PDV ao fechar uma venda com produto recebido em troca. Cria o produto (inativo), o pagamento vale_troca e o rastro em entradas_produto numa transação só. SECURITY DEFINER porque o vendedor não tem inventory.create.';

NOTIFY pgrst, 'reload schema';
