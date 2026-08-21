-- =============================================================================
-- Sisteminha (RPG System.IO) — OS que JÁ NASCE entregue também é conferida
-- =============================================================================
--
-- ACHADO NOS TESTES DE 21/08, com massa de dados de verdade: as duas travas da
-- entrega de OS só valem para UPDATE. Criando a OS já com `status = 'entregue'`
-- num único INSERT, as duas são puladas de uma vez:
--
--   1. `conferir_pagamento_ao_entregar` (BEFORE UPDATE) — não confere nada,
--      então nasce uma OS "entregue" de R$ 999 sem um centavo registrado.
--   2. `gerar_titulo_ao_entregar_os` (BEFORE UPDATE) — não gera o título,
--      então esse dinheiro não existe para o Financeiro. Testado: título
--      gerado = 0.
--
-- Resultado combinado: um atendimento inteiro, com valor, some do controle
-- financeiro sem deixar rastro de que deveria estar lá. Não é "número errado",
-- é dinheiro invisível.
--
-- POR QUE ISSO IMPORTA, MESMO A TELA NÃO FAZENDO ISSO: a tela sempre cria a OS
-- na primeira etapa, então hoje ninguém tropeça por acidente. Mas dois
-- caminhos reais e já planejados batem exatamente aqui:
--
--   - **A migração do sistema antigo.** Quando a loja sair do sistema atual,
--     alguém vai importar o histórico — e OS já concluída entra no INSERT com
--     status final. Seria o pior momento possível pra descobrir que nenhuma
--     delas gerou título.
--   - **As automações do n8n**, que já têm base pronta e escrevem direto na
--     API, sem passar pela tela.
--
-- CORREÇÃO: as duas funções passam a valer para INSERT também. A condição de
-- saída fica explícita com TG_OP em vez de depender do NULL de OLD (em INSERT,
-- `OLD.status = 'entregue'` avalia como NULL, e o IF não entra por acaso — o
-- comportamento até era o certo, mas por sutileza de SQL, não por decisão
-- escrita; quem lesse depois não teria como saber se era intencional).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.conferir_pagamento_ao_entregar_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago DECIMAL(10,2);
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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.conferir_pagamento_ao_entregar_os() IS
  'Impede marcar OS paga como entregue sem pagamento suficiente em os_pagamentos. Vale para INSERT e UPDATE: OS importada ou criada por API já com status entregue passa pela mesma conferência que a tela faz.';

COMMENT ON FUNCTION public.gerar_titulo_ao_entregar_os() IS
  'Gera o título a receber quando a OS paga vira entregue. Vale para INSERT e UPDATE — sem isso, OS que nasce entregue (importação do sistema antigo, automação) não geraria título e o dinheiro sumiria do Financeiro.';

DROP TRIGGER IF EXISTS conferir_pagamento_ao_entregar ON public.service_orders;
CREATE TRIGGER conferir_pagamento_ao_entregar
  BEFORE INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.conferir_pagamento_ao_entregar_os();

DROP TRIGGER IF EXISTS gerar_titulo_ao_entregar ON public.service_orders;
CREATE TRIGGER gerar_titulo_ao_entregar
  BEFORE INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.gerar_titulo_ao_entregar_os();

NOTIFY pgrst, 'reload schema';
