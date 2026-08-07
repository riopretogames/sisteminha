-- =============================================================================
-- Sisteminha (RP System.IO) — Desconto de venda exige a permissão no banco
-- =============================================================================
--
-- Decisão irmã da Opção B, mesma régua (PLANO-DE-REFINAMENTO.md, Vendas/PDV):
-- permissão que existe no catálogo tem que valer no banco também.
--
-- Hoje `sales.discount` só é checada no PDV: o campo de desconto aparece ou
-- não conforme a permissão. Quem gravasse uma venda direto pela API podia
-- mandar `descontos` com qualquer valor — a RLS de `vendas` só checa
-- `sales.create`, que todo vendedor tem, e RLS não sabe olhar VALOR de
-- coluna, só a linha inteira.
--
-- Por que gatilho e não policy: policy responde "pode ou não pode gravar esta
-- linha". A pergunta aqui é diferente — "pode gravar esta linha COM desconto
-- diferente de zero" — e depende de comparar o valor novo com o antigo. Isso
-- é trabalho de gatilho.
--
-- Só reage quando o desconto MUDA. Cancelar uma venda, trocar o status ou
-- corrigir a observação de uma venda que já tinha desconto não passa por
-- checagem nenhuma — senão quem não pode dar desconto ficaria impedido de
-- mexer em qualquer venda descontada, o que não é a intenção.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validar_permissao_desconto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo    NUMERIC := COALESCE(NEW.descontos, 0);
  v_antigo  NUMERIC;
BEGIN
  -- No INSERT não existe linha anterior, e OLD fica sem valor atribuído —
  -- ler OLD.descontos aqui seria erro de execução, não nulo.
  IF TG_OP = 'INSERT' THEN
    v_antigo := 0;
  ELSE
    v_antigo := COALESCE(OLD.descontos, 0);
  END IF;

  -- Nada mudou no desconto: não é assunto deste gatilho.
  IF v_novo = v_antigo THEN
    RETURN NEW;
  END IF;

  -- Zerar/remover desconto é sempre permitido — nunca é o caminho do abuso, e
  -- travar isso impediria corrigir um desconto lançado errado.
  IF v_novo = 0 THEN
    RETURN NEW;
  END IF;

  -- Sem usuário logado = chamada de dentro do próprio banco (service role,
  -- rotina de manutenção, gatilho de outra tabela). Não é o cenário que este
  -- gatilho existe pra cobrir, e travar aqui quebraria automação futura.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_permission(auth.uid(), 'sales.discount') THEN
    RAISE EXCEPTION
      'Você não tem permissão para aplicar desconto em venda.'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Peça a um administrador a permissão "Dar desconto na venda" (sales.discount).';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validar_permissao_desconto() IS
  'Impede gravar desconto em venda sem sales.discount, inclusive por chamada direta à API. Só dispara quando o valor do desconto muda para diferente de zero.';

CREATE TRIGGER validar_desconto_venda
  BEFORE INSERT OR UPDATE OF descontos ON public.vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_permissao_desconto();
