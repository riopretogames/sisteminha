-- =============================================================================
-- PEÇA LANÇADA NUMA OS PARADA NÃO SAI DO ESTOQUE
-- =============================================================================
--
-- Achado na revisão de 01/09: dava para a mesma peça sair DUAS VEZES do
-- estoque, e o único sinal seria a prateleira digital mostrando uma unidade a
-- menos do que a de verdade — que é o tipo de erro que só aparece no
-- inventário, meses depois.
--
-- -----------------------------------------------------------------------------
-- COMO ACONTECIA, PASSO A PASSO
-- -----------------------------------------------------------------------------
--   1. O cliente recusa o orçamento. As peças que o técnico havia lançado
--      voltam ao estoque (gatilho `acertar_estoque_da_os`), e a OS fica
--      marcada com a hora em `pecas_estornadas_em`.
--   2. A OS continua na bancada — é lá que o técnico remonta o aparelho. E na
--      bancada ela continua aceitando lançamento: alguém lança uma peça nova.
--      Ela sai do estoque na hora, pelo gatilho de sempre.
--   3. Dois dias depois o cliente volta atrás. A OS é devolvida para
--      "Aguardando aprovação", e o sistema, corretamente, separa de novo TODAS
--      as peças da OS — inclusive a do passo 2, que nunca tinha voltado.
--
-- Resultado: a peça do passo 2 saiu do estoque duas vezes.
--
-- -----------------------------------------------------------------------------
-- A REGRA QUE FALTAVA, DITA NUMA FRASE
-- -----------------------------------------------------------------------------
-- **Enquanto a OS está parada, nenhuma peça está separada para ela.**
--
-- É o que `pecas_estornadas_em` já queria dizer: preenchido = as peças desta
-- OS estão na prateleira, não na bancada. O lançamento novo furava essa regra
-- porque o gatilho da baixa (de 05/08) nasceu antes de existir OS parada — ele
-- só sabia perguntar "tem produto de estoque?", nunca "esta OS está de pé?".
--
-- Com a correção, o vaivém das peças fica com um dono só: enquanto a OS está
-- parada, o lançamento apenas registra o que vai ser preciso; quem desconta é
-- o gatilho de retomada, todas de uma vez, no momento em que a OS volta a
-- andar. Se ela nunca voltar, nada foi descontado — que é o certo, porque o
-- serviço não aconteceu.
--
-- A auditoria não perde nada: o movimento aparece em Movimentações na hora em
-- que a OS volta a andar, com o motivo "Peça separada de novo: OS voltou a
-- andar", em vez de aparecer duas vezes com a mesma peça.

CREATE OR REPLACE FUNCTION public.baixar_estoque_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto    RECORD;
  v_numero_os  TEXT;
  v_os_parada  BOOLEAN;
BEGIN
  IF NEW.produto_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A pergunta nova (01/09). Ver o cabeçalho: OS parada não segura peça.
  SELECT numero_os, pecas_estornadas_em IS NOT NULL
    INTO v_numero_os, v_os_parada
    FROM public.service_orders
   WHERE id = NEW.os_id;

  IF v_os_parada THEN
    RETURN NEW;
  END IF;

  SELECT estoque_atual, custo, tenant_id
  INTO v_produto
  FROM public.produtos
  WHERE id = NEW.produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado ao dar baixa por OS.', NEW.produto_id;
  END IF;

  IF v_produto.estoque_atual < NEW.quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: produto tem % unidade(s), OS pede %.',
      v_produto.estoque_atual, NEW.quantidade
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.produtos
  SET estoque_atual = estoque_atual - NEW.quantidade
  WHERE id = NEW.produto_id;

  INSERT INTO public.movimentos_estoque (
    tenant_id, produto_id, tipo, quantidade,
    custo_unitario, valor_total,
    motivo, origem, usuario_id,
    saldo_anterior, saldo_depois
  ) VALUES (
    v_produto.tenant_id,
    NEW.produto_id,
    'saida',
    NEW.quantidade,
    v_produto.custo,
    v_produto.custo * NEW.quantidade,
    'Peça usada em OS',
    'os:' || COALESCE(v_numero_os, NEW.os_id::text),
    auth.uid(),
    v_produto.estoque_atual,
    v_produto.estoque_atual - NEW.quantidade
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.baixar_estoque_os() IS
  'Desconta estoque e grava auditoria quando uma peça do estoque é usada num item de OS. Não age quando a OS está parada (service_orders.pecas_estornadas_em preenchido: orçamento recusado ou OS cancelada) -- ali nenhuma peça está separada para ela, e quem desconta tudo de uma vez é o gatilho acertar_estoque_da_os quando a OS volta a andar. Sem essa pergunta, a peça lançada durante a parada saía do estoque duas vezes.';

-- -----------------------------------------------------------------------------
-- CONFERE QUE A MUDANÇA CHEGOU MESMO
-- -----------------------------------------------------------------------------
-- Aplicar migration às cegas já custou caro aqui (o caso da "tercerizada"
-- escrita errada, em 31/08): o comando dizia "sucesso" e o banco continuava
-- igual. Este bloco derruba a transação se a função no banco não tiver a
-- pergunta nova.
DO $verifica$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'baixar_estoque_os'
       AND pg_get_functiondef(p.oid) LIKE '%pecas_estornadas_em IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION
      'baixar_estoque_os continua sem a pergunta "a OS está parada?" -- a peça lançada numa OS recusada ainda pode sair do estoque duas vezes.';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
