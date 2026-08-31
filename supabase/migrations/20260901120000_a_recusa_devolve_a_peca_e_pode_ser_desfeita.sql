-- =============================================================================
-- A RECUSA DEVOLVE A PEÇA AO ESTOQUE — E PODE SER DESFEITA
-- =============================================================================
--
-- Três buracos que a mudança de ontem (20260831220000, a taxa de análise)
-- abriu sem querer, achados na revisão de 01/09.
--
-- Até ontem, recusar o orçamento CANCELAVA a OS. E "cancelado" era a palavra
-- em que estavam penduradas duas coisas importantes:
--
--   • o estorno da peça (gatilho de 22/08): a peça que o técnico lançou para
--     montar o orçamento tinha saído do estoque, e voltava ao cancelar;
--   • o entendimento de que aquela OS acabou.
--
-- Com a taxa, a OS recusada passou a ir para FINALIZADO — para o cliente
-- buscar o aparelho e pagar a análise pelo caixa, que é o certo. Só que o
-- gatilho do estorno continuou esperando a palavra "cancelado":
--
--   1. A PEÇA SUMIA. Orçamento recusado com peça lançada tirava a peça do
--      estoque para sempre. A loja comprou a peça, ela saiu da prateleira
--      digital, o conserto não aconteceu, e ela não voltou para lugar nenhum.
--      Exatamente o defeito que a migration de 22/08 tinha corrigido — que
--      voltou por uma porta lateral.
--
--   2. DESFAZER A RECUSA COBRAVA ERRADO. O cliente que recusa e volta atrás
--      no dia seguinte é caso comum de balcão. Movendo a OS de volta, ela
--      continuava valendo os R$ 80 da análise: o reparo de R$ 450 estava
--      guardado em `valor_orcado_recusado` e ninguém o trazia de volta. A
--      loja consertava o aparelho e cobrava a taxa.
--
--   3. GARANTIA E CORTESIA GANHAVAM TAXA. Numa OS de garantia, a recusa
--      escrevia R$ 80 no valor — e a entrega de garantia não cobra nada. Ou
--      seja: um valor que nunca vira dinheiro, atravessando todo relatório de
--      faturamento da assistência.
--
-- -----------------------------------------------------------------------------
-- 1. QUANDO A PEÇA JÁ VOLTOU, NÃO PODE VOLTAR DE NOVO
-- -----------------------------------------------------------------------------
-- O gatilho antigo não tinha como saber se já havia devolvido. Cancelar uma OS
-- que fosse reaberta e cancelada outra vez devolvia a peça duas vezes, e o
-- estoque passava a mostrar unidade que não existe na prateleira. Uma marca na
-- própria OS resolve — e serve também para o caminho de volta.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS pecas_estornadas_em TIMESTAMPTZ;

COMMENT ON COLUMN public.service_orders.pecas_estornadas_em IS
  'Quando as peças desta OS voltaram ao estoque (orçamento recusado ou OS cancelada). Nulo = as peças continuam separadas para esta OS. Impede devolver duas vezes, e diz que é preciso descontar de novo se a OS voltar a andar.';

-- -----------------------------------------------------------------------------
-- 2. O VAIVÉM DA PEÇA, NUM LUGAR SÓ
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mover_pecas_da_os(
  _os_id     UUID,
  _numero_os TEXT,
  _devolver  BOOLEAN,
  _motivo    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item    RECORD;
  v_produto RECORD;
  v_sinal   INTEGER := CASE WHEN _devolver THEN 1 ELSE -1 END;
BEGIN
  FOR v_item IN
    SELECT produto_id, SUM(quantidade) AS quantidade
      FROM public.service_order_items
     WHERE os_id = _os_id
       AND produto_id IS NOT NULL
     GROUP BY produto_id
  LOOP
    SELECT estoque_atual, custo, tenant_id
      INTO v_produto
      FROM public.produtos
     WHERE id = v_item.produto_id
     FOR UPDATE;

    IF NOT FOUND THEN
      -- Produto excluído desde o lançamento: não trava a OS por isso, só não
      -- tem para onde devolver (nem de onde tirar).
      CONTINUE;
    END IF;

    -- Descontar de novo (OS que volta a andar) exige que a peça exista. Se ela
    -- já foi vendida a outro cliente no meio do caminho, deixar passar criaria
    -- estoque negativo — a loja acharia que tem a peça separada e não tem.
    IF NOT _devolver AND v_produto.estoque_atual < v_item.quantidade THEN
      RAISE EXCEPTION
        'A peça desta OS voltou ao estoque quando o orçamento foi recusado e não está mais disponível (tem %, a OS precisa de %). Reponha o estoque antes de reabrir a OS.',
        v_produto.estoque_atual, v_item.quantidade
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.produtos
       SET estoque_atual = estoque_atual + (v_sinal * v_item.quantidade)
     WHERE id = v_item.produto_id;

    INSERT INTO public.movimentos_estoque (
      tenant_id, produto_id, tipo, quantidade,
      custo_unitario, valor_total,
      motivo, origem, usuario_id,
      saldo_anterior, saldo_depois
    ) VALUES (
      v_produto.tenant_id,
      v_item.produto_id,
      CASE WHEN _devolver THEN 'entrada' ELSE 'saida' END,
      v_item.quantidade,
      v_produto.custo,
      v_produto.custo * v_item.quantidade,
      _motivo,
      CASE WHEN _devolver THEN 'estorno:os:' ELSE 'os:' END
        || COALESCE(_numero_os, _os_id::text),
      auth.uid(),
      v_produto.estoque_atual,
      v_produto.estoque_atual + (v_sinal * v_item.quantidade)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.mover_pecas_da_os(UUID, TEXT, BOOLEAN, TEXT) IS
  'Devolve ao estoque (ou desconta de novo) as peças lançadas numa OS, com auditoria em movimentos_estoque. Usada quando a OS para (recusa/cancelamento) e quando ela volta a andar.';

-- -----------------------------------------------------------------------------
-- 3. O GATILHO QUE SEGUE A OS NOS DOIS SENTIDOS
-- -----------------------------------------------------------------------------
-- Substitui o gatilho de 22/08, que só olhava para "cancelado". Agora a
-- pergunta é outra, e é a que interessa para o estoque: **esta OS vai
-- acontecer?** Se não vai — cancelada ou orçamento recusado —, a peça não está
-- mais separada para ela. Se voltou a andar, está de novo.

CREATE OR REPLACE FUNCTION public.acertar_estoque_quando_a_os_para_ou_volta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parou BOOLEAN := (NEW.status = 'cancelado' OR NEW.laudo_aprovado IS FALSE);
BEGIN
  IF v_parou AND OLD.pecas_estornadas_em IS NULL THEN
    PERFORM public.mover_pecas_da_os(
      NEW.id, NEW.numero_os, true,
      CASE WHEN NEW.laudo_aprovado IS FALSE
           THEN 'Estorno de peça: cliente não aprovou o orçamento'
           ELSE 'Estorno de peça de OS cancelada' END);

    UPDATE public.service_orders
       SET pecas_estornadas_em = now()
     WHERE id = NEW.id;

  ELSIF NOT v_parou AND OLD.pecas_estornadas_em IS NOT NULL THEN
    PERFORM public.mover_pecas_da_os(
      NEW.id, NEW.numero_os, false, 'Peça separada de novo: OS voltou a andar');

    UPDATE public.service_orders
       SET pecas_estornadas_em = NULL
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.acertar_estoque_quando_a_os_para_ou_volta() IS
  'Devolve as peças ao estoque quando a OS para (cancelada ou orçamento recusado) e desconta de novo quando ela volta a andar. Guiado por service_orders.pecas_estornadas_em, que impede devolver duas vezes.';

DROP TRIGGER IF EXISTS estornar_estoque_ao_cancelar_os ON public.service_orders;
DROP TRIGGER IF EXISTS acertar_estoque_da_os ON public.service_orders;

CREATE TRIGGER acertar_estoque_da_os
  AFTER UPDATE ON public.service_orders
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.laudo_aprovado IS DISTINCT FROM NEW.laudo_aprovado
  )
  EXECUTE FUNCTION public.acertar_estoque_quando_a_os_para_ou_volta();

DROP FUNCTION IF EXISTS public.estornar_estoque_os_cancelada();

-- -----------------------------------------------------------------------------
-- 4. DESFAZER A RECUSA DEVOLVE O VALOR DO ORÇAMENTO
-- -----------------------------------------------------------------------------
-- Tirar a OS recusada de "Finalizado" só faz sentido de um jeito: o cliente
-- voltou atrás. Então tudo que a recusa fez precisa ser desfeito junto — o
-- valor volta a ser o do reparo, e a resposta do cliente volta a ser "ainda
-- não respondeu", para que o botão de aprovar funcione de novo.
--
-- O motivo da recusa não é jogado fora: vai para o histórico da OS, que é
-- onde ele continua contando a história ("recusou por R$ 450, achou caro, e
-- voltou dois dias depois").

CREATE OR REPLACE FUNCTION public.desfazer_recusa_ao_reabrir_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.laudo_aprovado IS FALSE
     AND NEW.laudo_aprovado IS FALSE
     AND NEW.status NOT IN ('finalizado', 'entregue', 'cancelado')
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
  'Tirar uma OS recusada de Finalizado significa que o cliente voltou atrás: devolve o valor do orçamento (que a taxa de análise havia substituído), limpa a decisão e guarda o motivo antigo no histórico da OS.';

DROP TRIGGER IF EXISTS desfazer_recusa_ao_reabrir ON public.service_orders;

CREATE TRIGGER desfazer_recusa_ao_reabrir
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.desfazer_recusa_ao_reabrir_os();

-- -----------------------------------------------------------------------------
-- 5. TAXA SÓ ONDE A LOJA COBRA
-- -----------------------------------------------------------------------------
-- Garantia e cortesia não passam pelo caixa na entrega (o gatilho de 18/08 só
-- exige pagamento de OS `paga` com orçamento > 0). Escrever R$ 80 nelas seria
-- criar faturamento que nunca acontece.

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
         status                 = 'finalizado'
   WHERE id = _os_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_decisao_do_laudo(UUID, BOOLEAN, TEXT) IS
  'Grava a resposta do cliente ao orçamento e move a OS na mesma transação. Aprovou: vai para "aprovado" e o valor não muda. Recusou: guarda o valor recusado, põe a taxa de análise (só em OS paga — garantia e cortesia não passam pelo caixa) e manda para "finalizado", de onde o cliente retira. As peças voltam ao estoque pelo gatilho acertar_estoque_da_os. Exige orders.approve.';

-- Coluna nova em service_orders não mexe na trava de custo (a trava vale para
-- produtos, servicos, service_order_items e movimentos_estoque), então não há
-- `aplicar_trava_de_custo()` a chamar aqui.

NOTIFY pgrst, 'reload schema';
