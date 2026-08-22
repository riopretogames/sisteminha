-- =============================================================================
-- Sisteminha (RPG System.IO) — título de OS não duplica ao reentregar
-- =============================================================================
--
-- ACHADO NA VERIFICAÇÃO POR CÓDIGO DE 22/08 (roteiro de teste, passo 29): a
-- migration 20260821110000 recriou `gerar_titulo_ao_entregar_os` pra também
-- valer em INSERT (OS que já nasce entregue), mas nessa reescrita perdeu a
-- trava de idempotência que a versão original (20260805150000) tinha —
-- o `IF NOT EXISTS (SELECT 1 FROM titulos_financeiros WHERE os_id = NEW.id)`
-- não foi copiado pra função nova.
--
-- Consequência real: hoje já é possível reabrir uma OS entregue (passo 29 do
-- roteiro, correção de 21/08) e o próprio roteiro promete que "a cobrança
-- CONTINUA lá" depois de reabrir. Mas se alguém, depois de reabrir, entregar
-- a mesma OS de novo, o gatilho dispara outra vez sem checar se já existe
-- título pra essa OS — nasce um SEGUNDO título em Contas a Receber, cobrando
-- o cliente duas vezes pelo mesmo conserto.
--
-- Correção: devolve a checagem de idempotência (mesmo texto/lugar da versão
-- original), agora dentro da função que já cobre INSERT e UPDATE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.gerar_titulo_ao_entregar_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'entregue' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  NEW.data_finalizacao := COALESCE(NEW.data_finalizacao, now());

  IF NEW.tipo <> 'paga' OR NEW.total_orcamento <= 0 THEN
    NEW.valor_final_pago := COALESCE(NEW.valor_final_pago, 0);
    RETURN NEW;
  END IF;

  NEW.valor_final_pago := COALESCE(
    NEW.valor_final_pago,
    (SELECT SUM(valor) FROM public.os_pagamentos WHERE os_id = NEW.id),
    NEW.total_orcamento
  );

  -- Idempotência: se a OS já tinha um título gerado (ex.: foi reaberta e
  -- entregue outra vez), NÃO cria um segundo. Perdida na reescrita de
  -- 20260821110000 — devolvida aqui.
  IF NOT EXISTS (SELECT 1 FROM public.titulos_financeiros WHERE os_id = NEW.id) THEN
    INSERT INTO public.titulos_financeiros (
      tenant_id, natureza, descricao, cliente_id, os_id,
      valor, valor_pago, vencimento, competencia, status, pago_em
    ) VALUES (
      NEW.tenant_id, 'receber',
      'OS ' || NEW.numero_os || ' — serviço',
      NEW.cliente_id, NEW.id,
      NEW.valor_final_pago, NEW.valor_final_pago,
      now()::date, now()::date, 'pago', now()::date
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.gerar_titulo_ao_entregar_os() IS
  'Gera o título a receber quando a OS paga vira entregue. Vale para INSERT e UPDATE. Idempotente por os_id — reabrir e entregar de novo não duplica o título (achado 22/08, a versão de 21/08 tinha perdido essa trava).';

NOTIFY pgrst, 'reload schema';
