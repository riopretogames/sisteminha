-- =============================================================================
-- Sisteminha (RPG System.IO) — não dá pra devolver mais do que foi vendido
-- =============================================================================
--
-- ACHADO ANTIGO, aberto desde a revisão de 08/08 e reconferido em 18/08: a
-- única barreira contra devolver mais unidades do que a venda teve estava na
-- TELA. `TrocaDevolucao.tsx` calcula "vendido menos já devolvido" e usa isso
-- pra limitar o campo de quantidade — o que resolve o engano de digitação,
-- mas não resolve nada além disso.
--
-- O que passava por baixo:
--   - duas devoluções da MESMA venda abertas ao mesmo tempo, em terminais
--     diferentes: as duas leem "restam 2", as duas devolvem 2, e saem 4 de
--     uma venda de 2;
--   - qualquer chamada direta à API, que não passa pela tela;
--   - a automação do n8n, quando existir.
--
-- Por que isso é caro, e não só feio: devolução mexe em DINHEIRO e em
-- ESTOQUE ao mesmo tempo. Devolver a mais paga ao cliente um valor que ele
-- nunca gastou, e ainda faz entrar no estoque unidade que nunca saiu — o
-- produto passa a existir em quantidade maior do que a loja comprou, e a
-- diferença só aparece no inventário, meses depois, sem rastro de origem.
--
-- CORREÇÃO: gatilho em `devolucao_itens` que, antes de gravar, confere contra
-- a venda ORIGINAL — quanto daquele produto foi vendido, e quanto já voltou em
-- outras devoluções da mesma venda.
--
-- A serialização é a parte que faz isto valer contra o caso concorrente:
-- `SELECT ... FOR UPDATE` na venda original faz a segunda transação ESPERAR a
-- primeira terminar, e só então recontar. Sem esse bloqueio, as duas leriam o
-- mesmo saldo antigo e as duas passariam — que é exatamente o furo de hoje.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validar_quantidade_devolvida()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda_original UUID;
  v_vendido        INTEGER;
  v_ja_devolvido   INTEGER;
  v_produto        TEXT;
BEGIN
  SELECT venda_original_id INTO v_venda_original
    FROM public.devolucoes
   WHERE id = NEW.devolucao_id;

  IF v_venda_original IS NULL THEN
    RAISE EXCEPTION 'Devolução sem venda de origem — não dá pra conferir a quantidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serializa devoluções concorrentes da MESMA venda. A segunda transação
  -- para aqui até a primeira confirmar, e aí recontará com o valor novo.
  PERFORM 1 FROM public.vendas WHERE id = v_venda_original FOR UPDATE;

  SELECT COALESCE(SUM(quantidade), 0) INTO v_vendido
    FROM public.itens_venda
   WHERE venda_id = v_venda_original
     AND produto_id = NEW.produto_id;

  IF v_vendido = 0 THEN
    SELECT nome INTO v_produto FROM public.produtos WHERE id = NEW.produto_id;
    RAISE EXCEPTION
      'O produto % não faz parte desta venda — não há o que devolver.',
      COALESCE(v_produto, 'informado')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Tudo que já voltou desse produto, em qualquer devolução desta venda.
  -- Exclui a própria linha (em UPDATE) pra não contar duas vezes.
  SELECT COALESCE(SUM(di.quantidade), 0) INTO v_ja_devolvido
    FROM public.devolucao_itens di
    JOIN public.devolucoes d ON d.id = di.devolucao_id
   WHERE d.venda_original_id = v_venda_original
     AND di.produto_id = NEW.produto_id
     AND di.id IS DISTINCT FROM NEW.id;

  IF v_ja_devolvido + NEW.quantidade > v_vendido THEN
    SELECT nome INTO v_produto FROM public.produtos WHERE id = NEW.produto_id;
    RAISE EXCEPTION
      'Não dá pra devolver % unidade(s) de %: a venda teve %, e % já foi devolvida. Resta %.',
      NEW.quantidade,
      COALESCE(v_produto, 'produto'),
      v_vendido,
      v_ja_devolvido,
      GREATEST(0, v_vendido - v_ja_devolvido)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validar_quantidade_devolvida() IS
  'Impede devolver mais unidades do que a venda original teve, somando o que já voltou em outras devoluções da mesma venda. Trava a venda com FOR UPDATE para que duas devoluções simultâneas não leiam o mesmo saldo e passem as duas.';

DROP TRIGGER IF EXISTS trg_quantidade_devolvida ON public.devolucao_itens;
CREATE TRIGGER trg_quantidade_devolvida
  BEFORE INSERT OR UPDATE ON public.devolucao_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_quantidade_devolvida();

NOTIFY pgrst, 'reload schema';
