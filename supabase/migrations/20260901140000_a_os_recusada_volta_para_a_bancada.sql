-- =============================================================================
-- A OS RECUSADA VOLTA PARA A BANCADA, NÃO PARA A PRATELEIRA
-- =============================================================================
--
-- Decisão do Felipe em 01/09, respondendo à dúvida que ficou aberta na revisão:
--
--   *"Vai para finalizado quando o técnico terminar de montar, clicando em
--     reparo concluído, e depois entregue quando o vendedor marcar retirado."*
--
-- É o que o `PROCESSO-ORDEM-DE-SERVICO.md` já descrevia e o sistema não fazia.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTAVA ERRADO
-- -----------------------------------------------------------------------------
-- Desde ontem, registrar a recusa mandava a OS direto para "Finalizado". E
-- "Finalizado", neste sistema, quer dizer **pronto para o cliente buscar**.
--
-- Só que o aparelho não está pronto: ele foi ao diagnóstico, o que significa
-- que está ABERTO na bancada. Alguém precisa remontar antes de o cliente
-- aparecer. Pulando essa etapa, o sistema avisava "pode buscar" com o aparelho
-- em pedaços — e a loja só descobria no balcão, com o cliente na frente.
--
-- -----------------------------------------------------------------------------
-- O CAMINHO CERTO: O MESMO DO REPARO APROVADO
-- -----------------------------------------------------------------------------
-- O aparelho recusado sai pela mesma porta do aprovado, sem etapa inventada:
--
--   Cliente não aprovou  →  a OS vai para ETAPA 3 (Aprovado / Executar), que é
--                           onde a bancada trabalha
--   Técnico remonta      →  aperta REPARO CONCLUÍDO  →  ETAPA 5 (Finalizado)
--   Cliente vem buscar   →  vendedor marca retirado  →  ETAPA 6 (Entregue),
--                           cobrando a taxa de análise pelo caixa
--
-- O nome da coluna ("Aprovado / Executar") não descreve esta OS, e é por isso
-- que a recusa fica marcada na ficha, no cartão do quadro e na lista: quem
-- olhar o quadro precisa ver que aquele aparelho não vai ser consertado, só
-- remontado. O que NÃO se faz é criar uma etapa "Recusado" ao lado — coluna
-- nova é coluna que a equipe esquece de olhar, e o processo do Felipe é
-- explícito em manter o recusado na mesma esteira.
--
-- O dinheiro não muda: a OS continua valendo a taxa de análise (só em OS
-- paga), e o valor recusado continua guardado.

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
  SELECT id, tenant_id, status, tipo, total_orcamento
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
    UPDATE public.service_orders
       SET laudo_aprovado      = true,
           laudo_decidido_em   = now(),
           laudo_decidido_por  = auth.uid(),
           laudo_motivo_recusa = NULL,
           status              = 'aprovado'
     WHERE id = _os_id;
    RETURN;
  END IF;

  -- Só OS paga passa pelo caixa na entrega. Garantia e cortesia recusadas
  -- saem sem valor — o aparelho volta para o cliente e pronto.
  IF v_os.tipo = 'paga' THEN
    SELECT taxa_analise INTO v_taxa FROM public.tenants WHERE id = v_os.tenant_id;
  ELSE
    v_taxa := 0;
  END IF;

  UPDATE public.service_orders
     SET laudo_aprovado         = false,
         laudo_decidido_em      = now(),
         laudo_decidido_por     = auth.uid(),
         laudo_motivo_recusa    = btrim(_motivo),
         valor_orcado_recusado  = v_os.total_orcamento,
         total_orcamento        = COALESCE(v_taxa, 0),
         -- A bancada, não a prateleira. Ver o cabeçalho desta migration.
         status                 = 'aprovado'
   WHERE id = _os_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_decisao_do_laudo(UUID, BOOLEAN, TEXT) IS
  'Grava a resposta do cliente ao orçamento e move a OS na mesma transação. Aprovou: vai para "aprovado" e o valor não muda. Recusou: guarda o valor recusado, põe a taxa de análise (só em OS paga) e TAMBÉM vai para "aprovado" — o aparelho voltou aberto do diagnóstico e o técnico precisa remontar antes de marcar Reparo concluído. As peças voltam ao estoque pelo gatilho acertar_estoque_da_os. Exige orders.approve.';

-- -----------------------------------------------------------------------------
-- DESFAZER A RECUSA PASSA A SER UMA COISA SÓ: VOLTAR PARA A DECISÃO
-- -----------------------------------------------------------------------------
-- O gatilho de hoje de manhã desfazia a recusa sempre que a OS saísse de
-- "Finalizado" para qualquer etapa da esteira. Com a recusa nascendo em
-- "Aprovado", essa regra se vira contra si mesma: a própria recusa já entra
-- numa etapa da esteira, e o gatilho a desfaria no mesmo instante em que ela
-- fosse registrada.
--
-- A pergunta certa é mais estreita e não depende de onde a recusa mora: o
-- cliente voltou atrás **quando alguém devolve a OS para a etapa em que ele
-- responde**. Fora isso, a recusa continua valendo — inclusive enquanto o
-- técnico remonta o aparelho, que é trabalho de OS recusada, não sinal de que
-- ela deixou de ser recusada.

CREATE OR REPLACE FUNCTION public.desfazer_recusa_ao_reabrir_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.laudo_aprovado IS FALSE
     AND NEW.laudo_aprovado IS FALSE
     AND NEW.status IN ('aguardando_aprovacao', 'aguardando_analise')
  THEN
    INSERT INTO public.service_order_history (
      os_id, usuario_id, status_anterior, status_novo, comentario
    ) VALUES (
      NEW.id, auth.uid(), OLD.status, NEW.status,
      'Recusa desfeita: o cliente havia recusado o orçamento de '
        || to_char(COALESCE(OLD.valor_orcado_recusado, OLD.total_orcamento), 'FM999G999G990D00')
        || COALESCE(' — motivo: ' || OLD.laudo_motivo_recusa, '')
        || '. O valor do orçamento voltou a valer no lugar da taxa de análise.'
    );

    NEW.total_orcamento       := COALESCE(OLD.valor_orcado_recusado, OLD.total_orcamento);
    NEW.valor_orcado_recusado := NULL;
    NEW.laudo_aprovado        := NULL;
    NEW.laudo_decidido_em     := NULL;
    NEW.laudo_decidido_por    := NULL;
    NEW.laudo_motivo_recusa   := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.desfazer_recusa_ao_reabrir_os() IS
  'Devolver uma OS recusada para a etapa em que o cliente responde (Aguardando aprovação ou Entrada/Análise) significa que ele voltou atrás: restaura o valor do orçamento que a taxa de análise havia substituído, limpa a decisão e guarda o motivo antigo no histórico da OS. Remontar o aparelho e concluir NÃO desfaz a recusa — é o trabalho normal de uma OS recusada.';

NOTIFY pgrst, 'reload schema';
