-- =============================================================================
-- A TAXA DE ANÁLISE, QUANDO O CLIENTE NÃO APROVA O ORÇAMENTO
-- =============================================================================
--
-- Decisões do Felipe em 31/08, respondendo às três perguntas que este trabalho
-- dependia:
--
--   1. "A taxa de 80 reais vai ser configurável, porém 80 é o padrão."
--   2. A taxa entra como VALOR DA OS recusada — e aí a entrega já cobra
--      sozinha, porque o fluxo de entrega exige o pagamento.
--   3. Quando o cliente APROVA, cobra-se o valor do laudo, e pronto: o valor
--      que está no relatório entregue ao cliente já é o final. **Não existe
--      abatimento a fazer** — o que era a terceira dúvida.
--
-- -----------------------------------------------------------------------------
-- 1. O VALOR, CONFIGURÁVEL POR LOJA
-- -----------------------------------------------------------------------------
-- Mesmo raciocínio dos campos obrigatórios: quem comprar o sisteminha cobra
-- outro valor, ou não cobra nada. 80 é o padrão da Rio Preto Games, não uma
-- verdade do sistema.
--
-- Zero é resposta válida e significa "esta loja não cobra análise": a OS
-- recusada segue para a retirada sem valor nenhum, e a entrega não pede
-- pagamento.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS taxa_analise NUMERIC(10,2) NOT NULL DEFAULT 80;

COMMENT ON COLUMN public.tenants.taxa_analise IS
  'Quanto a loja cobra pela análise quando o cliente NÃO aprova o orçamento. Vira o valor da OS recusada, e a entrega cobra na retirada. Zero = a loja não cobra. Padrão 80 (Rio Preto Games, 31/08).';

-- -----------------------------------------------------------------------------
-- 2. O QUE FOI ORÇADO NÃO PODE SUMIR
-- -----------------------------------------------------------------------------
-- Na recusa, o valor da OS passa a ser a taxa — senão a entrega cobraria o
-- reparo que não foi feito. Mas o valor ORÇADO é justamente o número que
-- explica a recusa ("recusou um reparo de R$ 450 e pagou R$ 80 de análise").
-- Perder isso ao sobrescrever seria trocar o dado mais interessante pelo mais
-- óbvio.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS valor_orcado_recusado NUMERIC(10,2);

COMMENT ON COLUMN public.service_orders.valor_orcado_recusado IS
  'Quanto valia o orçamento que o cliente recusou. Guardado porque `total_orcamento` passa a ser a taxa de análise na recusa — sem isto, o valor recusado sumiria.';

-- -----------------------------------------------------------------------------
-- 3. A RECUSA DEIXA DE CANCELAR: O APARELHO VOLTA PELO CAIXA
-- -----------------------------------------------------------------------------
-- Até aqui, recusar cancelava a OS. Com a taxa, isso não serve mais: OS
-- cancelada some do quadro e não passa pelo fluxo de entrega — e é justamente
-- na entrega que o sistema cobra (gatilho de 18/08: OS paga com orçamento > 0
-- não vira "entregue" sem pagamento que o cubra).
--
-- Então a OS recusada vai para FINALIZADO: o aparelho está pronto para o
-- cliente buscar. Ele busca, paga a análise, e a OS vira "entregue" como
-- qualquer outra. Nenhum passo novo para a equipe aprender.
--
-- O que se perde: "cancelado" deixa de marcar a recusa. Mas isso já estava
-- resolvido de um jeito melhor desde ontem — `laudo_aprovado = false` diz que
-- foi o cliente quem recusou, e `laudo_motivo_recusa` diz por quê. Cancelado
-- volta a ser só o que sempre deveria ter sido: a saída de emergência.

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
  v_os   RECORD;
  v_taxa NUMERIC(10,2);
BEGIN
  SELECT id, tenant_id, status, total_orcamento
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

  IF NOT public.has_permission(auth.uid(), 'orders.approve') THEN
    RAISE EXCEPTION 'Seu acesso não permite registrar a resposta do cliente ao orçamento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_os.status <> 'aguardando_aprovacao' THEN
    RAISE EXCEPTION 'Esta OS não está aguardando a resposta do cliente.';
  END IF;

  IF _aprovado = false AND COALESCE(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'Escreva por que o cliente não aprovou.';
  END IF;

  IF _aprovado THEN
    -- Aprovou: nada muda no dinheiro. O valor do laudo é o que o cliente já
    -- viu no relatório, e é o que ele vai pagar na retirada.
    UPDATE public.service_orders
       SET laudo_aprovado      = true,
           laudo_decidido_em   = now(),
           laudo_decidido_por  = auth.uid(),
           laudo_motivo_recusa = NULL,
           status              = 'aprovado'
     WHERE id = _os_id;
    RETURN;
  END IF;

  SELECT taxa_analise INTO v_taxa
    FROM public.tenants
   WHERE id = v_os.tenant_id;

  UPDATE public.service_orders
     SET laudo_aprovado         = false,
         laudo_decidido_em      = now(),
         laudo_decidido_por     = auth.uid(),
         laudo_motivo_recusa    = btrim(_motivo),
         valor_orcado_recusado  = v_os.total_orcamento,
         total_orcamento        = COALESCE(v_taxa, 0),
         status                 = 'finalizado'
   WHERE id = _os_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_decisao_do_laudo(UUID, BOOLEAN, TEXT) IS
  'Grava a resposta do cliente ao orçamento e move a OS na mesma transação. Aprovou: vai para "aprovado" e o valor não muda. Recusou: guarda o valor recusado, põe a taxa de análise da loja como valor da OS e manda para "finalizado", de onde o cliente retira pagando a taxa. Exige orders.approve.';
