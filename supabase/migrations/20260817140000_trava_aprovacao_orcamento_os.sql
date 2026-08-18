-- =============================================================================
-- Sisteminha (RP System.IO) — trava de verdade na aprovação de orçamento de OS
-- =============================================================================
--
-- Achado original da revisão técnica (06-09/08), confirmado ainda válido em
-- 17/08: `orders.approve` existe cadastrada desde 01/08, atribuída a
-- administrador/gerente/gerente_tecnico/vendedor, mas nenhuma tela nem
-- policy a conferia — `OSOrcamentos.tsx` gateava os botões "Aprovar"/
-- "Recusar" com `orders.edit`, que o técnico também tem. Contraria a regra
-- de negócio que o próprio Felipe ditou na migration 20260809160000: quem
-- decide orçamento é quem fala com o cliente (vendedor/gerente), o técnico
-- não tem esse contato.
--
-- Corrigido nas duas pontas, junto com este commit:
-- - Tela: `OSOrcamentos.tsx` passa a gatear com `orders.approve`.
-- - Banco (esta migration): sem isso, o técnico continuaria conseguindo
--   aprovar/recusar chamando a API direto, mesmo com o botão escondido.
--
-- Só a transição de SAÍDA de "aguardando_aprovacao" pra "aprovado" ou
-- "cancelado" exige `orders.approve` — é a decisão de orçamento em si, não
-- qualquer edição de OS. `orders.edit` continua bastando para diagnóstico,
-- lançar peça/serviço, mudar outras etapas, etc. As chaves usadas aqui
-- ('aguardando_aprovacao', 'aprovado', 'cancelado') são as etapas de
-- sistema protegidas por `proteger_status_de_sistema` (migration
-- 20260809130000) — não podem ser renomeadas nem excluídas, seguro
-- hardcodear.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validar_aprovacao_orcamento_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'aguardando_aprovacao'
     AND NEW.status IN ('aprovado', 'cancelado')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT public.has_permission(auth.uid(), 'orders.approve')
  THEN
    RAISE EXCEPTION 'Sem permissão para aprovar ou recusar orçamento de OS.'
      USING ERRCODE = '42501'; -- insufficient_privilege, mesmo código que RLS usa
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validar_aprovacao_orcamento_os() IS
  'Exige orders.approve especificamente pra sair de aguardando_aprovacao pra aprovado/cancelado — decisão de orçamento, não edição comum de OS (essa continua bastando orders.edit). Fecha no banco o que OSOrcamentos.tsx já fecha na tela.';

CREATE TRIGGER validar_aprovacao_orcamento
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_aprovacao_orcamento_os();

NOTIFY pgrst, 'reload schema';
