-- =============================================================================
-- RPG System.IO — Financeiro e Auditoria
-- =============================================================================
--
-- O menu tinha Financeiro desde o início, mas o banco não tinha uma única
-- tabela para sustentá-lo. Aqui ele passa a existir de verdade.
--
-- Decisão central: contas a pagar e a receber são A MESMA tabela
-- (`titulos_financeiros`), separadas pela coluna `natureza`. Isso não é
-- economia de digitação — é o que faz o Fluxo de Caixa ser uma consulta só,
-- em vez de um UNION de duas tabelas quase idênticas que sempre divergem com
-- o tempo. Mesma lógica dos `catalogos`.
-- =============================================================================


-- =============================================================================
-- 1. CATEGORIAS FINANCEIRAS
-- =============================================================================
-- Tabela própria e não catálogo, porque carrega `natureza` — uma categoria de
-- despesa não pode aparecer na lista de receita.

CREATE TYPE public.natureza_financeira AS ENUM ('receita', 'despesa');
CREATE TYPE public.natureza_titulo     AS ENUM ('pagar', 'receber');
CREATE TYPE public.status_titulo       AS ENUM ('aberto', 'pago', 'cancelado');

CREATE TABLE public.categorias_financeiras (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  natureza   public.natureza_financeira NOT NULL,
  ordem      INTEGER NOT NULL DEFAULT 0,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome, natureza)
);


-- =============================================================================
-- 2. TÍTULOS (contas a pagar e a receber)
-- =============================================================================

CREATE TABLE public.titulos_financeiros (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  natureza      public.natureza_titulo NOT NULL,
  descricao     TEXT NOT NULL,
  categoria_id  UUID REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL,

  -- De onde o título nasceu. Só um destes costuma estar preenchido.
  fornecedor_id UUID REFERENCES public.fornecedores(id)   ON DELETE SET NULL,
  cliente_id    UUID REFERENCES public.clientes(id)       ON DELETE SET NULL,
  venda_id      UUID REFERENCES public.vendas(id)         ON DELETE SET NULL,
  os_id         UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,

  valor         DECIMAL(10,2) NOT NULL,
  valor_pago    DECIMAL(10,2) NOT NULL DEFAULT 0,
  vencimento    DATE NOT NULL,
  -- Mês a que a despesa/receita pertence, que nem sempre é o do vencimento.
  competencia   DATE,

  status        public.status_titulo NOT NULL DEFAULT 'aberto',
  pago_em       DATE,
  forma_pagamento_id UUID REFERENCES public.formas_pagamento(id) ON DELETE SET NULL,

  observacoes   TEXT,
  criado_por    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT titulo_valor_positivo CHECK (valor > 0),
  CONSTRAINT titulo_pago_nao_negativo CHECK (valor_pago >= 0)
);

COMMENT ON TABLE public.titulos_financeiros IS
  'Contas a pagar e a receber. `natureza` separa as duas — o Fluxo de Caixa lê daqui numa consulta só.';
COMMENT ON COLUMN public.titulos_financeiros.competencia IS
  'Mês de competência. Aluguel pago em 05/09 referente a agosto tem competência 2026-08-01.';

-- "Vencido" NÃO é status guardado: é status aberto + vencimento no passado.
-- Guardar exigiria um job diário para virar a coluna, que inevitavelmente
-- atrasa e deixa o dado mentindo. Derivar sempre bate com a realidade.
CREATE INDEX idx_titulos_tenant_natureza ON public.titulos_financeiros(tenant_id, natureza, status);
CREATE INDEX idx_titulos_vencimento      ON public.titulos_financeiros(tenant_id, vencimento);

CREATE TRIGGER update_titulos_updated_at
  BEFORE UPDATE ON public.titulos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- 3. CAIXA
-- =============================================================================

CREATE TYPE public.status_caixa      AS ENUM ('aberto', 'fechado');
CREATE TYPE public.tipo_mov_caixa    AS ENUM ('venda', 'recebimento', 'pagamento', 'sangria', 'suprimento', 'ajuste');

CREATE TABLE public.caixa_sessoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status      public.status_caixa NOT NULL DEFAULT 'aberto',

  aberto_por  UUID NOT NULL REFERENCES auth.users(id),
  aberto_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  valor_abertura DECIMAL(10,2) NOT NULL DEFAULT 0,

  fechado_por UUID REFERENCES auth.users(id),
  fechado_em  TIMESTAMPTZ,
  -- O que a pessoa contou na gaveta.
  valor_informado DECIMAL(10,2),
  -- O que o sistema calculou. A diferença entre os dois é o que interessa.
  valor_calculado DECIMAL(10,2),
  diferenca   DECIMAL(10,2),

  observacoes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.caixa_sessoes.diferenca IS
  'valor_informado - valor_calculado. Negativo = falta dinheiro na gaveta.';

-- Só um caixa aberto por vez, por loja. Dois caixas abertos simultaneamente
-- tornam impossível saber em qual a venda deveria ter entrado.
CREATE UNIQUE INDEX idx_caixa_um_aberto_por_tenant
  ON public.caixa_sessoes(tenant_id)
  WHERE status = 'aberto';

CREATE TABLE public.caixa_movimentos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id  UUID NOT NULL REFERENCES public.caixa_sessoes(id) ON DELETE CASCADE,
  tipo       public.tipo_mov_caixa NOT NULL,
  descricao  TEXT NOT NULL,
  valor      DECIMAL(10,2) NOT NULL,
  forma_pagamento_id UUID REFERENCES public.formas_pagamento(id) ON DELETE SET NULL,
  venda_id   UUID REFERENCES public.vendas(id) ON DELETE SET NULL,
  titulo_id  UUID REFERENCES public.titulos_financeiros(id) ON DELETE SET NULL,
  usuario_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.caixa_movimentos.valor IS
  'Positivo entra, negativo sai. Sangria e pagamento são negativos.';

CREATE INDEX idx_caixa_mov_sessao ON public.caixa_movimentos(sessao_id);


-- =============================================================================
-- 4. AUDITORIA
-- =============================================================================
-- O menu tinha "Logs / Auditoria" e a permissão `audit.view` desde o começo,
-- mas nada era registrado em lugar nenhum.

CREATE TABLE public.auditoria (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  usuario_id  UUID REFERENCES auth.users(id),
  acao        TEXT NOT NULL,            -- INSERT | UPDATE | DELETE
  tabela      TEXT NOT NULL,
  registro_id UUID,
  dados_antes  JSONB,
  dados_depois JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditoria_busca ON public.auditoria(tenant_id, created_at DESC);
CREATE INDEX idx_auditoria_tabela ON public.auditoria(tenant_id, tabela, created_at DESC);

CREATE OR REPLACE FUNCTION public.registrar_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes  JSONB;
  v_depois JSONB;
  v_tenant UUID;
  v_id     UUID;
BEGIN
  -- CUIDADO: em PL/pgSQL, tocar em NEW durante um DELETE (ou em OLD durante um
  -- INSERT) levanta "record is not assigned yet" — e como o trigger aborta, a
  -- operação inteira falha junto. Um CASE dentro do INSERT não protege, porque
  -- a expressão é avaliada de qualquer forma. Por isso a leitura dos registros
  -- é feita aqui, guardada por TG_OP, e nunca fora dele.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_antes := to_jsonb(OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_depois := to_jsonb(NEW);
  END IF;

  -- Nem toda tabela auditada tem tenant_id (user_roles não tem). Em JSONB,
  -- chave ausente devolve NULL em vez de erro — não precisa de EXCEPTION.
  v_tenant := COALESCE(v_depois ->> 'tenant_id', v_antes ->> 'tenant_id')::UUID;
  v_id     := COALESCE(v_depois ->> 'id',        v_antes ->> 'id')::UUID;

  INSERT INTO public.auditoria (tenant_id, usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  VALUES (v_tenant, auth.uid(), TG_OP, TG_TABLE_NAME, v_id, v_antes, v_depois);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Auditado só o que tem consequência: dinheiro, estoque e poder de acesso.
-- Auditar tudo enche a tabela de ruído e ninguém lê.
CREATE TRIGGER audit_vendas
  AFTER INSERT OR UPDATE OR DELETE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

CREATE TRIGGER audit_produtos
  AFTER INSERT OR UPDATE OR DELETE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

CREATE TRIGGER audit_service_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

CREATE TRIGGER audit_titulos
  AFTER INSERT OR UPDATE OR DELETE ON public.titulos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

CREATE TRIGGER audit_caixa_sessoes
  AFTER INSERT OR UPDATE OR DELETE ON public.caixa_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();


-- =============================================================================
-- 5. RLS
-- =============================================================================

ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.titulos_financeiros    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixa_sessoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixa_movimentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria              ENABLE ROW LEVEL SECURITY;

-- ── Categorias ──────────────────────────────────────────────────────────────
CREATE POLICY "Ver categorias financeiras"
  ON public.categorias_financeiras FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'finance.view')
  );

CREATE POLICY "Gerenciar categorias financeiras"
  ON public.categorias_financeiras FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'settings.edit')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'settings.edit')
  );

-- ── Títulos ─────────────────────────────────────────────────────────────────
-- Quem só pode ver contas a pagar não enxerga as a receber, e vice-versa.
CREATE POLICY "Ver titulos conforme a natureza"
  ON public.titulos_financeiros FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      (natureza = 'pagar'   AND public.has_permission(auth.uid(), 'finance.payable.manage'))
      OR (natureza = 'receber' AND public.has_permission(auth.uid(), 'finance.receivable.manage'))
      OR public.has_permission(auth.uid(), 'finance.cashflow.view')
    )
  );

CREATE POLICY "Gerenciar contas a pagar"
  ON public.titulos_financeiros FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'pagar'
    AND public.has_permission(auth.uid(), 'finance.payable.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'pagar'
    AND public.has_permission(auth.uid(), 'finance.payable.manage')
  );

CREATE POLICY "Gerenciar contas a receber"
  ON public.titulos_financeiros FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'receber'
    AND public.has_permission(auth.uid(), 'finance.receivable.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND natureza = 'receber'
    AND public.has_permission(auth.uid(), 'finance.receivable.manage')
  );

-- ── Caixa ───────────────────────────────────────────────────────────────────
CREATE POLICY "Ver caixa do tenant"
  ON public.caixa_sessoes FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'finance.view')
  );

CREATE POLICY "Operar o caixa"
  ON public.caixa_sessoes FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'finance.cashier.close')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'finance.cashier.close')
  );

CREATE POLICY "Ver movimentos do caixa"
  ON public.caixa_movimentos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.caixa_sessoes s
    WHERE s.id = sessao_id
      AND s.tenant_id = public.get_user_tenant_id(auth.uid())
      AND public.has_permission(auth.uid(), 'finance.view')
  ));

CREATE POLICY "Lancar movimento no caixa"
  ON public.caixa_movimentos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.caixa_sessoes s
    WHERE s.id = sessao_id
      AND s.tenant_id = public.get_user_tenant_id(auth.uid())
      AND s.status = 'aberto'
      AND public.has_permission(auth.uid(), 'finance.cashier.close')
  ));

-- ── Auditoria ───────────────────────────────────────────────────────────────
-- Só leitura, e só para quem tem audit.view. Nem UPDATE nem DELETE têm policy:
-- log que pode ser editado não é log.
CREATE POLICY "Ver auditoria"
  ON public.auditoria FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'audit.view')
  );


-- =============================================================================
-- 6. SEED — categorias financeiras da operação
-- =============================================================================

DO $$
DECLARE
  t UUID;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at LIMIT 1;
  IF t IS NULL THEN RETURN; END IF;

  INSERT INTO public.categorias_financeiras (tenant_id, nome, natureza, ordem) VALUES
    (t,'Venda de produtos','receita',10),
    (t,'Serviço de assistência','receita',20),
    (t,'Venda de seminovo','receita',30),
    (t,'Outras receitas','receita',90),

    (t,'Compra de mercadoria','despesa',10),
    (t,'Compra de peças','despesa',20),
    (t,'Folha de pagamento','despesa',30),
    (t,'Premiações e comissões','despesa',40),
    (t,'Aluguel','despesa',50),
    (t,'Energia, água e internet','despesa',60),
    (t,'Impostos e taxas','despesa',70),
    (t,'Marketing','despesa',80),
    (t,'Ferramentas e equipamentos','despesa',85),
    (t,'Outras despesas','despesa',90)
  ON CONFLICT DO NOTHING;
END $$;
