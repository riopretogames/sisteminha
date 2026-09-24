-- =============================================================================
-- Troco que passa do dinheiro recebido sai do caixa
-- =============================================================================
--
-- ⚠️ DECISÃO DE REGRA — aplicar só com o OK do Felipe (achado 28 da revisão de
-- 24/09/2026, área Vendas). Separado da migration 20260924163000 de propósito,
-- para poder ficar de fora sem levar as outras correções junto.
--
-- POR QUE ESTE ARQUIVO MORA EM supabase/pendentes/ (fechamento de 24/09): o
-- `npx supabase db push` aplica TUDO o que está em supabase/migrations/. Se
-- ele ficasse lá, a próxima publicação aplicaria esta regra sem o OK do Felipe.
-- Quando o Felipe aprovar: copiar para supabase/migrations/ com um carimbo de
-- data NOVO (mais recente que a última migration aplicada — o db push recusa
-- migration com data anterior à última), e conferir se a view
-- `vw_caixa_resumo_formas` (migration 20260924165000, seção 5) precisa da
-- mesma conta do troco negativo.
--
-- O QUE ACONTECE HOJE. No PDV, o aparelho recebido na troca conta como
-- pagamento. Se ele vale mais que a compra — um PS5 de R$ 2.000 para levar um
-- controle de R$ 430 —, a tela manda devolver R$ 1.570 ao cliente, e o
-- vendedor paga essa diferença com dinheiro da gaveta. O gatilho do caixa só
-- sabia lançar ENTRADA: calculava "dinheiro recebido − troco", e quando isso
-- dava negativo (troco maior que o dinheiro que entrou) não lançava nada. O
-- fechamento do dia acusava R$ 1.570 faltando na gaveta, sem rastro de onde.
-- O mesmo com troco dado sobre cartão ou PIX lançado a mais.
--
-- O QUE ESTA MIGRATION FAZ. Deixa o lançamento da venda ficar NEGATIVO quando
-- o troco passa do dinheiro que entrou: a diferença aparece no caixa como
-- saída, descrita como "Troco além do dinheiro recebido". O resto da conta não
-- muda — troco coberto pelo dinheiro recebido continua saindo do próprio
-- dinheiro, como sempre.
--
-- A PREMISSA (por isso é decisão do Felipe): a diferença é paga EM DINHEIRO,
-- da gaveta. Se a loja preferir pagar essa diferença por PIX, o caminho é
-- outro: o PDV perguntar "como a loja paga a diferença?" (igual a Troca e
-- Devolução já pergunta) e gravar isso — e esta migration não deve ser
-- aplicada.
--
-- A tela já avisa desde 24/09: quando o troco passa do dinheiro recebido, o
-- PDV mostra "R$ X deste troco não entrou em dinheiro … e vai sair da gaveta".
--
-- ✅ PAR COM O FINANCEIRO (resolvido no fechamento de 24/09): o estorno do
-- caixa da venda cancelada (`estornar_caixa_da_venda_cancelada`, migration
-- 20260924165000) já usa `IF v_conferido <> 0`, então também devolve ao caixa
-- a saída de uma venda com lançamento negativo.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_pagamentos_venda_no_caixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda_id          UUID;
  v_venda_tenant      UUID;
  v_venda_status      TEXT;
  v_venda_total       DECIMAL(10,2);
  v_venda_numero      TEXT;
  v_sessao_id         UUID;
  v_total_pago        DECIMAL(10,2);
  v_troco             DECIMAL(10,2);
  v_cash_sum          DECIMAL(10,2);
  v_cash_liquido      DECIMAL(10,2);
  v_mov_id            UUID;
  v_mov_sessao        UUID;
  v_mov_valor         DECIMAL(10,2);
  v_mov_sessao_status TEXT;
BEGIN
  FOR v_venda_id IN SELECT DISTINCT venda_id FROM inserted LOOP
    SELECT tenant_id, status, total, numero_venda
      INTO v_venda_tenant, v_venda_status, v_venda_total, v_venda_numero
    FROM public.vendas WHERE id = v_venda_id;

    IF v_venda_status IS DISTINCT FROM 'pago' THEN
      CONTINUE;
    END IF;

    -- Recalcula com TUDO que já está gravado agora pra esta venda — pega
    -- automaticamente qualquer pagamento de uma leva anterior (troca em
    -- várias chamadas RPC + lote manual, em qualquer ordem).
    SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
    FROM public.pagamentos_venda WHERE venda_id = v_venda_id;

    v_troco := GREATEST(0, v_total_pago - v_venda_total);

    SELECT COALESCE(SUM(pv.valor), 0) INTO v_cash_sum
    FROM public.pagamentos_venda pv
    JOIN public.formas_pagamento fp ON fp.id = pv.forma_pagamento_id
    WHERE pv.venda_id = v_venda_id AND fp.entra_no_caixa = true;

    -- A MUDANÇA DESTA MIGRATION: sem o GREATEST(0, ...). Negativo quer dizer
    -- que o troco passou do dinheiro recebido, e a diferença SAIU da gaveta.
    v_cash_liquido := v_cash_sum - v_troco;

    SELECT id, sessao_id, valor INTO v_mov_id, v_mov_sessao, v_mov_valor
    FROM public.caixa_movimentos
    WHERE venda_id = v_venda_id AND tipo = 'venda'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_mov_id IS NOT NULL THEN
      SELECT status INTO v_mov_sessao_status FROM public.caixa_sessoes WHERE id = v_mov_sessao;

      IF v_mov_sessao_status = 'aberto' THEN
        -- Sessão ainda aberta: corrige o valor no próprio lançamento — não
        -- é retroativo, a conferência daquele dia ainda não fechou.
        IF v_cash_liquido <> 0 THEN
          UPDATE public.caixa_movimentos
             SET valor = v_cash_liquido,
                 descricao = CASE WHEN v_cash_liquido < 0
                                  THEN 'Troco além do dinheiro recebido — venda ' || COALESCE(v_venda_numero, '')
                                  ELSE 'Venda ' || COALESCE(v_venda_numero, '') END
           WHERE id = v_mov_id;
        ELSE
          DELETE FROM public.caixa_movimentos WHERE id = v_mov_id;
        END IF;
        CONTINUE;
      END IF;

      -- Sessão já fechada: o lançamento registrado ali é imutável (mesma
      -- regra da migration 20260817160000). Entra só a DIFERENÇA, para mais
      -- ou para menos, no caixa aberto de agora.
      IF v_cash_liquido = v_mov_valor THEN
        CONTINUE;
      END IF;
      v_cash_liquido := v_cash_liquido - v_mov_valor;
    END IF;

    IF v_cash_liquido = 0 THEN
      CONTINUE;
    END IF;

    v_sessao_id := public.garantir_caixa_aberto(v_venda_tenant, auth.uid());

    IF v_sessao_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, venda_id, usuario_id)
    VALUES (
      v_sessao_id,
      'venda',
      CASE WHEN v_cash_liquido < 0
           THEN 'Troco além do dinheiro recebido — venda ' || COALESCE(v_venda_numero, '')
           ELSE 'Venda ' || COALESCE(v_venda_numero, '') END,
      v_cash_liquido,
      v_venda_id,
      auth.uid()
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pagamentos_venda_no_caixa() FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERE
-- ─────────────────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE v_txt TEXT;
BEGIN
  SELECT pg_get_functiondef('public.registrar_pagamentos_venda_no_caixa()'::regprocedure) INTO v_txt;
  IF v_txt LIKE '%GREATEST(0, v_cash_sum%' THEN
    RAISE EXCEPTION 'o lançamento da venda continua travado em zero';
  END IF;

  IF has_function_privilege('authenticated', 'public.registrar_pagamentos_venda_no_caixa()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.registrar_pagamentos_venda_no_caixa()', 'EXECUTE') THEN
    RAISE EXCEPTION 'registrar_pagamentos_venda_no_caixa ficou chamável por fora do gatilho';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lancar_pagamentos_venda_no_caixa'
                    AND tgrelid = 'public.pagamentos_venda'::regclass) THEN
    RAISE EXCEPTION 'o gatilho do caixa da venda sumiu';
  END IF;
END
$verifica$;
