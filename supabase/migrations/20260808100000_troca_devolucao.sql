-- =============================================================================
-- RPG System.IO — Troca e Devolução de produto
-- =============================================================================
--
-- Feature nova, desenhada com o Felipe em 08/08 (PLANO-DE-REFINAMENTO.md,
-- Vendas/PDV): a loja não tinha NENHUM jeito de registrar troca ou
-- devolução de produto — decisão do Felipe: devolução real de dinheiro
-- (não vira crédito de loja), cobrindo os dois casos (devolução pura e
-- troca por outro produto) numa tela só. A loja não trabalha com
-- crediário, então não existe cenário de "cliente fica devendo".
--
-- Desenho:
-- - `devolucoes` guarda o evento (venda original, produto(s) novo(s) se
--   houve troca — como uma venda de verdade, reaproveitando toda a
--   infraestrutura de baixa de estoque que já existe —, e o acerto
--   financeiro: OU devolve dinheiro ao cliente OU o cliente paga a
--   diferença, nunca os dois ao mesmo tempo numa mesma devolução).
-- - `devolucao_itens` guarda quais itens da venda ORIGINAL voltaram, com o
--   preço unitário da venda original (não o preço atual do produto — pode
--   ter mudado desde então).
-- - Estoque dos itens devolvidos volta sozinho via gatilho — mesmo padrão
--   de `baixar_estoque_venda`/`estornar_estoque_venda_cancelada`, só que
--   no sentido de entrada. Itens novos (troca) entram como uma venda
--   normal em `vendas`/`itens_venda`, então a baixa de estoque já
--   acontece pelo gatilho que já existe — não duplica lógica aqui.
--
-- Pendência conhecida, já registrada no plano: o dinheiro que sai numa
-- devolução ainda não aparece na conferência de Caixa (achado já existente
-- de que o Caixa não reflete venda/OS real) — quando isso for corrigido no
-- Financeiro, `devolucoes.valor_devolvido_cliente` precisa entrar na conta.
-- =============================================================================

CREATE TABLE public.devolucoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  numero_devolucao    TEXT,
  venda_original_id   UUID NOT NULL REFERENCES public.vendas(id),
  -- Preenchido só quando teve troca (produto novo levado no lugar). É uma
  -- venda de verdade, com seus próprios itens_venda/pagamentos_venda —
  -- não duplicamos essas tabelas aqui.
  venda_nova_id       UUID REFERENCES public.vendas(id),
  -- Só um dos dois é diferente de zero: ou devolve dinheiro pro cliente,
  -- ou o cliente paga a diferença (produto novo mais caro). Nunca os dois.
  valor_devolvido_cliente    DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (valor_devolvido_cliente >= 0),
  valor_cliente_pagou_a_mais DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (valor_cliente_pagou_a_mais >= 0),
  -- Forma usada pra acertar a diferença (devolver ou cobrar a mais) — o
  -- mesmo cadastro de Formas de Pagamento que o PDV já usa. Nulo quando a
  -- troca bate certinho (diferença zero, nada a acertar).
  forma_pagamento_id  UUID REFERENCES public.formas_pagamento(id),
  motivo              TEXT,
  usuario_id          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT devolucao_no_maximo_um_sentido_de_acerto CHECK (
    valor_devolvido_cliente = 0 OR valor_cliente_pagou_a_mais = 0
  )
);

COMMENT ON TABLE public.devolucoes IS
  'Troca ou devolução de produto de uma venda já fechada. Devolve dinheiro de verdade (a loja não trabalha com crédito de loja nem crediário).';

CREATE INDEX idx_devolucoes_venda_original ON public.devolucoes(venda_original_id);
CREATE INDEX idx_devolucoes_tenant ON public.devolucoes(tenant_id, created_at);

CREATE TABLE public.devolucao_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucao_id   UUID NOT NULL REFERENCES public.devolucoes(id) ON DELETE CASCADE,
  produto_id     UUID NOT NULL REFERENCES public.produtos(id),
  quantidade     INTEGER NOT NULL CHECK (quantidade > 0),
  -- Preço da venda ORIGINAL, não o preço atual do produto — o reembolso
  -- tem que refletir quanto o cliente pagou de verdade, mesmo que o preço
  -- do produto tenha mudado desde a venda.
  preco_unitario DECIMAL(10,2) NOT NULL
);

COMMENT ON TABLE public.devolucao_itens IS
  'Quais itens da venda original voltaram, e a que preço (da venda original, não o atual).';

CREATE INDEX idx_devolucao_itens_devolucao ON public.devolucao_itens(devolucao_id);

ALTER TABLE public.devolucoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devolucao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver devolucoes do tenant"
  ON public.devolucoes FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- `sales.cancel` já existia cadastrada (era permissão decorativa, sem UI
-- nenhuma usando ela) — troca/devolução é exatamente o tipo de ação que
-- essa permissão deveria gatear, então reaproveitamos em vez de criar uma
-- permissão nova.
CREATE POLICY "Quem cancela venda registra devolucao"
  ON public.devolucoes FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'sales.cancel')
  );

CREATE POLICY "Ver itens de devolucao do tenant"
  ON public.devolucao_itens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.devolucoes d
    WHERE d.id = devolucao_id
      AND d.tenant_id = public.get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Quem cancela venda lanca itens de devolucao"
  ON public.devolucao_itens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.devolucoes d
    WHERE d.id = devolucao_id
      AND d.tenant_id = public.get_user_tenant_id(auth.uid())
      AND public.has_permission(auth.uid(), 'sales.cancel')
  ));

-- Numeração sequencial (DV-202608-0001), reaproveitando o mesmo contador
-- de documentos que OS e Venda já usam.
CREATE OR REPLACE FUNCTION public.generate_devolucao_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.numero_devolucao := public.proximo_numero_documento(NEW.tenant_id, 'DV');
  RETURN NEW;
END;
$$;

CREATE TRIGGER gerar_numero_devolucao
  BEFORE INSERT ON public.devolucoes
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_devolucao_number();

-- Devolve estoque do item devolvido — mesmo padrão de
-- baixar_estoque_venda()/estornar_estoque_venda_cancelada(), no sentido de
-- entrada. Itens NOVOS de uma troca não passam por aqui: eles viram uma
-- venda de verdade (venda_nova_id), então o gatilho de baixa de estoque
-- que já existe cuida disso sozinho.
CREATE OR REPLACE FUNCTION public.estornar_estoque_devolucao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto RECORD;
BEGIN
  SELECT estoque_atual, custo, tenant_id
  INTO v_produto
  FROM public.produtos
  WHERE id = NEW.produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Produto excluído desde a venda original — não há pra onde devolver
    -- estoque, mas não bloqueia o registro da devolução por isso.
    RETURN NEW;
  END IF;

  UPDATE public.produtos
  SET estoque_atual = estoque_atual + NEW.quantidade
  WHERE id = NEW.produto_id;

  INSERT INTO public.movimentos_estoque (
    tenant_id, produto_id, tipo, quantidade,
    custo_unitario, valor_total,
    motivo, origem, usuario_id,
    saldo_anterior, saldo_depois
  ) VALUES (
    v_produto.tenant_id,
    NEW.produto_id,
    'entrada',
    NEW.quantidade,
    v_produto.custo,
    v_produto.custo * NEW.quantidade,
    'Devolução de produto',
    'devolucao:' || NEW.devolucao_id::text,
    auth.uid(),
    v_produto.estoque_atual,
    v_produto.estoque_atual + NEW.quantidade
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.estornar_estoque_devolucao() IS
  'Devolve estoque e grava auditoria em movimentos_estoque quando um item volta numa troca/devolução. Espelha estornar_estoque_venda_cancelada(), só que por item devolvido em vez de venda cancelada inteira.';

CREATE TRIGGER estornar_estoque_ao_devolver
  AFTER INSERT ON public.devolucao_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.estornar_estoque_devolucao();
