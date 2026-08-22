-- =============================================================================
-- Sisteminha (RPG System.IO) — número de OS muda de OS-AAAAMM-NNNN pra OSNNNN
-- =============================================================================
--
-- Pedido do Felipe em 23/08: a OS passa a seguir exatamente o mesmo padrão que
-- a venda ganhou em 22/08 — "OS0001", "OS0002"... numa sequência ÚNICA por
-- loja, que nunca reinicia. Nem no fim do mês, nem no fim do ano.
--
-- Antes: `OS-202608-0001`, com o contador reiniciando todo mês. Duas OS de
-- meses diferentes podiam ser as duas "0001", e quem falava "a OS 1" no balcão
-- precisava dizer o mês junto pra não haver dúvida.
--
-- MESMA DECISÃO DA VENDA, pelo mesmo motivo: só as OS NOVAS usam o formato
-- curto. As que já existem continuam com o número que sempre tiveram —
-- reescrever histórico faria o número no papel entregue ao cliente não bater
-- mais com o número no sistema.
--
-- Como não reinicia: usa a mesma tabela de contador (`documento_sequencias`,
-- chave tenant + documento + ano_mes), gravando com `ano_mes` fixo em 'UNICO'
-- em vez do mês corrente. A chave nunca muda, então o contador nunca encontra
-- uma linha nova pra começar do zero. É o mesmo mecanismo que
-- `proximo_numero_venda` (22/08) já usa e que está em produção há um dia.
--
-- A sequência começa em 1, como aconteceu com a venda. Não há risco de dois
-- documentos com o mesmo nome: `OS0001` e `OS-202608-0001` são visivelmente
-- diferentes, e o índice único de `numero_os` continua garantindo o resto.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.proximo_numero_os(_tenant UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  -- 'UNICO' no lugar do ano_mes real: a chave nunca muda, então o contador
  -- nunca reinicia. INSERT ... ON CONFLICT DO UPDATE é atômico — duas OS
  -- abertas no mesmo instante recebem números diferentes, sem trava manual.
  INSERT INTO public.documento_sequencias (tenant_id, documento, ano_mes, ultimo)
  VALUES (_tenant, 'OS', 'UNICO', 1)
  ON CONFLICT (tenant_id, documento, ano_mes)
  DO UPDATE SET ultimo = public.documento_sequencias.ultimo + 1
  RETURNING ultimo INTO v_seq;

  RETURN 'OS' || lpad(v_seq::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.proximo_numero_os(UUID) IS
  'Numeração de OS nova a partir de 23/08: OS0001, OS0002... sequência única por loja, nunca reinicia. Espelha proximo_numero_venda (22/08). Contador em documento_sequencias com ano_mes fixo (''UNICO'').';

CREATE OR REPLACE FUNCTION public.generate_os_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.numero_os := public.proximo_numero_os(NEW.tenant_id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generate_os_number() IS
  'Gera o número da OS nova no formato OS0001, OS0002... (23/08). OS antigas mantêm o número OS-AAAAMM-NNNN que já tinham.';

NOTIFY pgrst, 'reload schema';
