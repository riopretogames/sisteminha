-- =============================================================================
-- RPG System.IO — Passo 4: Ordem de Serviço gera conta a receber ao entregar
-- =============================================================================
--
-- Hoje fechar uma OS não gera nada em Financeiro — confirmado lendo o código
-- inteiro, nenhuma tela cria linha em titulos_financeiros a partir de uma OS.
--
-- Regra combinada com o Felipe (05/08):
--   • Só OS do tipo 'paga' gera cobrança — 'garantia' e 'cortesia' são de
--     graça por definição, não fazem sentido virar conta a receber.
--   • Gera no momento em que a OS vira 'entregue' (a loja opera com o
--     cliente pagando na retirada — um evento só, não dois).
--   • O título já nasce PAGO (não "em aberto"), porque no fluxo desta loja
--     entrega e pagamento acontecem juntos.
--
-- Por que SECURITY DEFINER: quem move a OS pro status 'entregue' (técnico,
-- atendente) não necessariamente tem `finance.receivable.manage` — e não
-- deveria precisar ter, só pra mudar o status da OS. Mesmo raciocínio do
-- Passo 1 com `produtos`.
--
-- Idempotência: se a OS sair de 'entregue' e voltar (correção de status por
-- engano), NÃO gera um segundo título — verifica se já existe um vinculado
-- a esta OS antes de inserir.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.gerar_titulo_ao_entregar_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'entregue' OR OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  NEW.data_finalizacao := COALESCE(NEW.data_finalizacao, now());

  IF NEW.tipo <> 'paga' OR NEW.total_orcamento <= 0 THEN
    NEW.valor_final_pago := COALESCE(NEW.valor_final_pago, 0);
    RETURN NEW;
  END IF;

  NEW.valor_final_pago := COALESCE(NEW.valor_final_pago, NEW.total_orcamento);

  IF NOT EXISTS (SELECT 1 FROM public.titulos_financeiros WHERE os_id = NEW.id) THEN
    INSERT INTO public.titulos_financeiros (
      tenant_id, natureza, descricao, os_id, cliente_id,
      valor, valor_pago, vencimento, status, pago_em, criado_por
    ) VALUES (
      NEW.tenant_id,
      'receber',
      'OS ' || NEW.numero_os,
      NEW.id,
      NEW.cliente_id,
      NEW.total_orcamento,
      NEW.total_orcamento,
      CURRENT_DATE,
      'pago',
      CURRENT_DATE,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.gerar_titulo_ao_entregar_os() IS
  'Ao mover uma OS pra "entregue": preenche data_finalizacao/valor_final_pago (existiam no schema mas nunca eram gravados) e, só para OS tipo paga com orçamento > 0, cria a conta a receber já paga. Idempotente por os_id.';

CREATE TRIGGER gerar_titulo_ao_entregar
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.gerar_titulo_ao_entregar_os();
