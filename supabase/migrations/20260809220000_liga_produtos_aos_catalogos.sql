-- =============================================================================
-- Sisteminha (RP System.IO) — Produtos ganham catálogo de verdade
-- =============================================================================
--
-- Achado numa revisão anterior: os catálogos de Marca, Modelo, Cor, Condição
-- e Memória (grupo "Produto e Estoque", src/config/catalogos.ts) existem em
-- Listas do Sistema, mas nenhuma tela do lado de Produto/Estoque os usa de
-- verdade — `produtos.marca`/`modelo` são texto livre, e Cor/Condição/Memória
-- não têm coluna nenhuma. Mesmo problema que já foi corrigido duas vezes:
-- Ordens de Serviço (`service_orders.marca_id` etc., migration 20260809110000)
-- e Cliente (`clientes.origem_id`/`motivo_compra_id`, migration
-- 20260801000003). Mesmo remédio aqui.
--
-- Motivo imediato: o formulário novo de "Entrada de Produto por Troca" (PDV)
-- precisa descrever o aparelho usado que está entrando — marca, modelo, cor,
-- condição, memória — e não faz sentido criar campo de texto livre de novo
-- pra isso, repetindo o problema.
--
-- Ficam de fora desta migration, por não serem necessários agora:
-- `localizacao` (continua enum fixo) e os catálogos `grade`/`tipo_peca`.
--
-- As colunas antigas (`marca`, `modelo` texto; `categoria` enum) continuam
-- existindo, sem migração de dado — não é objetivo desta migration mudar o
-- que já está cadastrado, só abrir o caminho novo pra quem cadastrar a partir
-- de agora (a começar pela Entrada de Produto por Troca).
-- =============================================================================

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS grupo_produto_id UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marca_id         UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modelo_id        UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cor_id           UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS condicao_id      UUID REFERENCES public.catalogos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS memoria_id       UUID REFERENCES public.catalogos(id) ON DELETE SET NULL;

-- A FK crua pra `catalogos(id)` não garante que o item escolhido é do TIPO
-- certo (nada impede escolher um item de "grupo_produto" no campo de "cor").
-- `catalogo_e_do_tipo` (20260801000003_cadastros.sql) resolve isso, e já
-- aceita NULL como válido (campo opcional).
ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_grupo_valido    CHECK (public.catalogo_e_do_tipo(grupo_produto_id, 'grupo_produto')),
  ADD CONSTRAINT produtos_marca_valida    CHECK (public.catalogo_e_do_tipo(marca_id, 'marca')),
  ADD CONSTRAINT produtos_modelo_valido   CHECK (public.catalogo_e_do_tipo(modelo_id, 'modelo')),
  ADD CONSTRAINT produtos_cor_valida      CHECK (public.catalogo_e_do_tipo(cor_id, 'cor')),
  ADD CONSTRAINT produtos_condicao_valida CHECK (public.catalogo_e_do_tipo(condicao_id, 'condicao')),
  ADD CONSTRAINT produtos_memoria_valida  CHECK (public.catalogo_e_do_tipo(memoria_id, 'memoria'));

CREATE INDEX IF NOT EXISTS idx_produtos_grupo_produto_id ON public.produtos(grupo_produto_id);
CREATE INDEX IF NOT EXISTS idx_produtos_marca_id         ON public.produtos(marca_id);
CREATE INDEX IF NOT EXISTS idx_produtos_modelo_id        ON public.produtos(modelo_id);
CREATE INDEX IF NOT EXISTS idx_produtos_cor_id           ON public.produtos(cor_id);
CREATE INDEX IF NOT EXISTS idx_produtos_condicao_id      ON public.produtos(condicao_id);
CREATE INDEX IF NOT EXISTS idx_produtos_memoria_id       ON public.produtos(memoria_id);

COMMENT ON COLUMN public.produtos.grupo_produto_id IS 'Tipo de produto, do catálogo editável (Console/Jogo/Controle/...). Substitui categoria (enum fixo) para cadastro novo; categoria continua existindo por compatibilidade.';
COMMENT ON COLUMN public.produtos.marca_id    IS 'Marca do catálogo editável. produtos.marca (texto livre) continua existindo por compatibilidade com cadastros antigos.';
COMMENT ON COLUMN public.produtos.modelo_id   IS 'Modelo do catálogo editável. produtos.modelo (texto livre) continua existindo por compatibilidade com cadastros antigos.';
COMMENT ON COLUMN public.produtos.cor_id      IS 'Cor do catálogo editável — coluna nova, não existia antes.';
COMMENT ON COLUMN public.produtos.condicao_id IS 'Condição (Novo/Seminovo/Usado/Com avaria) do catálogo editável — coluna nova, não existia antes.';
COMMENT ON COLUMN public.produtos.memoria_id  IS 'Memória/capacidade do catálogo editável — coluna nova, não existia antes.';

-- =============================================================================
-- SEED: "Condição" precisa ter itens pra ser usável já na primeira troca.
-- "Grupo de Produto" já está semeado (Console/Jogo/Controle/...) desde
-- 20260801000003. Marca/Modelo/Cor/Memória ficam vazios de propósito — quem
-- cadastrar vai criando pelo próprio seletor (CampoCatalogo permite criar
-- item novo sem precisar ir em Listas do Sistema primeiro).
-- =============================================================================

INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem)
SELECT t.id, v.tipo, v.descricao, v.ordem
FROM public.tenants t
CROSS JOIN (VALUES
  ('condicao', 'Novo',        10),
  ('condicao', 'Seminovo',    20),
  ('condicao', 'Usado',       30),
  ('condicao', 'Com avaria',  40)
) AS v(tipo, descricao, ordem)
ON CONFLICT (tenant_id, tipo, descricao) DO NOTHING;

NOTIFY pgrst, 'reload schema';
