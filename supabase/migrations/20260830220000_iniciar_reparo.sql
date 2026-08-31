-- =============================================================================
-- BOTÃO "INICIAR REPARO" — A HORA EM QUE O APARELHO ENTROU NA BANCADA
-- =============================================================================
--
-- Vem do organograma que o Felipe desenhou do processo (Figma, 30/08). Na
-- ETAPA 1 - parte B (ASSISTÊNCIA), o técnico:
--
--   busca o aparelho → puxa a OS no sistema → **botão INICIAR REPARO** →
--   confirma que vai iniciar ("reparo começa aqui") → desmonta → investiga
--
-- Duas coisas escritas no desenho, e as duas são o ponto deste trabalho:
--
--   "Só o perfil Técnico vê este botão."
--   "Reparo começa aqui."
--
-- -----------------------------------------------------------------------------
-- POR QUE ISTO NÃO É UMA ETAPA NOVA DO QUADRO
-- -----------------------------------------------------------------------------
-- A OS continua em "Entrada / Análise" enquanto o técnico desmonta e
-- investiga. Criar uma coluna "Em reparo" partiria a etapa 1 em duas no
-- quadro, e o desenho do Felipe não faz isso — o que ele quer marcar é o
-- INSTANTE em que o aparelho saiu da fila e foi para a mesa.
--
-- E essa marca é o que hoje falta para responder a pergunta que a loja faz
-- todo dia: "faz três dias que está na análise" não distingue o aparelho que
-- ninguém pegou do que está aberto na bancada desde ontem. Um é atraso da
-- fila, o outro é reparo em andamento. Sem a hora de início, os dois contam
-- igual em qualquer relatório de tempo.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS reparo_iniciado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reparo_iniciado_por UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.service_orders.reparo_iniciado_em IS
  'Quando o técnico apertou "Iniciar reparo" e o aparelho foi para a bancada. NULL = ainda na fila. Não é troca de etapa: a OS segue em Entrada/Análise. Organograma do Felipe, 30/08.';

COMMENT ON COLUMN public.service_orders.reparo_iniciado_por IS
  'Quem começou o reparo. É o técnico que pegou o aparelho, e não necessariamente o técnico responsável pela OS.';

-- -----------------------------------------------------------------------------
-- A TRAVA DE PERFIL MORA NO BANCO, NÃO SÓ NA TELA
-- -----------------------------------------------------------------------------
-- "Só o perfil Técnico vê este botão" resolvido apenas escondendo o botão
-- seria decoração: qualquer um com `orders.edit` (o vendedor de balcão, numa
-- loja que dê essa permissão a ele) poderia gravar o início do reparo pela
-- API, e o registro passaria a dizer que o vendedor estava com o aparelho
-- aberto na mesa.
--
-- A função exige `orders.diagnose`, que é a permissão de bancada — hoje só
-- Técnico e Gerente Técnico a têm.

CREATE OR REPLACE FUNCTION public.iniciar_reparo_os(_os_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os      RECORD;
  v_agora   TIMESTAMPTZ := now();
BEGIN
  SELECT id, tenant_id, reparo_iniciado_em, status
    INTO v_os
    FROM public.service_orders
   WHERE id = _os_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS % não encontrada.', _os_id;
  END IF;

  -- Mesma trava de loja das outras funções com SECURITY DEFINER (ver
  -- 20260818110000): sem ela, dava para iniciar o reparo de uma OS de outra
  -- loja passando o id direto pela API.
  IF v_os.tenant_id <> public.get_user_tenant_id(auth.uid()) THEN
    RAISE EXCEPTION 'Esta OS não é da sua loja.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission(auth.uid(), 'orders.diagnose') THEN
    RAISE EXCEPTION 'Só quem trabalha na bancada pode iniciar o reparo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Já começou: devolve a hora que já estava lá em vez de sobrescrever.
  -- Dois técnicos clicando quase junto é normal na bancada, e o segundo
  -- clique não pode reescrever a história do primeiro.
  IF v_os.reparo_iniciado_em IS NOT NULL THEN
    RETURN v_os.reparo_iniciado_em;
  END IF;

  UPDATE public.service_orders
     SET reparo_iniciado_em  = v_agora,
         reparo_iniciado_por = auth.uid()
   WHERE id = _os_id;

  RETURN v_agora;
END;
$$;

COMMENT ON FUNCTION public.iniciar_reparo_os(UUID) IS
  'Marca a hora em que o aparelho entrou na bancada, com quem começou. Exige orders.diagnose e a OS ser da mesma loja. Chamar de novo devolve a hora original — não reescreve. Organograma do Felipe, 30/08.';

REVOKE ALL ON FUNCTION public.iniciar_reparo_os(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_reparo_os(UUID) TO authenticated;
