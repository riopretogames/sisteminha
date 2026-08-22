-- =============================================================================
-- Sisteminha (RPG System.IO) — cliente bloqueado não entrega/cobra OS paga
-- =============================================================================
--
-- ACHADO NA VERIFICAÇÃO POR CÓDIGO DE 22/08, fora do escopo original do
-- passo 25 do roteiro (que testa só a ABERTURA da OS): `NovaOS.tsx` mostra,
-- quando o dono do aparelho está bloqueado, o aviso:
--
--   "A OS pode ser aberta normalmente [...] Mas o sistema vai RECUSAR A
--    COBRANÇA NA ENTREGA enquanto o bloqueio existir."
--
-- Isso é uma promessa explícita de tela. Conferido no banco: não existia
-- nenhuma checagem de `clientes.liberado_venda` nem em
-- `conferir_pagamento_ao_entregar_os()` nem em `gerar_titulo_ao_entregar_os()`
-- — a OS entrega e cobra normalmente mesmo com o cliente bloqueado. A tela
-- promete uma trava que o banco nunca teve.
--
-- Mesmo raciocínio de `impedir_venda_cliente_bloqueado` (20260808160000):
-- a recusa tem que ser do banco, não só da tela, senão uma chamada direta
-- na API ou uma tela futura furam sem ningém notar. Escopo: só OS tipo
-- 'paga' com orçamento > 0 — é exatamente o caso em que existe cobrança de
-- verdade (garantia/cortesia não cobram nada, então não há "cobrança" pra
-- recusar).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.conferir_pagamento_ao_entregar_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago       DECIMAL(10,2);
  v_bloqueado  BOOLEAN;
  v_nome       TEXT;
BEGIN
  -- Só interessa quando a OS ESTÁ ficando entregue: ou nasce assim (INSERT),
  -- ou passa a ser agora (UPDATE vindo de outra etapa).
  IF NEW.status <> 'entregue' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  -- Garantia/cortesia e orçamento zerado não cobram nada — nada pra
  -- conferir (mesmo critério de gerar_titulo_ao_entregar_os).
  IF NEW.tipo <> 'paga' OR NEW.total_orcamento <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT NOT COALESCE(c.liberado_venda, true), c.nome
      INTO v_bloqueado, v_nome
    FROM public.clientes c
    WHERE c.id = NEW.cliente_id
      AND c.tenant_id = NEW.tenant_id;

    IF COALESCE(v_bloqueado, false) THEN
      RAISE EXCEPTION
        'O cliente % está bloqueado para venda — a cobrança desta OS foi recusada. Libere na ficha dele (Cadastros > Clientes) antes de entregar.',
        v_nome
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_pago
  FROM public.os_pagamentos
  WHERE os_id = NEW.id;

  IF v_pago < NEW.total_orcamento THEN
    RAISE EXCEPTION
      'Registre o pagamento do orçamento (R$ %) antes de marcar a OS como entregue — falta R$ %.',
      NEW.total_orcamento, (NEW.total_orcamento - v_pago)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.conferir_pagamento_ao_entregar_os() IS
  'Impede marcar OS paga como entregue sem pagamento suficiente em os_pagamentos, e agora também recusa entregar/cobrar OS paga de cliente com liberado_venda = false (achado 22/08 — a tela já prometia essa recusa, o banco não cumpria). Vale para INSERT e UPDATE.';

NOTIFY pgrst, 'reload schema';
