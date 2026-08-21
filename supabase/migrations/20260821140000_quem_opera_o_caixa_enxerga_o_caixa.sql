-- =============================================================================
-- Sisteminha (RPG System.IO) — quem opera o caixa também enxerga o caixa
-- =============================================================================
--
-- ACHADO ANTIGO, reconferido em 18/08 e corrigido agora: as permissões do
-- Caixa se dividem assim hoje —
--
--   ver sessão e movimentos ......... finance.view
--   abrir, lançar e fechar .......... finance.cashier.close
--
-- As duas são independentes no catálogo, e o sistema permite conceder cada
-- uma por exceção individual. Quem receber SÓ a de operar cai numa tela
-- inutilizável: consegue abrir o caixa, lançar sangria e fechar, mas não
-- enxerga uma linha do que ele mesmo lançou — a lista de movimentos volta
-- vazia pela RLS, sem erro, como se o caixa não tivesse nada.
--
-- Conceder "operar sem ver" não é uma combinação que alguém escolheria de
-- propósito; é uma que o catálogo deixa montar por engano. E o modo de falha
-- é silencioso, que é o pior tipo: a pessoa acha que o lançamento não salvou
-- e lança de novo.
--
-- CORREÇÃO: a leitura passa a aceitar QUALQUER uma das duas. Quem pode operar
-- o caixa pode, por definição, olhar para ele. A recíproca continua NÃO
-- valendo: `finance.view` sozinha segue só lendo, sem abrir nem lançar — essa
-- assimetria é proposital e é o ponto do controle.
--
-- Junto vai um acerto de nome. A permissão se chama "Fechar o caixa" no
-- catálogo, mas governa abrir, lançar E fechar — quem lê a lista de permissões
-- para montar um perfil não tem como adivinhar isso, e concede achando que
-- está liberando bem menos do que está. A CHAVE continua
-- `finance.cashier.close` de propósito: renomear a chave quebraria as
-- concessões já feitas e as policies que a citam. Só o texto muda, que é o
-- que a pessoa lê.
-- =============================================================================

UPDATE public.permissions
   SET descricao = 'Operar o caixa (abrir, lançar e fechar)'
 WHERE key = 'finance.cashier.close';

-- ---------------------------------------------------------------------------
-- Leitura: finance.view OU quem opera o caixa
-- ---------------------------------------------------------------------------

-- Os nomes abaixo são os das policies que JÁ EXISTEM (migration
-- 20260801000005) — conferido antes de escrever. Recriar com nome diferente
-- deixaria a antiga de pé, e como policies de SELECT somam entre si, o
-- resultado seria o certo por acidente, com lixo permanente no banco.

DROP POLICY IF EXISTS "Ver caixa do tenant" ON public.caixa_sessoes;
CREATE POLICY "Ver caixa do tenant"
  ON public.caixa_sessoes FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'finance.view')
      OR public.has_permission(auth.uid(), 'finance.cashier.close')
    )
  );

DROP POLICY IF EXISTS "Ver movimentos do caixa" ON public.caixa_movimentos;
CREATE POLICY "Ver movimentos do caixa"
  ON public.caixa_movimentos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.caixa_sessoes s
    WHERE s.id = sessao_id
      AND s.tenant_id = public.get_user_tenant_id(auth.uid())
      AND (
        public.has_permission(auth.uid(), 'finance.view')
        OR public.has_permission(auth.uid(), 'finance.cashier.close')
      )
  ));

NOTIFY pgrst, 'reload schema';
