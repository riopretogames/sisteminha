-- =============================================================================
-- Sisteminha (RP System.IO) — A assistência tem cadastro próprio
-- =============================================================================
--
-- CORREÇÃO DE UM ERRO MEU, APONTADO PELO FELIPE EM 09/08:
-- "os cadastros da ordem de serviço são diferentes dos cadastros de venda.
--  Lembre-se sempre disso."
--
-- A migration de algumas horas atrás (`20260809100000`) ligou a OS nos mesmos
-- catálogos do estoque: `marca`, `modelo`, `cor`, `memoria`, `grupo_produto`.
-- Está errado, e o motivo é operacional, não de organização:
--
--   - Na bancada entra aparelho de marca que a loja NUNCA vendeu e nunca vai
--     vender (Motorola, LG, Positivo...). Misturado, o cadastro de marcas do
--     estoque enche de fabricante que não está à venda, e quem cadastra produto
--     passa a garimpar no meio disso.
--   - "Equipamento" na OS (CELULAR, VIDEO GAME, NOTEBOOK) não é "Grupo de
--     Produto" no estoque (Console, Jogo, Controle, Peça). São perguntas
--     diferentes: uma é "o que entrou na bancada", a outra é "em que prateleira
--     isso fica".
--
-- Custo baixo porque as colunas nasceram hoje e nenhuma OS as usou ainda —
-- nada a migrar.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. AS LISTAS DA ASSISTÊNCIA
-- -----------------------------------------------------------------------------
-- Semeadas com o que a Rio Preto Games recebe de verdade: games e celular.
-- Não é lista fechada — a tela de Nova OS deixa cadastrar item novo na hora, e
-- Cadastros > Listas do Sistema também. Isto aqui é só para a loja não começar
-- do zero.

INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem)
SELECT t.id, v.tipo, v.descricao, v.ordem
FROM public.tenants t
CROSS JOIN (VALUES
  -- Que tipo de aparelho entra na bancada
  ('os_equipamento', 'Celular',            10),
  ('os_equipamento', 'Video game',         20),
  ('os_equipamento', 'Controle',           30),
  ('os_equipamento', 'Notebook',           40),
  ('os_equipamento', 'Computador',         50),
  ('os_equipamento', 'Tablet',             60),
  ('os_equipamento', 'Caixa de som',       70),
  ('os_equipamento', 'Fonte / carregador', 80),
  ('os_equipamento', 'Outro',              90),

  -- Fabricantes que chegam para conserto, incluindo os que a loja não vende
  ('os_marca', 'Samsung',    10),
  ('os_marca', 'Apple',      20),
  ('os_marca', 'Xiaomi',     30),
  ('os_marca', 'Motorola',   40),
  ('os_marca', 'LG',         50),
  ('os_marca', 'Sony',       60),
  ('os_marca', 'Microsoft',  70),
  ('os_marca', 'Nintendo',   80),
  ('os_marca', 'Positivo',   90),
  ('os_marca', 'Multilaser', 100),
  ('os_marca', 'JBL',        110),
  ('os_marca', 'Dell',       120),
  ('os_marca', 'Lenovo',     130),
  ('os_marca', 'Acer',       140),
  ('os_marca', 'Asus',       150),
  ('os_marca', 'Outra',      160),

  -- Cor do aparelho recebido
  ('os_cor', 'Preto',   10),
  ('os_cor', 'Branco',  20),
  ('os_cor', 'Azul',    30),
  ('os_cor', 'Grafite', 40),
  ('os_cor', 'Dourado', 50),
  ('os_cor', 'Prata',   60),
  ('os_cor', 'Rosa',    70),
  ('os_cor', 'Vermelho',80),
  ('os_cor', 'Verde',   90),

  -- Capacidade do aparelho recebido
  ('os_memoria', '32GB',  10),
  ('os_memoria', '64GB',  20),
  ('os_memoria', '128GB', 30),
  ('os_memoria', '256GB', 40),
  ('os_memoria', '512GB', 50),
  ('os_memoria', '1TB',   60),
  ('os_memoria', '2TB',   70)
) AS v(tipo, descricao, ordem)
ON CONFLICT (tenant_id, tipo, descricao) DO NOTHING;

-- `os_modelo` nasce vazio de propósito: modelo é a lista que mais varia por
-- loja, e chutar cinquenta nomes só criaria lixo pra loja desativar depois. A
-- equipe cadastra na primeira vez que o aparelho aparece, direto na tela da OS.


-- -----------------------------------------------------------------------------
-- 2. AS COLUNAS DA OS PASSAM A APONTAR PARA AS LISTAS NOVAS
-- -----------------------------------------------------------------------------
-- Só troca a regra de validação: as colunas continuam as mesmas, e como nenhuma
-- OS chegou a usá-las, não há dado para converter.

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS so_equipamento_valido,
  DROP CONSTRAINT IF EXISTS so_marca_valida,
  DROP CONSTRAINT IF EXISTS so_modelo_valido,
  DROP CONSTRAINT IF EXISTS so_cor_valida,
  DROP CONSTRAINT IF EXISTS so_memoria_valida;

-- Segurança antes de trancar: se alguma OS tiver sido criada nesse intervalo
-- apontando para o catálogo de produto, o UPDATE abaixo limpa a referência em
-- vez de deixar a migration falhar com o cliente esperando no balcão.
UPDATE public.service_orders
   SET equipamento_id = NULL
 WHERE equipamento_id IS NOT NULL
   AND NOT public.catalogo_e_do_tipo(equipamento_id, 'os_equipamento');

UPDATE public.service_orders
   SET marca_id = NULL
 WHERE marca_id IS NOT NULL
   AND NOT public.catalogo_e_do_tipo(marca_id, 'os_marca');

UPDATE public.service_orders
   SET modelo_id = NULL
 WHERE modelo_id IS NOT NULL
   AND NOT public.catalogo_e_do_tipo(modelo_id, 'os_modelo');

UPDATE public.service_orders
   SET cor_id = NULL
 WHERE cor_id IS NOT NULL
   AND NOT public.catalogo_e_do_tipo(cor_id, 'os_cor');

UPDATE public.service_orders
   SET memoria_id = NULL
 WHERE memoria_id IS NOT NULL
   AND NOT public.catalogo_e_do_tipo(memoria_id, 'os_memoria');

ALTER TABLE public.service_orders
  ADD CONSTRAINT so_equipamento_valido CHECK (public.catalogo_e_do_tipo(equipamento_id, 'os_equipamento')),
  ADD CONSTRAINT so_marca_valida       CHECK (public.catalogo_e_do_tipo(marca_id, 'os_marca')),
  ADD CONSTRAINT so_modelo_valido      CHECK (public.catalogo_e_do_tipo(modelo_id, 'os_modelo')),
  ADD CONSTRAINT so_cor_valida         CHECK (public.catalogo_e_do_tipo(cor_id, 'os_cor')),
  ADD CONSTRAINT so_memoria_valida     CHECK (public.catalogo_e_do_tipo(memoria_id, 'os_memoria'));

COMMENT ON COLUMN public.service_orders.equipamento_id IS
  'Catálogo `os_equipamento` — o que entrou na bancada. Não é `grupo_produto`, '
  'que é a prateleira da loja: a assistência tem cadastro próprio.';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- 1) As listas novas têm item?
--    SELECT tipo, count(*) FROM public.catalogos
--     WHERE tipo LIKE 'os\_%' GROUP BY tipo ORDER BY tipo;
--    (os_modelo não aparece: nasce vazio de propósito)
--
-- 2) A trava está apontando para a lista certa? (tem que dar erro)
--    UPDATE public.service_orders
--       SET marca_id = (SELECT id FROM public.catalogos WHERE tipo = 'marca' LIMIT 1)
--     WHERE id = (SELECT id FROM public.service_orders LIMIT 1);
-- =============================================================================
