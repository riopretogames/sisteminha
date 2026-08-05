-- =============================================================================
-- RPG System.IO — Etapa 1/2 da reforma de perfis de acesso
-- =============================================================================
--
-- Adiciona os novos valores ao enum `app_role`.
--
-- Precisa ficar SOZINHO em uma migration: no PostgreSQL um valor recém-criado
-- por ALTER TYPE ... ADD VALUE não pode ser USADO na mesma transação em que foi
-- adicionado. A migração dos dados e das policies vem na migration seguinte
-- (20260801000002), já em outra transação.
--
-- Os valores antigos ('admin', 'atendente') continuam existindo no tipo porque
-- o PostgreSQL não permite remover valor de enum. Ficam órfãos e sem uso após a
-- etapa 2 — nenhuma linha de user_roles e nenhuma policy volta a referenciá-los.
-- =============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente_tecnico';
