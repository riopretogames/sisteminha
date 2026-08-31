-- =============================================================================
-- A FUNÇÃO DE CUSTO DO SERVIÇO PASSA A PEDIR CRACHÁ
-- =============================================================================
--
-- Achado da revisão de 01/09, confirmado por três ângulos diferentes: a função
-- `custo_das_pecas_do_servico` (criada em 31/08) devolve o custo de compra das
-- peças para QUALQUER pessoa logada.
--
-- Por que isso escapou: ela é `SECURITY DEFINER` de propósito, para conseguir
-- ler `produtos.custo` — a coluna que a trava de custo esconde. O comentário
-- original diz "quem não pode ver custo continua sem poder ver a coluna", e
-- isso é verdade para a COLUNA. Só que a função devolve o mesmo número por
-- outro caminho, sem perguntar nada a ninguém.
--
-- É exatamente o buraco que o CLAUDE.md descreve na regra da chave mestra:
-- quem usa privilégio de dono precisa conferir o crachá de quem pediu ANTES de
-- usar o privilégio. `ajustar_estoque_produto` e `registrar_entrada_mercadoria`
-- já fazem isso; esta nasceu sem.
--
-- Hoje nenhuma tela chama a função, então nada muda para a loja. Mas a porta
-- ficaria aberta esperando alguém ligar — e a promessa do sistema é que o
-- custo de compra só aparece para quem tem `inventory.cost.view`.

CREATE OR REPLACE FUNCTION public.custo_das_pecas_do_servico(_servico_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  -- A conferência vem ANTES de tocar no custo. Com a chave de dono na mão,
  -- perguntar depois seria perguntar tarde.
  IF NOT public.has_permission(auth.uid(), 'inventory.cost.view') THEN
    RAISE EXCEPTION 'Seu acesso não permite ver custo de peça.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(SUM(sp.quantidade * COALESCE(p.custo, 0)), 0)
    INTO v_total
    FROM public.servico_pecas sp
    JOIN public.produtos p ON p.id = sp.produto_id
   WHERE sp.servico_id = _servico_id
     AND sp.tenant_id = public.get_user_tenant_id(auth.uid());

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.custo_das_pecas_do_servico(UUID) IS
  'Quanto custam, hoje, as peças da ficha técnica de um serviço. Exige inventory.cost.view: a função lê uma coluna protegida com privilégio de dono, então confere o crachá de quem pediu antes de usar esse privilégio. Recalcula sozinho quando o custo da peça muda — diferente de servicos.custo_estimado, que é digitado e envelhece.';
