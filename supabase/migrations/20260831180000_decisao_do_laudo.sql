-- =============================================================================
-- A RESPOSTA DO CLIENTE AO LAUDO VIRA REGISTRO
-- =============================================================================
--
-- Organograma do Felipe (30/08), depois do laudo enviado:
--
--   Cliente aprovou? --SIM--> Vendedor marca LAUDO APROVADO --> ETAPA 3
--                    --NÃO--> registra o MOTIVO da reprovação
--                             --> cobra 80 reais na retirada
--                             --> cliente retira o aparelho
--
-- -----------------------------------------------------------------------------
-- O QUE FALTAVA
-- -----------------------------------------------------------------------------
-- Aprovar já era possível: a OS mudava de "Aguardando aprovação" para
-- "Aprovado", e o histórico de etapas guardava quem fez e quando. O que não
-- existia era o registro da DECISÃO em si:
--
--   • o motivo da recusa não tinha onde ser escrito. Ele sumia na conversa do
--     balcão — e é a informação mais valiosa que uma recusa deixa: preço alto,
--     prazo longo, cliente achou que não vale a pena consertar. Sem isso, a
--     loja não sabe por que perde orçamento;
--   • e "cancelado" não distingue o orçamento RECUSADO pelo cliente da OS
--     cancelada por qualquer outro motivo (desistiu antes do laudo, aparelho
--     era de outra loja, erro de cadastro). Nos relatórios os dois viravam a
--     mesma coisa.
--
-- Agora a decisão fica gravada com quem, quando e por quê — e continua
-- respeitando a permissão de sempre: quem decide orçamento é quem tem
-- `orders.approve`.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS laudo_aprovado      BOOLEAN,
  ADD COLUMN IF NOT EXISTS laudo_decidido_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS laudo_decidido_por  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS laudo_motivo_recusa TEXT;

COMMENT ON COLUMN public.service_orders.laudo_aprovado IS
  'O cliente aprovou o orçamento? TRUE aprovou, FALSE recusou, NULL ainda não respondeu. Organograma do Felipe, 30/08.';

COMMENT ON COLUMN public.service_orders.laudo_decidido_em IS
  'Quando a resposta do cliente foi registrada no sistema — não é quando ele respondeu, é quando alguém da loja anotou.';

COMMENT ON COLUMN public.service_orders.laudo_decidido_por IS
  'Quem registrou a resposta. No processo do Felipe é o vendedor, que é quem fala com o cliente.';

COMMENT ON COLUMN public.service_orders.laudo_motivo_recusa IS
  'Por que o cliente não aprovou, nas palavras de quem atendeu. Obrigatório na recusa: é o dado que explica orçamento perdido.';

-- -----------------------------------------------------------------------------
-- A FUNÇÃO QUE REGISTRA
-- -----------------------------------------------------------------------------
-- Faz as duas coisas numa transação só: grava a decisão e move a OS. Separado,
-- daria para gravar "recusou" e a OS ficar parada em Aguardando aprovação, ou
-- mover sem registrar o motivo — os dois estados mentem para quem olha depois.

CREATE OR REPLACE FUNCTION public.registrar_decisao_do_laudo(
  _os_id     UUID,
  _aprovado  BOOLEAN,
  _motivo    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os RECORD;
BEGIN
  SELECT id, tenant_id, status
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

  -- Mesma permissão de sempre para decidir orçamento (ver o gatilho
  -- validar_aprovacao_orcamento_os, migration 20260817140000). Conferir aqui
  -- também dá a mensagem em português antes de o gatilho reclamar em inglês.
  IF NOT public.has_permission(auth.uid(), 'orders.approve') THEN
    RAISE EXCEPTION 'Seu acesso não permite registrar a resposta do cliente ao orçamento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_os.status <> 'aguardando_aprovacao' THEN
    RAISE EXCEPTION 'Esta OS não está aguardando a resposta do cliente.';
  END IF;

  -- Recusa sem motivo é o caso que esta função existe para impedir: é
  -- justamente o dado que explica o orçamento perdido.
  IF _aprovado = false AND COALESCE(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'Escreva por que o cliente não aprovou.';
  END IF;

  UPDATE public.service_orders
     SET laudo_aprovado      = _aprovado,
         laudo_decidido_em   = now(),
         laudo_decidido_por  = auth.uid(),
         laudo_motivo_recusa = CASE WHEN _aprovado THEN NULL ELSE btrim(_motivo) END,
         -- Aprovou: vai para a bancada executar. Recusou: a OS não vai
         -- acontecer, e "cancelado" é a saída que este sistema já usa para
         -- isso — com a diferença de que agora se sabe QUE foi o cliente quem
         -- recusou, e por quê.
         status              = CASE WHEN _aprovado THEN 'aprovado' ELSE 'cancelado' END
   WHERE id = _os_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_decisao_do_laudo(UUID, BOOLEAN, TEXT) IS
  'Grava a resposta do cliente ao orçamento (com motivo, quando recusado) e move a OS na mesma transação. Exige orders.approve e que a OS esteja aguardando aprovação.';

REVOKE ALL ON FUNCTION public.registrar_decisao_do_laudo(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_decisao_do_laudo(UUID, BOOLEAN, TEXT) TO authenticated;
