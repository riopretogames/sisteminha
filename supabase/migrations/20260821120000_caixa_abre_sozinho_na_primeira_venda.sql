-- =============================================================================
-- Sisteminha (RPG System.IO) — o Caixa abre sozinho na primeira venda do dia
-- =============================================================================
--
-- ACHADO NOS TESTES DE 21/08, com massa real: sem sessão de caixa aberta, os
-- gatilhos que lançam venda e OS no Caixa saíam em silêncio. Comprovado: 10
-- vendas somando R$ 22.265,40 e o Caixa registrou ZERO movimentos.
--
-- Na loja isso significa: quem abre a loja e esquece de abrir o caixa vende o
-- dia todo normalmente, e no fechamento a conferência compara uma gaveta cheia
-- contra um sistema que diz que não entrou nada. O dinheiro existe, a venda
-- está registrada — só a ponte entre os dois não foi feita, e refazer depois é
-- trabalho manual.
--
-- DECISÃO DO FELIPE (21/08), entre avisar no PDV ou abrir sozinho: **abrir
-- sozinho**. Resolve sem depender de ninguém lembrar, que era o ponto — o erro
-- acontece justamente no dia corrido em que ninguém vai ler aviso nenhum.
--
-- O QUE MUDA NO SIGNIFICADO DE "ABRIR O CAIXA": abrir passa a ter dois modos.
-- O normal continua igual — alguém abre pela tela, conta a gaveta e informa o
-- valor inicial. O automático nasce com **valor de abertura zero**, porque
-- ninguém contou nada, e fica MARCADO como automático em `observacoes`. Isso
-- importa no fechamento: numa sessão automática, o "valor calculado" não
-- inclui troco inicial nenhum, e quem confere precisa saber disso pra não
-- perseguir uma diferença que é só o fundo de caixa que já estava lá.
--
-- CONCORRÊNCIA: duas vendas ao mesmo tempo poderiam tentar abrir duas sessões.
-- O índice `idx_caixa_um_aberto_por_tenant` (parcial, só sobre status
-- 'aberto') já impede isso no banco — a segunda tentativa recebe
-- unique_violation, e a função trata capturando o erro e relendo a sessão que
-- a outra transação acabou de criar.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.garantir_caixa_aberto(_tenant UUID, _usuario UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao  UUID;
  v_abridor UUID;
BEGIN
  SELECT id INTO v_sessao
    FROM public.caixa_sessoes
   WHERE tenant_id = _tenant AND status = 'aberto'
   LIMIT 1;

  IF v_sessao IS NOT NULL THEN
    RETURN v_sessao;
  END IF;

  -- `aberto_por` é NOT NULL e aponta pra auth.users. Ordem de preferência:
  -- quem está operando agora; senão o usuário que a venda/OS registrou;
  -- senão qualquer pessoa da loja, só pra a coluna não ficar sem dono.
  -- (profiles.id É auth.users.id — mesma chave.)
  v_abridor := COALESCE(auth.uid(), _usuario);

  IF v_abridor IS NULL THEN
    SELECT id INTO v_abridor
      FROM public.profiles
     WHERE tenant_id = _tenant
     ORDER BY created_at
     LIMIT 1;
  END IF;

  IF v_abridor IS NULL THEN
    -- Loja sem nenhum usuário: não há em nome de quem abrir. Volta NULL e o
    -- chamador segue sem lançar, como fazia antes.
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.caixa_sessoes (
      tenant_id, status, aberto_por, valor_abertura, observacoes
    ) VALUES (
      _tenant, 'aberto', v_abridor, 0,
      'Aberto automaticamente na primeira movimentação do dia. '
      || 'O valor de abertura ficou em R$ 0,00 porque ninguém contou a gaveta '
      || 'no início — se havia troco guardado, ele não está nesta conta.'
    )
    RETURNING id INTO v_sessao;
  EXCEPTION WHEN unique_violation THEN
    -- Outra transação abriu no mesmo instante. O índice parcial garante que
    -- só uma vence; esta relê a vencedora em vez de falhar a venda.
    SELECT id INTO v_sessao
      FROM public.caixa_sessoes
     WHERE tenant_id = _tenant AND status = 'aberto'
     LIMIT 1;
  END;

  RETURN v_sessao;
END;
$$;

COMMENT ON FUNCTION public.garantir_caixa_aberto(UUID, UUID) IS
  'Devolve a sessão de caixa aberta da loja, criando uma se não houver. A sessão automática nasce com valor de abertura zero e marcada em observacoes — ninguém contou a gaveta. Existe porque venda sem caixa aberto sumia da conferência em silêncio (achado em 21/08).';

REVOKE ALL ON FUNCTION public.garantir_caixa_aberto(UUID, UUID) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Os dois gatilhos passam a GARANTIR a sessão em vez de desistir
--
-- As funções abaixo são as de 20/08 (que corrigiram duplicidade de
-- lançamento, troco, forma que não entra no caixa e sessão já fechada),
-- IDÊNTICAS, com uma única troca: o trecho que procurava sessão aberta e
-- desistia agora chama `garantir_caixa_aberto`. Toda a lógica de recálculo e
-- de imutabilidade de sessão fechada segue exatamente como estava — o único
-- comportamento novo é não desistir por falta de caixa aberto.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_pagamentos_venda_no_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda_id       UUID;
  v_venda_tenant   UUID;
  v_venda_status   TEXT;
  v_venda_total    DECIMAL(10,2);
  v_venda_numero   TEXT;
  v_sessao_id      UUID;
  v_total_pago     DECIMAL(10,2);
  v_troco          DECIMAL(10,2);
  v_cash_sum       DECIMAL(10,2);
  v_cash_liquido   DECIMAL(10,2);
  v_mov_id         UUID;
  v_mov_sessao     UUID;
  v_mov_valor      DECIMAL(10,2);
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

    v_cash_liquido := GREATEST(0, v_cash_sum - v_troco);

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
        IF v_cash_liquido > 0 THEN
          UPDATE public.caixa_movimentos SET valor = v_cash_liquido WHERE id = v_mov_id;
        ELSE
          DELETE FROM public.caixa_movimentos WHERE id = v_mov_id;
        END IF;
        CONTINUE;
      END IF;

      -- Sessão já fechada: o lançamento registrado ali é imutável (mesma
      -- regra da migration 20260817160000). Só entra lançamento novo se
      -- apareceu dinheiro GENUINAMENTE NOVO desde então.
      IF v_cash_liquido <= v_mov_valor THEN
        CONTINUE;
      END IF;
      v_cash_liquido := v_cash_liquido - v_mov_valor;
    END IF;

    IF v_cash_liquido <= 0 THEN
      CONTINUE;
    END IF;

    -- Antes: se nao havia sessao aberta, desistia calado -- era exatamente
    -- aqui que o dinheiro do dia sumia da conferencia (achado em 21/08).
    -- Agora garante a sessao; so desiste se a loja nao tiver nenhum usuario
    -- em nome de quem abrir.
    v_sessao_id := public.garantir_caixa_aberto(v_venda_tenant, auth.uid());

    IF v_sessao_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, venda_id, usuario_id)
    VALUES (v_sessao_id, 'venda', 'Venda ' || COALESCE(v_venda_numero, ''), v_cash_liquido, v_venda_id, auth.uid());
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_os_no_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao_id      UUID;
  v_total_pago     DECIMAL(10,2);
  v_troco          DECIMAL(10,2);
  v_cash_sum       DECIMAL(10,2);
  v_cash_liquido   DECIMAL(10,2);
  v_titulo_id      UUID;
  v_mov_id         UUID;
  v_mov_sessao     UUID;
  v_mov_valor      DECIMAL(10,2);
  v_mov_sessao_status TEXT;
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

  SELECT id, sessao_id, valor INTO v_mov_id, v_mov_sessao, v_mov_valor
  FROM public.caixa_movimentos
  WHERE titulo_id = v_titulo_id AND tipo = 'recebimento'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_mov_id IS NOT NULL THEN
    SELECT status INTO v_mov_sessao_status FROM public.caixa_sessoes WHERE id = v_mov_sessao;

    IF v_mov_sessao_status = 'aberto' THEN
      IF v_cash_liquido > 0 THEN
        UPDATE public.caixa_movimentos SET valor = v_cash_liquido WHERE id = v_mov_id;
      ELSE
        DELETE FROM public.caixa_movimentos WHERE id = v_mov_id;
      END IF;
      RETURN NEW;
    END IF;

    -- Sessão já fechada: imutável. Reabrir e reentregar a OS sem
    -- pagamento novo (o caso que motivou esta correção) cai exatamente
    -- aqui — v_cash_liquido bate com v_mov_valor, então não faz nada.
    IF v_cash_liquido <= v_mov_valor THEN
      RETURN NEW;
    END IF;
    v_cash_liquido := v_cash_liquido - v_mov_valor;
  END IF;

  IF v_cash_liquido <= 0 THEN
    RETURN NEW;
  END IF;

  -- Mesma correcao do gatilho de venda: garante a sessao em vez de desistir.
  v_sessao_id := public.garantir_caixa_aberto(NEW.tenant_id, auth.uid());

  IF v_sessao_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, titulo_id, usuario_id)
  VALUES (v_sessao_id, 'recebimento', 'OS ' || NEW.numero_os, v_cash_liquido, v_titulo_id, auth.uid());

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
