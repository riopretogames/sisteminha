-- =============================================================================
-- Sisteminha (RP System.IO) — Ordem de Serviço: checklist e campos do cadastro
-- =============================================================================
--
-- O Felipe comparou a tela de abertura de OS com a do sistema que a loja usa
-- hoje e resumiu: "está muito básica, muito precária. Todos os campos são
-- selecionáveis, criados na aba cadastro."
--
-- Ele tem razão, e o diagnóstico é o mesmo que apareceu no cadastro de cliente:
-- **o cadastro já existe, a tela é que não usa.** Desde 01/08 estão semeados,
-- sem nenhuma tela lendo:
--
--   `checklist_defeito`  — 29 sintomas (Não liga, Tela trincada, Não lê disco…)
--   `acessorio_entrada`  — 12 pertences (Fonte, Cabos, Caixa, Controle…)
--   `condicao_entrada`   —  6 estados (Sem avarias, Molhado, Lacre violado…)
--
-- E é pior que "faltando": marca, modelo, cor e memória são digitação livre
-- hoje, então o banco aceita "Samsung", "samsung" e "SANSUNG" como três coisas
-- diferentes. Qualquer relatório de "que aparelho mais dá problema" nasce
-- inútil.
--
-- O QUE ESTA MIGRATION FAZ
--
--   1. Uma tabela de ligação OS ↔ catálogo, que serve aos três checklists.
--   2. Colunas que apontam para o catálogo em vez de guardar texto solto.
--   3. Senha de desenho, vendedor e anotações de check-in.
--
-- O QUE ELA NÃO FAZ, DE PROPÓSITO
--
--   - Não apaga as colunas de texto antigas (`marca`, `modelo`, `cor`,
--     `memoria`). Elas continuam sendo preenchidas com a descrição escolhida,
--     igual ao que a `20260807060000` fez com as formas de pagamento — assim
--     nenhum relatório existente quebra. Apagar coluna com dado real exige
--     confirmação do Felipe.
--   - Não trata foto do aparelho. Decisão do Felipe em 09/08: fica para uma
--     etapa própria, junto com o armazenamento de arquivos que o projeto ainda
--     não tem.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O CHECKLIST DA ENTRADA
-- -----------------------------------------------------------------------------
-- Uma tabela para os três blocos (defeito, acessório, condição). O bloco a que
-- cada linha pertence NÃO é repetido aqui: vem do `tipo` do próprio item de
-- catálogo. Guardar de novo criaria a chance de a linha dizer "defeito" e o
-- catálogo dizer "acessório" — duas verdades para a mesma coisa.
--
-- Por que tabela de ligação e não um campo com vários valores: chave
-- estrangeira. O banco garante que todo item marcado numa OS existe de verdade
-- no catálogo. `service_orders.acessorios_deixados` (JSON, criada em janeiro e
-- nunca usada) não teria essa garantia — marcaria texto solto.

CREATE TABLE IF NOT EXISTS public.os_checklist (
  os_id       UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  catalogo_id UUID NOT NULL REFERENCES public.catalogos(id)      ON DELETE RESTRICT,
  -- Repetido para a RLS isolar loja de loja sem consultar `service_orders`.
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id)        ON DELETE CASCADE,
  observacao  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (os_id, catalogo_id),
  CONSTRAINT os_checklist_tipo_valido CHECK (
    public.catalogo_e_do_tipo(catalogo_id, 'checklist_defeito')
    OR public.catalogo_e_do_tipo(catalogo_id, 'acessorio_entrada')
    OR public.catalogo_e_do_tipo(catalogo_id, 'condicao_entrada')
  )
);

COMMENT ON TABLE public.os_checklist IS
  'O que foi marcado na entrada do aparelho: sintomas relatados, pertences '
  'deixados e estado físico. Os três vêm de catálogos editáveis em Listas do '
  'Sistema, então a loja cria item novo sem precisar de migration.';

COMMENT ON COLUMN public.os_checklist.observacao IS
  'Detalhe da linha. Ex.: em "Tela trincada", "trinco no canto inferior '
  'direito". Opcional.';

-- ON DELETE RESTRICT no catálogo, e não CASCADE, de propósito: apagar um item
-- de catálogo não pode apagar em silêncio o registro de que o cliente deixou
-- uma fonte junto com o aparelho. O certo é desativar o item, que a tela de
-- Listas do Sistema já faz.

CREATE INDEX IF NOT EXISTS idx_os_checklist_os ON public.os_checklist(os_id);
CREATE INDEX IF NOT EXISTS idx_os_checklist_catalogo ON public.os_checklist(catalogo_id);

ALTER TABLE public.os_checklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver checklist da OS do tenant" ON public.os_checklist;
CREATE POLICY "Ver checklist da OS do tenant"
  ON public.os_checklist FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Marcar item é editar a OS: mesma chave que a policy de `service_orders` usa.
DROP POLICY IF EXISTS "Quem edita OS marca o checklist" ON public.os_checklist;
CREATE POLICY "Quem edita OS marca o checklist"
  ON public.os_checklist FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'orders.edit')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'orders.edit')
  );


-- -----------------------------------------------------------------------------
-- 2. CAMPOS DO APARELHO VINDOS DO CADASTRO
-- -----------------------------------------------------------------------------
-- `equipamento_id` é o "Equipamento" do modelo de referência (CELULARES,
-- VIDEO GAMES, PEÇAS...). No nosso catálogo isso é `grupo_produto`, que já
-- existe e já é usado pelo estoque — não vale criar um segundo cadastro de
-- categoria para dizer a mesma coisa.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS equipamento_id UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marca_id       UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modelo_id      UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cor_id         UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS memoria_id     UUID REFERENCES public.catalogos(id) ON DELETE SET NULL;

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS so_equipamento_valido,
  DROP CONSTRAINT IF EXISTS so_marca_valida,
  DROP CONSTRAINT IF EXISTS so_modelo_valido,
  DROP CONSTRAINT IF EXISTS so_cor_valida,
  DROP CONSTRAINT IF EXISTS so_memoria_valida;

ALTER TABLE public.service_orders
  ADD CONSTRAINT so_equipamento_valido CHECK (public.catalogo_e_do_tipo(equipamento_id, 'grupo_produto')),
  ADD CONSTRAINT so_marca_valida       CHECK (public.catalogo_e_do_tipo(marca_id, 'marca')),
  ADD CONSTRAINT so_modelo_valido      CHECK (public.catalogo_e_do_tipo(modelo_id, 'modelo')),
  ADD CONSTRAINT so_cor_valida         CHECK (public.catalogo_e_do_tipo(cor_id, 'cor')),
  ADD CONSTRAINT so_memoria_valida     CHECK (public.catalogo_e_do_tipo(memoria_id, 'memoria'));

COMMENT ON COLUMN public.service_orders.marca IS
  'Texto da marca escolhida. A escolha de verdade é `marca_id` (catálogo); '
  'este campo segue preenchido sozinho para não quebrar relatório antigo.';


-- -----------------------------------------------------------------------------
-- 3. SENHA DE DESENHO, VENDEDOR E ANOTAÇÕES DE CHECK-IN
-- -----------------------------------------------------------------------------

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS senha_padrao       TEXT,
  ADD COLUMN IF NOT EXISTS vendedor_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anotacoes_checkin  TEXT;

COMMENT ON COLUMN public.service_orders.senha_padrao IS
  'Padrão de desbloqueio do Android, como sequência de pontos numerados de 1 a '
  '9 na grade 3x3, ex.: "1-2-3-6-9". Fica separado de `senha_aparelho` (senha '
  'digitada) porque um aparelho pode ter os dois.';

COMMENT ON COLUMN public.service_orders.vendedor_id IS
  'Quem recebeu o aparelho no balcão. Diferente do técnico que conserta e de '
  'quem criou a OS no sistema.';

COMMENT ON COLUMN public.service_orders.anotacoes_checkin IS
  'Observações da entrada que não cabem no checklist — visíveis no laudo do '
  'cliente. Não confundir com `observacoes`, que é nota interna da loja.';

COMMENT ON COLUMN public.service_orders.observacoes IS
  'Nota interna da loja. NÃO deve aparecer no laudo entregue ao cliente.';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- 1) A tabela do checklist existe e está protegida?
--    SELECT relrowsecurity FROM pg_class WHERE relname = 'os_checklist';
--
-- 2) As colunas novas entraram?
--    SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'service_orders'
--       AND column_name IN ('equipamento_id','marca_id','modelo_id','cor_id',
--                           'memoria_id','senha_padrao','vendedor_id',
--                           'anotacoes_checkin')
--     ORDER BY column_name;   -- tem que voltar 8 linhas
--
-- 3) A trava de tipo funciona? (tem que dar erro: marca não é defeito)
--    UPDATE public.service_orders
--       SET marca_id = (SELECT id FROM public.catalogos
--                        WHERE tipo = 'checklist_defeito' LIMIT 1)
--     WHERE id = (SELECT id FROM public.service_orders LIMIT 1);
--
-- 4) Os catálogos que a tela vai usar têm item cadastrado?
--    SELECT tipo, count(*) FROM public.catalogos
--     WHERE tipo IN ('checklist_defeito','acessorio_entrada','condicao_entrada',
--                    'grupo_produto','marca','modelo','cor','memoria')
--     GROUP BY tipo ORDER BY tipo;
-- =============================================================================
