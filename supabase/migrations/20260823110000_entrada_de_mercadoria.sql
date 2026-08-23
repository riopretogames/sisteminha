-- =============================================================================
-- RPG System.IO — Entrada de Mercadoria do Fornecedor
-- =============================================================================
--
-- O último achado 🔴 do plano: "Fornecedores não alimenta compra/entrada de
-- estoque". Não era um conserto — era uma tela que nunca existiu. Ficou
-- travado de propósito até o Felipe explicar como a loja recebe mercadoria de
-- verdade, o que ele fez em 23/08. As respostas dele estão desenhadas aqui:
--
--   1. "somente produto"  → a mercadoria chega SEM a nota fiscal. Por isso
--      `numero_nota` é opcional: exigir a nota travaria quem está com a caixa
--      aberta na frente, esperando um papel que chega dias depois.
--   2. "conferência"      → a loja confere item por item. A entrada registra o
--      que chegou DE VERDADE, não o que era esperado.
--   3. "reportar o setor de compra para entender o erro" → divergência NÃO
--      bloqueia a entrada. A mercadoria já está fisicamente na loja; segurar o
--      estoque só faria o sistema mentir. Ela é marcada e fica visível.
--   4. "sim o custo atualiza"  → ver a seção de custo médio abaixo.
--   5. "conta paga"       → o título nasce quitado na data da entrada. O
--      Felipe pode corrigir data e forma depois, no Financeiro.
--
-- POR QUE CUSTO MÉDIO, E NÃO O ÚLTIMO PREÇO PAGO
--
-- Decisão do Felipe em 23/08. Se havia 5 unidades a R$ 40 e chegam 10 a R$ 50,
-- o custo passa a ser R$ 46,67 — ((5×40) + (10×50)) ÷ 15 — e não R$ 50.
--
-- O motivo é que `produtos.margem_percent` é calculada a partir do custo. Com
-- "último preço", as 5 unidades antigas passariam a valer R$ 50 sem ninguém
-- ter pago isso, e a margem delas apareceria menor do que foi de verdade.
-- Fornecedor que aumenta o preço faria a margem da loja "cair" na tela antes
-- de cair no bolso.
--
-- =============================================================================


-- =============================================================================
-- 1. AS TABELAS
-- =============================================================================

CREATE TABLE public.entradas_mercadoria (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  numero        TEXT NOT NULL,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE RESTRICT,

  -- Opcional de propósito: a nota chega depois da mercadoria (resposta 1).
  numero_nota   TEXT,

  data_entrada  DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao    TEXT,

  total            DECIMAL(10,2) NOT NULL DEFAULT 0,
  tem_divergencia  BOOLEAN NOT NULL DEFAULT false,

  -- O lançamento no financeiro que esta entrada gerou.
  titulo_id     UUID REFERENCES public.titulos_financeiros(id) ON DELETE SET NULL,

  usuario_id    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT entrada_numero_unico UNIQUE (tenant_id, numero)
);

CREATE TABLE public.entradas_mercadoria_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_id     UUID NOT NULL REFERENCES public.entradas_mercadoria(id) ON DELETE CASCADE,
  produto_id     UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,

  quantidade     INTEGER NOT NULL,
  custo_unitario DECIMAL(10,2) NOT NULL,

  -- NULL = veio como esperado. Texto = o que veio errado, para o setor de
  -- compras entender (resposta 3). Não impede a entrada.
  divergencia    TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT item_entrada_quantidade_positiva CHECK (quantidade > 0),
  CONSTRAINT item_entrada_custo_nao_negativo  CHECK (custo_unitario >= 0)
);

CREATE INDEX idx_entradas_mercadoria_tenant     ON public.entradas_mercadoria(tenant_id, data_entrada DESC);
CREATE INDEX idx_entradas_mercadoria_fornecedor ON public.entradas_mercadoria(fornecedor_id);
CREATE INDEX idx_entradas_itens_entrada         ON public.entradas_mercadoria_itens(entrada_id);
CREATE INDEX idx_entradas_itens_produto         ON public.entradas_mercadoria_itens(produto_id);

COMMENT ON TABLE public.entradas_mercadoria IS
  'Recebimento de mercadoria do fornecedor. A nota fiscal é opcional porque chega depois da mercadoria (decisão do Felipe, 23/08).';
COMMENT ON COLUMN public.entradas_mercadoria_itens.divergencia IS
  'O que veio diferente do pedido. Não bloqueia a entrada — a mercadoria já está na loja; serve para o setor de compras apurar.';


-- =============================================================================
-- 2. NUMERAÇÃO: EM0001, EM0002... sem reiniciar por mês
-- =============================================================================
--
-- Mesmo padrão de OV (venda) e OS: `ano_mes = 'UNICO'` faz o contador nunca
-- reiniciar. Documento que reinicia produz dois papéis com o mesmo número.

CREATE OR REPLACE FUNCTION public.proximo_numero_entrada(_tenant UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO public.documento_sequencias (tenant_id, documento, ano_mes, ultimo)
  VALUES (_tenant, 'EM', 'UNICO', 1)
  ON CONFLICT (tenant_id, documento, ano_mes)
  DO UPDATE SET ultimo = public.documento_sequencias.ultimo + 1
  RETURNING ultimo INTO v_seq;

  RETURN 'EM' || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.proximo_numero_entrada(UUID) FROM PUBLIC, anon;


-- =============================================================================
-- 3. A OPERAÇÃO INTEIRA, NUMA TRANSAÇÃO SÓ
-- =============================================================================
--
-- Dar entrada mexe em quatro lugares: estoque, custo do produto, histórico de
-- movimentação e financeiro. Se isso fossem quatro chamadas soltas do
-- navegador, uma queda de rede no meio deixaria o estoque somado e a conta não
-- lançada — ou pior, o custo alterado sem a mercadoria ter entrado.
--
-- Aqui é tudo ou nada.

CREATE OR REPLACE FUNCTION public.registrar_entrada_mercadoria(
  _fornecedor_id UUID,
  _itens         JSONB,
  _data_entrada  DATE    DEFAULT CURRENT_DATE,
  _numero_nota   TEXT    DEFAULT NULL,
  _observacao    TEXT    DEFAULT NULL,
  _categoria_id  UUID    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant       UUID;
  v_entrada_id   UUID;
  v_numero       TEXT;
  v_item         JSONB;
  v_produto      RECORD;
  v_qtd          INTEGER;
  v_custo        DECIMAL(10,2);
  v_novo_custo   DECIMAL(10,2);
  v_total        DECIMAL(10,2) := 0;
  v_divergiu     BOOLEAN := false;
  v_titulo_id    UUID;
  v_fornecedor   TEXT;
BEGIN
  -- Quem dá entrada digita o preço de compra, então mexe com custo por
  -- definição. Exigir as duas permissões mantém a regra de custo protegido
  -- (Opção B) de pé: ninguém vê preço de compra por uma porta lateral.
  IF NOT public.has_permission(auth.uid(), 'inventory.adjust') THEN
    RAISE EXCEPTION 'Seu perfil de acesso não permite lançar entrada de estoque.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.has_permission(auth.uid(), 'inventory.cost.view') THEN
    RAISE EXCEPTION 'Dar entrada exige também a permissão de ver custo, porque o preço de compra aparece na tela.'
      USING ERRCODE = 'P0001';
  END IF;

  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Usuário sem loja definida.' USING ERRCODE = 'P0001';
  END IF;

  SELECT nome INTO v_fornecedor
  FROM public.fornecedores
  WHERE id = _fornecedor_id AND tenant_id = v_tenant;
  IF v_fornecedor IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado nesta loja.' USING ERRCODE = 'P0001';
  END IF;

  IF _itens IS NULL OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos um produto na entrada.' USING ERRCODE = 'P0001';
  END IF;

  v_numero := public.proximo_numero_entrada(v_tenant);

  INSERT INTO public.entradas_mercadoria (
    tenant_id, numero, fornecedor_id, numero_nota,
    data_entrada, observacao, usuario_id
  ) VALUES (
    v_tenant, v_numero, _fornecedor_id, NULLIF(trim(COALESCE(_numero_nota, '')), ''),
    _data_entrada, NULLIF(trim(COALESCE(_observacao, '')), ''), auth.uid()
  )
  RETURNING id INTO v_entrada_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens)
  LOOP
    v_qtd   := (v_item->>'quantidade')::INTEGER;
    v_custo := (v_item->>'custo_unitario')::DECIMAL(10,2);

    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida na entrada: %', v_qtd USING ERRCODE = 'P0001';
    END IF;
    IF v_custo IS NULL OR v_custo < 0 THEN
      RAISE EXCEPTION 'Preço de compra inválido na entrada: %', v_custo USING ERRCODE = 'P0001';
    END IF;

    -- FOR UPDATE: duas entradas do mesmo produto ao mesmo tempo calculariam o
    -- custo médio em cima do mesmo saldo antigo, e uma sobrescreveria a outra.
    SELECT id, estoque_atual, custo, nome
    INTO v_produto
    FROM public.produtos
    WHERE id = (v_item->>'produto_id')::UUID
      AND tenant_id = v_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado nesta loja.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.entradas_mercadoria_itens (
      entrada_id, produto_id, quantidade, custo_unitario, divergencia
    ) VALUES (
      v_entrada_id,
      v_produto.id,
      v_qtd,
      v_custo,
      NULLIF(trim(COALESCE(v_item->>'divergencia', '')), '')
    );

    IF NULLIF(trim(COALESCE(v_item->>'divergencia', '')), '') IS NOT NULL THEN
      v_divergiu := true;
    END IF;

    -- Custo médio ponderado. Estoque zerado (ou negativo, que acontece quando
    -- alguém vendeu antes de dar entrada) não tem passado para ponderar: o
    -- custo novo vale sozinho.
    IF COALESCE(v_produto.estoque_atual, 0) > 0 THEN
      v_novo_custo := ROUND(
        ((v_produto.estoque_atual * COALESCE(v_produto.custo, 0)) + (v_qtd * v_custo))
        / (v_produto.estoque_atual + v_qtd),
        2
      );
    ELSE
      v_novo_custo := v_custo;
    END IF;

    UPDATE public.produtos
    SET estoque_atual = COALESCE(estoque_atual, 0) + v_qtd,
        custo         = v_novo_custo
    WHERE id = v_produto.id;

    INSERT INTO public.movimentos_estoque (
      tenant_id, produto_id, tipo, quantidade,
      custo_unitario, valor_total,
      motivo, origem, usuario_id,
      saldo_anterior, saldo_depois
    ) VALUES (
      v_tenant,
      v_produto.id,
      'entrada',
      v_qtd,
      v_custo,
      v_custo * v_qtd,
      'Entrada de mercadoria — ' || v_fornecedor,
      'entrada:' || v_numero,
      auth.uid(),
      COALESCE(v_produto.estoque_atual, 0),
      COALESCE(v_produto.estoque_atual, 0) + v_qtd
    );

    v_total := v_total + (v_custo * v_qtd);
  END LOOP;

  -- O título nasce quitado (resposta 5). A trava `trg_status_titulo` é BEFORE
  -- UPDATE, então não atrapalha um INSERT já pago — conferido antes de escrever.
  INSERT INTO public.titulos_financeiros (
    tenant_id, natureza, descricao, categoria_id, fornecedor_id,
    valor, valor_pago, vencimento, competencia,
    status, pago_em, observacoes, criado_por
  ) VALUES (
    v_tenant,
    'pagar',
    'Compra de mercadoria ' || v_numero || ' — ' || v_fornecedor,
    _categoria_id,
    _fornecedor_id,
    v_total,
    v_total,
    _data_entrada,
    _data_entrada,
    'pago',
    _data_entrada,
    CASE WHEN _numero_nota IS NOT NULL AND trim(_numero_nota) <> ''
         THEN 'Nota fiscal ' || trim(_numero_nota)
         ELSE 'Nota fiscal ainda não recebida.'
    END,
    auth.uid()
  )
  RETURNING id INTO v_titulo_id;

  UPDATE public.entradas_mercadoria
  SET total = v_total,
      tem_divergencia = v_divergiu,
      titulo_id = v_titulo_id
  WHERE id = v_entrada_id;

  RETURN v_entrada_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_entrada_mercadoria IS
  'Dá entrada em mercadoria do fornecedor: soma o estoque, recalcula o custo MÉDIO do produto, grava a movimentação e lança a compra já paga no financeiro — tudo numa transação só. Exige inventory.adjust e inventory.cost.view.';

REVOKE ALL ON FUNCTION public.registrar_entrada_mercadoria(UUID, JSONB, DATE, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrada_mercadoria(UUID, JSONB, DATE, TEXT, TEXT, UUID) TO authenticated;


-- =============================================================================
-- 4. QUEM PODE VER
-- =============================================================================
--
-- A tela inteira é sobre preço de compra: cada linha tem o custo unitário. Não
-- adianta esconder coluna aqui — quem vê a entrada vê o custo. Por isso a
-- leitura exige `inventory.cost.view` junto, em vez de virar uma quinta tabela
-- com colunas revogadas.
--
-- Escrita não tem policy nenhuma de propósito: só a função acima grava, e ela
-- roda com privilégio de dono. Insert solto pelo navegador somaria estoque sem
-- lançar o financeiro.

ALTER TABLE public.entradas_mercadoria       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entradas_mercadoria_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver entradas de mercadoria da loja"
  ON public.entradas_mercadoria FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'inventory.adjust')
    AND public.has_permission(auth.uid(), 'inventory.cost.view')
  );

CREATE POLICY "Ver itens da entrada de mercadoria"
  ON public.entradas_mercadoria_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.entradas_mercadoria e
      WHERE e.id = entradas_mercadoria_itens.entrada_id
        AND e.tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.has_permission(auth.uid(), 'inventory.adjust')
        AND public.has_permission(auth.uid(), 'inventory.cost.view')
    )
  );

GRANT SELECT ON public.entradas_mercadoria       TO authenticated;
GRANT SELECT ON public.entradas_mercadoria_itens TO authenticated;


-- =============================================================================
-- 5. A TRAVA DE CUSTO CONTINUA VALENDO
-- =============================================================================
--
-- Esta migration altera `produtos.custo` por dentro da função, mas não adiciona
-- coluna em nenhuma das 4 tabelas protegidas. Ainda assim reaplicamos a trava:
-- é barato, e o CLAUDE.md manda chamar sempre que uma migration encosta nelas.

SELECT public.aplicar_trava_de_custo();
