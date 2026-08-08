-- =============================================================================
-- Sisteminha (RP System.IO) — Cliente bloqueado não fecha venda
-- =============================================================================
--
-- A coluna `clientes.liberado_venda` existe desde 01/08 e nunca foi lida por
-- ninguém: nem tela, nem banco. Era exatamente o tipo de configuração que dá
-- a impressão de controlar alguma coisa e não controla nada — o mesmo problema
-- que a flag `entra_no_caixa` tem no Financeiro.
--
-- Decisão do Felipe em 08/08: o cadastro ganha o liga/desliga "pode comprar na
-- loja" (e NÃO ganha limite de crédito — a loja não trabalha com fiado). Serve
-- para golpe, cheque sem fundo e cliente que a loja não quer mais atender.
--
-- Se a checagem ficasse só no PDV, bastaria a tela de Troca/Devolução, uma
-- importação ou uma chamada direta na API para furar. Então a recusa é do
-- banco, e a tela só antecipa o aviso para o vendedor não descobrir na hora de
-- fechar.
--
-- CONSEQUÊNCIA ASSUMIDA: a venda nova gerada por uma troca também é recusada
-- para cliente bloqueado. É proposital — bloqueado é bloqueado. Se a loja
-- decidir atender assim mesmo, é só desbloquear na ficha do cliente, resolver,
-- e bloquear de novo. Melhor exigir esse gesto consciente do que abrir uma
-- porta lateral silenciosa.
--
-- Venda sem cliente (`cliente_id` nulo) continua livre: é a maioria do balcão.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.impedir_venda_cliente_bloqueado()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY DEFINER porque a checagem tem que valer inclusive quando quem vende
-- não teria permissão de ler a ficha do cliente. O acesso é de leitura, numa
-- coluna só, e o filtro de tenant continua explícito abaixo.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bloqueado BOOLEAN;
  nome_cliente TEXT;
BEGIN
  IF NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NOT COALESCE(c.liberado_venda, true), c.nome
    INTO bloqueado, nome_cliente
  FROM public.clientes c
  WHERE c.id = NEW.cliente_id
    AND c.tenant_id = NEW.tenant_id;

  IF COALESCE(bloqueado, false) THEN
    RAISE EXCEPTION
      'O cliente % está bloqueado para venda. Libere na ficha dele (Cadastros > Clientes) antes de vender.',
      nome_cliente
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venda_cliente_bloqueado ON public.vendas;

CREATE TRIGGER trg_venda_cliente_bloqueado
  BEFORE INSERT OR UPDATE OF cliente_id ON public.vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_venda_cliente_bloqueado();

COMMENT ON COLUMN public.clientes.liberado_venda IS
  'Desligado = o banco recusa fechar venda no nome deste cliente '
  '(gatilho trg_venda_cliente_bloqueado). Não tem relação com crediário — a '
  'loja não trabalha com fiado.';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- 1) O gatilho existe?
--    SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'public.vendas'::regclass
--       AND tgname = 'trg_venda_cliente_bloqueado';
--
-- 2) Teste de verdade (desfaça no fim com ROLLBACK):
--    BEGIN;
--      UPDATE public.clientes SET liberado_venda = false
--       WHERE id = '<id de um cliente de teste>';
--      -- A linha abaixo TEM que falhar:
--      INSERT INTO public.vendas (tenant_id, cliente_id, total)
--      VALUES ('<tenant>', '<id do mesmo cliente>', 10);
--    ROLLBACK;
-- =============================================================================
