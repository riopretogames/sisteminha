-- =============================================================================
-- Sisteminha (RPG System.IO) — Tarefas: conferência do gerente, anexos e horário
-- =============================================================================
--
-- Pedido do Felipe em 24/09/2026, depois de testar o módulo:
--
--   1. "Quando eu marcasse concluído, ela fosse para uma aba de conferência,
--      que meu gerente vai lá e vai conferir o que foi feito. Depois que meu
--      gerente desmarcasse, ele voltava para a função original dele."
--   2. "Coloque a possibilidade de ter alguns horários pré-definidos. Deixe
--      que eu escolha os horários."
--   3. "Tem que anexar arquivos" — foto, PDF, o que for.
--
-- O QUE MUDA
--
--   permissão  tasks.review          quem confere (admin, gerente, gerente técnico)
--   catálogo   tarefa_horario        os horários que a loja cadastra (Listas do Sistema)
--   tarefas    horario               hora marcada da tarefa (opcional)
--   tarefas    conferida_em/_por     conferência de tarefa avulsa concluída
--   conclusões conferida_em/_por     conferência do feito de cada dia
--   tabela     tarefas_anexos        os arquivos da tarefa (o binário fica no Storage)
--   bucket     tarefas-anexos        privado, 20 MB por arquivo, lido por link assinado
--   função     conferir_tarefa(...)  o gerente aprova (fica conferida) ou devolve
--                                    (o feito é desfeito e a tarefa volta pendente)
--
-- COMO A CONFERÊNCIA FUNCIONA NO BANCO
--
--   Feito e ainda não conferido = "aguardando conferência". A tela tira o
--   cartão do quadro e mostra na aba Conferência. O gerente aprova ou devolve
--   pela função `conferir_tarefa`, que é a ÚNICA porta para escrever
--   `conferida_em`: quem tem só tasks.edit não consegue se auto-conferir pela
--   API (gatilho travas_das_tarefas), e uma conclusão já conferida não pode
--   ser desmarcada por quem não confere (gatilho na tabela de conclusões).
--
--   ATENÇÃO (revisão de 24/09, achado 17): como escrita aqui, a promessa
--   acima só valia para ALTERAR. Ao CRIAR, dava para gravar o feito já
--   conferido e em qualquer dia, e criar avulsa já conferida. Quem fecha isso
--   é a migration 20260924162000 (gatilho travas_da_conclusao_nova e as novas
--   versões de travas_da_tarefa_nova, travas_das_tarefas e
--   trava_conclusao_conferida). Este arquivo já foi aplicado; só este
--   comentário mudou.
--
-- Não é migration destrutiva: acrescenta colunas, tabela, bucket e função.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. PERMISSÃO DE CONFERIR
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (key, modulo, descricao) VALUES
  ('tasks.review', 'Tarefas', 'Conferir o que a equipe marcou como feito (aprovar ou devolver)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('administrador',   'tasks.review'),
  ('gerente',         'tasks.review'),
  ('gerente_tecnico', 'tasks.review')
ON CONFLICT (role, permission_key) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. HORÁRIOS PRÉ-DEFINIDOS (catálogo) E A HORA DA TAREFA
-- -----------------------------------------------------------------------------
-- O Felipe cadastra os horários dele em Listas do Sistema; a ficha oferece a
-- lista e ainda aceita uma hora digitada. A tarefa guarda a hora de verdade
-- (tipo TIME), não o texto do catálogo — assim Minhas Tarefas ordena certo.
INSERT INTO public.catalogos (tenant_id, tipo, descricao, ordem, ativo, padrao)
SELECT t.id, 'tarefa_horario', v.descricao, v.ordem, true, false
FROM public.tenants t
CROSS JOIN (VALUES
  ('07:30', 10), ('08:00', 20), ('09:00', 30), ('10:00', 40),
  ('12:00', 50), ('14:00', 60), ('16:00', 70), ('18:00', 80)
) AS v(descricao, ordem)
ON CONFLICT (tenant_id, tipo, descricao) DO NOTHING;

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS horario TIME,
  ADD COLUMN IF NOT EXISTS conferida_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conferida_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tarefas.horario IS
  'Hora marcada da tarefa (opcional). O catálogo tarefa_horario só sugere; aqui fica a hora de verdade.';
COMMENT ON COLUMN public.tarefas.conferida_em IS
  'Tarefa AVULSA concluída e conferida pelo gerente. Nula com concluida_em preenchida = aguardando conferência.';

ALTER TABLE public.tarefas_conclusoes
  ADD COLUMN IF NOT EXISTS conferida_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conferida_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tarefas_conclusoes.conferida_em IS
  'O feito do dia foi conferido pelo gerente. Nulo = aguardando conferência.';

-- A aba Conferência pergunta "o que está feito e ainda não conferido".
CREATE INDEX IF NOT EXISTS idx_tarefas_conclusoes_aguardando
  ON public.tarefas_conclusoes(tenant_id, concluida_em DESC) WHERE conferida_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_avulsas_aguardando
  ON public.tarefas(tenant_id, concluida_em DESC) WHERE concluida_em IS NOT NULL AND conferida_em IS NULL;


-- -----------------------------------------------------------------------------
-- 3. ANEXOS
-- -----------------------------------------------------------------------------
CREATE TABLE public.tarefas_anexos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tarefa_id   UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  -- Nome que a pessoa vê ("foto-da-vitrine.jpg").
  nome        TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
  -- Caminho no bucket: <tenant_id>/<tarefa_id>/<uuid>-<nome>. É o que a
  -- policy do Storage confere (a primeira pasta tem que ser a loja).
  caminho     TEXT NOT NULL UNIQUE,
  tipo        TEXT,
  tamanho     BIGINT NOT NULL DEFAULT 0 CHECK (tamanho >= 0),
  enviado_por UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tarefas_anexos IS
  'Arquivos da tarefa (foto, PDF...). O binário fica no bucket tarefas-anexos; aqui fica o nome, o caminho e quem enviou.';

CREATE INDEX idx_tarefas_anexos_tarefa ON public.tarefas_anexos(tarefa_id, created_at);

CREATE TRIGGER herda_tenant_da_tarefa BEFORE INSERT ON public.tarefas_anexos
  FOR EACH ROW EXECUTE FUNCTION public.herda_tenant_da_tarefa();

ALTER TABLE public.tarefas_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver anexos de tarefas da loja"
  ON public.tarefas_anexos FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view'));

-- Anexar é andamento: o responsável pode, mesmo sem tasks.edit.
CREATE POLICY "Anexar arquivo em tarefa da loja"
  ON public.tarefas_anexos FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND enviado_por = auth.uid()
         AND (public.has_permission(auth.uid(), 'tasks.edit')
              OR public.eh_responsavel_da_tarefa(tarefa_id, auth.uid())));

CREATE POLICY "Remover anexo de tarefa da loja"
  ON public.tarefas_anexos FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND (enviado_por = auth.uid() OR public.has_permission(auth.uid(), 'tasks.edit')));

REVOKE ALL ON public.tarefas_anexos FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas_anexos TO authenticated;
GRANT ALL ON public.tarefas_anexos TO service_role;

-- O bucket. Privado: ninguém abre um anexo por link solto na internet; a tela
-- pede um link assinado que vale por alguns minutos. 20 MB por arquivo, tipo
-- livre — o Felipe disse "arquivos, PDFs, fotos, enfim".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tarefas-anexos', 'tarefas-anexos', false, 20971520, NULL)
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 20971520, allowed_mime_types = NULL;

-- Mesmo desenho das policies da logo: a primeira pasta do caminho é a loja.
DROP POLICY IF EXISTS "Ver anexos de tarefas da propria loja" ON storage.objects;
CREATE POLICY "Ver anexos de tarefas da propria loja"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tarefas-anexos'
         AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
         AND public.has_permission(auth.uid(), 'tasks.view'));

DROP POLICY IF EXISTS "Enviar anexo de tarefa da propria loja" ON storage.objects;
CREATE POLICY "Enviar anexo de tarefa da propria loja"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tarefas-anexos'
         AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
         AND public.has_permission(auth.uid(), 'tasks.view'));

DROP POLICY IF EXISTS "Remover anexo de tarefa da propria loja" ON storage.objects;
CREATE POLICY "Remover anexo de tarefa da propria loja"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tarefas-anexos'
         AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
         AND public.has_permission(auth.uid(), 'tasks.view'));
-- (Sem UPDATE: anexo não se sobrescreve, apaga e envia outro.)


-- -----------------------------------------------------------------------------
-- 4. A CONFERÊNCIA
-- -----------------------------------------------------------------------------

-- 4a. travas_das_tarefas ganha duas regras:
--   - concluida_em limpa => conferida_* limpa junto (devolver ou desmarcar);
--   - conferida_* só muda pela mão de quem tem tasks.review (a função abaixo
--     roda com esse crachá; o editor comum não consegue se auto-conferir);
--   - avulsa já conferida não é desmarcada por quem não confere.
CREATE OR REPLACE FUNCTION public.travas_das_tarefas()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_antes JSONB;
  v_depois JSONB;
  v_confere BOOLEAN := auth.uid() IS NULL OR public.has_permission(auth.uid(), 'tasks.review');
BEGIN
  IF NEW.status = 'feito' AND cardinality(NEW.dias_semana) > 0 THEN
    RAISE EXCEPTION 'Tarefa que se repete não fica "feita" para sempre: marque o feito de hoje.';
  END IF;

  -- Desmarcar o feito de uma avulsa já conferida: só quem confere.
  IF OLD.concluida_em IS NOT NULL AND NEW.concluida_em IS NULL
     AND OLD.conferida_em IS NOT NULL AND NOT v_confere THEN
    RAISE EXCEPTION 'Esta tarefa já foi conferida pelo gerente; só ele pode devolvê-la.';
  END IF;

  -- Sem feito não há conferência.
  IF NEW.concluida_em IS NULL THEN
    NEW.conferida_em := NULL;
    NEW.conferida_por := NULL;
  END IF;

  -- Conferir é ato de quem confere.
  IF (NEW.conferida_em IS DISTINCT FROM OLD.conferida_em
      OR NEW.conferida_por IS DISTINCT FROM OLD.conferida_por)
     AND NEW.conferida_em IS NOT NULL AND NOT v_confere THEN
    RAISE EXCEPTION 'Só quem confere tarefas pode marcar uma como conferida.';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'tasks.edit') THEN
    v_antes  := to_jsonb(OLD) - 'status' - 'concluida_em' - 'conferida_em' - 'conferida_por' - 'updated_at';
    v_depois := to_jsonb(NEW) - 'status' - 'concluida_em' - 'conferida_em' - 'conferida_por' - 'updated_at';
    IF v_antes <> v_depois THEN
      RAISE EXCEPTION 'Seu perfil só permite marcar o andamento das suas tarefas, não editá-las.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.travas_das_tarefas() FROM PUBLIC, anon, authenticated;

-- A mensagem do gatilho de criação também perde o nome de tabela (pendência
-- anotada no plano em 23/09).
CREATE OR REPLACE FUNCTION public.travas_da_tarefa_nova()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'feito' AND cardinality(NEW.dias_semana) > 0 THEN
    RAISE EXCEPTION 'Tarefa que se repete não nasce "feita": marque o feito de hoje.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.travas_da_tarefa_nova() FROM PUBLIC, anon, authenticated;

-- 4b. Conclusão do dia já conferida não some pela mão de quem não confere.
CREATE OR REPLACE FUNCTION public.trava_conclusao_conferida()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.conferida_em IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NOT public.has_permission(auth.uid(), 'tasks.review') THEN
    RAISE EXCEPTION 'Este feito já foi conferido pelo gerente; só ele pode devolvê-lo.';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trava_conclusao_conferida() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trava_conclusao_conferida
  BEFORE DELETE ON public.tarefas_conclusoes
  FOR EACH ROW EXECUTE FUNCTION public.trava_conclusao_conferida();

-- 4c. A porta única da conferência.
--
-- `_dia` nulo = tarefa avulsa (a conferência mora em `tarefas`);
-- `_dia` preenchido = o feito daquele dia (mora em `tarefas_conclusoes`).
-- `_aprovada` true = fica conferida e volta ao quadro como feita;
-- `_aprovada` false = devolve: o feito é desfeito e a tarefa volta pendente
-- para a pessoa (a Minhas Tarefas dela mostra de novo).
--
-- SECURITY DEFINER porque `tarefas_conclusoes` não tem policy de UPDATE de
-- propósito (ninguém reescreve quem fez). A função confere loja e crachá
-- antes de qualquer coisa, e roda com o auth.uid() de quem chamou — os
-- gatilhos acima enxergam o crachá certo.
CREATE OR REPLACE FUNCTION public.conferir_tarefa(_tarefa_id UUID, _dia DATE, _aprovada BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.get_user_tenant_id(auth.uid());
  v_ok BOOLEAN;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission(auth.uid(), 'tasks.review') THEN
    RAISE EXCEPTION 'Seu perfil de acesso não permite conferir tarefas.';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = _tarefa_id AND t.tenant_id = v_tenant) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Tarefa não encontrada.';
  END IF;

  IF _dia IS NULL THEN
    IF _aprovada THEN
      UPDATE public.tarefas
         SET conferida_em = now(), conferida_por = auth.uid()
       WHERE id = _tarefa_id AND concluida_em IS NOT NULL;
    ELSE
      UPDATE public.tarefas
         SET concluida_em = NULL, conferida_em = NULL, conferida_por = NULL,
             status = CASE WHEN status = 'feito' THEN 'nao_iniciado' ELSE status END
       WHERE id = _tarefa_id;
    END IF;
  ELSE
    IF _aprovada THEN
      UPDATE public.tarefas_conclusoes
         SET conferida_em = now(), conferida_por = auth.uid()
       WHERE tarefa_id = _tarefa_id AND dia = _dia;
    ELSE
      DELETE FROM public.tarefas_conclusoes WHERE tarefa_id = _tarefa_id AND dia = _dia;
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.conferir_tarefa(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferir_tarefa(UUID, DATE, BOOLEAN) TO authenticated;


-- -----------------------------------------------------------------------------
-- 5. CONFERÊNCIA — derruba a transação se algo ficou aberto
-- -----------------------------------------------------------------------------
DO $verifica$
DECLARE
  v_n INT;
  v_txt TEXT;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename LIKE 'tarefas%'
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n > 0 THEN
    RAISE EXCEPTION '% policy(ies) de tarefas ainda valem para quem não fez login', v_n;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tarefas_anexos'::regclass) THEN
    RAISE EXCEPTION 'tarefas_anexos sem RLS';
  END IF;
  IF has_table_privilege('anon', 'public.tarefas_anexos', 'SELECT') THEN
    RAISE EXCEPTION 'anon lê tarefas_anexos';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.tarefas_anexos', 'INSERT') THEN
    RAISE EXCEPTION 'quem está logado não consegue anexar';
  END IF;

  IF has_function_privilege('authenticated', 'public.travas_das_tarefas()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.travas_da_tarefa_nova()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trava_conclusao_conferida()', 'EXECUTE') THEN
    RAISE EXCEPTION 'função de gatilho continua chamável por quem está logado';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.conferir_tarefa(uuid, date, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'conferir_tarefa sem EXECUTE para authenticated — a aba Conferência não funcionaria';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('travas_das_tarefas', 'travas_da_tarefa_nova', 'trava_conclusao_conferida', 'conferir_tarefa')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função aberta para PUBLIC: %', v_txt;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'tarefas-anexos' AND public = false) THEN
    RAISE EXCEPTION 'bucket tarefas-anexos não existe ou ficou público';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%anexo%de tarefa%';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'esperava 3 policies de Storage para anexos, achei %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.role_permissions
   WHERE role = 'administrador' AND permission_key = 'tasks.review';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'o administrador ficou sem tasks.review';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
