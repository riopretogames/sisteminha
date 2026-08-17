-- =============================================================================
-- Sisteminha (RP System.IO) — lança a devolução no Caixa automaticamente
-- =============================================================================
--
-- Continuação de 20260817110000: agora que `tipo_mov_caixa` já tem o valor
-- 'devolucao' (precisa estar em migration anterior, já comitada, pra poder
-- ser usado aqui), este gatilho lança o dinheiro devolvido como um
-- movimento de saída no caixa aberto do momento.
--
-- Mesmo padrão de `estornar_estoque_devolucao()` (migration
-- 20260808100000): SECURITY DEFINER, dispara sozinho ao registrar a
-- devolução, sem depender de nenhuma tela lembrar de fazer isso à parte.
--
-- Sem caixa aberto no momento, não tem onde lançar — a devolução acontece
-- normalmente do mesmo jeito, só não entra na conferência daquele dia
-- (mesma limitação que venda de PDV e título de OS pago ainda têm hoje;
-- não é regressão desta migration, é o estado atual do projeto inteiro).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_devolucao_no_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao_id UUID;
BEGIN
  -- Só lança se saiu dinheiro de verdade pro cliente. Cliente pagando a
  -- mais numa troca não passa por aqui — vira pagamento normal da venda
  -- nova (fora do escopo deste gatilho, ver comentário da migration
  -- anterior).
  IF NEW.valor_devolvido_cliente <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_sessao_id
  FROM public.caixa_sessoes
  WHERE tenant_id = NEW.tenant_id AND status = 'aberto'
  LIMIT 1;

  IF v_sessao_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.caixa_movimentos (
    sessao_id, tipo, descricao, valor, forma_pagamento_id, devolucao_id, usuario_id
  ) VALUES (
    v_sessao_id,
    'devolucao',
    'Devolução ' || COALESCE(NEW.numero_devolucao, '')
      || CASE WHEN NEW.motivo IS NOT NULL AND NEW.motivo <> '' THEN ' — ' || NEW.motivo ELSE '' END,
    -NEW.valor_devolvido_cliente,
    NEW.forma_pagamento_id,
    NEW.id,
    NEW.usuario_id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.registrar_devolucao_no_caixa() IS
  'Lança o dinheiro devolvido ao cliente como saída no caixa aberto do momento (se houver um). Espelha estornar_estoque_devolucao(), só que para o Caixa em vez do Estoque.';

CREATE TRIGGER lancar_devolucao_no_caixa
  AFTER INSERT ON public.devolucoes
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_devolucao_no_caixa();

NOTIFY pgrst, 'reload schema';
