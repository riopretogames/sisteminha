-- =============================================================================
-- Sisteminha (RP System.IO) — Entrega pelo vendedor e controle de abandono
-- =============================================================================
--
-- Duas decisões do Felipe em 09/08:
--
--   1. "O vendedor apenas pode marcar como entregue."
--   2. "Gera avisos recorrentes no painel: produto abandonado mais de seis
--      meses é descartado ou vendido para cobrar o custo dos reparos."
--
-- -----------------------------------------------------------------------------
-- 1. ENTREGA PELO VENDEDOR
-- -----------------------------------------------------------------------------
-- Hoje o vendedor não muda status NENHUM: ele não tem `orders.edit`, e o banco
-- recusa. Quem entrega o aparelho no balcão precisa ter que chamar o técnico só
-- para clicar em "Entregue" — ou, pior, pedir o login de alguém.
--
-- Mas dar `orders.edit` ao vendedor abriria o fluxo técnico inteiro para ele:
-- poderia mandar OS de volta para reparo, mexer em orçamento. Por isso nasce
-- uma permissão só para o ato da entrega.
--
-- A trava é de banco, não de tela: a policy passa a aceitar quem tem
-- `orders.deliver`, e um gatilho garante que essa pessoa SÓ consiga mudar o
-- status para "entregue" — nada mais na OS.

INSERT INTO public.permissions (key, modulo, descricao) VALUES
  ('orders.deliver', 'OS', 'Entregar aparelho ao cliente (marcar OS como entregue)')
ON CONFLICT (key) DO NOTHING;

-- Quem atende o balcão entrega. O técnico não entra aqui de propósito: ele já
-- tem `orders.edit`, que cobre tudo.
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('administrador',   'orders.deliver'),
  ('gerente',         'orders.deliver'),
  ('gerente_tecnico', 'orders.deliver'),
  ('atendente',       'orders.deliver'),
  ('vendedor',        'orders.deliver')
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Quem edita OS atualiza" ON public.service_orders;

CREATE POLICY "Quem edita OS atualiza"
  ON public.service_orders FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'orders.edit')
      OR public.has_permission(auth.uid(), 'orders.deliver')
    )
  );


CREATE OR REPLACE FUNCTION public.limitar_alteracao_de_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Quem edita OS de verdade passa direto.
  IF public.has_permission(auth.uid(), 'orders.edit') THEN
    RETURN NEW;
  END IF;

  -- Daqui pra baixo é quem só tem `orders.deliver`. A ÚNICA coisa permitida é
  -- levar a OS para "entregue".
  IF NEW.status IS DISTINCT FROM 'entregue' THEN
    RAISE EXCEPTION
      'Seu acesso permite apenas marcar a OS como entregue.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- E nada mais pode mudar junto. Sem isto, daria para "entregar" a OS e no
  -- mesmo movimento alterar o valor do orçamento.
  IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) AND (
       NEW.total_orcamento  IS DISTINCT FROM OLD.total_orcamento
    OR NEW.defeito_cliente  IS DISTINCT FROM OLD.defeito_cliente
    OR NEW.cliente_id       IS DISTINCT FROM OLD.cliente_id
    OR NEW.tecnico_id       IS DISTINCT FROM OLD.tecnico_id
    OR NEW.garantia_dias    IS DISTINCT FROM OLD.garantia_dias
    OR NEW.tipo             IS DISTINCT FROM OLD.tipo
  ) THEN
    RAISE EXCEPTION
      'Seu acesso permite marcar a OS como entregue, mas não alterar os dados dela.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limitar_alteracao_os ON public.service_orders;

-- BEFORE, e depois do gatilho que gera o título (nome alfabético manda na
-- ordem quando os dois são BEFORE UPDATE): a validação de permissão tem que
-- rodar antes de qualquer efeito colateral.
CREATE TRIGGER trg_limitar_alteracao_os
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.limitar_alteracao_de_os();


-- -----------------------------------------------------------------------------
-- 2. APARELHO PARADO ESPERANDO O CLIENTE BUSCAR
-- -----------------------------------------------------------------------------
-- Regra da loja: aparelho pronto que o cliente não busca em 6 meses é tratado
-- como abandonado — descartado ou vendido para cobrar o custo do reparo.
--
-- Para isso a loja precisa de duas coisas que o sistema não dava: saber há
-- quantos dias cada aparelho está parado, e ter onde cobrar o cliente antes de
-- chegar nos 6 meses. Uma view resolve as duas — a tela lê dela, e a automação
-- do n8n também, sem cada lado refazer a conta do seu jeito.
--
-- A contagem começa em `data_finalizacao` (quando o serviço ficou pronto). Se
-- estiver vazia, usa a última atualização — OS antiga pode não ter a data.

CREATE OR REPLACE VIEW public.vw_os_aguardando_retirada
WITH (security_barrier = true) AS
SELECT
  s.id,
  s.tenant_id,
  s.numero_os,
  s.status,
  s.marca,
  s.modelo,
  s.numero_serie,
  s.total_orcamento,
  s.cliente_id,
  c.nome AS cliente_nome,
  COALESCE(c.telefones[1], '') AS cliente_telefone,
  COALESCE(s.data_finalizacao, s.updated_at, s.created_at) AS pronto_desde,
  (CURRENT_DATE - COALESCE(s.data_finalizacao, s.updated_at, s.created_at)::date) AS dias_parado,
  CASE
    WHEN (CURRENT_DATE - COALESCE(s.data_finalizacao, s.updated_at, s.created_at)::date) >= 180
      THEN 'abandonado'
    WHEN (CURRENT_DATE - COALESCE(s.data_finalizacao, s.updated_at, s.created_at)::date) >= 90
      THEN 'critico'
    WHEN (CURRENT_DATE - COALESCE(s.data_finalizacao, s.updated_at, s.created_at)::date) >= 30
      THEN 'atencao'
    ELSE 'normal'
  END AS faixa
FROM public.service_orders s
LEFT JOIN public.clientes c ON c.id = s.cliente_id
WHERE s.status = 'finalizado'
  AND s.tenant_id = public.get_user_tenant_id(auth.uid());

COMMENT ON VIEW public.vw_os_aguardando_retirada IS
  'Aparelhos prontos que o cliente ainda não buscou, com há quantos dias estão '
  'parados. Faixas: 30 dias = atenção, 90 = crítico, 180 = abandonado (a loja '
  'descarta ou vende para cobrar o reparo). Uma conta só, para a tela e para a '
  'automação não divergirem.';

GRANT SELECT ON public.vw_os_aguardando_retirada TO authenticated;


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- 1) A permissão nova chegou nos papéis certos?
--    SELECT role FROM public.role_permissions
--     WHERE permission_key = 'orders.deliver' ORDER BY role;
--
-- 2) A view responde?
--    SELECT numero_os, cliente_nome, dias_parado, faixa
--      FROM public.vw_os_aguardando_retirada ORDER BY dias_parado DESC;
--
-- 3) A trava do vendedor funciona? Só dá para testar entrando com um usuário
--    que tenha `orders.deliver` e NÃO tenha `orders.edit`: mudar para
--    "entregue" tem que passar, e qualquer outra mudança tem que ser recusada.
-- =============================================================================
