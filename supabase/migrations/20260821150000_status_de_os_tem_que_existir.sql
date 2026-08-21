-- =============================================================================
-- Sisteminha (RPG System.IO) — status de OS tem que ser uma etapa que existe
-- =============================================================================
--
-- ACHADO EM 18/08: desde que `service_orders.status` virou TEXTO LIVRE (para a
-- loja poder criar etapa própria em "Gerenciar Status"), nenhuma migration
-- criou o contraponto. Não existe CHECK nem gatilho conferindo se o valor
-- gravado corresponde a uma etapa que existe de verdade naquela loja.
--
-- O Kanban já tem uma rede visual — status desconhecido cai numa coluna "Sem
-- etapa válida" em vez de a OS sumir. Mas é só visual, e dois lugares
-- gravam o texto cru sem olhar para ela:
--
--   - `automacao_eventos`, a fila que vai alimentar os fluxos do n8n. Um
--     status inválido entra na fila e o fluxo lá fora não casa com nada —
--     e o n8n é justamente onde ninguém daqui vê o erro acontecer.
--   - `service_order_history`, o histórico da OS, que passa a registrar uma
--     transição para uma etapa que não existe.
--
-- Como um status inválido apareceria na prática: erro de digitação em código
-- novo, importação de dados do sistema antigo, chamada de API por integração,
-- ou uma etapa excluída em "Gerenciar Status" enquanto ainda havia OS nela.
--
-- CORREÇÃO: gatilho que confere o status contra `os_status_config` DO MESMO
-- TENANT antes de gravar. A checagem é por tenant de propósito — cada loja
-- tem a sua lista de etapas, e uma etapa criada por uma loja não vale para a
-- outra.
--
-- Por que gatilho e não CHECK: um CHECK não consegue consultar outra tabela.
-- E por que não chave estrangeira: `os_status_config` tem chave própria (id),
-- o status guarda a `key`, e a validade depende também do tenant — uma FK
-- simples não expressa isso.
--
-- A mensagem lista as etapas válidas daquela loja. Erro de digitação em
-- integração é o caso mais provável, e quem estiver lendo o log vai querer
-- ver a lista certa na hora, não ter que ir procurar.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validar_status_da_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existe  BOOLEAN;
  v_validas TEXT;
BEGIN
  -- Só confere quando o status muda (ou na criação). UPDATE de qualquer outro
  -- campo não paga o custo da consulta.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.os_status_config c
     WHERE c.tenant_id = NEW.tenant_id
       AND c.key = NEW.status
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(c.key, ', ' ORDER BY c.ordem)
    INTO v_validas
    FROM public.os_status_config c
   WHERE c.tenant_id = NEW.tenant_id;

  RAISE EXCEPTION
    'Etapa "%" não existe nesta loja. As cadastradas são: %.',
    NEW.status, COALESCE(v_validas, '(nenhuma)')
    USING ERRCODE = 'foreign_key_violation';
END;
$$;

COMMENT ON FUNCTION public.validar_status_da_os() IS
  'Confere que service_orders.status corresponde a uma etapa cadastrada em os_status_config do MESMO tenant. Existe porque o status é texto livre (para a loja criar etapa própria) e nada impedia gravar um valor inexistente, que entraria calado na fila de automação do n8n e no histórico da OS.';

DROP TRIGGER IF EXISTS trg_status_da_os ON public.service_orders;
CREATE TRIGGER trg_status_da_os
  BEFORE INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_status_da_os();

NOTIFY pgrst, 'reload schema';
