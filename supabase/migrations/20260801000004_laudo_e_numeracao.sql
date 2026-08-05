-- =============================================================================
-- RPG System.IO — Laudo técnico e numeração de documentos
-- =============================================================================
--
-- Três coisas:
--
-- 1. `service_orders` ganha os campos que o padrão de laudo da casa exige e que
--    não existiam: observações e garantia no nível da OS. Hoje garantia só
--    existe por item (service_order_items.garantia_item_meses), o que não
--    responde "qual a garantia DESTA OS".
--
-- 2. `imei` vira `numero_serie`. A loja conserta console, controle, notebook e
--    PC — nenhum deles tem IMEI. O campo sempre foi "identificador único do
--    aparelho"; o nome é que estava errado.
--
-- 3. Numeração de OS e venda deixa de usar COUNT(*)+1. Duas OS abertas ao mesmo
--    tempo recebiam o MESMO número, e excluir uma OS fazia a próxima repetir um
--    número já usado. Passa a usar contador atômico por tenant e mês.
-- =============================================================================


-- =============================================================================
-- 1. CAMPOS DO LAUDO
-- =============================================================================

ALTER TABLE public.service_orders RENAME COLUMN imei TO numero_serie;

COMMENT ON COLUMN public.service_orders.numero_serie IS
  'Identificador único do aparelho: IMEI (celular), serial (console/notebook) ou nº de série do fabricante.';

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS observacoes         TEXT,
  ADD COLUMN IF NOT EXISTS garantia_meses      INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS suspeita_tecnica    TEXT,
  ADD COLUMN IF NOT EXISTS constatacao_tecnica TEXT,
  ADD COLUMN IF NOT EXISTS risco_informado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reparo_inviavel     BOOLEAN NOT NULL DEFAULT false;

-- O padrão de laudo da casa manda separar TRÊS níveis de certeza e nunca
-- misturá-los. Antes tudo isso cabia num único `diagnostico_tecnico`, o que
-- deixava uma suspeita parecer constatação confirmada.
COMMENT ON COLUMN public.service_orders.defeito_cliente IS
  'Nível 1 — o que o CLIENTE relatou. Nunca editar para "corrigir" tecnicamente.';
COMMENT ON COLUMN public.service_orders.suspeita_tecnica IS
  'Nível 2 — hipótese a partir do sintoma, SEM confirmação física. Não apresentar ao cliente como certeza.';
COMMENT ON COLUMN public.service_orders.constatacao_tecnica IS
  'Nível 3 — o que foi confirmado em bancada. Só entra aqui o que foi verificado de fato.';

COMMENT ON COLUMN public.service_orders.observacoes IS
  'Riscos, recomendações e cuidados pós-reparo comunicados ao cliente.';
COMMENT ON COLUMN public.service_orders.garantia_meses IS
  'Garantia do serviço desta OS. Padrão da casa: 3 meses. Zero = sem garantia (ex.: peça fornecida pelo cliente).';
COMMENT ON COLUMN public.service_orders.risco_informado_em IS
  'Quando o cliente foi avisado do risco em reparo avançado (reballing, reflow, banho químico, oxidação). NULL = ainda não avisado.';
COMMENT ON COLUMN public.service_orders.reparo_inviavel IS
  'Placa com dano severo: o laudo declara inviabilidade em vez de emitir orçamento.';


-- =============================================================================
-- 2. NUMERAÇÃO ATÔMICA
-- =============================================================================
-- O problema do COUNT(*)+1:
--   • duas OS simultâneas leem a mesma contagem e geram o mesmo número;
--   • ao excluir uma OS, a contagem cai e o próximo número repete um já usado.
-- Um contador dedicado com UPDATE atômico resolve os dois.

CREATE TABLE public.documento_sequencias (
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  documento  TEXT NOT NULL,   -- 'OS' | 'VD'
  ano_mes    TEXT NOT NULL,   -- 'YYYYMM'
  ultimo     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, documento, ano_mes)
);

COMMENT ON TABLE public.documento_sequencias IS
  'Contador de numeração por loja/documento/mês. Só o trigger escreve aqui.';

ALTER TABLE public.documento_sequencias ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito: ninguém acessa via API. Os triggers são
-- SECURITY DEFINER e passam por cima do RLS.

CREATE OR REPLACE FUNCTION public.proximo_numero_documento(_tenant UUID, _documento TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano_mes TEXT := to_char(now(), 'YYYYMM');
  v_seq     INTEGER;
BEGIN
  -- INSERT ... ON CONFLICT DO UPDATE é atômico: concorrentes serializam na
  -- linha e cada um recebe um valor distinto.
  INSERT INTO public.documento_sequencias (tenant_id, documento, ano_mes, ultimo)
  VALUES (_tenant, _documento, v_ano_mes, 1)
  ON CONFLICT (tenant_id, documento, ano_mes)
  DO UPDATE SET ultimo = public.documento_sequencias.ultimo + 1
  RETURNING ultimo INTO v_seq;

  RETURN _documento || '-' || v_ano_mes || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- Semeia o contador com o que já existe, para a numeração não recomeçar do 1.
INSERT INTO public.documento_sequencias (tenant_id, documento, ano_mes, ultimo)
SELECT tenant_id, 'OS', to_char(created_at, 'YYYYMM'), COUNT(*)
FROM public.service_orders
GROUP BY tenant_id, to_char(created_at, 'YYYYMM')
ON CONFLICT DO NOTHING;

INSERT INTO public.documento_sequencias (tenant_id, documento, ano_mes, ultimo)
SELECT tenant_id, 'VD', to_char(created_at, 'YYYYMM'), COUNT(*)
FROM public.vendas
GROUP BY tenant_id, to_char(created_at, 'YYYYMM')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.generate_os_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.numero_os := public.proximo_numero_documento(NEW.tenant_id, 'OS');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_venda_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.numero_venda := public.proximo_numero_documento(NEW.tenant_id, 'VD');
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 3. LIMPEZA
-- =============================================================================
-- `track_stock_movement()` foi criada na migration inicial mas NENHUM trigger a
-- usava — movimentação de estoque nunca foi registrada automaticamente. Some
-- daqui para não passar a falsa impressão de que existe essa auditoria; o
-- lançamento em movimentos_estoque continua sendo explícito, feito pela
-- aplicação, que é onde dá para informar tipo, motivo e origem corretos.

DROP FUNCTION IF EXISTS public.track_stock_movement();
