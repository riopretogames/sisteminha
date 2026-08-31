-- =============================================================================
-- "INICIAR REPARO" VIRA "INICIAR DIAGNÓSTICO"
-- =============================================================================
--
-- Correção do Felipe em 31/08, e ele está certo: na etapa 1 o técnico ainda
-- não está reparando nada. Ele desmonta, investiga e monta o laudo — isso é
-- diagnóstico. O reparo em si só começa depois que o cliente aprova, e esse
-- momento já tem botão próprio ("Iniciar a execução").
--
-- Chamar os dois de "reparo" embaralhava justamente a conta que motivou a
-- marca de hora: com dois "inícios de reparo", qualquer relatório de tempo de
-- bancada somaria a análise com a execução e chamaria o total de "reparo".
--
-- -----------------------------------------------------------------------------
-- POR QUE RENOMEAR NO BANCO, E NÃO SÓ NA TELA
-- -----------------------------------------------------------------------------
-- A regra da casa é que chave e nome de coluna são contrato: renomear quebra
-- código, automação e histórico. Aqui a troca é segura por um motivo simples —
-- estas colunas e esta função nasceram ONTEM (30/08), ninguém de fora depende
-- delas, e nenhuma automação foi ligada ainda. Deixar o nome errado agora
-- seria carregar a confusão para sempre por preguiça de um dia.
--
-- RENAME preserva o que já foi gravado: se alguém já apertou o botão em
-- alguma OS, a hora e o autor continuam lá.

ALTER TABLE public.service_orders
  RENAME COLUMN reparo_iniciado_em TO diagnostico_iniciado_em;

ALTER TABLE public.service_orders
  RENAME COLUMN reparo_iniciado_por TO diagnostico_iniciado_por;

COMMENT ON COLUMN public.service_orders.diagnostico_iniciado_em IS
  'Quando o técnico começou a DIAGNOSTICAR: pegou o aparelho, desmontou, investigou. NULL = ainda na fila. Não é troca de etapa: a OS segue em Entrada/Análise. O reparo em si é execucao_iniciada_em.';

COMMENT ON COLUMN public.service_orders.diagnostico_iniciado_por IS
  'Quem diagnosticou. É quem pegou o aparelho, e não necessariamente o técnico responsável pela OS.';

DROP FUNCTION IF EXISTS public.iniciar_reparo_os(UUID);

CREATE OR REPLACE FUNCTION public.iniciar_diagnostico_os(_os_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os    RECORD;
  v_agora TIMESTAMPTZ := now();
BEGIN
  SELECT id, tenant_id, diagnostico_iniciado_em
    INTO v_os
    FROM public.service_orders
   WHERE id = _os_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS % não encontrada.', _os_id;
  END IF;

  IF v_os.tenant_id <> public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Esta OS não é da sua loja.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission(auth.uid(), 'orders.diagnose') THEN
    RAISE EXCEPTION 'Só quem trabalha na bancada pode iniciar o diagnóstico.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Já começou: devolve a hora original em vez de sobrescrever. Dois técnicos
  -- clicando quase junto é normal na bancada, e o segundo clique não pode
  -- reescrever a história do primeiro.
  IF v_os.diagnostico_iniciado_em IS NOT NULL THEN
    RETURN v_os.diagnostico_iniciado_em;
  END IF;

  UPDATE public.service_orders
     SET diagnostico_iniciado_em  = v_agora,
         diagnostico_iniciado_por = auth.uid()
   WHERE id = _os_id;

  RETURN v_agora;
END;
$$;

COMMENT ON FUNCTION public.iniciar_diagnostico_os(UUID) IS
  'Marca a hora em que o aparelho entrou na bancada para diagnóstico, com quem começou. Exige orders.diagnose e a OS ser da mesma loja. Chamar de novo devolve a hora original.';

REVOKE ALL ON FUNCTION public.iniciar_diagnostico_os(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_diagnostico_os(UUID) TO authenticated;
