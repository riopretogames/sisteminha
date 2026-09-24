-- =============================================================================
-- O caixa e os títulos passam a conferir no banco, não no navegador
-- =============================================================================
--
-- Revisão completa de 24/09/2026 (área Financeiro). Sete achados, todos do
-- mesmo tipo: o número certo dependia de a tela estar em dia, ou de ninguém
-- chamar a API por fora dela. Um por seção, na ordem em que aparecem aqui.
--
-- 1. FECHAMENTO DO CAIXA (achado 55, grave). A conta de "quanto deveria ter na
--    gaveta" era feita no navegador, com a lista de movimentos carregada
--    quando a tela abriu. Venda em dinheiro feita em OUTRO computador depois
--    disso entrava na sessão, mas ficava fora do "esperado" gravado — e o
--    fechamento saía com uma sobra falsa, para sempre (sessão fechada não
--    muda). Além disso o banco aceitava qualquer valor_calculado, diferença e
--    até valor de abertura mandados pela API. Agora quem calcula é o banco, na
--    hora de fechar, com o que está gravado naquele instante; o que vier do
--    navegador nesses campos é ignorado.
--
-- 2. LANÇAMENTO EM CAIXA QUE ACABOU DE FECHAR. Complemento do 1: se uma venda
--    em dinheiro chega exatamente enquanto alguém fecha o caixa, os dois
--    esperam um pelo outro (trava de linha na sessão). A venda que chegar
--    depois do fechamento vai para o caixa aberto seguinte — nunca para
--    dentro de um caixa que já foi conferido.
--
-- 3. DEVOLUÇÃO COM O CAIXA FECHADO (achado 60). Venda e OS abrem o caixa
--    sozinhas desde 21/08; a devolução tinha ficado para trás e, sem caixa
--    aberto, não lançava nada — o dinheiro devolvido saía da gaveta sem
--    registro nenhum.
--
-- 4. VENDA CANCELADA DEIXAVA O DINHEIRO NO CAIXA (achado 59). Agora o
--    cancelamento tira o lançamento do caixa aberto, ou lança um estorno se
--    aquele caixa já foi fechado.
--
-- 5. RESUMO POR FORMA DE PAGAMENTO (achado 63). Somava o valor ENTREGUE pelo
--    cliente (com troco) como dinheiro recebido, contava pagamento de OS que
--    não chegou a ser entregue, e deixava de fora o PIX/cartão feito antes da
--    primeira venda em dinheiro do dia.
--
-- 6. TÍTULO AUTOMÁTICO DA OS (achado 65). Dava para reabrir e cancelar o
--    título que a entrega da OS cria sozinha: a receita sumia do Fluxo com a
--    OS entregue e paga, e reentregar não recriava.
--
-- 7. OS REENTREGUE DUAS VEZES (achado 68). O lançamento no caixa comparava só
--    com o ÚLTIMO lançamento da OS, e a terceira entrega transformava R$ 50 em
--    R$ 150 de dinheiro que não existe.
--
-- 8. LEITURA DESENCONTRADA (achado 69). Quem pode ver Metas ou IE lia as
--    vendas mas não as devoluções; quem pode ver o Fluxo de Caixa não lia as
--    categorias — os números saíam incompletos em silêncio.
--
-- Regras de sempre (CLAUDE.md): policy com TO authenticated, função de
-- gatilho fechada com REVOKE ... FROM PUBLIC, view fechada para escrita, e a
-- conferência no fim derruba a migration se algo não ficou no lugar.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Quem calcula o fechamento é o banco
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `auth.uid() IS NULL` é manutenção feita direto no banco (SQL Editor,
-- migration): fica livre, como em `proteger_venda_gravada`. Tudo que vem da
-- tela ou da API tem crachá e passa pelas travas. O cálculo do fechamento vale
-- para os dois — não existe fechamento com "esperado" digitado.

CREATE OR REPLACE FUNCTION public.conferir_sessao_de_caixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movimentos NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      IF NEW.status IS DISTINCT FROM 'aberto'::public.status_caixa THEN
        RAISE EXCEPTION 'Caixa novo nasce aberto. O fechamento vem depois, com a conferência da gaveta.'
          USING ERRCODE = 'check_violation';
      END IF;
      -- Quem abriu e quando é carimbo, não escolha: abrir "ontem às 8h" pela
      -- API deslocaria para dentro da sessão vendas que não eram dela.
      NEW.aberto_em       := now();
      NEW.aberto_por      := auth.uid();
      NEW.fechado_em      := NULL;
      NEW.fechado_por     := NULL;
      NEW.valor_informado := NULL;
      NEW.valor_calculado := NULL;
      NEW.diferenca       := NULL;
    END IF;

    IF NEW.valor_abertura IS NULL OR NEW.valor_abertura < 0 THEN
      RAISE EXCEPTION 'O valor inicial da gaveta não pode ser negativo.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE ------------------------------------------------------------------
  IF auth.uid() IS NOT NULL THEN
    -- A regra de acesso já esconde a sessão fechada de quem tenta alterar;
    -- isto é a segunda tranca, para o dia em que alguém mexer na regra.
    IF OLD.status = 'fechado' THEN
      RAISE EXCEPTION 'Este caixa já foi fechado e conferido. Ele não muda mais.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.tenant_id      IS DISTINCT FROM OLD.tenant_id
       OR NEW.aberto_por  IS DISTINCT FROM OLD.aberto_por
       OR NEW.aberto_em   IS DISTINCT FROM OLD.aberto_em
       OR NEW.valor_abertura IS DISTINCT FROM OLD.valor_abertura
       OR NEW.created_at  IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'A abertura do caixa (quem abriu, quando e com quanto) não muda depois de feita.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.status = 'aberto' AND NEW.status = 'fechado' THEN
    IF NEW.valor_informado IS NULL OR NEW.valor_informado < 0 THEN
      RAISE EXCEPTION 'Informe quanto dinheiro foi contado na gaveta (zero ou mais).'
        USING ERRCODE = 'check_violation';
    END IF;

    -- O esperado é a abertura mais TUDO que está lançado nesta sessão agora.
    -- Se uma venda está sendo gravada neste instante, o fechamento espera ela
    -- terminar (ver a trava da seção 2) e a soma já a inclui.
    SELECT COALESCE(SUM(valor), 0) INTO v_movimentos
      FROM public.caixa_movimentos
     WHERE sessao_id = OLD.id;

    NEW.valor_calculado := NEW.valor_abertura + v_movimentos;
    NEW.diferenca       := NEW.valor_informado - NEW.valor_calculado;
    NEW.fechado_em      := now();
    NEW.fechado_por     := COALESCE(auth.uid(), NEW.fechado_por, OLD.aberto_por);
  ELSIF NEW.status = 'aberto' AND auth.uid() IS NOT NULL THEN
    -- Continua aberto: os campos do fechamento só existem no fechamento.
    IF NEW.fechado_em IS NOT NULL OR NEW.fechado_por IS NOT NULL
       OR NEW.valor_informado IS NOT NULL OR NEW.valor_calculado IS NOT NULL
       OR NEW.diferenca IS NOT NULL
    THEN
      RAISE EXCEPTION 'Os valores de fechamento só são gravados ao fechar o caixa.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.conferir_sessao_de_caixa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conferir_sessao_de_caixa ON public.caixa_sessoes;
CREATE TRIGGER conferir_sessao_de_caixa
  BEFORE INSERT OR UPDATE ON public.caixa_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.conferir_sessao_de_caixa();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lançamento nunca cai dentro de um caixa já conferido
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A trava (FOR SHARE) segura a linha da sessão enquanto o lançamento não
-- termina. Fechar o caixa precisa da mesma linha, então:
--   - venda gravando e alguém fechando: o fechamento espera a venda, e a
--     soma do "esperado" já a inclui;
--   - caixa fechando e venda chegando: a venda espera o fechamento, vê que o
--     caixa fechou e vai para o caixa aberto seguinte (que abre sozinho, como
--     desde 21/08).
-- Lançamento feito À MÃO (sangria, suprimento) não é redirecionado: a pessoa
-- estava olhando um caixa que fechou, então é melhor avisar que lançar num
-- caixa que ela nem viu abrir.
--
-- UPDATE só olha valor e sessão: o banco também atualiza movimento quando
-- apaga uma forma de pagamento (a ligação vira vazia), e isso não muda
-- dinheiro nenhum — não pode ser barrado.

CREATE OR REPLACE FUNCTION public.movimento_so_em_caixa_aberto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao UUID;
  v_status public.status_caixa;
  v_tenant UUID;
  v_nova   UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_sessao := NEW.sessao_id;
  ELSE
    v_sessao := OLD.sessao_id;
  END IF;

  SELECT status, tenant_id INTO v_status, v_tenant
    FROM public.caixa_sessoes
   WHERE id = v_sessao
     FOR SHARE;

  IF v_status IS DISTINCT FROM 'fechado'::public.status_caixa OR auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.venda_id IS NULL AND NEW.titulo_id IS NULL AND NEW.devolucao_id IS NULL THEN
      RAISE EXCEPTION 'Este caixa acabou de ser fechado. Atualize a tela e, se ainda precisar, lance no caixa aberto.'
        USING ERRCODE = 'check_violation';
    END IF;

    v_nova := public.garantir_caixa_aberto(v_tenant, NEW.usuario_id);
    IF v_nova IS NULL THEN
      RAISE EXCEPTION 'Não há caixa aberto para receber este lançamento.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.sessao_id := v_nova;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Lançamento de um caixa já fechado não muda nem some — a conferência daquele dia já foi feita.'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.movimento_so_em_caixa_aberto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS movimento_so_em_caixa_aberto ON public.caixa_movimentos;
CREATE TRIGGER movimento_so_em_caixa_aberto
  BEFORE INSERT OR UPDATE OF valor, sessao_id OR DELETE ON public.caixa_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.movimento_so_em_caixa_aberto();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Devolução em dinheiro abre o caixa, como a venda e a OS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_devolucao_no_caixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao_id      UUID;
  v_entra_no_caixa BOOLEAN;
BEGIN
  IF NEW.valor_devolvido_cliente <= 0 THEN
    RETURN NEW;
  END IF;

  -- Devolvido em PIX/cartão não sai da gaveta. Sem forma informada, conta
  -- como dinheiro — é o caso do balcão, e era assim desde 17/08.
  IF NEW.forma_pagamento_id IS NOT NULL THEN
    SELECT entra_no_caixa INTO v_entra_no_caixa
      FROM public.formas_pagamento WHERE id = NEW.forma_pagamento_id;

    IF v_entra_no_caixa IS NOT TRUE THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Antes: sem caixa aberto, saía sem lançar nada — o dinheiro devolvido de
  -- manhã, antes da primeira venda, sumia da conferência. Agora abre o caixa
  -- como a venda e a OS fazem desde 21/08.
  v_sessao_id := public.garantir_caixa_aberto(NEW.tenant_id, NEW.usuario_id);

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

REVOKE EXECUTE ON FUNCTION public.registrar_devolucao_no_caixa() FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Venda cancelada tira o dinheiro dela do caixa
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Caixa ainda aberto: o lançamento da venda sai (a conferência daquele dia
-- ainda não aconteceu). Caixa já fechado: aquele número foi conferido e não
-- muda — entra um ESTORNO (tipo "ajuste", negativo) no caixa aberto de agora,
-- que é quando o dinheiro volta de fato.
--
-- Só existe um cancelamento por venda (a venda não volta de "cancelado"),
-- então o estorno não tem como sair em dobro.

CREATE OR REPLACE FUNCTION public.estornar_caixa_da_venda_cancelada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conferido NUMERIC;
  v_sessao    UUID;
BEGIN
  DELETE FROM public.caixa_movimentos m
   USING public.caixa_sessoes s
   WHERE s.id = m.sessao_id
     AND s.status = 'aberto'
     AND m.venda_id = NEW.id
     AND m.tipo = 'venda';

  SELECT COALESCE(SUM(m.valor), 0) INTO v_conferido
    FROM public.caixa_movimentos m
    JOIN public.caixa_sessoes s ON s.id = m.sessao_id
   WHERE s.status = 'fechado'
     AND m.venda_id = NEW.id
     AND m.tipo = 'venda';

  -- `<> 0`, e não `> 0` (fechamento da revisão de 24/09): se a migration
  -- supabase/pendentes/troco_alem_do_dinheiro_sai_do_caixa.sql entrar (depende do
  -- OK do Felipe), o lançamento de uma venda pode ser NEGATIVO (troco
  -- além do dinheiro recebido saiu da gaveta). Cancelar essa venda num caixa
  -- já fechado tem que lançar o estorno do mesmo jeito — com o sinal trocado.
  -- Sem ela, nenhum lançamento de venda é negativo e as duas contas dão
  -- o mesmo resultado.
  IF v_conferido <> 0 THEN
    v_sessao := public.garantir_caixa_aberto(NEW.tenant_id, COALESCE(auth.uid(), NEW.vendedor_id));
    IF v_sessao IS NOT NULL THEN
      INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, venda_id, usuario_id)
      VALUES (
        v_sessao,
        'ajuste',
        'Estorno da venda ' || COALESCE(NEW.numero_venda, '') || ' (cancelada)',
        -v_conferido,
        NEW.id,
        auth.uid()
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.estornar_caixa_da_venda_cancelada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS estornar_caixa_ao_cancelar_venda ON public.vendas;
CREATE TRIGGER estornar_caixa_ao_cancelar_venda
  AFTER UPDATE OF status ON public.vendas
  FOR EACH ROW
  WHEN (OLD.status = 'pago' AND NEW.status = 'cancelado')
  EXECUTE FUNCTION public.estornar_caixa_da_venda_cancelada();


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Resumo por forma de pagamento: sem troco, só OS entregue, sem buraco
-- ─────────────────────────────────────────────────────────────────────────────
--
-- (a) TROCO. O PDV grava o que o cliente ENTREGOU (R$ 100 numa venda de
--     R$ 80). O caixa já descontava o troco (gatilho da venda, v_cash_liquido);
--     o resumo não, e a linha "Dinheiro físico" mostrava R$ 100 com R$ 80 na
--     gaveta. Agora a mesma conta: troco = o que foi pago além do devido, e
--     sai da parte em dinheiro. O vale-troca (pagamento sem forma cadastrada)
--     entra na conta do troco mas não vira linha, como antes.
-- (b) OS NÃO ENTREGUE. O pagamento da OS é gravado antes de a entrega mudar
--     a situação; se a entrega falha, o valor aparecia como recebido. Agora
--     só conta OS entregue — o que o comentário da view sempre prometeu.
-- (c) O COMEÇO DA JANELA. Era a abertura da sessão. Como o caixa abre sozinho
--     só na primeira venda EM DINHEIRO, o PIX e o cartão de antes ficavam fora
--     de todo resumo. Agora a janela começa no fechamento do caixa anterior:
--     tudo que entrou entre um fechamento e o próximo aparece em exatamente
--     um resumo. (O primeiro caixa da loja começa na própria abertura.)

CREATE OR REPLACE VIEW public.vw_caixa_resumo_formas AS
WITH pag_venda AS (
  SELECT pv.forma_pagamento_id,
         pv.valor,
         pv.created_at,
         v.tenant_id,
         v.total AS devido,
         fp.entra_no_caixa,
         SUM(pv.valor) OVER (PARTITION BY pv.venda_id) AS pago_total,
         SUM(CASE WHEN fp.entra_no_caixa THEN pv.valor ELSE 0 END)
           OVER (PARTITION BY pv.venda_id) AS pago_dinheiro
    FROM public.pagamentos_venda pv
    JOIN public.vendas v ON v.id = pv.venda_id AND v.status = 'pago'
    LEFT JOIN public.formas_pagamento fp ON fp.id = pv.forma_pagamento_id
), pag_os AS (
  SELECT op.forma_pagamento_id,
         op.valor,
         op.created_at,
         s.tenant_id,
         s.total_orcamento AS devido,
         fp.entra_no_caixa,
         SUM(op.valor) OVER (PARTITION BY op.os_id) AS pago_total,
         SUM(CASE WHEN fp.entra_no_caixa THEN op.valor ELSE 0 END)
           OVER (PARTITION BY op.os_id) AS pago_dinheiro
    FROM public.os_pagamentos op
    JOIN public.service_orders s ON s.id = op.os_id AND s.status = 'entregue'
    LEFT JOIN public.formas_pagamento fp ON fp.id = op.forma_pagamento_id
), pagamentos AS (
  SELECT t.forma_pagamento_id,
         t.tenant_id,
         t.created_at,
         CASE
           WHEN t.entra_no_caixa AND t.pago_dinheiro > 0
             THEN t.valor
                  * GREATEST(0, t.pago_dinheiro - GREATEST(0, t.pago_total - t.devido))
                  / t.pago_dinheiro
           ELSE t.valor
         END AS valor
    FROM (SELECT * FROM pag_venda UNION ALL SELECT * FROM pag_os) t
   WHERE t.forma_pagamento_id IS NOT NULL
)
SELECT cx.id AS sessao_id,
       fp.id AS forma_pagamento_id,
       fp.descricao AS forma_descricao,
       fp.entra_no_caixa,
       ROUND(COALESCE(SUM(p.valor), 0), 2) AS total
  FROM public.caixa_sessoes cx
  LEFT JOIN LATERAL (
    SELECT MAX(a.fechado_em) AS fechado_em
      FROM public.caixa_sessoes a
     WHERE a.tenant_id = cx.tenant_id
       AND a.status = 'fechado'
       AND a.id <> cx.id
       AND a.fechado_em <= cx.aberto_em
  ) ant ON true
  JOIN public.formas_pagamento fp ON fp.tenant_id = cx.tenant_id AND fp.ativo
  LEFT JOIN pagamentos p
         ON p.forma_pagamento_id = fp.id
        AND p.tenant_id = cx.tenant_id
        AND p.created_at > COALESCE(ant.fechado_em, cx.aberto_em - interval '1 microsecond')
        AND p.created_at <= COALESCE(cx.fechado_em, now())
 WHERE cx.tenant_id = public.get_user_tenant_id(auth.uid())
   AND (public.has_permission(auth.uid(), 'finance.view')
        OR public.has_permission(auth.uid(), 'finance.cashier.close'))
 GROUP BY cx.id, fp.id, fp.descricao, fp.entra_no_caixa, fp.ordem
 ORDER BY fp.ordem;

COMMENT ON VIEW public.vw_caixa_resumo_formas IS
  'Resumo informativo do caixa por forma de pagamento: vendas pagas e OS entregues, '
  'do fechamento do caixa anterior até o fechamento deste (ou agora). O dinheiro já '
  'vem sem o troco, igual ao que o caixa lança. Não entra na conferência da gaveta.';

-- Regra das views (23/09): leitura sim, escrita nunca.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.vw_caixa_resumo_formas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_caixa_resumo_formas TO authenticated;
ALTER VIEW public.vw_caixa_resumo_formas SET (security_barrier = true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Título criado pela entrega da OS (ou por venda) acompanha o documento
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A trava de 18/08 continua igual para título lançado à mão. O que muda: o
-- título AUTOMÁTICO (os_id ou venda_id preenchido) não reabre, não cancela e
-- não muda de valor, vencimento nem data de pagamento pela tela ou pela API.
-- Ele é o espelho de uma OS entregue e paga — mexer só nele deixava a OS
-- dizendo "paga" e o Financeiro dizendo "não entrou". E como a entrega só
-- cria o título se não existir nenhum para aquela OS (nem cancelado), o
-- estrago não tinha volta. Correção de valor passa pela própria OS.
--
-- O vínculo (os_id, venda_id) também não muda pela API: desligar o título da
-- OS era o jeito de escapar da trava acima.
--
-- Categoria, descrição e observações continuam editáveis.

CREATE OR REPLACE FUNCTION public.validar_mudanca_status_titulo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.os_id IS DISTINCT FROM OLD.os_id OR NEW.venda_id IS DISTINCT FROM OLD.venda_id THEN
      RAISE EXCEPTION
        'A ligação do título com a OS ou com a venda é feita pelo sistema e não muda.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF (OLD.os_id IS NOT NULL OR OLD.venda_id IS NOT NULL)
       AND (NEW.status        IS DISTINCT FROM OLD.status
         OR NEW.valor         IS DISTINCT FROM OLD.valor
         OR NEW.valor_pago    IS DISTINCT FROM OLD.valor_pago
         OR NEW.pago_em       IS DISTINCT FROM OLD.pago_em
         OR NEW.vencimento    IS DISTINCT FROM OLD.vencimento
         OR NEW.natureza      IS DISTINCT FROM OLD.natureza
         OR NEW.tenant_id     IS DISTINCT FROM OLD.tenant_id)
    THEN
      RAISE EXCEPTION
        'Este título foi criado sozinho pelo sistema (entrega da OS ou venda) e acompanha aquele documento: não dá para reabrir, cancelar nem mudar o valor por aqui. Se o valor está errado, a correção é feita na própria OS.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Não mexeu no status: nada mais a validar (edição comum de descrição,
  -- categoria, observações...).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'cancelado' THEN
    RAISE EXCEPTION
      'Este título está cancelado e não pode voltar atrás. Se o cancelamento foi engano, lance um título novo.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'pago' AND NEW.status = 'cancelado' THEN
    RAISE EXCEPTION
      'Este título já foi pago e não pode ser cancelado — isso apagaria o registro de que o dinheiro entrou ou saiu. Use "Reabrir" primeiro, se a baixa foi engano.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validar_mudanca_status_titulo() FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. OS reentregue: o caixa compara com TUDO que já entrou por ela
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Antes, o gatilho olhava só o lançamento MAIS RECENTE da OS. Com dois
-- lançamentos (R$ 100 num caixa já fechado + R$ 50 no caixa aberto, depois de
-- reabrir e aumentar o orçamento), uma terceira entrega regravava os R$ 50
-- como R$ 150 — dinheiro que nunca entrou.
--
-- A conta agora: o que a OS tem em dinheiro (sem troco) MENOS o que já foi
-- conferido em caixas FECHADOS é o que deve estar no caixa aberto. Se já
-- existe lançamento dela no caixa aberto, ele é ajustado para esse valor;
-- senão entra um novo. Nunca lança negativo: orçamento que diminuiu depois de
-- pago é devolução, e devolução é outro caminho.

CREATE OR REPLACE FUNCTION public.registrar_pagamento_os_no_caixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao_id     UUID;
  v_total_pago    NUMERIC(10,2);
  v_troco         NUMERIC(10,2);
  v_cash_sum      NUMERIC(10,2);
  v_cash_liquido  NUMERIC(10,2);
  v_titulo_id     UUID;
  v_ja_conferido  NUMERIC(10,2) := 0;
  v_no_aberto     NUMERIC(10,2);
  v_mov_id        UUID;
BEGIN
  IF NEW.status <> 'entregue' OR OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo <> 'paga' OR NEW.total_orcamento <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_titulo_id FROM public.titulos_financeiros WHERE os_id = NEW.id LIMIT 1;

  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
    FROM public.os_pagamentos WHERE os_id = NEW.id;

  v_troco := GREATEST(0, v_total_pago - NEW.total_orcamento);

  SELECT COALESCE(SUM(op.valor), 0) INTO v_cash_sum
    FROM public.os_pagamentos op
    JOIN public.formas_pagamento fp ON fp.id = op.forma_pagamento_id
   WHERE op.os_id = NEW.id AND fp.entra_no_caixa = true;

  v_cash_liquido := GREATEST(0, v_cash_sum - v_troco);

  IF v_titulo_id IS NOT NULL THEN
    SELECT COALESCE(SUM(m.valor), 0) INTO v_ja_conferido
      FROM public.caixa_movimentos m
      JOIN public.caixa_sessoes s ON s.id = m.sessao_id
     WHERE m.titulo_id = v_titulo_id
       AND m.tipo = 'recebimento'
       AND s.status = 'fechado';

    SELECT m.id INTO v_mov_id
      FROM public.caixa_movimentos m
      JOIN public.caixa_sessoes s ON s.id = m.sessao_id
     WHERE m.titulo_id = v_titulo_id
       AND m.tipo = 'recebimento'
       AND s.status = 'aberto'
     ORDER BY m.created_at DESC
     LIMIT 1;

    -- Mais de um lançamento da mesma OS no caixa aberto não deveria existir;
    -- se existir (sobra do defeito antigo), fica um só e ele é ajustado.
    IF v_mov_id IS NOT NULL THEN
      DELETE FROM public.caixa_movimentos m
       USING public.caixa_sessoes s
       WHERE s.id = m.sessao_id
         AND s.status = 'aberto'
         AND m.titulo_id = v_titulo_id
         AND m.tipo = 'recebimento'
         AND m.id <> v_mov_id;
    END IF;
  END IF;

  v_no_aberto := v_cash_liquido - v_ja_conferido;

  IF v_mov_id IS NOT NULL THEN
    IF v_no_aberto > 0 THEN
      UPDATE public.caixa_movimentos SET valor = v_no_aberto WHERE id = v_mov_id;
    ELSE
      DELETE FROM public.caixa_movimentos WHERE id = v_mov_id;
    END IF;
    RETURN NEW;
  END IF;

  IF v_no_aberto <= 0 THEN
    RETURN NEW;
  END IF;

  v_sessao_id := public.garantir_caixa_aberto(NEW.tenant_id, auth.uid());

  IF v_sessao_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, titulo_id, usuario_id)
  VALUES (v_sessao_id, 'recebimento', 'OS ' || NEW.numero_os, v_no_aberto, v_titulo_id, auth.uid());

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pagamento_os_no_caixa() FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Quem lê as vendas lê as devoluções; quem lê o Fluxo lê as categorias
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A regra de leitura de `vendas` aceita Metas, IE Comercial e IE Estoque; a
-- de devoluções não aceitava. Uma pessoa só com Metas via o faturamento SEM o
-- desconto das devoluções — número maior que o real, sem erro nenhum. Mesma
-- coisa com as categorias: o Fluxo de Caixa e o Relatório Financeiro abrem
-- com `finance.cashflow.view`, e as categorias só com `finance.view`, então
-- tudo aparecia como "Sem categoria".

DROP POLICY IF EXISTS "Ver devolucoes do tenant" ON public.devolucoes;
CREATE POLICY "Ver devolucoes do tenant" ON public.devolucoes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'sales.view')
      OR public.has_permission(auth.uid(), 'sales.create')
      OR public.has_permission(auth.uid(), 'sales.cancel')
      OR public.has_permission(auth.uid(), 'dashboards.sales.view')
      OR public.has_permission(auth.uid(), 'dashboards.goals.view')
      OR public.has_permission(auth.uid(), 'bi.commercial.view')
      OR public.has_permission(auth.uid(), 'bi.stock.view')
      OR public.has_permission(auth.uid(), 'finance.view')
      OR public.has_permission(auth.uid(), 'finance.cashflow.view')
      OR public.has_permission(auth.uid(), 'reports.view')
      OR public.has_permission(auth.uid(), 'audit.view')
    )
  );

DROP POLICY IF EXISTS "Ver itens de devolucao do tenant" ON public.devolucao_itens;
CREATE POLICY "Ver itens de devolucao do tenant" ON public.devolucao_itens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.devolucoes d
       WHERE d.id = devolucao_itens.devolucao_id
         AND d.tenant_id = public.get_user_tenant_id(auth.uid())
         AND (
           public.has_permission(auth.uid(), 'sales.view')
           OR public.has_permission(auth.uid(), 'sales.create')
           OR public.has_permission(auth.uid(), 'sales.cancel')
           OR public.has_permission(auth.uid(), 'dashboards.sales.view')
           OR public.has_permission(auth.uid(), 'dashboards.goals.view')
           OR public.has_permission(auth.uid(), 'bi.commercial.view')
           OR public.has_permission(auth.uid(), 'bi.stock.view')
           OR public.has_permission(auth.uid(), 'finance.view')
           OR public.has_permission(auth.uid(), 'finance.cashflow.view')
           OR public.has_permission(auth.uid(), 'reports.view')
           OR public.has_permission(auth.uid(), 'audit.view')
         )
    )
  );

DROP POLICY IF EXISTS "Ver categorias financeiras" ON public.categorias_financeiras;
CREATE POLICY "Ver categorias financeiras" ON public.categorias_financeiras
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'finance.view')
      OR public.has_permission(auth.uid(), 'finance.cashflow.view')
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- Conferência: se algo não ficou no lugar, a migration inteira volta atrás
-- ─────────────────────────────────────────────────────────────────────────────

DO $verifica$
DECLARE
  v_txt TEXT;
  v_n   INTEGER;
BEGIN
  -- os três gatilhos novos existem, nas tabelas certas
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'conferir_sessao_de_caixa'
                   AND tgrelid = 'public.caixa_sessoes'::regclass) THEN
    RAISE EXCEPTION 'gatilho conferir_sessao_de_caixa não foi criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'movimento_so_em_caixa_aberto'
                   AND tgrelid = 'public.caixa_movimentos'::regclass) THEN
    RAISE EXCEPTION 'gatilho movimento_so_em_caixa_aberto não foi criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'estornar_caixa_ao_cancelar_venda'
                   AND tgrelid = 'public.vendas'::regclass) THEN
    RAISE EXCEPTION 'gatilho estornar_caixa_ao_cancelar_venda não foi criado';
  END IF;

  -- os gatilhos antigos continuam ligados às funções redefinidas
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE (tgname = 'lancar_devolucao_no_caixa' AND tgrelid = 'public.devolucoes'::regclass)
      OR (tgname = 'lancar_pagamento_os_no_caixa' AND tgrelid = 'public.service_orders'::regclass)
      OR (tgname = 'trg_status_titulo' AND tgrelid = 'public.titulos_financeiros'::regclass);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'um dos gatilhos de caixa/título sumiu (achados %, esperados 3)', v_n;
  END IF;

  -- a devolução passou a abrir o caixa
  IF pg_get_functiondef('public.registrar_devolucao_no_caixa()'::regprocedure) NOT LIKE '%garantir_caixa_aberto%' THEN
    RAISE EXCEPTION 'registrar_devolucao_no_caixa ainda não abre o caixa';
  END IF;

  -- nenhuma das funções de gatilho é chamável por quem está logado
  SELECT string_agg(f, ', ') INTO v_txt
    FROM unnest(ARRAY[
      'public.conferir_sessao_de_caixa()',
      'public.movimento_so_em_caixa_aberto()',
      'public.estornar_caixa_da_venda_cancelada()',
      'public.registrar_devolucao_no_caixa()',
      'public.registrar_pagamento_os_no_caixa()',
      'public.validar_mudanca_status_titulo()'
    ]) AS f
   WHERE has_function_privilege('authenticated', f, 'EXECUTE')
      OR has_function_privilege('anon', f, 'EXECUTE');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função de gatilho ainda aberta: %', v_txt;
  END IF;

  -- a view continua lendo e não grava
  IF NOT has_table_privilege('authenticated', 'public.vw_caixa_resumo_formas', 'SELECT') THEN
    RAISE EXCEPTION 'vw_caixa_resumo_formas sem SELECT — o resumo do caixa quebraria';
  END IF;
  IF has_table_privilege('authenticated', 'public.vw_caixa_resumo_formas', 'INSERT')
     OR has_table_privilege('authenticated', 'public.vw_caixa_resumo_formas', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.vw_caixa_resumo_formas', 'DELETE') THEN
    RAISE EXCEPTION 'vw_caixa_resumo_formas ficou gravável';
  END IF;
  IF has_table_privilege('anon', 'public.vw_caixa_resumo_formas', 'SELECT') THEN
    RAISE EXCEPTION 'vw_caixa_resumo_formas aberta para quem não fez login';
  END IF;

  -- nenhuma policy aberta para anon/public (regra de 14/09)
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'sobrou % policy aberta para anon/public', v_n;
  END IF;

  -- as três regras de leitura novas estão no lugar
  SELECT qual INTO v_txt FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'devolucoes' AND policyname = 'Ver devolucoes do tenant';
  IF v_txt IS NULL OR v_txt NOT LIKE '%dashboards.goals.view%' THEN
    RAISE EXCEPTION 'a leitura de devoluções não aceita quem vê Metas';
  END IF;
  SELECT qual INTO v_txt FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'devolucao_itens' AND policyname = 'Ver itens de devolucao do tenant';
  IF v_txt IS NULL OR v_txt NOT LIKE '%bi.commercial.view%' THEN
    RAISE EXCEPTION 'a leitura dos itens devolvidos não aceita quem vê o IE Comercial';
  END IF;
  SELECT qual INTO v_txt FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'categorias_financeiras' AND policyname = 'Ver categorias financeiras';
  IF v_txt IS NULL OR v_txt NOT LIKE '%finance.cashflow.view%' THEN
    RAISE EXCEPTION 'a leitura de categorias não aceita quem vê o Fluxo de Caixa';
  END IF;

  -- nenhuma função do schema aberta para "todo mundo" (regra de 15/09)
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função ainda aberta para PUBLIC: %', v_txt;
  END IF;
END
$verifica$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Prova de funcionamento, com os dados de verdade e DESFEITA no fim
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Age como o administrador da loja (é o que a tela faz), fecha o caixa que
-- estiver aberto, tenta as fraudes e confere o que o banco fez. Tudo roda num
-- sub-bloco que termina com um erro de propósito ("prova concluída"), que
-- desfaz cada linha gravada — o caixa aberto continua aberto, a venda
-- continua paga. Nenhuma numeração usa sequência (conferido), então não fica
-- nem buraco de número.

DO $prova$
DECLARE
  v_tenant    UUID;
  v_admin     UUID;
  v_sessao    UUID;
  v_nova      UUID;
  v_abertura  NUMERIC;
  v_soma      NUMERIC;
  v_calc      NUMERIC;
  v_dif       NUMERIC;
  v_por       UUID;
  v_titulo    UUID;
  v_venda     UUID;
  v_conferido NUMERIC;
  v_dev       UUID;
  v_recusou   BOOLEAN;
BEGIN
  BEGIN
    SELECT id INTO v_tenant FROM public.tenants ORDER BY created_at LIMIT 1;
    SELECT ur.user_id INTO v_admin
      FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'administrador' AND p.ativo AND p.tenant_id = v_tenant
     ORDER BY p.created_at LIMIT 1;

    IF v_tenant IS NULL OR v_admin IS NULL THEN
      RAISE EXCEPTION 'Banco sem loja ou administrador para a prova — confira antes de aplicar.';
    END IF;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- (a) um caixa aberto (o que já existe, ou um novo) e um suprimento de 50
    v_sessao := public.garantir_caixa_aberto(v_tenant, v_admin);
    INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, usuario_id)
    VALUES (v_sessao, 'suprimento', 'prova da migration 24/09 (desfeita)', 50, v_admin);

    -- (b) a abertura não muda pela API
    v_recusou := false;
    BEGIN
      UPDATE public.caixa_sessoes SET valor_abertura = valor_abertura + 999 WHERE id = v_sessao;
    EXCEPTION WHEN check_violation THEN
      v_recusou := true;
    END;
    IF NOT v_recusou THEN
      RAISE EXCEPTION 'prova: a abertura do caixa mudou depois de aberta';
    END IF;

    -- (c) fechar: o esperado e a diferença vêm do banco, não do que foi mandado
    SELECT valor_abertura INTO v_abertura FROM public.caixa_sessoes WHERE id = v_sessao;
    SELECT COALESCE(SUM(valor), 0) INTO v_soma FROM public.caixa_movimentos WHERE sessao_id = v_sessao;
    UPDATE public.caixa_sessoes
       SET status = 'fechado', valor_informado = 123.45, valor_calculado = 1, diferenca = 1
     WHERE id = v_sessao;
    SELECT valor_calculado, diferenca, fechado_por INTO v_calc, v_dif, v_por
      FROM public.caixa_sessoes WHERE id = v_sessao;
    IF v_calc IS DISTINCT FROM v_abertura + v_soma THEN
      RAISE EXCEPTION 'prova: esperado gravado % em vez de %', v_calc, v_abertura + v_soma;
    END IF;
    IF v_dif IS DISTINCT FROM 123.45 - v_calc THEN
      RAISE EXCEPTION 'prova: diferença gravada % em vez de %', v_dif, 123.45 - v_calc;
    END IF;
    IF v_por IS DISTINCT FROM v_admin THEN
      RAISE EXCEPTION 'prova: o fechamento não carimbou quem fechou';
    END IF;

    -- (d) lançamento à mão num caixa fechado: recusado
    v_recusou := false;
    BEGIN
      INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, usuario_id)
      VALUES (v_sessao, 'sangria', 'prova (desfeita)', -10, v_admin);
    EXCEPTION WHEN check_violation THEN
      v_recusou := true;
    END;
    IF NOT v_recusou THEN
      RAISE EXCEPTION 'prova: sangria entrou num caixa já fechado';
    END IF;

    -- (e) lançamento de um caixa fechado não muda de valor
    v_recusou := false;
    BEGIN
      UPDATE public.caixa_movimentos SET valor = 51
       WHERE sessao_id = v_sessao AND descricao = 'prova da migration 24/09 (desfeita)';
    EXCEPTION WHEN check_violation THEN
      v_recusou := true;
    END;
    IF NOT v_recusou THEN
      RAISE EXCEPTION 'prova: lançamento de caixa fechado mudou de valor';
    END IF;

    -- (f) lançamento AUTOMÁTICO que chega num caixa fechado vai para o aberto
    SELECT id INTO v_titulo FROM public.titulos_financeiros WHERE tenant_id = v_tenant LIMIT 1;
    IF v_titulo IS NOT NULL THEN
      INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, titulo_id, usuario_id)
      VALUES (v_sessao, 'recebimento', 'prova (desfeita)', 1, v_titulo, v_admin)
      RETURNING sessao_id INTO v_nova;
      IF v_nova = v_sessao
         OR (SELECT status FROM public.caixa_sessoes WHERE id = v_nova) <> 'aberto' THEN
        RAISE EXCEPTION 'prova: lançamento automático caiu dentro do caixa fechado';
      END IF;
    END IF;

    -- (g) título criado pela entrega da OS não reabre
    SELECT id INTO v_titulo FROM public.titulos_financeiros
     WHERE tenant_id = v_tenant AND os_id IS NOT NULL LIMIT 1;
    IF v_titulo IS NOT NULL THEN
      v_recusou := false;
      BEGIN
        UPDATE public.titulos_financeiros
           SET status = 'aberto', valor_pago = 0, pago_em = NULL
         WHERE id = v_titulo;
      EXCEPTION WHEN check_violation THEN
        v_recusou := true;
      END;
      IF NOT v_recusou THEN
        RAISE EXCEPTION 'prova: o título da OS foi reaberto pela API';
      END IF;
    END IF;

    -- (h) devolução em dinheiro com o caixa fechado abre o caixa e lança
    UPDATE public.caixa_sessoes SET status = 'fechado', valor_informado = 0
     WHERE tenant_id = v_tenant AND status = 'aberto';
    SELECT v.id INTO v_venda FROM public.vendas v
     WHERE v.tenant_id = v_tenant AND v.status = 'pago' LIMIT 1;
    IF v_venda IS NOT NULL THEN
      INSERT INTO public.devolucoes (tenant_id, venda_original_id, valor_devolvido_cliente, motivo, usuario_id)
      VALUES (v_tenant, v_venda, 10, 'prova (desfeita)', v_admin)
      RETURNING id INTO v_dev;
      IF NOT EXISTS (
        SELECT 1 FROM public.caixa_movimentos m JOIN public.caixa_sessoes s ON s.id = m.sessao_id
         WHERE m.devolucao_id = v_dev AND m.valor = -10 AND s.status = 'aberto'
      ) THEN
        RAISE EXCEPTION 'prova: devolução com o caixa fechado não entrou em caixa nenhum';
      END IF;
    END IF;

    -- (i) venda cancelada: o dinheiro já conferido volta como estorno
    SELECT m.venda_id, SUM(m.valor) INTO v_venda, v_conferido
      FROM public.caixa_movimentos m
      JOIN public.caixa_sessoes s ON s.id = m.sessao_id
      JOIN public.vendas v ON v.id = m.venda_id
     WHERE s.status = 'fechado' AND m.tipo = 'venda' AND v.status = 'pago'
       AND v.tenant_id = v_tenant
       AND NOT EXISTS (SELECT 1 FROM public.devolucoes d
                        WHERE d.venda_original_id = v.id OR d.venda_nova_id = v.id)
     GROUP BY m.venda_id
     LIMIT 1;
    IF v_venda IS NOT NULL THEN
      UPDATE public.vendas SET status = 'cancelado' WHERE id = v_venda;
      IF NOT EXISTS (
        SELECT 1 FROM public.caixa_movimentos m JOIN public.caixa_sessoes s ON s.id = m.sessao_id
         WHERE m.venda_id = v_venda AND m.tipo = 'ajuste' AND m.valor = -v_conferido
           AND s.status = 'aberto'
      ) THEN
        RAISE EXCEPTION 'prova: a venda cancelada deixou o dinheiro no caixa';
      END IF;
    END IF;

    -- Tudo certo: desfaz o rascunho inteiro.
    RAISE EXCEPTION 'prova concluída' USING ERRCODE = 'P0999';
  EXCEPTION
    WHEN SQLSTATE 'P0999' THEN
      NULL;
  END;

  PERFORM set_config('request.jwt.claims', '', true);
END
$prova$;

NOTIFY pgrst, 'reload schema';
