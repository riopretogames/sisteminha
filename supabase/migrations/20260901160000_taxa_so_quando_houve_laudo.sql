-- =============================================================================
-- A TAXA DE ANÁLISE SÓ VALE QUANDO HOUVE ANÁLISE
-- =============================================================================
--
-- Achado na revisão de 31/08, e é o defeito que termina em discussão no
-- balcão: a chavinha "Vai ter laudo eletrônico?" da abertura NÃO ERA LIDA POR
-- NENHUMA REGRA DE DINHEIRO. Ela existia só como lembrete na tela.
--
-- Com isso, o roteiro do balcão e o sistema diziam coisas opostas:
--
--   • Serviço TABELADO (chavinha desligada): o vendedor lê na tela "sem laudo,
--     não há taxa de análise" e promete isso ao cliente. Se o cliente
--     desistir, o sistema cobrava R$ 80 que ninguém combinou.
--
-- Qual das duas versões está certa? A da tela. O organograma do Felipe é
-- explícito: o serviço tabelado tem preço e prazo informados na hora, e a taxa
-- existe para pagar o trabalho de ABRIR e INVESTIGAR o aparelho — que na OS
-- tabelada não acontece.
--
-- Esta migration parte da versão VIGENTE da função (20260901140000) e muda uma
-- coisa só: a condição da taxa. Tudo o mais — motivo obrigatório na recusa, a
-- OS voltando para a bancada, o valor recusado guardado — fica como está.

CREATE OR REPLACE FUNCTION public.registrar_decisao_do_laudo(
  _os_id     UUID,
  _aprovado  BOOLEAN,
  _motivo    TEXT DEFAULT NULL
)
RETURNS VOID
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

  -- DUAS condições, não uma (corrigido em 01/09).
  --
  -- Só OS paga passa pelo caixa na entrega: garantia e cortesia recusadas saem
  -- sem valor, o aparelho volta para o cliente e pronto.
  --
  -- E só OS que teve LAUDO ELETRÔNICO. A taxa paga o trabalho de abrir e
  -- investigar o aparelho, e na OS de serviço tabelado esse trabalho não
  -- acontece — o preço foi informado no balcão, de tabela. Cobrar análise de
  -- quem nunca teve análise é cobrar por serviço não prestado, e era o que o
  -- sistema fazia: a chavinha "Vai ter laudo eletrônico?" da abertura não era
  -- lida por nenhuma regra de dinheiro, então o vendedor prometia "sem taxa"
  -- e o sistema cobrava R$ 80 na retirada.
  --
  -- COALESCE por causa das OS antigas, abertas antes de a chavinha existir:
  -- todas passaram por análise, então o padrão certo para elas é `true`.
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
         -- A bancada, não a prateleira. Ver o cabeçalho desta migration.
         status                 = 'aprovado'
   WHERE id = _os_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_decisao_do_laudo(UUID, BOOLEAN, TEXT) IS
  'Grava a resposta do cliente ao orçamento e move a OS na mesma transação. Aprovou: vai para "aprovado" e o valor não muda. Recusou: guarda o valor recusado, põe a taxa de análise (só em OS paga) e TAMBÉM vai para "aprovado" — o aparelho voltou aberto do diagnóstico e o técnico precisa remontar antes de marcar Reparo concluído. As peças voltam ao estoque pelo gatilho acertar_estoque_da_os. Exige orders.approve.';
