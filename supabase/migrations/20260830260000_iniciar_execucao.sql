-- =============================================================================
-- "INICIAR A EXECUÇÃO" — O SEGUNDO COMEÇO DA BANCADA
-- =============================================================================
--
-- O organograma do Felipe (30/08) tem DOIS botões de começar, e eu só tinha
-- feito o primeiro:
--
--   ETAPA 1-B (análise):  busca o aparelho → **INICIAR REPARO** → desmonta,
--                         investiga, monta o laudo
--   ETAPA 3 (execução):   vê a OS na aba Execução → **INICIAR A EXECUÇÃO** →
--                         executa o reparo → REPARO CONCLUÍDO
--
-- São dois momentos diferentes com o mesmo aparelho, e a distância entre eles
-- é o tempo em que a OS ficou parada esperando o cliente responder o
-- orçamento. Guardar só um dos dois faria o "tempo de reparo" da loja incluir
-- a espera do cliente — que não é trabalho da bancada e não deveria contar
-- contra ela.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS execucao_iniciada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execucao_iniciada_por UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.service_orders.execucao_iniciada_em IS
  'Quando o técnico começou a EXECUTAR o reparo, depois do laudo aprovado. Diferente de reparo_iniciado_em, que é a análise. Organograma do Felipe, 30/08.';

COMMENT ON COLUMN public.service_orders.execucao_iniciada_por IS
  'Quem executou. Pode ser outro técnico: quem analisa nem sempre é quem conserta.';

CREATE OR REPLACE FUNCTION public.iniciar_execucao_os(_os_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os    RECORD;
  v_agora TIMESTAMPTZ := now();
BEGIN
  SELECT id, tenant_id, execucao_iniciada_em
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
    RAISE EXCEPTION 'Só quem trabalha na bancada pode iniciar a execução.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Já começou: devolve a hora original. Mesmo cuidado de iniciar_reparo_os —
  -- o segundo clique não reescreve a história do primeiro.
  IF v_os.execucao_iniciada_em IS NOT NULL THEN
    RETURN v_os.execucao_iniciada_em;
  END IF;

  UPDATE public.service_orders
     SET execucao_iniciada_em  = v_agora,
         execucao_iniciada_por = auth.uid()
   WHERE id = _os_id;

  RETURN v_agora;
END;
$$;

COMMENT ON FUNCTION public.iniciar_execucao_os(UUID) IS
  'Marca a hora em que o reparo aprovado começou a ser executado. Exige orders.diagnose e a OS ser da mesma loja. Chamar de novo devolve a hora original.';

REVOKE ALL ON FUNCTION public.iniciar_execucao_os(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_execucao_os(UUID) TO authenticated;
