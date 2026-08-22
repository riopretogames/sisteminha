-- =============================================================================
-- Sisteminha (RPG System.IO) — número de venda muda de VD-AAAAMM-NNNN pra OVNNNN
-- =============================================================================
--
-- Pedido do Felipe em 22/08: o número da venda deixa de ser "VD-202608-0015"
-- (reinicia todo mês) e passa a ser "OV0001", "OV0002"... numa sequência
-- ÚNICA que nunca reinicia — nem no fim do mês, nem no fim do ano.
--
-- Decisão confirmada com o Felipe: só as vendas NOVAS usam o formato OV. As
-- que já existem continuam com o número VD-AAAAMM-NNNN que já tinham — não
-- reescreve histórico.
--
-- Como funciona sem reiniciar: reaproveita a mesma tabela de contador que
-- 'OS' já usa (`documento_sequencias`, chave tenant+documento+ano_mes), só
-- que gravando sempre com o mesmo `ano_mes` fixo ('UNICO') em vez do mês
-- corrente — assim o contador nunca encontra uma chave nova pra começar do
-- zero. A numeração de OS (OS-AAAAMM-NNNN) não muda; ela continua usando
-- `proximo_numero_documento` do jeito que já era.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.proximo_numero_venda(_tenant UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  -- 'UNICO' no lugar do ano_mes real: a chave nunca muda, então o contador
  -- nunca reinicia. INSERT ... ON CONFLICT DO UPDATE é atômico, mesma
  -- garantia de concorrência que proximo_numero_documento já tinha.
  INSERT INTO public.documento_sequencias (tenant_id, documento, ano_mes, ultimo)
  VALUES (_tenant, 'OV', 'UNICO', 1)
  ON CONFLICT (tenant_id, documento, ano_mes)
  DO UPDATE SET ultimo = public.documento_sequencias.ultimo + 1
  RETURNING ultimo INTO v_seq;

  RETURN 'OV' || lpad(v_seq::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.proximo_numero_venda(UUID) IS
  'Numeração de venda nova a partir de 22/08: OV0001, OV0002... sequência única por loja, nunca reinicia. Contador guardado em documento_sequencias com ano_mes fixo (''UNICO'').';

CREATE OR REPLACE FUNCTION public.generate_venda_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.numero_venda := public.proximo_numero_venda(NEW.tenant_id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generate_venda_number() IS
  'Gera o número da venda nova no formato OV0001, OV0002... (22/08). Vendas antigas mantêm o número VD-AAAAMM-NNNN que já tinham.';


-- =============================================================================
-- LINHA DO TEMPO DA VENDA — quando mudou de etapa, e quem mudou
-- =============================================================================
--
-- Pedido do Felipe em 22/08: documentar hora de criação, hora de cada
-- mudança de status e quem fez. A hora de criação já existe
-- (`vendas.created_at`, junto com `vendas.vendedor_id`) — o que faltava era
-- o histórico de mudança de status depois de criada (ex.: cancelamento).
--
-- Mesmo padrão já usado e testado em Ordens de Serviço
-- (`service_order_history` / `track_os_status_change`, migration inicial):
-- uma tabela de histórico, populada por gatilho só quando o status
-- REALMENTE muda (não em toda venda — a maioria nasce direto em "pago" e
-- nunca muda depois, então não gera linha nenhuma; é exatamente o esperado).
--
-- Diferença deliberada em relação ao histórico de OS: aqui não existe
-- policy de INSERT/UPDATE/DELETE nenhuma — só o gatilho (SECURITY DEFINER)
-- escreve. Mesmo raciocínio do comentário em `auditoria`: "log que pode ser
-- editado não é log". A tabela de OS tinha uma policy de INSERT direto que
-- nunca foi necessária (o gatilho já escreve sem precisar de policy); não
-- repetida aqui de propósito.
-- =============================================================================

CREATE TABLE public.venda_status_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID REFERENCES public.vendas(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  status_anterior venda_status,
  status_novo venda_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venda_status_historico IS
  'Linha do tempo de mudança de status de uma venda: quando e quem. Gravado só quando o status muda de verdade (track_venda_status_change) -- a maioria das vendas nasce "pago" e nunca muda, então fica sem linha nenhuma aqui, de propósito. A hora de criação mora em vendas.created_at/vendedor_id, não aqui.';

CREATE INDEX idx_venda_status_historico_venda ON public.venda_status_historico(venda_id, created_at);

ALTER TABLE public.venda_status_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver historico de status da venda"
  ON public.venda_status_historico FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendas v
      WHERE v.id = venda_id
        AND v.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.track_venda_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.venda_status_historico (venda_id, usuario_id, status_anterior, status_novo)
    VALUES (NEW.id, auth.uid(), OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.track_venda_status_change() IS
  'Grava uma linha em venda_status_historico toda vez que vendas.status muda de valor. Espelha track_os_status_change.';

CREATE TRIGGER track_venda_status
  AFTER UPDATE ON public.vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.track_venda_status_change();

NOTIFY pgrst, 'reload schema';
