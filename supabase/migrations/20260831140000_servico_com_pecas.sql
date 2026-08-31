-- =============================================================================
-- SERVIÇO COM PEÇAS: A FICHA TÉCNICA DO QUE A BANCADA FAZ
-- =============================================================================
--
-- Pedido do Felipe em 31/08, comparando com o sistema antigo: *"a tela de
-- adicionar serviço tem que ser mais complexa. Tem que ser um botão Adicionar
-- serviço que abre a opção de adicionar peça e custo. Já tem serviços
-- pré-cadastrados, com os custos já pré-cadastrados, com as peças já
-- pré-cadastradas."*
--
-- Hoje o cadastro de serviços guarda nome, preço de referência e custo
-- estimado — mas o custo é um número digitado, solto. Ninguém sabe DE QUE ele
-- é feito, e quando o preço da peça muda, o custo do serviço continua o mesmo,
-- mentindo em silêncio.
--
-- E na OS, "Troca de tela" e a tela em si são dois lançamentos separados que o
-- técnico precisa lembrar de fazer. Esquecer o segundo tira a peça do estoque
-- da conta e infla a margem daquele serviço.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTA TABELA É
-- -----------------------------------------------------------------------------
-- A lista de peças que um serviço consome, por padrão. "Troca de tela do
-- iPhone 11" consome 1 tela de iPhone 11; "Limpeza interna" não consome peça
-- nenhuma e continua sem nenhuma linha aqui.
--
-- É PADRÃO, não obrigação: a OS de verdade pode trocar a peça, mudar a
-- quantidade ou tirar. O que a ficha técnica faz é a bancada não precisar
-- lembrar — e o custo do serviço passar a ser uma CONTA, não um palpite
-- digitado uma vez e esquecido.

CREATE TABLE IF NOT EXISTS public.servico_pecas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  servico_id  UUID NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  produto_id  UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,

  -- Quase sempre 1, mas existe serviço que leva duas (dois analógicos, quatro
  -- parafusos). Numérico e não inteiro porque peça vendida por metro ou grama
  -- existe no ramo (fita, solda, cola).
  quantidade  NUMERIC NOT NULL DEFAULT 1 CHECK (quantidade > 0),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A mesma peça duas vezes no mesmo serviço é erro de digitação, não caso de
  -- uso: quem precisa de duas unidades aumenta a quantidade.
  UNIQUE (servico_id, produto_id)
);

COMMENT ON TABLE public.servico_pecas IS
  'As peças que um serviço consome por padrão — a ficha técnica dele. Serve para a OS lançar serviço e peças de uma vez, e para o custo do serviço ser uma conta em vez de um número digitado. Pedido do Felipe em 31/08.';

COMMENT ON COLUMN public.servico_pecas.produto_id IS
  'ON DELETE RESTRICT de propósito: apagar do estoque uma peça que faz parte de um serviço tem que avisar, não sumir com a ficha técnica em silêncio.';

CREATE INDEX IF NOT EXISTS idx_servico_pecas_servico
  ON public.servico_pecas(tenant_id, servico_id);

CREATE TRIGGER update_servico_pecas_updated_at
  BEFORE UPDATE ON public.servico_pecas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- QUEM VÊ E QUEM MEXE
-- -----------------------------------------------------------------------------
-- Ler é livre dentro da loja: o técnico precisa enxergar a ficha técnica para
-- lançar o serviço na OS, e ele não administra cadastro.
--
-- Mexer exige a mesma permissão de cadastrar serviço.

ALTER TABLE public.servico_pecas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver pecas do servico do tenant"
  ON public.servico_pecas FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Gerenciar pecas do servico do tenant"
  ON public.servico_pecas FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.services.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.services.manage')
  );

-- -----------------------------------------------------------------------------
-- O CUSTO DO SERVIÇO VIRA CONTA
-- -----------------------------------------------------------------------------
-- Soma o custo médio das peças da ficha técnica. Não mexe em
-- `servicos.custo_estimado`: aquele campo continua sendo o palpite de mão de
-- obra e do que não é peça, e quem lê os dois junto é a tela.
--
-- SECURITY DEFINER porque `produtos.custo` é coluna protegida (regra de
-- custo protegido, Opção B): quem não pode ver custo continua sem poder ver a
-- coluna, mas pode saber quanto custa o serviço que está lançando.

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
  'Quanto custam, hoje, as peças da ficha técnica de um serviço. Recalcula sozinho quando o custo da peça muda — diferente de servicos.custo_estimado, que é digitado e envelhece.';

REVOKE ALL ON FUNCTION public.custo_das_pecas_do_servico(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custo_das_pecas_do_servico(UUID) TO authenticated;
