-- =============================================================================
-- RPG System.IO — Permissão do Dashboard de Assistência
-- =============================================================================
--
-- A loja tinha dashboard de Venda, de Estoque e de Metas, mas nenhum da
-- bancada — apesar de a assistência ser metade do negócio. Este é o crachá da
-- tela nova.
--
-- Quem recebe, e por quê:
--
--   • gerente_tecnico e tecnico → a bancada é o trabalho deles. O técnico já
--     tinha `dashboards.stock.view` (precisa saber se tem peça) e agora vê
--     também como está a fila de serviço.
--   • administrador e gerente → precisam ser incluídos À MÃO, abaixo.
--   • vendedor → NÃO recebe. Ele vende; o painel da bancada mostra
--     produtividade de técnico, que não é assunto dele. Mesma lógica que já
--     deixa o vendedor sem `dashboards.stock.view`.
--
-- ⚠️ ARMADILHA para toda permissão nova daqui pra frente: **não existe regra
-- que dê permissão nova ao administrador automaticamente.** `has_permission`
-- só consulta `role_permissions`, e o "administrador tem tudo" de 01/08 foi um
-- INSERT em massa naquele dia — vale para o que existia naquele momento, não
-- para o futuro. Criar a permissão e esquecer de conceder produz o pior
-- resultado possível: a tela some do menu até para o dono da loja, sem erro
-- nenhum, e parece que o sistema "não tem" a funcionalidade.

INSERT INTO public.permissions (key, modulo, descricao)
VALUES ('dashboards.service.view', 'Dashboards', 'Ver o dashboard de assistência')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
VALUES
  ('administrador', 'dashboards.service.view'),
  ('gerente',       'dashboards.service.view')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
VALUES
  ('gerente_tecnico', 'dashboards.service.view'),
  ('tecnico',         'dashboards.service.view')
ON CONFLICT (role, permission_key) DO NOTHING;
