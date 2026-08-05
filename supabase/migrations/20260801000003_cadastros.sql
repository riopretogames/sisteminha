-- =============================================================================
-- RPG System.IO — Módulo de Cadastros
-- =============================================================================
--
-- Cria o que falta pro módulo de Cadastros existir de verdade:
--
--   catalogos          → as ~12 "tabelas de apoio" (marcas, cores, condições,
--                        checklist, origens...) em UMA tabela discriminada por
--                        `tipo`, em vez de 12 tabelas quase idênticas.
--   fornecedores       → de quem se compra
--   transportadoras    → quem leva e traz
--   servicos           → mão de obra da assistência, com valor de referência
--   formas_pagamento   → com parcela, taxa e juros
--   + campos que faltavam em `clientes`
--
-- -----------------------------------------------------------------------------
-- Sobre a escolha de `catalogos` como tabela única
-- -----------------------------------------------------------------------------
-- Ganho: criar um cadastro novo (ex.: "Motivo de Cancelamento") não exige
-- migration nem tela nova — basta um item em src/config/catalogos.ts.
--
-- Custo, dito na cara: o banco não impede por FK que `produtos.cor_id` aponte
-- para uma linha de tipo 'marca'. Quem garante isso é a função
-- catalogo_e_do_tipo(), usada nos CHECKs abaixo. Se algum dia um catálogo
-- precisar de colunas próprias (preço, alíquota, regra), ele SAI daqui e vira
-- tabela dedicada — foi exatamente o caso de `servicos` e `formas_pagamento`.
-- =============================================================================


-- =============================================================================
-- 1. CATÁLOGOS
-- =============================================================================

CREATE TABLE public.catalogos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  descricao   TEXT NOT NULL,
  -- Cor de exibição opcional (tags, status). Guarda classe Tailwind ou hex.
  cor         TEXT,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  -- Item pré-selecionado do tipo. Só um por tipo (ver índice único parcial).
  padrao      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo, descricao)
);

COMMENT ON TABLE public.catalogos IS
  'Tabelas de apoio do sistema, discriminadas por `tipo`. Espelha src/config/catalogos.ts.';

CREATE INDEX idx_catalogos_tipo ON public.catalogos(tenant_id, tipo, ativo);

-- No máximo um item padrão por tipo.
CREATE UNIQUE INDEX idx_catalogos_padrao_unico
  ON public.catalogos(tenant_id, tipo)
  WHERE padrao;

CREATE TRIGGER update_catalogos_updated_at
  BEFORE UPDATE ON public.catalogos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Guarda de integridade: usada nos CHECKs de quem referencia catálogo.
CREATE OR REPLACE FUNCTION public.catalogo_e_do_tipo(_id UUID, _tipo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _id IS NULL OR EXISTS (
    SELECT 1 FROM public.catalogos c WHERE c.id = _id AND c.tipo = _tipo
  )
$$;

ALTER TABLE public.catalogos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver catalogos do tenant"
  ON public.catalogos FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Gerenciar catalogos do tenant"
  ON public.catalogos FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.products.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.products.manage')
  );


-- =============================================================================
-- 2. FORNECEDORES
-- =============================================================================

CREATE TABLE public.fornecedores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  razao_social   TEXT,
  cpf_cnpj       TEXT,
  inscricao_estadual TEXT,
  email          TEXT,
  telefones      TEXT[] NOT NULL DEFAULT '{}',
  contato_nome   TEXT,
  site           TEXT,
  cep            TEXT,
  estado         TEXT,
  municipio      TEXT,
  bairro         TEXT,
  logradouro     TEXT,
  numero         TEXT,
  complemento    TEXT,
  prazo_entrega_dias INTEGER,
  observacoes    TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fornecedores_tenant ON public.fornecedores(tenant_id, ativo);

CREATE TRIGGER update_fornecedores_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver fornecedores do tenant"
  ON public.fornecedores FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Gerenciar fornecedores"
  ON public.fornecedores FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.suppliers.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.suppliers.manage')
  );


-- =============================================================================
-- 3. TRANSPORTADORAS
-- =============================================================================

CREATE TABLE public.transportadoras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  cpf_cnpj    TEXT,
  telefones   TEXT[] NOT NULL DEFAULT '{}',
  email       TEXT,
  site_rastreio TEXT,
  observacoes TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transportadoras_tenant ON public.transportadoras(tenant_id, ativo);

CREATE TRIGGER update_transportadoras_updated_at
  BEFORE UPDATE ON public.transportadoras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.transportadoras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver transportadoras do tenant"
  ON public.transportadoras FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Gerenciar transportadoras"
  ON public.transportadoras FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.suppliers.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.suppliers.manage')
  );


-- =============================================================================
-- 4. SERVIÇOS (mão de obra da assistência)
-- =============================================================================
-- Tabela própria, não catálogo: tem preço, tempo e garantia — colunas que só
-- fazem sentido aqui.

CREATE TABLE public.servicos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  descricao         TEXT,
  grupo_id          UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  preco_referencia  DECIMAL(10,2) NOT NULL DEFAULT 0,
  custo_estimado    DECIMAL(10,2) NOT NULL DEFAULT 0,
  tempo_estimado_horas DECIMAL(5,2),
  -- Padrão da casa é 3 meses (ver processo de laudo técnico).
  garantia_meses    INTEGER NOT NULL DEFAULT 3,
  exige_aviso_risco BOOLEAN NOT NULL DEFAULT false,
  ativo             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome),
  CONSTRAINT servicos_grupo_valido CHECK (public.catalogo_e_do_tipo(grupo_id, 'grupo_produto'))
);

COMMENT ON COLUMN public.servicos.exige_aviso_risco IS
  'Reparo avançado (reballing, reflow, banho químico, oxidação) obriga aviso de risco ao cliente antes de executar.';

CREATE INDEX idx_servicos_tenant ON public.servicos(tenant_id, ativo);

CREATE TRIGGER update_servicos_updated_at
  BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver servicos do tenant"
  ON public.servicos FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Gerenciar servicos"
  ON public.servicos FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.services.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.services.manage')
  );


-- =============================================================================
-- 5. FORMAS DE PAGAMENTO
-- =============================================================================
-- Também tabela própria: taxa, parcela e juros não cabem num catálogo simples.

CREATE TYPE public.tipo_juros AS ENUM ('sem_juros', 'simples', 'composto');

CREATE TABLE public.formas_pagamento (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  descricao      TEXT NOT NULL,
  -- Agrupador livre ("Assistência Técnica", "Link de Pagamento").
  grupo          TEXT,
  max_parcelas   INTEGER NOT NULL DEFAULT 1,
  contem_taxa    BOOLEAN NOT NULL DEFAULT false,
  taxa_percent   DECIMAL(5,2) NOT NULL DEFAULT 0,
  juros          public.tipo_juros NOT NULL DEFAULT 'sem_juros',
  juros_percent  DECIMAL(5,2) NOT NULL DEFAULT 0,
  -- Entra no fechamento de caixa? Folha de pagamento e permuta não entram.
  entra_no_caixa BOOLEAN NOT NULL DEFAULT true,
  ordem          INTEGER NOT NULL DEFAULT 0,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, descricao),
  CONSTRAINT formas_pagamento_parcelas_validas CHECK (max_parcelas BETWEEN 1 AND 24)
);

-- Taxa por parcela: 3x tem taxa diferente de 12x.
CREATE TABLE public.formas_pagamento_parcelas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forma_pagamento_id UUID NOT NULL REFERENCES public.formas_pagamento(id) ON DELETE CASCADE,
  parcela            INTEGER NOT NULL,
  taxa_percent       DECIMAL(5,2) NOT NULL DEFAULT 0,
  UNIQUE (forma_pagamento_id, parcela),
  CONSTRAINT parcela_valida CHECK (parcela BETWEEN 1 AND 24)
);

CREATE TRIGGER update_formas_pagamento_updated_at
  BEFORE UPDATE ON public.formas_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.formas_pagamento          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formas_pagamento_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver formas de pagamento do tenant"
  ON public.formas_pagamento FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Gerenciar formas de pagamento"
  ON public.formas_pagamento FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.products.manage')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'registry.products.manage')
  );

CREATE POLICY "Ver parcelas das formas de pagamento"
  ON public.formas_pagamento_parcelas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.formas_pagamento f
    WHERE f.id = forma_pagamento_id
      AND f.tenant_id = public.get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Gerenciar parcelas das formas de pagamento"
  ON public.formas_pagamento_parcelas FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.formas_pagamento f
    WHERE f.id = forma_pagamento_id
      AND f.tenant_id = public.get_user_tenant_id(auth.uid())
      AND public.has_permission(auth.uid(), 'registry.products.manage')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.formas_pagamento f
    WHERE f.id = forma_pagamento_id
      AND f.tenant_id = public.get_user_tenant_id(auth.uid())
      AND public.has_permission(auth.uid(), 'registry.products.manage')
  ));


-- =============================================================================
-- 6. CAMPOS QUE FALTAVAM NA FICHA DO CLIENTE
-- =============================================================================
-- Alinha `clientes` com o formulário que a equipe já preenche hoje no OK Cells.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo_pessoa       TEXT NOT NULL DEFAULT 'fisica',
  ADD COLUMN IF NOT EXISTS rg                TEXT,
  ADD COLUMN IF NOT EXISTS genero            TEXT,
  ADD COLUMN IF NOT EXISTS instagram         TEXT,
  ADD COLUMN IF NOT EXISTS site              TEXT,
  ADD COLUMN IF NOT EXISTS cep               TEXT,
  ADD COLUMN IF NOT EXISTS estado            TEXT,
  ADD COLUMN IF NOT EXISTS municipio         TEXT,
  ADD COLUMN IF NOT EXISTS bairro            TEXT,
  ADD COLUMN IF NOT EXISTS logradouro        TEXT,
  ADD COLUMN IF NOT EXISTS numero            TEXT,
  ADD COLUMN IF NOT EXISTS complemento       TEXT,
  ADD COLUMN IF NOT EXISTS limite_credito    DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS liberado_venda    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS origem_id         UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_compra_id  UUID REFERENCES public.catalogos(id) ON DELETE SET NULL;

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_tipo_pessoa_valido CHECK (tipo_pessoa IN ('fisica', 'juridica')),
  ADD CONSTRAINT clientes_origem_valida CHECK (public.catalogo_e_do_tipo(origem_id, 'origem_cliente')),
  ADD CONSTRAINT clientes_motivo_valido CHECK (public.catalogo_e_do_tipo(motivo_compra_id, 'motivo_compra'));

COMMENT ON COLUMN public.clientes.limite_credito IS
  'NULL = sem limite definido. 0 = bloqueado para crediário.';


-- =============================================================================
-- 7. SEED — dados reais da operação
-- =============================================================================
-- Semeado a partir do que já está cadastrado no OK Cells hoje, adaptado ao
-- catálogo da Rio Preto Games (console e jogo, não só celular).

DO $$
DECLARE
  t UUID;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at LIMIT 1;
  IF t IS NULL THEN RETURN; END IF;

  -- ── Grupos de produto ────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'grupo_produto','Console',10), (t,'grupo_produto','Jogo',20),
    (t,'grupo_produto','Controle',30), (t,'grupo_produto','Celular',40),
    (t,'grupo_produto','Informática',50), (t,'grupo_produto','Acessório',60),
    (t,'grupo_produto','Peça',70), (t,'grupo_produto','Serviço',80)
  ON CONFLICT DO NOTHING;

  -- ── Marcas ───────────────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'marca','Sony',10), (t,'marca','Microsoft',20), (t,'marca','Nintendo',30),
    (t,'marca','Samsung',40), (t,'marca','Xiaomi',50), (t,'marca','Motorola',60),
    (t,'marca','Apple',70), (t,'marca','LG',80), (t,'marca','Multilaser',90),
    (t,'marca','Genérica',100)
  ON CONFLICT DO NOTHING;

  -- ── Condições ────────────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'condicao','Novo',10), (t,'condicao','Seminovo',20),
    (t,'condicao','Usado',30), (t,'condicao','Vitrine',40),
    (t,'condicao','Com avaria',50)
  ON CONFLICT DO NOTHING;

  -- ── Capacidades ──────────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'memoria','32GB',10), (t,'memoria','64GB',20), (t,'memoria','128GB',30),
    (t,'memoria','256GB',40), (t,'memoria','512GB',50), (t,'memoria','1TB',60),
    (t,'memoria','2TB',70)
  ON CONFLICT DO NOTHING;

  -- ── Cores ────────────────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'cor','Preto',10), (t,'cor','Branco',20), (t,'cor','Azul',30),
    (t,'cor','Vermelho',40), (t,'cor','Grafite',50), (t,'cor','Rosa',60)
  ON CONFLICT DO NOTHING;

  -- ── Tipos de peça ────────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'tipo_peca','Tela',10), (t,'tipo_peca','Bateria',20),
    (t,'tipo_peca','Conector de carga',30), (t,'tipo_peca','Placa lógica',40),
    (t,'tipo_peca','Analógico',50), (t,'tipo_peca','Cooler',60),
    (t,'tipo_peca','Fonte',70), (t,'tipo_peca','Leitor óptico',80),
    (t,'tipo_peca','HDMI',90), (t,'tipo_peca','HD / SSD',100),
    (t,'tipo_peca','Película de controle',110)
  ON CONFLICT DO NOTHING;

  -- ── Localizações ─────────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'localizacao','Vitrine',10), (t,'localizacao','Depósito',20),
    (t,'localizacao','Bancada',30), (t,'localizacao','Sucata',40)
  ON CONFLICT DO NOTHING;

  -- ── Origem do cliente (espelha o OK Cells, inclusive os inativos) ────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem, ativo, padrao) VALUES
    (t,'origem_cliente','Instagram',10,true,false),
    (t,'origem_cliente','WhatsApp',20,true,true),
    (t,'origem_cliente','Google',30,true,false),
    (t,'origem_cliente','Indicação',40,true,false),
    (t,'origem_cliente','Lojista',50,true,false),
    (t,'origem_cliente','Telemarketing',60,false,false),
    (t,'origem_cliente','LinkedIn',70,false,false),
    (t,'origem_cliente','Jornal',80,false,false)
  ON CONFLICT DO NOTHING;

  -- ── Origem da venda ──────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem, padrao) VALUES
    (t,'origem_venda','Balcão',10,true), (t,'origem_venda','Site',20,false),
    (t,'origem_venda','WhatsApp',30,false), (t,'origem_venda','Instagram',40,false),
    (t,'origem_venda','Shopee',50,false)
  ON CONFLICT DO NOTHING;

  -- ── Tags de cliente ──────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, cor, ordem) VALUES
    (t,'tag_cliente','VIP','bg-amber-500/10 text-amber-600',10),
    (t,'tag_cliente','Fiel','bg-emerald-500/10 text-emerald-600',20),
    (t,'tag_cliente','Atacado','bg-blue-500/10 text-blue-600',30),
    (t,'tag_cliente','Atenção','bg-red-500/10 text-red-600',40)
  ON CONFLICT DO NOTHING;

  -- ── Motivos de compra ────────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'motivo_compra','Recomendação pessoal',10),
    (t,'motivo_compra','Promoção ou desconto',20),
    (t,'motivo_compra','Conveniência na compra',30),
    (t,'motivo_compra','Necessidade essencial',40),
    (t,'motivo_compra','Qualidade do produto',50),
    (t,'motivo_compra','Garantia satisfatória',60),
    (t,'motivo_compra','Custo-benefício',70),
    (t,'motivo_compra','Avaliações convincentes',80),
    (t,'motivo_compra','Confiança na marca',90),
    (t,'motivo_compra','Disponibilidade imediata',100),
    (t,'motivo_compra','Durabilidade',110),
    (t,'motivo_compra','Atendimento da loja',120),
    (t,'motivo_compra','Nenhum motivo informado',130)
  ON CONFLICT DO NOTHING;

  -- ── Checklist de defeitos (o que o cliente relata na entrada) ────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'checklist_defeito','Não liga',10),
    (t,'checklist_defeito','Liga, dá o bip e desliga',20),
    (t,'checklist_defeito','Não está carregando',30),
    (t,'checklist_defeito','Conector de carga com defeito',40),
    (t,'checklist_defeito','Tela trincada',50),
    (t,'checklist_defeito','Não dá imagem',60),
    (t,'checklist_defeito','Luz vermelha',70),
    (t,'checklist_defeito','Aquecimento excessivo',80),
    (t,'checklist_defeito','Travamentos constantes e lentidão',90),
    (t,'checklist_defeito','Não lê disco',100),
    (t,'checklist_defeito','Analógico com defeito',110),
    (t,'checklist_defeito','Não responde ao touch',120),
    (t,'checklist_defeito','Botão de ligar não funciona',130),
    (t,'checklist_defeito','Câmera frontal não funciona',140),
    (t,'checklist_defeito','Câmera traseira não funciona',150),
    (t,'checklist_defeito','Alto-falantes não funcionam',160),
    (t,'checklist_defeito','Microfone não funciona',170),
    (t,'checklist_defeito','Não conecta em redes de sinal',180),
    (t,'checklist_defeito','Não conecta no Wi-Fi',190),
    (t,'checklist_defeito','Não conecta no Bluetooth',200),
    (t,'checklist_defeito','Biometria não funciona',210),
    (t,'checklist_defeito','Face ID não funciona',220),
    (t,'checklist_defeito','Molhado',230),
    (t,'checklist_defeito','Marcas de uso / quebrado',240),
    (t,'checklist_defeito','Impossibilitado de testes',250),
    (t,'checklist_defeito','Manutenção preventiva',260),
    (t,'checklist_defeito','Revisão de loja',270),
    (t,'checklist_defeito','Bateria',280)
  ON CONFLICT DO NOTHING;

  -- ── Acessórios entregues junto com o aparelho ────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'acessorio_entrada','Sem acessórios',10),
    (t,'acessorio_entrada','Fonte',20),
    (t,'acessorio_entrada','Sem fonte',30),
    (t,'acessorio_entrada','Cabos',40),
    (t,'acessorio_entrada','Caixa',50),
    (t,'acessorio_entrada','Capinha',60),
    (t,'acessorio_entrada','Controle',70),
    (t,'acessorio_entrada','2 controles',80),
    (t,'acessorio_entrada','Memory card / cartão SD',90),
    (t,'acessorio_entrada','Cartão SIM',100),
    (t,'acessorio_entrada','Senha do aparelho informada',110),
    (t,'acessorio_entrada','Senha de conta Google / iCloud informada',120)
  ON CONFLICT DO NOTHING;

  -- ── Condição de entrada ──────────────────────────────────────────────────
  INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem) VALUES
    (t,'condicao_entrada','Sem avarias aparentes',10),
    (t,'condicao_entrada','Marcas de uso',20),
    (t,'condicao_entrada','Tampa ou carcaça quebrada',30),
    (t,'condicao_entrada','Molhado / oxidado',40),
    (t,'condicao_entrada','Já aberto por terceiros',50),
    (t,'condicao_entrada','Lacre violado',60)
  ON CONFLICT DO NOTHING;

  -- ── Formas de pagamento (espelha o cadastro atual) ───────────────────────
  INSERT INTO public.formas_pagamento
    (tenant_id, descricao, grupo, max_parcelas, contem_taxa, juros, entra_no_caixa, ordem) VALUES
    (t,'Dinheiro',            NULL,                  1,  false, 'sem_juros', true,  10),
    (t,'PIX',                 NULL,                  1,  false, 'sem_juros', true,  20),
    (t,'Cartão Débito',       NULL,                  1,  false, 'sem_juros', true,  30),
    (t,'Cartão Crédito',      NULL,                  12, false, 'sem_juros', true,  40),
    (t,'Cartão Crédito - Taxa',NULL,                 12, true,  'simples',   true,  50),
    (t,'Link de Pagamento',   'Link de Pagamento',   12, false, 'sem_juros', true,  60),
    (t,'Shopee',              NULL,                  1,  false, 'sem_juros', true,  70),
    (t,'Produtos para a AS',  'Assistência Técnica', 1,  false, 'sem_juros', false, 80),
    (t,'Folha de Pagamento',  NULL,                  1,  false, 'sem_juros', false, 90)
  ON CONFLICT DO NOTHING;
END $$;
