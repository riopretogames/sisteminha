-- =============================================================================
-- Sisteminha (RPG System.IO) — Tarefas: o feito e a conferência valem no banco
-- =============================================================================
--
-- Revisão completa de 24/09/2026 (pedido do Felipe: "faz uma revisão completa
-- no sistema e testa tudo"). Dois achados do módulo de Tarefas precisam do
-- banco:
--
-- ACHADO 17 — dava para se auto-conferir pela API.
--   A migration 20260924100000 prometia que `conferir_tarefa` era "a ÚNICA
--   porta para escrever conferida_em". Era verdade só para ALTERAR. Para
--   CRIAR, não: quem tem tasks.edit (os 5 perfis, vendedor inclusive) ou é o
--   responsável gravava, pelo console do navegador, o feito da tarefa que se
--   repete já "conferido" — até com o id do gerente em conferida_por — e em
--   qualquer dia que quisesse. O mesmo com a tarefa avulsa: nascia concluída
--   e conferida, sem nunca passar pela aba Conferência. É forjar histórico de
--   rotina cumprida, que é a base anunciada para ligar às premiações.
--   (A tela nunca faz isso; o furo era da API.)
--
-- ACHADO 19 — o feito era marcado em dia que não é da tarefa.
--   A bolinha deixava marcar numa quinta a tarefa "seg, qua e sex": gravava
--   um feito de QUINTA, a tarefa ia para a Conferência e na sexta voltava
--   pendente, e quem "adiantou" achava que já tinha feito. Aconteceu no banco
--   de verdade (a única conclusão gravada até 24/09 é exatamente essa). A
--   tela passou a travar a bolinha fora do dia da tarefa (lib/tarefas.ts,
--   travaDoFeito); aqui o banco passa a recusar também, para a regra não
--   depender só da tela (regra de custo protegido, CLAUDE.md).
--
-- O QUE MUDA
--
--   gatilho novo  travas_da_conclusao_nova   (antes de gravar um feito do dia)
--     - quem marca é quem está logado, e AGORA (concluida_por / concluida_em
--       não vêm da tela);
--     - quem não confere não grava feito já conferido (conferida_* zera) e
--       só marca o feito de HOJE (no fuso da loja);
--     - ninguém marca feito em dia que não é da tarefa, nem feito do dia em
--       tarefa avulsa (a avulsa é marcada na própria tarefa).
--   travas_da_tarefa_nova   quem não confere não cria tarefa já conferida.
--   travas_das_tarefas      quem não confere não MEXE na conferência — nem
--                           para desfazê-la (antes só não podia preencher).
--   trava_conclusao_conferida  quem não confere só desmarca o feito de hoje:
--                           o de outro dia é do gerente conferir ou devolver
--                           (antes dava para apagar o feito de ontem de outra
--                           pessoa, ainda não conferido, e ele sumia da aba).
--                           Apagar a tarefa de vez (tasks.manage) continua
--                           levando os feitos dela junto.
--
-- `conferir_tarefa` continua funcionando: roda com o crachá de quem tem
-- tasks.review, e os gatilhos deixam quem confere passar.
--
-- O feito gravado antes desta migration (o de quinta, 24/09) não é tocado: os
-- gatilhos valem para o que for gravado daqui em diante. O gerente confere ou
-- devolve pela aba Conferência, como qualquer outro.
--
-- (O achado 22 — o cofre de arquivos dos anexos mais largo que a ficha do
-- anexo — foi tratado pela migration 20260924166000, da frente de segurança.)
--
-- Não é migration destrutiva: só troca funções de gatilho e cria um gatilho.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O FEITO DO DIA (tarefas_conclusoes) — ao gravar
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.travas_da_conclusao_nova()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_confere BOOLEAN := auth.uid() IS NULL OR public.has_permission(auth.uid(), 'tasks.review');
  -- "Hoje" da loja, não do servidor (que roda em UTC: às 21h de Rio Preto o
  -- servidor já está no dia seguinte).
  v_hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dias SMALLINT[];
BEGIN
  -- Sem crachá é a chave mestra ou o próprio banco (migration, manutenção):
  -- não há "quem marcou" para conferir.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Quem marcou é quem está logado, e quando é agora. A policy já exigia
  -- concluida_por = auth.uid(); o horário, ninguém conferia.
  NEW.concluida_por := auth.uid();
  NEW.concluida_em := now();

  IF NOT v_confere THEN
    -- Feito nasce esperando o gerente. Conferir é pela conferir_tarefa.
    NEW.conferida_em := NULL;
    NEW.conferida_por := NULL;
    IF NEW.dia IS DISTINCT FROM v_hoje THEN
      RAISE EXCEPTION 'O feito só pode ser marcado no próprio dia.';
    END IF;
  END IF;

  SELECT t.dias_semana INTO v_dias FROM public.tarefas t WHERE t.id = NEW.tarefa_id;
  IF cardinality(COALESCE(v_dias, '{}'::smallint[])) = 0 THEN
    RAISE EXCEPTION 'Esta tarefa não se repete: marque a conclusão na própria tarefa.';
  END IF;
  IF NOT (EXTRACT(DOW FROM NEW.dia)::smallint = ANY (v_dias)) THEN
    RAISE EXCEPTION 'Hoje não é dia desta tarefa: o feito só se marca no dia dela.';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.travas_da_conclusao_nova() FROM PUBLIC, anon, authenticated;

-- O nome começa com "t", depois de herda_tenant_da_tarefa ("h"): os gatilhos
-- BEFORE rodam em ordem alfabética, e a loja já vem copiada da tarefa.
DROP TRIGGER IF EXISTS travas_da_conclusao_nova ON public.tarefas_conclusoes;
CREATE TRIGGER travas_da_conclusao_nova
  BEFORE INSERT ON public.tarefas_conclusoes
  FOR EACH ROW EXECUTE FUNCTION public.travas_da_conclusao_nova();


-- -----------------------------------------------------------------------------
-- 2. O FEITO DO DIA — ao desmarcar
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trava_conclusao_conferida()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Apagada junto com a tarefa (apagar de vez é de quem tem tasks.manage):
  -- o feito vai com ela, como sempre foi (ON DELETE CASCADE).
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'tasks.review') THEN
    IF OLD.conferida_em IS NOT NULL THEN
      RAISE EXCEPTION 'Este feito já foi conferido pelo gerente; só ele pode devolvê-lo.';
    END IF;
    IF OLD.dia IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'Só o feito de hoje pode ser desmarcado. O de outro dia fica para o gerente conferir ou devolver.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trava_conclusao_conferida() FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. A TAREFA (avulsa) — ao criar e ao alterar
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.travas_da_tarefa_nova()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'feito' AND cardinality(NEW.dias_semana) > 0 THEN
    RAISE EXCEPTION 'Tarefa que se repete não nasce "feita": marque o feito de hoje.';
  END IF;

  -- Tarefa não nasce conferida pela mão de quem não confere: se nascer
  -- concluída, vai esperar o gerente na aba Conferência como qualquer outra.
  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'tasks.review') THEN
    NEW.conferida_em := NULL;
    NEW.conferida_por := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.travas_da_tarefa_nova() FROM PUBLIC, anon, authenticated;

-- Igual à versão de 20260924100000, menos uma brecha: quem não confere podia
-- DESFAZER a conferência de uma avulsa (pôr conferida_em em branco sem mexer
-- no feito), e a tarefa conferida voltava para a aba como se ninguém tivesse
-- olhado. Agora qualquer mudança nas colunas de conferência é de quem confere.
-- A limpeza automática (sem feito não há conferência) continua: para quem não
-- confere, ela só acontece quando não havia conferência nenhuma (a trava de
-- cima recusa desmarcar a avulsa já conferida).
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

  -- Conferir (e desconferir) é ato de quem confere.
  IF (NEW.conferida_em IS DISTINCT FROM OLD.conferida_em
      OR NEW.conferida_por IS DISTINCT FROM OLD.conferida_por)
     AND NOT v_confere THEN
    RAISE EXCEPTION 'Só quem confere tarefas pode mexer na conferência.';
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


-- -----------------------------------------------------------------------------
-- 4. CONFERÊNCIA — derruba a transação se algo ficou aberto ou faltando
-- -----------------------------------------------------------------------------
DO $verifica$
DECLARE
  v_n INT;
  v_txt TEXT;
BEGIN
  -- 1. o gatilho novo está no lugar, antes de gravar o feito do dia
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = 'public.tarefas_conclusoes'::regclass
     AND tgname = 'travas_da_conclusao_nova' AND NOT tgisinternal;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'gatilho travas_da_conclusao_nova não foi criado em tarefas_conclusoes';
  END IF;

  -- 2. as trocas de regra chegaram de verdade às funções
  IF pg_get_functiondef('public.travas_da_conclusao_nova()'::regprocedure) NOT LIKE '%America/Sao_Paulo%'
     OR pg_get_functiondef('public.travas_da_conclusao_nova()'::regprocedure) NOT LIKE '%= ANY (v_dias)%' THEN
    RAISE EXCEPTION 'travas_da_conclusao_nova sem a trava do dia';
  END IF;
  IF pg_get_functiondef('public.travas_da_tarefa_nova()'::regprocedure) NOT LIKE '%conferida_em := NULL%' THEN
    RAISE EXCEPTION 'travas_da_tarefa_nova ainda deixa criar tarefa já conferida';
  END IF;
  IF pg_get_functiondef('public.trava_conclusao_conferida()'::regprocedure) NOT LIKE '%America/Sao_Paulo%' THEN
    RAISE EXCEPTION 'trava_conclusao_conferida ainda deixa apagar o feito de outro dia';
  END IF;
  IF pg_get_functiondef('public.travas_das_tarefas()'::regprocedure) NOT LIKE '%mexer na conferência%' THEN
    RAISE EXCEPTION 'travas_das_tarefas ainda deixa desfazer a conferência';
  END IF;

  -- 3. funções de gatilho fechadas (nem PUBLIC, nem quem está logado)
  IF has_function_privilege('authenticated', 'public.travas_da_conclusao_nova()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.travas_da_tarefa_nova()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.travas_das_tarefas()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trava_conclusao_conferida()', 'EXECUTE') THEN
    RAISE EXCEPTION 'função de gatilho de tarefas continua chamável por quem está logado';
  END IF;
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('travas_da_conclusao_nova', 'travas_da_tarefa_nova', 'travas_das_tarefas',
                       'trava_conclusao_conferida')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função de tarefas aberta para PUBLIC: %', v_txt;
  END IF;

  -- 4. a porta da conferência continua aberta para quem está logado (a
  --    função confere o crachá lá dentro)
  IF NOT has_function_privilege('authenticated', 'public.conferir_tarefa(uuid, date, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'conferir_tarefa sem EXECUTE para authenticated — a aba Conferência pararia';
  END IF;

  -- 5. nenhuma policy de tarefas vale para quem não fez login
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename LIKE 'tarefas%'
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n > 0 THEN
    RAISE EXCEPTION '% policy(ies) de tarefas valem para quem não fez login', v_n;
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
