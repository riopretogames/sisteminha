-- =============================================================================
-- OS: UMA REGRA SÓ PARA A RESPOSTA DO CLIENTE, E O DINHEIRO QUE SAÍA CALADO
-- Revisão completa de 24/09 (área: Ordens de Serviço)
-- =============================================================================
--
-- A revisão achou portas que a tela e o banco tratavam diferente. Tela que
-- oferece o que o banco recusa vira "Tente novamente" no balcão; banco que
-- deixa o que a tela esconde vira atalho pela API. Esta migration faz o banco
-- dizer exatamente o que a tela diz (src/lib/decisaoDoLaudo.ts).
--
-- 1. PULAR A RESPOSTA DO CLIENTE NÃO PASSA — PARA NINGUÉM.
--    Até aqui, sair de "Aguardando aprovação" para a frente sem a resposta
--    registrada era barrado só para quem NÃO aprova orçamento. Quem aprova
--    passava direto (a OS-202608-0007 foi para "Aguardando Peça" assim, e
--    está lá com a resposta em branco). E da ENTRADA a OS com laudo
--    eletrônico ia direto a "Finalizado" ou "Entregue", sem laudo enviado nem
--    resposta, e era cobrada cheia. Agora: OS com laudo eletrônico só passa
--    da análise para a frente com a resposta registrada — pelos botões
--    "Laudo aprovado" / "Cliente não aprovou" (registrar_decisao_do_laudo),
--    que gravam quem respondeu, quando e o motivo da recusa. Voltar para a
--    análise, mandar o laudo e cancelar continuam livres.
--
-- 2. O SERVIÇO TABELADO VAI DIRETO PARA A EXECUÇÃO.
--    PROCESSO-ORDEM-DE-SERVICO.md, passo 9. Sem laudo não há o que o cliente
--    aprovar, então levar a OS tabelada para "Aprovado / Executar" deixa de
--    ser "aprovar orçamento" — o técnico faz. Em troca, mudar se a OS tem
--    laudo eletrônico depois de aberta passa a exigir quem aprova (senão bastaria
--    desligar a chavinha pela API para pular a aprovação).
--
-- 3. DESFAZER A RECUSA É DE QUEM FALA COM O CLIENTE.
--    Voltar a OS recusada para a análise desfaz a recusa: a OS volta a valer
--    o orçamento cheio, as peças saem do estoque de novo e a resposta volta a
--    ficar em aberto. Registrar a recusa exigia a permissão de aprovar
--    orçamento; apagá-la não exigia nada — um arrasto do técnico bastava.
--    Agora as duas pontas pedem a mesma permissão. E o motivo, que ia para o
--    histórico numa linha que nenhuma tela lia (e ainda duplicada: o gatilho
--    gravava uma linha e o histórico de etapas gravava outra), passa a ir na
--    MESMA linha da troca de etapa, que a linha do tempo da ficha mostra.
--
-- 4. A TAXA DA OS RECUSADA NÃO SE MEXE SEM QUEM APROVA.
--    Na OS recusada, o valor é a taxa de análise. O técnico podia zerá-la (a
--    OS saía de graça) ou digitar o valor do conserto recusado. A trava que já
--    protegia o valor APROVADO passa a proteger também a taxa da recusada.
--    E o registro da resposta inteiro (quem, quando, motivo, valor recusado),
--    não só o "aprovou/recusou", só muda por quem aprova.
--
-- 5. OS PAGA EM R$ 0 NÃO SAI SEM COBRANÇA POR ENGANO.
--    A Nova OS não pedia valor, e a entrega de OS paga em R$ 0 passava sem
--    pergunta nenhuma, sem título e sem caixa — o banco saía cedo. Agora
--    entregar OS paga sem valor exige quem aprova orçamento (a tela confirma
--    antes), e "Laudo aprovado" numa OS paga sem valor é recusado: preencha o
--    valor do laudo antes.
--
-- 6. O AVISO DE PEÇA QUE NÃO VOLTA FALAVA SÓ DE RECUSA.
--    A mesma engrenagem devolve a peça ao estoque na recusa E no cancelamento.
--    Reabrir uma OS CANCELADA cuja peça já foi vendida dizia "voltou ao estoque
--    quando o orçamento foi recusado" — história errada. Texto neutro agora.
--
-- 7. O COMENTÁRIO QUE PROMETIA UMA TELA QUE NÃO EXISTE.
--    A trava do valor aprovado dizia que "peça a mais descoberta na bancada
--    vira um novo aguardando aprovação pela tela". Nenhuma tela faz isso. O
--    comentário agora diz a verdade; a regra (exigir nova aprovação quando o
--    valor aprovado sobe) é decisão do Felipe, anotada no plano. Até lá a
--    ficha pede confirmação antes de salvar o valor maior.
--
-- Nada aqui apaga dado. Tudo conferido no fim por uma prova que roda as
-- regras de verdade (como administrador e como técnico) num rascunho que é
-- desfeito — se qualquer uma falhar, a migration inteira é recusada.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 e 2. A RESPOSTA DO CLIENTE E O SERVIÇO TABELADO
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_aprovacao_orcamento_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Recusou também é resposta: só NULL é "o cliente ainda não respondeu".
  v_decidido  BOOLEAN := NEW.laudo_aprovado IS NOT NULL;
  -- OS antiga, de antes da chavinha, conta como "tem laudo": todas passaram
  -- por análise. Mesma leitura da tela (lib/decisaoDoLaudo.ts).
  v_tem_laudo BOOLEAN := COALESCE(NEW.laudo_eletronico, true);
BEGIN
  -- Chamada de dentro do banco (rotina, sem ninguém logado): não é o cenário.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- (1) Pular a resposta do cliente — vale para TODO MUNDO. Quem aprova tem
  --     os botões da resposta; é por eles que a OS anda. Da Entrada, só a OS
  --     com laudo espera resposta (a tabelada segue direto); parada em
  --     "Aguardando aprovação", espera sempre.
  IF OLD.status IN ('aguardando_aprovacao', 'aguardando_analise')
     AND NEW.status NOT IN ('aguardando_aprovacao', 'aguardando_analise', 'cancelado')
     AND NOT v_decidido
     AND (OLD.status = 'aguardando_aprovacao' OR v_tem_laudo)
  THEN
    IF OLD.status = 'aguardando_aprovacao' THEN
      RAISE EXCEPTION
        'O cliente ainda não respondeu ao orçamento. Registre a resposta dele pelos botões "Laudo aprovado" / "Cliente não aprovou" antes de seguir com a OS.'
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION
      'Esta OS tem laudo eletrônico: ela só segue para a bancada depois que o cliente responder. Envie o laudo para aprovação e registre a resposta dele (Laudo aprovado / Cliente não aprovou).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Chegar em "aprovado" só é APROVAR quando a OS tem laudo e o cliente
  --     ainda não respondeu. Respondida (aprovou ou recusou) ou tabelada,
  --     "Aprovado / Executar" é a bancada — rotina de quem edita OS.
  IF NEW.status = 'aprovado'
     AND NOT v_decidido
     AND v_tem_laudo
     AND NOT public.has_permission(auth.uid(), 'orders.approve')
  THEN
    RAISE EXCEPTION 'Sem permissão para aprovar orçamento de OS.'
      USING ERRCODE = '42501';
  END IF;

  -- (3) Cancelar vindo de "Aguardando aprovação" é RECUSAR o orçamento.
  IF OLD.status = 'aguardando_aprovacao'
     AND NEW.status = 'cancelado'
     AND NOT public.has_permission(auth.uid(), 'orders.approve')
  THEN
    RAISE EXCEPTION 'Sem permissão para recusar orçamento de OS.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. DESFAZER A RECUSA: SÓ QUEM APROVA, E O MOTIVO NA LINHA DO TEMPO
-- -----------------------------------------------------------------------------
-- Roda ANTES das outras travas (os gatilhos BEFORE rodam em ordem alfabética),
-- então é ela quem explica ao técnico por que não pode — com o valor que
-- voltaria a ser cobrado.
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
    IF auth.uid() IS NOT NULL
       AND NOT public.has_permission(auth.uid(), 'orders.approve')
    THEN
      RAISE EXCEPTION
        'O cliente recusou o orçamento desta OS. Voltar com ela para a análise desfaz a recusa e volta a cobrar R$ % no lugar da taxa — só se o cliente voltou atrás, e quem registra é um vendedor ou gerente.',
        to_char(COALESCE(OLD.valor_orcado_recusado, OLD.total_orcamento), 'FM999G999G990D00')
        USING ERRCODE = '42501';
    END IF;

    -- A linha do histórico com o motivo NÃO é mais gravada aqui: quem grava é
    -- `track_os_status_change`, na mesma linha da troca de etapa. Antes eram
    -- duas linhas para a mesma passagem, e a do motivo nenhuma tela lia.
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

CREATE OR REPLACE FUNCTION public.track_os_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comentario TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- A recusa desfeita apaga o motivo da ficha (a resposta volta a ficar em
    -- aberto). O histórico é onde ele continua contando a história — e a
    -- linha do tempo da ficha mostra este comentário.
    IF OLD.laudo_aprovado IS FALSE AND NEW.laudo_aprovado IS NULL THEN
      v_comentario :=
        'Recusa desfeita: o cliente havia recusado o orçamento de R$ '
        || to_char(COALESCE(OLD.valor_orcado_recusado, OLD.total_orcamento), 'FM999G999G990D00')
        || COALESCE(' — motivo: ' || OLD.laudo_motivo_recusa, '')
        || '. O valor do orçamento voltou a valer no lugar da taxa de análise.';
    END IF;

    INSERT INTO public.service_order_history (
      os_id, usuario_id, status_anterior, status_novo, comentario
    ) VALUES (
      NEW.id, auth.uid(), OLD.status, NEW.status, v_comentario
    );
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 4 e 7. AS TRAVAS DO DINHEIRO DA OS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.travas_da_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pode_aprovar BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) Entregue é entregue: o dinheiro da OS não muda mais enquanto ela
  --     estiver nessa etapa. Reabrir (trocar a etapa) é outra ação.
  IF OLD.status = 'entregue' AND NEW.status = 'entregue' THEN
    IF NEW.total_orcamento  IS DISTINCT FROM OLD.total_orcamento
       OR NEW.tipo            IS DISTINCT FROM OLD.tipo
       OR NEW.valor_final_pago IS DISTINCT FROM OLD.valor_final_pago
       OR NEW.laudo_aprovado  IS DISTINCT FROM OLD.laudo_aprovado
       OR NEW.cliente_id      IS DISTINCT FROM OLD.cliente_id
    THEN
      RAISE EXCEPTION
        'Esta OS já foi entregue: o orçamento, o tipo e o valor pago dela não mudam mais. Para corrigir, reabra a OS.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  v_pode_aprovar := public.has_permission(auth.uid(), 'orders.approve');

  -- (b) O registro da resposta do cliente — aprovou/recusou, quem, quando, o
  --     motivo e o valor recusado — só muda por quem aprova orçamento. Quem
  --     grava é `registrar_decisao_do_laudo`; quem apaga (recusa desfeita) é
  --     `desfazer_recusa_ao_reabrir_os`, que desde 24/09 também exige a
  --     permissão. Não sobra exceção.
  IF NOT v_pode_aprovar
     AND (NEW.laudo_aprovado, NEW.laudo_decidido_em, NEW.laudo_decidido_por,
          NEW.laudo_motivo_recusa, NEW.valor_orcado_recusado)
         IS DISTINCT FROM
         (OLD.laudo_aprovado, OLD.laudo_decidido_em, OLD.laudo_decidido_por,
          OLD.laudo_motivo_recusa, OLD.valor_orcado_recusado)
  THEN
    RAISE EXCEPTION
      'A resposta do cliente ao orçamento só é registrada por quem tem a permissão de aprovar orçamento.'
      USING ERRCODE = '42501';
  END IF;

  -- (c) Valor aprovado pelo cliente não baixa sem a permissão de quem aprova:
  --     baixar, ou virar a OS em garantia/cortesia, é dar desconto no que foi
  --     combinado. SUBIR passa — e nenhuma tela devolve a OS para "Aguardando
  --     aprovação" quando isso acontece (este comentário prometia que sim até
  --     24/09). A ficha pede confirmação antes de salvar o valor maior; exigir
  --     nova aprovação é decisão do Felipe, anotada no plano.
  IF OLD.laudo_aprovado IS TRUE AND NEW.laudo_aprovado IS TRUE
     AND NOT v_pode_aprovar
     AND (NEW.total_orcamento < OLD.total_orcamento
          OR (OLD.tipo = 'paga' AND NEW.tipo IS DISTINCT FROM 'paga'))
  THEN
    RAISE EXCEPTION
      'O cliente aprovou R$ %. Baixar esse valor ou dispensar a cobrança é decisão de quem aprova orçamento.',
      to_char(OLD.total_orcamento, 'FM999G999G990D00')
      USING ERRCODE = '42501';
  END IF;

  -- (d) Na OS RECUSADA o valor é a taxa de análise. Zerar a taxa (a OS sai de
  --     graça) ou trocar pelo valor do conserto recusado (a loja cobra o que
  --     o cliente não quis) é decisão de quem aprova — nos dois sentidos.
  IF OLD.laudo_aprovado IS FALSE AND NEW.laudo_aprovado IS FALSE
     AND NOT v_pode_aprovar
     AND (NEW.total_orcamento IS DISTINCT FROM OLD.total_orcamento
          OR NEW.tipo IS DISTINCT FROM OLD.tipo)
  THEN
    RAISE EXCEPTION
      'O cliente recusou o orçamento e esta OS vale R$ % (a taxa de análise). Mudar esse valor, ou o tipo da OS, é decisão de quem aprova orçamento.',
      to_char(OLD.total_orcamento, 'FM999G999G990D00')
      USING ERRCODE = '42501';
  END IF;

  -- (e) "Vai ter laudo eletrônico?" é combinado com o cliente na abertura e
  --     decide duas coisas de dinheiro: se a recusa cobra taxa e se a OS vai
  --     direto para a execução sem aprovação (serviço tabelado). Mudar depois
  --     é decisão de quem aprova — senão bastaria desligar a chavinha pela API
  --     para pular a aprovação.
  IF NEW.laudo_eletronico IS DISTINCT FROM OLD.laudo_eletronico
     AND NOT v_pode_aprovar
  THEN
    RAISE EXCEPTION
      'Mudar se esta OS tem laudo eletrônico muda o que o cliente paga e o caminho dela na bancada — é decisão de quem aprova orçamento.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.travas_da_os() IS
  'Travas do dinheiro da OS (15/09, ampliadas em 24/09): OS entregue tem orçamento/tipo/valor pago congelados; o registro da resposta do cliente só muda por quem tem orders.approve; baixar valor aprovado, mexer na taxa da OS recusada e mudar o laudo eletrônico exigem orders.approve.';


-- -----------------------------------------------------------------------------
-- 5. A OS PAGA EM R$ 0
-- -----------------------------------------------------------------------------
-- Mesmo corpo de 20260822120000, com a regra do R$ 0 no lugar da saída cedo.
CREATE OR REPLACE FUNCTION public.conferir_pagamento_ao_entregar_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago       DECIMAL(10,2);
  v_bloqueado  BOOLEAN;
  v_nome       TEXT;
BEGIN
  -- Só interessa quando a OS ESTÁ ficando entregue: ou nasce assim (INSERT),
  -- ou passa a ser agora (UPDATE vindo de outra etapa).
  IF NEW.status <> 'entregue' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  -- Garantia e cortesia não cobram nada — nada para conferir.
  IF NEW.tipo IS NOT NULL AND NEW.tipo <> 'paga' THEN
    RETURN NEW;
  END IF;

  -- OS paga sem valor: sair sem cobrar nada (nem peça, nem serviço) é decisão
  -- de quem aprova orçamento. Até 24/09 isto saía cedo e calado — a OS paga
  -- esquecida em R$ 0 era entregue sem pergunta, sem título e sem caixa.
  IF COALESCE(NEW.total_orcamento, 0) <= 0 THEN
    IF auth.uid() IS NOT NULL
       AND NOT public.has_permission(auth.uid(), 'orders.approve')
    THEN
      RAISE EXCEPTION
        'A OS % é paga, mas está com valor R$ 0,00: entregar assim é sair sem cobrar nada. Preencha o valor do orçamento na ficha da OS, ou peça a um vendedor ou gerente para entregar sem cobrança.',
        NEW.numero_os
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT NOT COALESCE(c.liberado_venda, true), c.nome
      INTO v_bloqueado, v_nome
    FROM public.clientes c
    WHERE c.id = NEW.cliente_id
      AND c.tenant_id = NEW.tenant_id;

    IF COALESCE(v_bloqueado, false) THEN
      RAISE EXCEPTION
        'O cliente % está bloqueado para venda — a cobrança desta OS foi recusada. Libere na ficha dele (Cadastros > Clientes) antes de entregar.',
        v_nome
        USING ERRCODE = 'check_violation';
    END IF;
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

-- Mesmo corpo de 20260901160000, com a recusa de "aprovar R$ 0" em OS paga.
CREATE OR REPLACE FUNCTION public.registrar_decisao_do_laudo(
  _os_id uuid, _aprovado boolean, _motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os   RECORD;
  v_taxa NUMERIC(10,2);
BEGIN
  SELECT id, tenant_id, status, tipo, total_orcamento, laudo_eletronico
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

  -- OS paga sem valor não se aprova (24/09): aprovar R$ 0 deixava a OS seguir
  -- até a entrega e sair sem cobrança. Garantia e cortesia ficam de fora —
  -- nelas R$ 0 é o combinado.
  IF _aprovado AND v_os.tipo = 'paga' AND COALESCE(v_os.total_orcamento, 0) <= 0 THEN
    RAISE EXCEPTION
      'Esta OS está sem valor. Preencha o valor do orçamento (o que está no laudo) antes de registrar que o cliente aprovou.'
      USING ERRCODE = 'check_violation';
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

  -- A recusa cobra a taxa só em OS PAGA que teve LAUDO ELETRÔNICO (01/09): a
  -- taxa paga o trabalho de abrir e investigar o aparelho, que a OS tabelada
  -- não teve, e garantia/cortesia não passam pelo caixa. COALESCE para as OS
  -- antigas, de antes da chavinha: todas passaram por análise.
  IF v_os.tipo = 'paga' AND COALESCE(v_os.laudo_eletronico, true) THEN
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
         -- A bancada, não a prateleira: o aparelho saiu aberto do diagnóstico
         -- e o técnico precisa remontar antes de "Reparo concluído" (01/09).
         status                 = 'aprovado'
   WHERE id = _os_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- 6. O AVISO DA PEÇA QUE NÃO VOLTA, SEM CONTAR A HISTÓRIA ERRADA
-- -----------------------------------------------------------------------------
-- Mesmo corpo de 20260915100000; só o texto do aviso muda.
CREATE OR REPLACE FUNCTION public.mover_pecas_da_os(
  _os_id uuid, _numero_os text, _devolver boolean, _motivo text
)
RETURNS void
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
      CONTINUE;
    END IF;

    IF NOT _devolver AND v_produto.estoque_atual < v_item.quantidade THEN
      RAISE EXCEPTION
        'A peça desta OS voltou ao estoque quando a OS parou (orçamento recusado ou OS cancelada) e não está mais disponível: tem %, a OS precisa de %. Reponha o estoque antes de fazer a OS andar de novo.',
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
      (CASE WHEN _devolver THEN 'entrada' ELSE 'saida' END)::public.movimento_tipo,
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


-- -----------------------------------------------------------------------------
-- PORTAS FECHADAS (regra de 14-15/09)
-- -----------------------------------------------------------------------------
-- `CREATE OR REPLACE` mantém os privilégios que a função já tinha, mas a regra
-- é fechar na marra: função de gatilho e engrenagem interna não são chamáveis
-- por ninguém de fora. A única que a tela chama (.rpc) é a da resposta do
-- cliente, que ganha o EXECUTE de propósito.
REVOKE EXECUTE ON FUNCTION public.validar_aprovacao_orcamento_os() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.desfazer_recusa_ao_reabrir_os() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_os_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.travas_da_os() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.conferir_pagamento_ao_entregar_os() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mover_pecas_da_os(uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_decisao_do_laudo(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_decisao_do_laudo(uuid, boolean, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- CONFERE: AS PORTAS E AS REGRAS, DE VERDADE
-- -----------------------------------------------------------------------------
DO $verifica$
DECLARE
  v_txt TEXT;
BEGIN
  -- Nenhuma destas funções aberta para "todo mundo" ou para quem não logou.
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('validar_aprovacao_orcamento_os', 'desfazer_recusa_ao_reabrir_os',
                       'track_os_status_change', 'travas_da_os',
                       'conferir_pagamento_ao_entregar_os', 'mover_pecas_da_os',
                       'registrar_decisao_do_laudo')
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM unnest(p.proacl) a
                      WHERE a::text LIKE '=X/%' OR a::text LIKE 'anon=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função da OS aberta para PUBLIC ou anon: %', v_txt;
  END IF;

  -- Gatilho e engrenagem: fechados para quem está logado.
  IF has_function_privilege('authenticated', 'public.travas_da_os()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.validar_aprovacao_orcamento_os()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.desfazer_recusa_ao_reabrir_os()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.mover_pecas_da_os(uuid, text, boolean, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'função interna da OS continua chamável por quem está logado';
  END IF;

  -- A que a tela chama continua chamável — senão "Laudo aprovado" quebraria.
  IF NOT has_function_privilege('authenticated', 'public.registrar_decisao_do_laudo(uuid, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'registrar_decisao_do_laudo sem EXECUTE para authenticated — os botões da resposta do cliente quebrariam';
  END IF;
END
$verifica$;

-- Roda as regras novas de verdade, como o administrador e como um técnico, num
-- rascunho (OS criadas só para isto, com número próprio para não gastar a
-- numeração da loja) que é desfeito no fim pelo erro proposital P0999.
-- Qualquer OUTRO erro derruba a migration: é o que aconteceria na loja.
DO $prova$
DECLARE
  v_tenant  UUID;
  v_admin   UUID;
  v_tecnico UUID;
  v_cliente UUID;
  v_os      UUID;
  v_os2     UUID;
  v_os3     UUID;
  v_os4     UUID;
  v_msg     TEXT;
  v_total   NUMERIC;
  v_n       INT;
BEGIN
  BEGIN
    SELECT id INTO v_tenant FROM public.tenants ORDER BY created_at LIMIT 1;
    SELECT ur.user_id INTO v_admin
      FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'administrador' AND p.ativo AND p.tenant_id = v_tenant
     ORDER BY p.created_at LIMIT 1;
    -- Um técnico de verdade, que NÃO aprova orçamento — é o perfil que as
    -- regras novas protegem.
    SELECT ur.user_id INTO v_tecnico
      FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'tecnico' AND p.ativo AND p.tenant_id = v_tenant
       AND NOT public.has_permission(ur.user_id, 'orders.approve')
     ORDER BY p.created_at LIMIT 1;
    SELECT id INTO v_cliente FROM public.clientes WHERE tenant_id = v_tenant ORDER BY created_at LIMIT 1;

    IF v_tenant IS NULL OR v_admin IS NULL OR v_cliente IS NULL THEN
      RAISE EXCEPTION 'Banco sem loja, administrador ou cliente para a prova — confira antes de aplicar.';
    END IF;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- (1) Nem o administrador pula a resposta do cliente.
    INSERT INTO public.service_orders
      (tenant_id, cliente_id, numero_os, defeito_cliente, status, tipo, total_orcamento, laudo_eletronico)
    VALUES
      (v_tenant, v_cliente, 'PROVA-2409-A', 'prova da migration de 24/09 (desfeita)',
       'aguardando_aprovacao', 'paga', 450, true)
    RETURNING id INTO v_os;

    v_msg := NULL;
    BEGIN
      UPDATE public.service_orders SET status = 'finalizado' WHERE id = v_os;
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR v_msg NOT LIKE '%ainda não respondeu%' THEN
      RAISE EXCEPTION 'prova (1): pular a resposta do cliente passou para o administrador (%)', COALESCE(v_msg, 'sem erro');
    END IF;

    -- (2) A recusa pela porta certa; o técnico não desfaz nem mexe na taxa.
    PERFORM public.registrar_decisao_do_laudo(v_os, false, 'prova: achou caro');

    IF v_tecnico IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_tecnico, 'role', 'authenticated')::text, true);

      v_msg := NULL;
      BEGIN
        UPDATE public.service_orders SET status = 'aguardando_analise' WHERE id = v_os;
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
      END;
      IF v_msg IS NULL OR v_msg NOT LIKE '%desfaz a recusa%' THEN
        RAISE EXCEPTION 'prova (2): o técnico desfez a recusa (%)', COALESCE(v_msg, 'sem erro');
      END IF;

      v_msg := NULL;
      BEGIN
        UPDATE public.service_orders SET total_orcamento = total_orcamento + 1 WHERE id = v_os;
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
      END;
      IF v_msg IS NULL OR v_msg NOT LIKE '%taxa de análise%' THEN
        RAISE EXCEPTION 'prova (2): o técnico mudou a taxa da OS recusada (%)', COALESCE(v_msg, 'sem erro');
      END IF;

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    ELSE
      RAISE NOTICE 'Sem técnico ativo nesta loja: as provas do técnico foram puladas.';
    END IF;

    -- (3) Quem aprova desfaz: o valor volta, e a linha do tempo ganha UMA
    --     linha, com o motivo.
    UPDATE public.service_orders SET status = 'aguardando_analise' WHERE id = v_os;
    SELECT total_orcamento INTO v_total FROM public.service_orders WHERE id = v_os;
    IF v_total <> 450 THEN
      RAISE EXCEPTION 'prova (3): desfazer a recusa não devolveu o valor (ficou %)', v_total;
    END IF;
    SELECT count(*) INTO v_n FROM public.service_order_history
     WHERE os_id = v_os AND status_novo = 'aguardando_analise';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'prova (3): a volta gravou % linhas no histórico em vez de 1', v_n;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.service_order_history
                    WHERE os_id = v_os AND status_novo = 'aguardando_analise'
                      AND comentario LIKE '%achou caro%') THEN
      RAISE EXCEPTION 'prova (3): o motivo da recusa não ficou na linha do tempo';
    END IF;

    -- (4) Serviço tabelado: o técnico leva da Entrada para a execução; a OS
    --     com laudo, não.
    INSERT INTO public.service_orders
      (tenant_id, cliente_id, numero_os, defeito_cliente, status, tipo, total_orcamento, laudo_eletronico)
    VALUES
      (v_tenant, v_cliente, 'PROVA-2409-B', 'prova da migration de 24/09 (desfeita)',
       'aguardando_analise', 'paga', 150, false)
    RETURNING id INTO v_os2;

    IF v_tecnico IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_tecnico, 'role', 'authenticated')::text, true);

      -- Tem que passar: se falhar, o erro derruba a migration (é o defeito).
      UPDATE public.service_orders SET status = 'aprovado' WHERE id = v_os2;

      v_msg := NULL;
      BEGIN
        UPDATE public.service_orders SET status = 'finalizado' WHERE id = v_os;
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
      END;
      IF v_msg IS NULL OR v_msg NOT LIKE '%laudo eletrônico%' THEN
        RAISE EXCEPTION 'prova (4): a OS com laudo pulou da Entrada para Finalizado (%)', COALESCE(v_msg, 'sem erro');
      END IF;

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    END IF;

    -- (5) OS paga em R$ 0: o técnico não entrega; quem aprova, sim.
    INSERT INTO public.service_orders
      (tenant_id, cliente_id, numero_os, defeito_cliente, status, tipo, total_orcamento,
       laudo_eletronico, laudo_aprovado)
    VALUES
      (v_tenant, v_cliente, 'PROVA-2409-C', 'prova da migration de 24/09 (desfeita)',
       'finalizado', 'paga', 0, true, true)
    RETURNING id INTO v_os3;

    IF v_tecnico IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_tecnico, 'role', 'authenticated')::text, true);
      v_msg := NULL;
      BEGIN
        UPDATE public.service_orders SET status = 'entregue' WHERE id = v_os3;
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
      END;
      IF v_msg IS NULL OR v_msg NOT LIKE '%sem cobrar%' THEN
        RAISE EXCEPTION 'prova (5): o técnico entregou OS paga em R$ 0 (%)', COALESCE(v_msg, 'sem erro');
      END IF;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    END IF;

    UPDATE public.service_orders SET status = 'entregue' WHERE id = v_os3;

    -- (6) "Laudo aprovado" numa OS paga sem valor é recusado.
    INSERT INTO public.service_orders
      (tenant_id, cliente_id, numero_os, defeito_cliente, status, tipo, total_orcamento, laudo_eletronico)
    VALUES
      (v_tenant, v_cliente, 'PROVA-2409-D', 'prova da migration de 24/09 (desfeita)',
       'aguardando_aprovacao', 'paga', 0, true)
    RETURNING id INTO v_os4;

    v_msg := NULL;
    BEGIN
      PERFORM public.registrar_decisao_do_laudo(v_os4, true, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR v_msg NOT LIKE '%sem valor%' THEN
      RAISE EXCEPTION 'prova (6): aprovou OS paga em R$ 0 (%)', COALESCE(v_msg, 'sem erro');
    END IF;

    -- Tudo certo: desfaz o rascunho inteiro.
    RAISE EXCEPTION 'prova concluída' USING ERRCODE = 'P0999';
  EXCEPTION
    WHEN SQLSTATE 'P0999' THEN
      NULL;
  END;

  -- O crachá simulado morre com o sub-bloco, mas não custa garantir.
  PERFORM set_config('request.jwt.claims', '', true);
END
$prova$;

NOTIFY pgrst, 'reload schema';
